#!/bin/bash
# Полный прогон scripts/aeza-remote.sh в отдельном проекте Docker Compose.
# Нужны root, docker compose, python3 и образ node:22-bookworm-slim.
#   bash tests/aeza-deploy-sandbox.sh OLD.tar NEW.tar NEW_SHA
# OLD.tar и NEW.tar — git archive двух коммитов. Проект vic-smetacraft,
# его каталог, база и образ не используются; всё создаётся в mktemp и удаляется.
set -eu
set -o pipefail

if [ "$(id -u)" -ne 0 ] || [ "$#" -ne 3 ]; then
  echo "aeza-deploy-sandbox: запуск от root: OLD.tar NEW.tar NEW_SHA" >&2
  exit 1
fi
OLD_TAR="$(realpath "$1")"
NEW_TAR="$(realpath "$2")"
NEW_SHA="$3"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="$ROOT/scripts/aeza-remote.sh"
RUN_USER="999:982"
PROJECT="smc-sandbox-$$"
SB="$(mktemp -d /tmp/smc-sandbox.XXXXXX)"
chmod 711 "$SB"
APP="$SB/app"
BK="$SB/backups"
IMAGE="$PROJECT-app"
NEW_RELEASE="$(tar -xOf "$NEW_TAR" version.json | python3 -c 'import json,sys; print(json.load(sys.stdin)["releaseId"])')"
SEEN_IMAGES=()

cleanup() {
  docker compose -p "$PROJECT" -f "$APP/compose.vic.yaml" down >/dev/null 2>&1 || true
  docker image rm "$IMAGE:latest" "$IMAGE:previous" >/dev/null 2>&1 || true
  for id in "${SEEN_IMAGES[@]}"; do
    docker image rm "$id" >/dev/null 2>&1 || true
  done
  rm -rf "$SB"
}
trap cleanup EXIT

step() { echo "== $*"; }
die() { echo "aeza-deploy-sandbox: $*" >&2; exit 1; }

cid() {
  docker ps -q --filter label=com.docker.compose.project="$PROJECT" --filter label=com.docker.compose.service=app | head -n 1
}

running_image() {
  docker inspect --format '{{.Image}}' "$(cid)"
}

# api METHOD PATH [IDEMPOTENCY_KEY BODY] [TOKEN] -> "STATUS BODY"
api() {
  docker exec -i -e M="$1" -e P="$2" -e K="${3:-}" -e B="${4:-}" -e T="${5:-}" "$(cid)" node - <<'NODE'
const http = require('node:http');
const headers = {};
if (process.env.B) {
  headers['Content-Type'] = 'application/json';
  headers['Content-Length'] = Buffer.byteLength(process.env.B);
}
if (process.env.K) headers['Idempotency-Key'] = process.env.K;
if (process.env.T) headers.Authorization = `Bearer ${process.env.T}`;
let left = 15;
function go() {
  const req = http.request({
    hostname: '127.0.0.1', port: Number(process.env.PORT || 8000),
    path: process.env.P, method: process.env.M, headers,
  }, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => process.stdout.write(`${res.statusCode} ${body}`));
  });
  req.on('error', () => {
    left -= 1;
    if (left <= 0) process.exit(1);
    setTimeout(go, 1000);
  });
  if (process.env.B) req.write(process.env.B);
  req.end();
}
go();
NODE
}

project_body() {
  printf '{"format":"smetacraft-project","version":1,"block":"project","fields":{"length":"10.25","width":"8","height":"0.3","sandbox":"%s"},"openings":[],"piles":[]}' "$1"
}

# save NAME -> "projectId token"; при статусе не 201 печатает ответ и возвращает 1.
save() {
  local out
  out="$(api POST /api/projects/migrate "sandbox$1$RANDOM" "$(project_body "$1")")"
  case "$out" in
    "201 "*) printf '%s' "${out#201 }" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["projectId"], d["capabilityToken"])' ;;
    *) echo "$out"; return 1 ;;
  esac
}

read_back() {
  local out
  out="$(api GET "/api/projects/$1" "" "" "$2")"
  case "$out" in
    "200 "*'"sandbox":"'"$3"'"'*) return 0 ;;
    *) echo "read $1: ${out:0:160}" >&2; return 1 ;;
  esac
}

manifest() {
  (cd "$APP" && find . \( -path ./data -prune \) -o \( -type f -o -type l \) -print0 \
    | sort -z | xargs -0 sha256sum) | sha256sum | awk '{print $1}'
}

