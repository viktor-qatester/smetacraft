#!/usr/bin/env bash
# Перенос 4 коммитов из staverviktor17/vox-link (Cursor Origin) в GitHub smetacraft.
# Запускать в WSL (не PowerShell), после: origin auth login
set -euo pipefail

COMMITS=(22813d4 3310cfb 12381e6 a0b8080)
VOX_REMOTE="https://origin.cursor.com/staverviktor17/vox-link.git"
GITHUB_REPO="https://github.com/viktor-qatester/smetacraft.git"
WORKDIR="${SMETACRAFT_IMPORT_DIR:-$HOME/smetacraft-import}"

echo "=== Smetacraft: импорт из vox-link ==="

if ! command -v origin >/dev/null 2>&1; then
  echo "Origin CLI не найден. Установите:"
  echo '  curl -fsSL https://downloads.cursor.com/origin/install.sh | sh'
  echo '  echo export PATH="\$HOME/.local/bin:\$PATH" >> ~/.bashrc && source ~/.bashrc'
  exit 1
fi

if ! origin auth status 2>&1 | grep -qi "logged in"; then
  echo "Сначала войдите в Origin (откроется браузер):"
  echo "  origin auth login"
  exit 1
fi

echo "Клонирую GitHub smetacraft в $WORKDIR ..."
rm -rf "$WORKDIR"
git clone "$GITHUB_REPO" "$WORKDIR"
cd "$WORKDIR"

echo "Подключаю vox-link ..."
git remote add vox "$VOX_REMOTE"
git fetch vox main

echo "Переношу 4 коммита (код приложения + docs) ..."
for c in "${COMMITS[@]}"; do
  echo "  -> cherry-pick $c"
  git cherry-pick "$c"
done

echo "Отправляю на GitHub ..."
git push origin master

echo ""
echo "Готово! Проверьте:"
echo "  https://github.com/viktor-qatester/smetacraft/tree/master/docs"
echo "  docs/NEXT_SESSION_PROMPT.md должен быть на месте."
