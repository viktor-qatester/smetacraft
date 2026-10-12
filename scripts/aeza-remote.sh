#!/bin/bash
# Обновляет только проект Compose vic-smetacraft из переданного архива коммита.
# Не запускает установщик FORNEX и не меняет firewall, SSH, VPN и чужие контейнеры.
set -eu
set -o pipefail

# APP_OWNER, APP_MODE, DB_OWNER и DB_MODE задаются до копирования.
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

restore_sqlite_file() {
  local live="$APP/data/smetacraft.sqlite"
  cp -a "$DEST/smetacraft.sqlite" "$live"
  chown "$DB_OWNER" "$live"
  chmod "$DB_MODE" "$live"
  rm -f "${live}-wal" "${live}-shm"
}

if [ "${AEZA_REMOTE_SOURCE_ONLY:-}" = "1" ]; then
  return 0
fi

SHA="${1:-}"
RELEASE_ID="${2:-}"
APP="/srv/vic-workspace/apps/smetacraft"
PROJECT="vic-smetacraft"
COMPOSE_FILE="compose.vic.yaml"
BACKUP_ROOT="/srv/vic-workspace/backups/smetacraft"
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
DB_OWNER="$(stat -c '%u:%g' "$APP/data/smetacraft.sqlite")"
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

Если схема базы не менялась, достаточно вернуть код и перезапустить только этот проект.
Если схема менялась или проверка оборвалась после миграции, сначала остановите проект,
верните файл SQLite из этой копии и удалите рядом файлы WAL/SHM, затем верните код.
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
os.chdir("/srv/vic-workspace/apps/smetacraft")
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
test -s "$DEST/smetacraft.sqlite"
RESTORE_DB=1
if [ -d "$APP/data/blobs" ]; then
  mkdir -p "$DEST/data"
  cp -a "$APP/data/blobs" "$DEST/data/blobs"
fi

rollback() {
  set +e
  echo "Проверка не прошла. Возвращаю предыдущий код vic-smetacraft." >&2
  docker compose -p "$PROJECT" -f "$APP/$COMPOSE_FILE" stop >/dev/null 2>&1
  stage="$(mktemp -d)"
  tar -C "$stage" -xf "$DEST/code.tar"
  copy_code_tree "$stage" "$APP"
  rm -rf "$stage"
  if [ "$RESTORE_DB" = "1" ]; then
    restore_sqlite_file
  fi
  docker compose -p "$PROJECT" -f "$APP/$COMPOSE_FILE" up -d --force-recreate
  echo "rolled-back" > "$DEST/RESULT.txt" || true
  echo "Предыдущий релиз возвращён. Копия: $DEST" >&2
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

mapfile -t OLD_CIDS < <(docker ps -q --filter label=com.docker.compose.project="$PROJECT" --filter label=com.docker.compose.service="$SERVICE")
IMAGE=""
if [ -n "${OLD_CIDS[0]:-}" ]; then
  IMAGE="$(docker inspect --format '{{.Config.Image}}' "${OLD_CIDS[0]}")"
fi
if [ -z "$IMAGE" ]; then
  mapfile -t IMAGES < <(docker compose -p "$PROJECT" -f "$APP/$COMPOSE_FILE" config --images)
  IMAGE="${IMAGES[0]:-}"
fi
if [ -z "$IMAGE" ]; then
  fail "Не найден образ сервиса $SERVICE."
fi

if grep -q 'build:' "$APP/$COMPOSE_FILE"; then
  docker compose -p "$PROJECT" -f "$APP/$COMPOSE_FILE" build || fail "Сборка образа vic-smetacraft не прошла."
  mapfile -t IMAGES < <(docker compose -p "$PROJECT" -f "$APP/$COMPOSE_FILE" config --images)
  IMAGE="${IMAGES[0]:-}"
fi

echo "Миграции базы. Демонстрационные данные не загружаются." >&2
docker run --rm --user "$DB_OWNER" --entrypoint node \
  -e HOME=/tmp \
  -v "$APP:/release" -w /release \
  "$IMAGE" server/db-migrate.cjs || fail "Миграция базы не прошла. Код и SQLite возвращаются к копии."
DEST_PATH="$DEST" python3 - <<'PY'
import os, sqlite3
os.chdir("/srv/vic-workspace/apps/smetacraft")
con = sqlite3.connect("file:data/smetacraft.sqlite?mode=ro", uri=True, timeout=60)
version = con.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
row = con.execute("PRAGMA integrity_check").fetchone()
con.close()
open(os.path.join(os.environ["DEST_PATH"], "schema-after.txt"), "w", encoding="utf-8").write(str(version if version is not None else 0))
if row[0] != "ok":
    raise SystemExit(f"integrity {row[0]}")
print(f"schema-after {version}")
PY

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
} > "$DEST/SUCCESS.txt"
echo "AEZA обновлён: релиз $RELEASE_ID, коммит $SHA, схема $before -> $after" >&2
if [ "$before" != "$after" ]; then
  echo "Схема базы изменилась. Откат этого релиза — только вместе с копией SQLite из $DEST." >&2
fi