# Содержимое базы читает пользователь контейнера, чтобы root не создал WAL/SHM.
db_dump() {
  docker run --rm --user "$RUN_USER" --network none -v "$APP/data:/d" --entrypoint node "$(running_image)" -e '
const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");
const db = new DatabaseSync("/d/smetacraft.sqlite", { readOnly: true });
const hash = crypto.createHash("sha256");
for (const t of ["schema_migrations", "projects", "idempotency_keys"]) {
  for (const row of db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()) hash.update(JSON.stringify(row, (k, v) => v instanceof Uint8Array ? Buffer.from(v).toString("hex") : v));
}
db.close();
process.stdout.write(hash.digest("hex"));
' 2>/dev/null
}

run_remote() {
  local sha="${2:-$NEW_SHA}"
  cp "$1" "$BK/incoming-$sha.tar"
  set +e
  AEZA_APP_DIR="$APP" AEZA_PROJECT="$PROJECT" AEZA_BACKUP_ROOT="$BK" \
    bash "$REMOTE" "$sha" "$NEW_RELEASE" > "$SB/remote.log" 2>&1
  local code=$?
  set -e
  sed -e 's/^/    | /' "$SB/remote.log" | grep -v 'ExperimentalWarning\|trace-warnings'
  return "$code"
}

step "Песочница $SB, проект $PROJECT, новый релиз $NEW_RELEASE"
mkdir -p "$APP/data" "$BK"
tar -C "$APP" -xf "$OLD_TAR"
cat > "$APP/Dockerfile.vic" <<'EOF'
FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=999:982 . .
USER 999:982
CMD ["node", "server/server.cjs"]
EOF
printf '.env\n.git\ndata\nlogs\nbackups\n' > "$APP/.dockerignore"
printf 'SMETACRAFT_SANDBOX=1\n' > "$APP/.env"
cat > "$APP/compose.vic.yaml" <<'EOF'
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.vic
    user: "999:982"
    env_file: .env
    environment:
      PORT: "8080"
      SMETACRAFT_BIND: "0.0.0.0"
      SMETACRAFT_PUBLIC_ORIGIN: "http://127.0.0.1:18080"
    volumes:
      - ./data:/app/data
    restart: "no"
    cpus: 0.25
    mem_limit: 256m
    pids_limit: 128
    read_only: true
    tmpfs:
      - /tmp:size=32m,mode=1777
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
EOF
chown -R "$RUN_USER" "$APP"
chmod 700 "$APP" "$APP/data"
chmod 600 "$APP/.env" "$APP/compose.vic.yaml"

docker compose -p "$PROJECT" -f "$APP/compose.vic.yaml" build -q
docker run --rm --user "$RUN_USER" --network none -e HOME=/tmp -v "$APP:/release" -w /release \
  --entrypoint node "$IMAGE" server/db-migrate.cjs 2>/dev/null
docker compose -p "$PROJECT" -f "$APP/compose.vic.yaml" up -d >/dev/null 2>&1
OLD_IMAGE="$(running_image)"
SEEN_IMAGES+=("$OLD_IMAGE")
ids="$(save original)" || die "исходное сохранение не прошло: $ids"
read -r P1 T1 <<<"$ids"
read_back "$P1" "$T1" original || die "исходное чтение не прошло"
echo "исходный образ $OLD_IMAGE, проект сохранён и прочитан"

step "1. Воспроизведение: база root:root 644, приложение $RUN_USER"
chown 0:0 "$APP/data/smetacraft.sqlite"
chmod 644 "$APP/data/smetacraft.sqlite"
docker compose -p "$PROJECT" -f "$APP/compose.vic.yaml" up -d --force-recreate >/dev/null 2>&1
broken="$(save broken || true)"
case "$broken" in
  "503 "*storage_unavailable*) echo "сохранение: $broken" ;;
  *) die "ожидался 503 storage_unavailable, получено: $broken" ;;
esac
read_back "$P1" "$T1" original || die "чтение при закрытой записи не прошло"
before_manifest="$(manifest)"
if run_remote "$NEW_TAR"; then die "публикация не должна начинаться при чужом владельце базы"; fi
grep -q 'Хранилище недоступно пользователю контейнера' "$SB/remote.log" || die "нет сообщения о правах хранилища"
if compgen -G "$BK/2*" >/dev/null; then die "до остановки созданы копии или изменения"; fi
test "$(manifest)" = "$before_manifest" || die "код изменён при остановленной публикации"
test "$(running_image)" = "$OLD_IMAGE" || die "образ изменён при остановленной публикации"
echo "публикация остановлена до изменений"

step "Возврат владельца только файла базы, как на AEZA"
docker compose -p "$PROJECT" -f "$APP/compose.vic.yaml" stop >/dev/null 2>&1
chown "$RUN_USER" "$APP/data/smetacraft.sqlite"
docker compose -p "$PROJECT" -f "$APP/compose.vic.yaml" up -d >/dev/null 2>&1
ids="$(save after-owner-fix)" || die "сохранение после возврата владельца не прошло: $ids"
read -r P2 T2 <<<"$ids"
read_back "$P2" "$T2" after-owner-fix || die "чтение после возврата владельца не прошло"
echo "сохранение и чтение работают: $(stat -c '%u:%g %a' "$APP/data/smetacraft.sqlite")"

