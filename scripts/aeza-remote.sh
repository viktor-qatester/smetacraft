#!/bin/bash
# Обновляет только проект Compose vic-smetacraft из переданного архива коммита.
# Не запускает установщик FORNEX и не меняет firewall, SSH, VPN и чужие контейнеры.
set -eu
set -o pipefail

# APP_OWNER, APP_MODE, RUN_USER и DB_MODE задаются до копирования.
# rsync не должен переносить владельца и права каталога mktemp на APP.
copy_code_tree() {
  local src="$1"
  local dest="$2"
  rsync -a --no-owner --no-group --no-perms \
    --exclude '/.env' \
    --exclude '/data/' \
    --exclude '/compose.vic.yaml' \
    --exclude '/node_modules/' \
    "$src"/ "$dest"/
  chown --no-dereference "$APP_OWNER" "$dest"
  chmod "$APP_MODE" "$dest"
  while IFS= read -r -d '' path; do
    chown --no-dereference "$APP_OWNER" "$path"
    if [ ! -L "$path" ]; then
      chmod u+rX "$path"
    fi
  done < <(find "$dest" -mindepth 1 \
    \( -path "$dest/data" -o -path "$dest/data/*" \
       -o -path "$dest/node_modules" -o -path "$dest/node_modules/*" \
       -o -path "$dest/.env" -o -path "$dest/compose.vic.yaml" \) -prune \
    -o -print0)
}

# Копия в DEST создаётся root. База после возврата должна принадлежать
# пользователю контейнера из compose.vic.yaml, а не владельцу копии.
restore_sqlite_file() {
  local live="$APP/data/smetacraft.sqlite"
  cp -a "$DEST/smetacraft.sqlite" "$live"
  chown "$RUN_USER" "$live"
  chmod "$DB_MODE" "$live"
  rm -f "${live}-wal" "${live}-shm"
}

# python3 на хосте открывает базу от root. В режиме WAL он может создать
# -wal/-shm с владельцем root, и контейнер потеряет запись. Меняются только эти два файла.
own_sqlite_sidecars() {
  local suffix
  for suffix in -wal -shm; do
    if [ -e "$APP/data/smetacraft.sqlite$suffix" ] && [ ! -L "$APP/data/smetacraft.sqlite$suffix" ]; then
      chown "$RUN_USER" "$APP/data/smetacraft.sqlite$suffix"
    fi
  done
}

# rsync без --delete оставляет в APP файлы неудачного релиза. Удаляются только
# пути, которых нет в коде до обновления; data/, .env, compose.vic.yaml и
# серверные файлы вне архива коммита не затрагиваются.
remove_release_only_files() {
  OLD_TAR="$1" NEW_TAR="$2" TARGET="$3" python3 - <<'PY'
import os, tarfile
def names(path):
    out = set()
    with tarfile.open(path) as tar:
        for member in tar.getmembers():
            name = os.path.normpath(member.name)
            if name not in (".", "") and not name.startswith("..") and not os.path.isabs(name):
                out.add(name)
    return out
protected = (".env", "compose.vic.yaml", "data", "node_modules", ".git")
target = os.path.realpath(os.environ["TARGET"])
extra = names(os.environ["NEW_TAR"]) - names(os.environ["OLD_TAR"])
removed = 0
for name in sorted(extra, key=lambda item: item.count("/"), reverse=True):
    if name.split("/")[0] in protected:
        continue
    path = os.path.join(target, name)
    parent = os.path.realpath(os.path.dirname(path))
    if parent != target and not parent.startswith(target + os.sep):
        continue
    if os.path.islink(path) or os.path.isfile(path):
        os.unlink(path)
        removed += 1
    elif os.path.isdir(path) and not os.listdir(path):
        os.rmdir(path)
print(f"removed-release-files {removed}")
PY
}

if [ "${AEZA_REMOTE_SOURCE_ONLY:-}" = "1" ]; then
  return 0
fi

