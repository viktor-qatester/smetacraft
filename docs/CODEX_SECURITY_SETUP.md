# Codex Security — настройка для аудита SmetaCraft

Документ для повторяемого read-only security-аудита на машине владельца (Windows + Codex checkout).

Обновлено: 2026-09-21. Диапазон Phase 8: `5ee8135..f512a5f`.

---

## Git safe.directory (Windows)

Codex клонирует/открывает worktree с другим владельцем каталога. Без исключения встроенный security-scan **не видит** checkout.

**Разрешённая команда (один раз на машине):**

```bash
git config --global --add safe.directory C:/Users/Victor/Documents/Codex/smetacraft
```

Путь замените, если checkout лежит в другом месте. Код репозитория эта настройка **не меняет** — только доверие Git к каталогу.

---

## Security preflight (Codex)

| Проблема | Решение |
|----------|---------|
| `python` не в PATH | Использовать bundled Python из окружения Codex (preflight сообщит путь). |
| Preflight «долго» | Нормально при первом чтении слоёв конфигурации; дождаться статуса **ready**. |
| **Daybreak access: not_granted** | Защищённые результаты Codex Security могут не отображаться. Заявка: https://chatgpt.com/cyber . Ручной аудит и `node --test` остаются обязательными. |

Preflight **ready** — обязательное условие перед анализом по security-навыку Codex.

---

## Ограничения Codex Workbench

При threat-model scan Workbench распознал только **четыре** source-like файла Phase 8:

- `index.html`
- `js/app/boot.js`
- `js/app/document-import.js`
- `server/migrations/002_file_objects.sql`

**Не попали в инвентарь автоматически** (расширение `.cjs`):

- `server/file-store.cjs`
- `server/file-http.cjs`
- `server/sqlite-file-metadata-repository.cjs`
- `server/import/explicit-text.cjs`
- `server/zip-reader.cjs`

→ Серверную цепочку upload → storage → parser **проверять вручную** или отдельным scope в Codex/Cursor, не полагаться только на Workbench inventory.

---

## Минимальный чеклист ручного аудита Phase 8

1. Blob в `data/blobs/<objectId>`, не по имени пользователя; static URL не отдаёт файл.
2. Upload: MIME + magic bytes, лимит 5 MiB, Bearer capability как Phase 7.
3. Preview не меняет DOM/`localStorage`; apply только parameters.
4. `js/core/*`, `tests/golden.json` — без изменений в diff Phase 8.
5. `node --test tests/*.test.cjs` — зелёный (154/154 на `f512a5f`).
6. Поведенческий аудит PDF/DOCX — Gemini Notebook + локальный browser smoke (`127.0.0.1:8000`).

---

## Связанные документы

- [PHASE_8_CODEX_AUDIT.md](PHASE_8_CODEX_AUDIT.md) — выводы аудита Phase 8 v1
- [IMPORT_PDF.md](IMPORT_PDF.md) — контракт parser
- [PHASES_6_9_EXECUTION_PLAN.md](PHASES_6_9_EXECUTION_PLAN.md) §6 — исходные exit criteria