step "2. Неудачный релиз: сохранение падает после миграции и перезапуска"
work="$SB/broken"
mkdir -p "$work"
tar -C "$work" -xf "$NEW_TAR"
python3 - "$work/server/server.cjs" <<'PY'
import sys
path = sys.argv[1]
src = open(path, encoding="utf-8").read()
needle = "if (pathname === '/api/projects/migrate') {"
if src.count(needle) != 1:
    sys.exit("patch point not found")
open(path, "w", encoding="utf-8").write(src.replace(needle, needle + " return fail(res, 503, 'sandbox_forced_failure');"))
PY
printf 'release-only\n' > "$work/sandbox-release-only.txt"
tar -C "$work" -cf "$SB/broken.tar" .
before_manifest="$(manifest)"
before_db="$(db_dump)"
before_db_stat="$(stat -c '%u:%g %a' "$APP/data/smetacraft.sqlite")"
if run_remote "$SB/broken.tar"; then die "сломанный релиз не должен публиковаться"; fi
dest="$(ls -d "$BK"/2* | tail -n 1)"
test "$(cat "$dest/RESULT.txt")" = "rolled-back" || die "RESULT.txt: $(cat "$dest/RESULT.txt")"
grep -q 'sandbox_forced_failure' "$SB/remote.log" || die "сбой случился не на проверке сохранения"
test ! -e "$APP/sandbox-release-only.txt" || die "файл неудачного релиза остался"
test ! -e "$APP/.git/HEAD" || die ".git/HEAD неудачного релиза остался"
test "$(manifest)" = "$before_manifest" || die "код после отката отличается"
test "$(running_image)" = "$OLD_IMAGE" || die "после отката запущен другой образ: $(running_image)"
test "$(stat -c '%u:%g %a' "$APP/data/smetacraft.sqlite")" = "$before_db_stat" || die "владелец или права базы изменились"
test "$(db_dump)" = "$before_db" || die "содержимое базы после отката отличается"
for suffix in -wal -shm; do
  f="$APP/data/smetacraft.sqlite$suffix"
  if [ -e "$f" ]; then test "$(stat -c '%u:%g' "$f")" = "$RUN_USER" || die "$f принадлежит $(stat -c '%u:%g' "$f")"; fi
done
read_back "$P1" "$T1" original || die "исходный проект после отката не читается"
ids="$(save after-rollback)" || die "сохранение после отката не прошло: $ids"
read -r P3 T3 <<<"$ids"
read_back "$P3" "$T3" after-rollback || die "чтение после отката не прошло"
echo "откат: код, образ $OLD_IMAGE и SQLite $before_db_stat совпали; сохранение и чтение работают"

step "3. Рабочий релиз"
run_remote "$NEW_TAR" || die "рабочий релиз не опубликован"
NEW_IMAGE="$(running_image)"
SEEN_IMAGES+=("$NEW_IMAGE")
test "$NEW_IMAGE" != "$OLD_IMAGE" || die "образ не обновился"
test "$(docker image inspect --format '{{.Id}}' "$IMAGE:previous")" = "$OLD_IMAGE" || die "нет тега прежнего образа"
version="$(api GET /api/version)"
case "$version" in
  "200 "*"\"releaseId\":\"$NEW_RELEASE\""*) ;;
  *) die "версия: $version" ;;
esac
grep -q '^probe [0-9a-f]\{32\}$' "$SB/remote.log" || die "нет результата проверки сохранения в скрипте"
read_back "$P1" "$T1" original || die "исходный проект после релиза не читается"
ids="$(save after-release)" || die "сохранение после релиза не прошло: $ids"
read -r P4 T4 <<<"$ids"
read_back "$P4" "$T4" after-release || die "чтение после релиза не прошло"
test "$(stat -c '%u:%g' "$APP/data/smetacraft.sqlite")" = "$RUN_USER" || die "владелец базы после релиза"
echo "релиз $NEW_RELEASE: образ $NEW_IMAGE, сохранение и повторное чтение работают"

step "4. Тот же номер релиза, другой коммит, как у коммита журнала"
JOURNAL_SHA="$(printf 'journal-%s' "$NEW_SHA" | sha1sum | awk '{print $1}')"
run_remote "$NEW_TAR" "$JOURNAL_SHA" || die "повторная публикация того же номера не прошла"
grep -q '^probe [0-9a-f]\{32\}$' "$SB/remote.log" || die "нет новой записи проверки"
read_back "$P1" "$T1" original || die "исходный проект после повтора не читается"
echo "повтор номера $NEW_RELEASE с коммитом $JOURNAL_SHA прошёл"
echo "aeza-deploy-sandbox: ok"
