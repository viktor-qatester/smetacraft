#!/bin/bash
# Копирование кода не должно переносить владельца mktemp на APP.
# Откат SQLite должен вернуть исходные UID/GID и права базы.
set -eu
set -o pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "aeza-copy-perms: нужен root" >&2
  exit 1
fi
command -v rsync >/dev/null
command -v node >/dev/null

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if grep -n 'chmod 777' "$ROOT/scripts/aeza-remote.sh"; then
  echo "aeza-copy-perms: в скрипте есть chmod 777" >&2
  exit 1
fi

AEZA_REMOTE_SOURCE_ONLY=1
# shellcheck disable=SC1091
source "$ROOT/scripts/aeza-remote.sh"

sandbox="$(mktemp -d)"
# Родитель APP проходим, как /srv/vic-workspace/apps на сервере.
chmod 711 "$sandbox"
STAGE="$(mktemp -d)"
trap 'rm -rf "$sandbox" "$STAGE"' EXIT
APP="$sandbox/app"
DEST="$sandbox/backup"
control="$sandbox/control"
mkdir -p "$DEST" "$APP/data/blobs" "$STAGE/server" "$STAGE/data" "$STAGE/node_modules" "$control"

printf 'TOKEN=do-not-touch\n' > "$APP/.env"
printf 'name: vic-smetacraft\n' > "$APP/compose.vic.yaml"
printf 'blob-keep\n' > "$APP/data/blobs/keep.bin"
node -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[1]);
db.exec("CREATE TABLE keep_me (v TEXT)");
db.prepare("INSERT INTO keep_me (v) VALUES (?)").run("original-bytes");
db.close();
' "$APP/data/smetacraft.sqlite"

chown 999:982 "$APP" "$APP/data" "$APP/data/blobs" "$APP/data/smetacraft.sqlite" "$APP/data/blobs/keep.bin"
chown 1000:1000 "$APP/.env" "$APP/compose.vic.yaml"
chmod 700 "$APP" "$APP/data" "$APP/data/blobs"
chmod 640 "$APP/data/smetacraft.sqlite" "$APP/data/blobs/keep.bin"
chmod 600 "$APP/.env"
chmod 644 "$APP/compose.vic.yaml"

APP_OWNER="999:982"
APP_MODE="700"
DB_OWNER="999:982"
DB_MODE="640"

snap() {
  stat -c '%u:%g %a' "$1"
  sha256sum "$1" | awk '{print $1}'
}

env_before="$(snap "$APP/.env")"
compose_before="$(snap "$APP/compose.vic.yaml")"
db_before="$(snap "$APP/data/smetacraft.sqlite")"
blob_before="$(snap "$APP/data/blobs/keep.bin")"
data_before="$(stat -c '%u:%g %a' "$APP/data")"

cp -a "$APP/." "$control/"
chown 999:982 "$control"
chmod 700 "$control"

cp -a "$ROOT/server/." "$STAGE/server/"
printf 'new-code\n' > "$STAGE/release-marker.txt"
printf 'TOKEN=replaced\n' > "$STAGE/.env"
printf 'replaced: yes\n' > "$STAGE/compose.vic.yaml"
printf 'evil\n' > "$STAGE/data/evil.txt"
printf 'module-evil\n' > "$STAGE/node_modules/evil.js"
ln -s ".env" "$STAGE/env-link"
find "$STAGE" -type d -exec chmod 700 {} \;
find "$STAGE" -type f -exec chmod 600 {} \;
chown -R root:root "$STAGE"
chmod 700 "$STAGE"

umask 077
copy_code_tree "$STAGE" "$APP"

app_stat="$(stat -c '%u:%g %a' "$APP")"
test "$app_stat" = "999:982 700"
test "$(snap "$APP/.env")" = "$env_before"
test "$(snap "$APP/compose.vic.yaml")" = "$compose_before"
test "$(snap "$APP/data/smetacraft.sqlite")" = "$db_before"
test "$(snap "$APP/data/blobs/keep.bin")" = "$blob_before"
test "$(stat -c '%u:%g %a' "$APP/data")" = "$data_before"
test ! -e "$APP/data/evil.txt"
test ! -e "$APP/node_modules/evil.js"
test -f "$APP/release-marker.txt"
test "$(stat -c '%u:%g' "$APP/release-marker.txt")" = "999:982"
test "$(stat -c '%u:%g' "$APP/server")" = "999:982"
test "$(stat -c '%u:%g' "$APP/server/db-migrate.cjs")" = "999:982"
migrate_mode="$(stat -c '%a' "$APP/server/db-migrate.cjs")"
test "$migrate_mode" != "777"
test "$((8#$migrate_mode & 0400))" -ne 0

set +e
node -e '
const { spawnSync } = require("child_process");
const result = spawnSync("node", ["server/db-migrate.cjs"], {
  uid: 999,
  gid: 982,
  cwd: process.argv[1],
  env: { HOME: "/tmp", PATH: process.env.PATH },
  encoding: "utf8"
});
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
if (result.error) process.stderr.write(String(result.error) + "\n");
process.exit(result.status === null ? 1 : result.status);
' "$APP" > "$sandbox/migrate.out" 2> "$sandbox/migrate.err"
migrate_code=$?
set -e
cat "$sandbox/migrate.out"
if [ -s "$sandbox/migrate.err" ]; then
  cat "$sandbox/migrate.err" >&2
fi
test "$migrate_code" -eq 0
grep -q 'Applied migrations' "$sandbox/migrate.out"
if grep -q 'MODULE_NOT_FOUND' "$sandbox/migrate.err"; then
  echo "aeza-copy-perms: миграция получила MODULE_NOT_FOUND" >&2
  exit 1
fi

node -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[1]);
db.exec("CREATE TABLE restored (v TEXT)");
db.prepare("INSERT INTO restored (v) VALUES (?)").run("from-backup");
db.close();
' "$DEST/smetacraft.sqlite"
chown root:root "$DEST/smetacraft.sqlite"
chmod 600 "$DEST/smetacraft.sqlite"
printf 'wal\n' > "$APP/data/smetacraft.sqlite-wal"
printf 'shm\n' > "$APP/data/smetacraft.sqlite-shm"
restore_sqlite_file

test "$(stat -c '%u:%g %a' "$APP/data/smetacraft.sqlite")" = "999:982 640"
test "$(stat -c '%u:%g %a' "$DEST/smetacraft.sqlite")" = "0:0 600"
test ! -e "$APP/data/smetacraft.sqlite-wal"
test ! -e "$APP/data/smetacraft.sqlite-shm"
test "$(snap "$APP/data/blobs/keep.bin")" = "$blob_before"
test "$(stat -c '%u:%g %a' "$APP")" = "999:982 700"
node -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.argv[1], { readOnly: true });
const row = db.prepare("SELECT v FROM restored").get();
db.close();
if (!row || row.v !== "from-backup") process.exit(1);
' "$APP/data/smetacraft.sqlite"

rsync -a "$STAGE"/ "$control"/
control_stat="$(stat -c '%u:%g %a' "$control")"

echo "APP after copy: $app_stat"
echo "db-migrate.cjs mode: $migrate_mode"
echo "sqlite after restore: $(stat -c '%u:%g %a' "$APP/data/smetacraft.sqlite")"
echo "backup sqlite: $(stat -c '%u:%g %a' "$DEST/smetacraft.sqlite")"
echo "plain rsync -a on a copy of APP: $control_stat"
echo "aeza-copy-perms: ok"