SHA="${1:-}"
RELEASE_ID="${2:-}"
# Переопределения нужны только tests/aeza-deploy-sandbox.sh.
APP="${AEZA_APP_DIR:-/srv/vic-workspace/apps/smetacraft}"
PROJECT="${AEZA_PROJECT:-vic-smetacraft}"
COMPOSE_FILE="compose.vic.yaml"
BACKUP_ROOT="${AEZA_BACKUP_ROOT:-/srv/vic-workspace/backups/smetacraft}"
export APP
INCOMING="$BACKUP_ROOT/incoming-${SHA}.tar"

if ! printf '%s' "$SHA" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "Нужен полный SHA коммита." >&2
  exit 1
fi
if ! printf '%s' "$RELEASE_ID" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$'; then
  echo "Нужен номер релиза вида ГГГГ-ММ-ДД.N." >&2
  exit 1
fi

for tool in tar rsync python3 docker flock; do
  command -v "$tool" >/dev/null 2>&1 || { echo "На сервере нет команды $tool." >&2; exit 1; }
done
docker compose version >/dev/null 2>&1 || { echo "Нет docker compose." >&2; exit 1; }

test -f "$INCOMING"
test -d "$APP"
test -f "$APP/$COMPOSE_FILE"
test -f "$APP/.env"
test -d "$APP/data"
test -f "$APP/data/smetacraft.sqlite" || { echo "В data/ нет smetacraft.sqlite. Новая пустая база не создаётся." >&2; exit 1; }
cd "$APP"
APP_OWNER="$(stat -c '%u:%g' "$APP")"
APP_MODE="$(stat -c '%a' "$APP")"
DB_MODE="$(stat -c '%a' "$APP/data/smetacraft.sqlite")"

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
exec 9>"$BACKUP_ROOT/.lock"
flock -n 9 || { echo "Уже выполняется другое обновление SmetaCraft." >&2; exit 1; }

mapfile -t SERVICES < <(docker compose -p "$PROJECT" -f "$APP/$COMPOSE_FILE" config --services)
if [ "${#SERVICES[@]}" -lt 1 ]; then
  echo "В compose.vic.yaml нет сервисов." >&2
  exit 1
fi
SERVICE=""
if [ "${#SERVICES[@]}" -eq 1 ]; then
  SERVICE="${SERVICES[0]}"
else
  for candidate in "${SERVICES[@]}"; do
    case "$candidate" in
      *smetacraft*|*web*|*app*) SERVICE="$candidate"; break ;;
    esac
  done
fi
if [ -z "$SERVICE" ]; then
  echo "Несколько сервисов, ни один не похож на приложение. Обновление остановлено до изменений." >&2
  printf '%s\n' "${SERVICES[@]}" >&2
  exit 1
fi

# Миграция, откат SQLite и рабочий контейнер используют одного пользователя:
# user сервиса в compose.vic.yaml. Владелец текущего файла базы источником не служит.
RUN_USER="$(docker compose -p "$PROJECT" -f "$APP/$COMPOSE_FILE" config --format json \
  | SERVICE="$SERVICE" python3 -c 'import json,os,sys; print(json.load(sys.stdin)["services"][os.environ["SERVICE"]].get("user") or "")')"
if ! printf '%s' "$RUN_USER" | grep -Eq '^[0-9]+:[0-9]+$' || [ "${RUN_USER%%:*}" = "0" ]; then
  echo "В compose.vic.yaml у сервиса $SERVICE нет числового user UID:GID без root. Обновление остановлено до изменений." >&2
  exit 1
fi

