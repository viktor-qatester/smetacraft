---
name: smetacraft-file-import
description: "Реализовывать Phase 8 SmetaCraft — закрытое файловое хранилище и один утверждённый импорт с preview перед apply. Не применять к изменению формул, golden или универсальному importer без образца владельца."
---

# Phase 8: файловое хранилище и импорт SmetaCraft

Применять к Phase 8 и согласованным подшагам 8.1–8.4. Не применять к правкам расчётов, JSON v1 вне import path или Phase 9.

## Перед кодом

1. Прочитай `docs/ROADMAP.md`, `docs/PHASES_6_9_EXECUTION_PLAN.md` §6, `AGENTS.md`, `docs/PROJECT_MIGRATION.md` (граница Phase 7/8).
2. Сверь Agent Store plan: `docs/phase-8-plan.md` в Project store.
3. Убедись, что Phase 7 принята: migrate/readback работает. Baseline Phase 8 accepted: **154/154** на `master` @ `f512a5f`.
4. **Без образца и mapping-contract владельца** — только 8.1 storage (формат-агностично). Не выбирай новый CSV/XLSX/PDF сам. Не пиши parser нового формата. Уже принятый PDF/DOCX (`docs/IMPORT_PDF.md`) и факты с evidence/annotations v0.1 веди по [smetacraft-pdf-facts](../smetacraft-pdf-facts/SKILL.md), если владелец разрешил этот этап. Не подставляй значения без доказательства и не меняй формулы.

## Решения владельца (блокер parser)

До parser/upload UI зафиксируй: формат, MIME, max size, читаемые поля, единицы, поведение пустых/дублей, preview, apply mapping, retention оригинала. Документируй в `docs/IMPORT_<FORMAT>.md`.

## 8.1 Storage boundary

- Blob **вне web root**; путь по random `objectId`, не по имени пользователя.
- Metadata в SQLite: objectId, projectId, capability/owner, originalName, mediaType, bytes, sha256, status, timestamps.
- Статусы: `quarantine → validated → available` или `rejected`.
- Выдача только через авторизованный endpoint; `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`; inline HTML/SVG запрещён.
- Temp write + atomic rename; лимиты size/count до полного буферирования.
- Static handler **не** отдаёт `data/` и blobs — проверь тестом.

Рекомендуемые модули: `server/file-store.cjs`, `server/file-metadata-repository.cjs`, `server/migrations/NNN_*.sql`, `tests/file-storage.test.cjs`.

## 8.2 Безопасная загрузка

Проверь до `available`: размер, allowlisted MIME + magic bytes, безопасное имя (metadata only), digest/duplicate policy, структура формата, отсутствие path traversal. Неверный файл не меняет проект. Cleanup незавершённых temp.

Для архивных форматов (XLSX): лимиты entries, unpacked size, compression ratio, depth; макросы и внешние ссылки не исполнять.

## 8.3 Parser и neutral import model

Parser возвращает нейтральную модель (строка, значения, единица, warnings/errors, mapping). **Не** пишет в DOM, **не** вызывает `js/core/*`.

Flow: upload → parse → **preview** → явный apply → существующий `validateProjectV1` / NormalizedProjectModel. Исходный файл не становится JSON v1.

## 8.4 Проверки

Применяй [regression-tests](../smetacraft-regression-tests/SKILL.md): полный `node --test tests/*.test.cjs`, плюс import/storage/security сценарии из execution plan.

Контрольный расчёт после apply: ввод → строки ведомости → итог совпадает с ожиданием. Ошибка parser не меняет DOM, `smetacraft_project`, форму и ведомость.

Browser smoke: upload → preview → apply / отказ; static URL не отдаёт blob.

Перед приёмкой — [domain-review](../smetacraft-domain-review/SKILL.md) на diff.

## Контракты (не нарушать)

- `js/core/*.js` и `tests/golden.json` — только по явному разрешению.
- `localStorage` ключ `smetacraft_project` — не удалять автоматически.
- Расчёты остаются в браузере; backend не считает смету.
- SQLite в `data/`; PostgreSQL не использовать.
- Loopback (`127.0.0.1` / `localhost`) — разработка. Публичный хост — только из `SMETACRAFT_PUBLIC_ORIGIN` (сейчас Fornex `http://31.172.78.193` и `http://333428.fornex.cloud`). GitHub Pages не прод и не в allowlist.
- Commit/push/PR — по разрешению владельца; merge в `master` (= Pages static) — только «лей». Deploy Fornex — [`docs/DEPLOY_FORNEX.md`](../../../docs/DEPLOY_FORNEX.md), без секретов в git.

## После приёмки Phase 8

Phase 8 **принята владельцем 2026-09-21** (merge `f512a5f`, 154/154). Контракт: `docs/IMPORT_PDF.md`, UI-памятка в `index.html`, viewer/preview/apply в `js/app/document-import.js`. Аудиты: `docs/PHASE_8_CODEX_AUDIT.md`, `docs/PHASE_8_GEMINI_AUDIT.md`. Обнови `docs/ROADMAP.md` при следующих изменениях. Примени [skill-maintenance](../smetacraft-skill-maintenance/SKILL.md). Не начинай Phase 9 автоматически.