# До копий и замены кода: база, её WAL/SHM и каталог data/ доступны пользователю контейнера.
storage_problems=""
check_owned() {
  local path="$1" need="$2" owner mode
  owner="$(stat -c '%u:%g' "$path")"
  mode="$(stat -c '%a' "$path")"
  if [ "$owner" != "$RUN_USER" ] || (( (8#$mode & 8#$need) != 8#$need )); then
    storage_problems="${storage_problems}  ${path#"$APP"/} владелец $owner права $mode, нужен владелец $RUN_USER\n"
  fi
}
check_storage() {
  local suffix
  storage_problems=""
  check_owned "$APP/data" 0700
  check_owned "$APP/data/smetacraft.sqlite" 0600
  for suffix in -wal -shm; do
    if [ -e "$APP/data/smetacraft.sqlite$suffix" ]; then
      check_owned "$APP/data/smetacraft.sqlite$suffix" 0600
    fi
  done
}
check_storage
if [ -n "$storage_problems" ]; then
  printf 'Хранилище недоступно пользователю контейнера %s на запись. Обновление остановлено до изменений:\n%b' "$RUN_USER" "$storage_problems" >&2
  echo "Сначала сделайте согласованную копию базы и верните владельца только этих файлов." >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"
chmod 700 "$DEST"
CHANGED=0
RESTORE_DB=0
ROLLED=0

fail() {
  echo "$1" >&2
  if [ "$CHANGED" = "1" ] && [ "$ROLLED" != "1" ]; then
    ROLLED=1
    rollback || true
  fi
  exit 1
}

on_error() {
  local code=$?
  trap - ERR
  if [ "$CHANGED" = "1" ] && [ "$ROLLED" != "1" ]; then
    ROLLED=1
    rollback || true
  fi
  exit "$code"
}
trap on_error ERR

env_sum="$(sha256sum "$APP/.env" | awk '{print $1}')"
compose_sum="$(sha256sum "$APP/$COMPOSE_FILE" | awk '{print $1}')"

cat > "$DEST/ROLLBACK.txt" <<EOF
Возврат vic-smetacraft к копии $STAMP.
Каталог приложения: $APP
Код до обновления: $DEST/code.tar
Согласованная копия SQLite: $DEST/smetacraft.sqlite
Образ до обновления: ID в $DEST/image-before.txt, тег сервиса с суффиксом :previous.

Если схема базы не менялась, достаточно вернуть код и перезапустить только этот проект.
Если схема менялась или проверка оборвалась после миграции, сначала остановите проект,
верните файл SQLite из этой копии, назначьте ему владельца user из compose.vic.yaml
и удалите рядом файлы WAL/SHM, затем верните код и образ.
Чужие контейнеры, сети и тома не останавливать.
FORNEX этой копией не затрагивается.

Команды выполняет scripts/aeza-remote.sh сам, если обновление не прошло.
Повтор вручную — только из этого каталога и только для vic-smetacraft.
EOF

echo "Резервная копия кода без data/ и без .env" >&2
tar -C "$APP" -cf "$DEST/code.tar" \
  --exclude=./data \
  --exclude=./.env \
  --exclude=./node_modules \
  .

echo "Согласованная копия SQLite" >&2
DEST_PATH="$DEST" python3 - <<'PY'
import glob, os, sqlite3, sys
dest = os.environ["DEST_PATH"]
source = "data/smetacraft.sqlite"
os.chdir(os.environ["APP"])
if not os.path.isfile(source):
    sys.exit("no database")
target = os.path.join(dest, "smetacraft.sqlite")
src = sqlite3.connect(source, timeout=60)
dst = sqlite3.connect(target)
src.backup(dst)
dst.close()
src.close()
check = sqlite3.connect(target)
row = check.execute("PRAGMA integrity_check").fetchone()
version = check.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
check.close()
if row[0] != "ok":
    sys.exit(f"integrity {row[0]}")
open(os.path.join(dest, "schema-before.txt"), "w", encoding="utf-8").write(str(version if version is not None else 0))
print(f"schema-before {version}")
PY
own_sqlite_sidecars
test -s "$DEST/smetacraft.sqlite"
RESTORE_DB=1
if [ -d "$APP/data/blobs" ]; then
  mkdir -p "$DEST/data"
  cp -a "$APP/data/blobs" "$DEST/data/blobs"
fi

mapfile -t OLD_CIDS < <(docker ps -q --filter label=com.docker.compose.project="$PROJECT" --filter label=com.docker.compose.service="$SERVICE")
mapfile -t IMAGES < <(docker compose -p "$PROJECT" -f "$APP/$COMPOSE_FILE" config --images)
if [ "${#IMAGES[@]}" -ne 1 ] || [ -z "${IMAGES[0]}" ]; then
  echo "Не удалось однозначно определить образ сервиса $SERVICE. Обновление остановлено до изменений." >&2
  exit 1
fi
IMAGE="${IMAGES[0]}"
OLD_IMAGE_ID=""
if [ -n "${OLD_CIDS[0]:-}" ]; then
  OLD_IMAGE_ID="$(docker inspect --format '{{.Image}}' "${OLD_CIDS[0]}")"
elif docker image inspect "$IMAGE" >/dev/null 2>&1; then
  OLD_IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$IMAGE")"
fi
if [ -n "$OLD_IMAGE_ID" ]; then
  # Сборка перепишет тег сервиса. Отдельный тег не даёт удалить прежний образ до отката.
  docker tag "$OLD_IMAGE_ID" "${IMAGE%%:*}:previous"
fi
printf '%s\n' "$OLD_IMAGE_ID" > "$DEST/image-before.txt"
NEW_TAR="$INCOMING"

container_ready() {
  local cid="$1"
  docker exec -i "$cid" node - <<'NODE'
const http = require('node:http');
const port = Number(process.env.PORT || 8000);
let left = 15;
function attempt() {
  http.get({ hostname: '127.0.0.1', port, path: '/' }, (res) => {
    res.resume();
    if (res.statusCode === 200) process.exit(0);
    retry();
  }).on('error', retry);
}
function retry() {
  left -= 1;
  if (left <= 0) process.exit(1);
  setTimeout(attempt, 1000);
}
attempt();
NODE
}

rollback() {
  set +e
  echo "Проверка не прошла. Возвращаю предыдущий код, образ и SQLite vic-smetacraft." >&2
  docker compose -p "$PROJECT" -f "$APP/$COMPOSE_FILE" stop >/dev/null 2>&1
  stage="$(mktemp -d)"
  tar -C "$stage" -xf "$DEST/code.tar"
  copy_code_tree "$stage" "$APP"
  rm -rf "$stage"
  if [ -f "$NEW_TAR" ]; then
    remove_release_only_files "$DEST/code.tar" "$NEW_TAR" "$APP" >&2
  fi
  if ! tar -tf "$DEST/code.tar" ./.git/HEAD >/dev/null 2>&1; then
    rm -f "$APP/.git/HEAD"
    rmdir "$APP/.git" 2>/dev/null
  fi
  if [ "$RESTORE_DB" = "1" ]; then
    restore_sqlite_file
  fi
  if [ -n "$OLD_IMAGE_ID" ]; then
    docker tag "$OLD_IMAGE_ID" "$IMAGE"
  fi
  docker compose -p "$PROJECT" -f "$APP/$COMPOSE_FILE" up -d --force-recreate --no-build
  local cid running_image state="rolled-back"
  cid="$(docker ps -q --filter label=com.docker.compose.project="$PROJECT" --filter label=com.docker.compose.service="$SERVICE" | head -n 1)"
  running_image=""
  if [ -n "$cid" ]; then
    running_image="$(docker inspect --format '{{.Image}}' "$cid")"
  fi
  if [ -z "$cid" ] || { [ -n "$OLD_IMAGE_ID" ] && [ "$running_image" != "$OLD_IMAGE_ID" ]; } || ! container_ready "$cid"; then
    state="rollback-unverified"
    echo "Откат выполнен не полностью: контейнер не запущен на прежнем образе или не отвечает. Копия: $DEST" >&2
  else
    echo "Предыдущий релиз возвращён: образ ${OLD_IMAGE_ID:-без прежнего образа}, SQLite владелец $(stat -c '%u:%g %a' "$APP/data/smetacraft.sqlite"). Копия: $DEST" >&2
  fi
  echo "$state" > "$DEST/RESULT.txt" || true
  if [ -f "$DEST/schema-before.txt" ] && [ -f "$DEST/schema-after.txt" ]; then
    before="$(cat "$DEST/schema-before.txt")"
    after="$(cat "$DEST/schema-after.txt")"
    if [ "$after" != "$before" ]; then
      echo "Схема базы менялась ($before -> $after). SQLite восстановлена из согласованной копии вместе с кодом." >&2
    fi
  fi
  set -e
}

echo "Распаковываю коммит $SHA" >&2
STAGE="$(mktemp -d)"
tar -C "$STAGE" -xf "$INCOMING"
test -f "$STAGE/version.json"
test -f "$STAGE/index.html"
test -f "$STAGE/server/db-migrate.cjs"
actual_release="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["releaseId"])' "$STAGE/version.json")"
test "$actual_release" = "$RELEASE_ID" || fail "В архиве другой номер релиза: $actual_release"
CHANGED=1
copy_code_tree "$STAGE" "$APP"
rm -rf "$STAGE"
mv "$INCOMING" "$DEST/source.tar"
NEW_TAR="$DEST/source.tar"

mkdir -p "$APP/.git"
printf '%s\n' "$SHA" > "$APP/.git/HEAD"
chown -R "$APP_OWNER" "$APP/.git"
chown "$APP_OWNER" "$APP"
chmod "$APP_MODE" "$APP"
test "$(tr -d '\n' < "$APP/.git/HEAD")" = "$SHA" || fail "Не удалось записать коммит релиза."
test "$(python3 -c 'import json; print(json.load(open("version.json", encoding="utf-8"))["releaseId"])')" = "$RELEASE_ID" || fail "Номер релиза на диске не совпал."

if [ "$(sha256sum "$APP/.env" | awk '{print $1}')" != "$env_sum" ]; then
  fail "Файл .env изменился. Это запрещено."
fi
if [ "$(sha256sum "$APP/$COMPOSE_FILE" | awk '{print $1}')" != "$compose_sum" ]; then
  fail "compose.vic.yaml изменился. Это запрещено."
fi

if grep -q 'build:' "$APP/$COMPOSE_FILE"; then
  docker compose -p "$PROJECT" -f "$APP/$COMPOSE_FILE" build || fail "Сборка образа vic-smetacraft не прошла."
fi

echo "Миграции базы под пользователем контейнера $RUN_USER. Демонстрационные данные не загружаются." >&2
docker run --rm --user "$RUN_USER" --entrypoint node \
  -e HOME=/tmp \
  -v "$APP:/release" -w /release \
  "$IMAGE" server/db-migrate.cjs || fail "Миграция базы не прошла. Код и SQLite возвращаются к копии."
DEST_PATH="$DEST" python3 - <<'PY'
import os, sqlite3
os.chdir(os.environ["APP"])
con = sqlite3.connect("file:data/smetacraft.sqlite?mode=ro", uri=True, timeout=60)
version = con.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
row = con.execute("PRAGMA integrity_check").fetchone()
con.close()
open(os.path.join(os.environ["DEST_PATH"], "schema-after.txt"), "w", encoding="utf-8").write(str(version if version is not None else 0))
if row[0] != "ok":
    raise SystemExit(f"integrity {row[0]}")
print(f"schema-after {version}")
PY
own_sqlite_sidecars

echo "Проверка расчётов на коде этого коммита" >&2
docker run --rm --entrypoint node \
  -v "$APP:/release:ro" -w /release \
  "$IMAGE" --test \
  tests/golden.test.cjs tests/security.test.cjs tests/project-model.test.cjs tests/release.test.cjs \
  || fail "Проверки расчёта на сервере не прошли."

echo "Перезапуск только проекта $PROJECT" >&2
docker compose -p "$PROJECT" -f "$APP/$COMPOSE_FILE" up -d --force-recreate || fail "Контейнер vic-smetacraft не запустился."

mapfile -t NEW_CIDS < <(docker ps -q --filter label=com.docker.compose.project="$PROJECT" --filter label=com.docker.compose.service="$SERVICE")
CID="${NEW_CIDS[0]:-}"
test -n "$CID" || fail "Контейнер сервиса $SERVICE не запущен."

echo "Проверка интерфейса, сохранения и повторного чтения" >&2
docker exec -i -e SMETACRAFT_EXPECT_RELEASE="$RELEASE_ID" -e SMETACRAFT_EXPECT_COMMIT="$SHA" "$CID" node - <<'NODE' || fail "Проверка HTTP не прошла."
const http = require('node:http');
const crypto = require('node:crypto');

function request(method, path, headers, body) {
  const port = Number(process.env.PORT || 8000);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: headers || {},
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const release = process.env.SMETACRAFT_EXPECT_RELEASE;
  const commit = process.env.SMETACRAFT_EXPECT_COMMIT;
  let page = null;
  let lastError = 'page';
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      page = await request('GET', '/');
      if (page.status === 200) break;
      lastError = `page ${page.status}`;
    } catch (error) {
      lastError = error.message;
      page = null;
    }
    await sleep(1000);
  }
  if (!page || page.status !== 200) throw new Error(lastError);
  for (const marker of ['Тестовая версия SmetaCraft', 'Плита', 'id="bill-total"', `>${release}<`]) {
    if (!page.body.includes(marker)) throw new Error(`нет маркера ${marker}`);
  }
  const version = await request('GET', '/api/version');
  if (version.status !== 200) throw new Error(`version ${version.status}`);
  const versionJson = JSON.parse(version.body);
  if (versionJson.ok !== true || versionJson.releaseId !== release) throw new Error('release mismatch');
  if (versionJson.commit && versionJson.commit !== commit) throw new Error('commit mismatch');
  const slab = await request('GET', '/js/core/slab.js');
  if (slab.status !== 200 || !slab.body.includes('function calculateSlab')) throw new Error('slab.js');
  const stamp = `release-check-${release}`;
  const project = {
    format: 'smetacraft-project',
    version: 1,
    block: 'project',
    fields: { length: '10.25', width: '8', height: '0.3', 'release-check': stamp },
    openings: [],
    piles: [],
  };
  const raw = JSON.stringify(project);
  const key = `release${stamp}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  const saved = await request('POST', '/api/projects/migrate', {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(raw),
    'Idempotency-Key': key,
  }, raw);
  if (saved.status !== 201) throw new Error(`save ${saved.status} ${saved.body.slice(0, 180)}`);
  const receipt = JSON.parse(saved.body);
  if (!receipt.projectId || !receipt.capabilityToken) throw new Error('no receipt');
  const loaded = await request('GET', `/api/projects/${receipt.projectId}`, {
    Authorization: `Bearer ${receipt.capabilityToken}`,
  });
  if (loaded.status !== 200) throw new Error(`read ${loaded.status}`);
  if (!loaded.body.includes(stamp) || !loaded.body.includes('"length":"10.25"')) throw new Error('readback mismatch');
  const digest = crypto.createHash('sha256').update(raw).digest('hex');
  if (receipt.sha256 !== digest || !loaded.body.includes(digest)) throw new Error('sha mismatch');
  process.stdout.write(`probe ${receipt.projectId}\n`);
})().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
NODE

check_storage
if [ -n "$storage_problems" ]; then
  printf '%b' "$storage_problems" >&2
  fail "После запуска хранилище не принадлежит пользователю контейнера $RUN_USER."
fi

if [ "$(sha256sum "$APP/.env" | awk '{print $1}')" != "$env_sum" ]; then
  fail "Файл .env изменился после запуска."
fi
if [ "$(sha256sum "$APP/$COMPOSE_FILE" | awk '{print $1}')" != "$compose_sum" ]; then
  fail "compose.vic.yaml изменился после запуска."
fi

before="$(cat "$DEST/schema-before.txt")"
after="$(cat "$DEST/schema-after.txt")"
{
  echo "sha=$SHA"
  echo "release=$RELEASE_ID"
  echo "schema-before=$before"
  echo "schema-after=$after"
  echo "service=$SERVICE"
  echo "image=$(docker inspect --format '{{.Image}}' "$CID")"
  echo "run-user=$RUN_USER"
} > "$DEST/SUCCESS.txt"
echo "AEZA обновлён: релиз $RELEASE_ID, коммит $SHA, схема $before -> $after" >&2
if [ "$before" != "$after" ]; then
  echo "Схема базы изменилась. Откат этого релиза — только вместе с копией SQLite из $DEST." >&2
fi
