# Phase 8 v1 — отчёт read-only аудита (Codex + Cursor)

Обновлено: 2026-09-21  
**Диапазон:** `5ee8135..f512a5f` (merge PR #16)  
**Статус:** ⚠️ **Условно готов к приёмке** — security surface в целом соблюдён; нужны Gemini Notebook (поведение) и явная приёмка владельца.

Код в этом аудите **не менялся**. Golden и `js/core/*` не трогались.

---

## 1. Краткий вердикт

| Область | Оценка |
|---------|--------|
| Storage boundary (blob вне web root, objectId) | 🟢 |
| Upload security (MIME, magic, size, capability) | 🟢 |
| Preview / apply split, цены не импортируются | 🟢 |
| Контракт «без LLM/OCR» | 🟢 |
| `js/core/*`, `tests/golden.json` в diff Phase 8 | 🟢 не изменены |
| Автотесты `node --test tests/*.test.cjs` | 🟢 **154/154** |
| Codex Workbench coverage | 🟡 `.cjs` сервер не в инвентаре — ручная проверка |
| Exit criteria «ровно один формат» | 🟡 см. §4 |
| Codex Daybreak Security | 🟡 not_granted — часть результатов скрыта |
| Приёмка владельца / ROADMAP | 🔴 не закрыта |

---

## 2. Что проверено

### 2.1 Codex Security workflow (Windows checkout)

- Применён `git config --global --add safe.directory` для Codex checkout (см. [CODEX_SECURITY_SETUP.md](CODEX_SECURITY_SETUP.md)).
- Security preflight: capabilities **ready** (после bundled Python).
- Threat model: завершён; локальный `threat_model.md` (+32 строки) в checkout Codex — **не merge в репо** (артефакт Codex).
- Workbench inventory: 4 файла (см. setup doc); server `.cjs` — **manual scope**.

### 2.2 Cursor verification (cloud, `master` @ `f512a5f`)

**Storage (`server/file-store.cjs`):**

- Путь `data/blobs/<32-hex objectId>`; `assertObjectId` отсекает traversal.
- Запись temp + `rename` + `fsync`; cleanup `.tmp-*`.

**HTTP (`server/file-http.cjs`):**

- Allowlist PDF/DOCX; sanitize имени (`..`, `\0`, separators).
- Bearer capability + origin check (как Phase 7).
- Download: attachment disposition, nosniff (по контракту IMPORT_PDF).

**Parser (`server/import/explicit-text.cjs`):**

- Явный текст only; числа без подписи не мапятся.
- Neutral model → preview → apply через `validateProjectV1`.

**Frontend (`js/app/document-import.js`, `index.html`):**

- Памятка пользователя у блока загрузки PDF/DOCX.
- Preview обязателен перед apply.

**Regression:**

- 154/154 tests pass; golden contract preserved.

---

## 3. Findings

### 🟢 Без замечаний (blockers нет)

1. Phase 8 diff **не меняет** расчётное ядро и golden.
2. Storage/API соответствуют Phase 8.1–8.2 execution plan.
3. Preview/apply разделены; import path не подставляет цены.
4. Тесты storage + import + UI покрывают основные сценарии.

### 🟡 Замечания (не блокируют merge, учесть при приёмке)

| # | Тема | Детали | Рекомендация |
|---|------|--------|--------------|
| M1 | Workbench inventory | `.cjs` не в автоматическом threat inventory | При следующем security-scan явно включать `server/file-*.cjs`, `server/import/*.cjs` |
| M2 | Daybreak | `not_granted` на аккаунте Codex | Не считать Codex Security единственным источником; опираться на тесты + ручной review |
| M3 | Pages vs loopback | Upload PDF/DOCX **только** с локальным `server/server.cjs` | В памятке/UI уже косвенно; browser smoke — только localhost |
| M4 | `threat_model.md` | Остался в Codex checkout, не в GitHub | При необходимости — скопировать в `docs/` вручную из Codex «Проверить» |

### 🟡 Документное расхождение (осознанное решение v1)

**Execution plan §6 exit criteria:** «Поддерживается **ровно один** документированный формат».

**Phase 8 v1 реализовано:** PDF **и** DOCX с **одним** parser contract (`explicit-text`), один neutral model, один UI flow.

**Позиция для приёмки:** v1 = **один класс импорта** (explicit-text document), два MIME-контейнера. Зафиксировано в [IMPORT_PDF.md](IMPORT_PDF.md) и решениях владельца. При формальной приёмке обновить формулировку exit criteria в `PHASES_6_9_EXECUTION_PLAN.md` или ROADMAP — «один контракт parser, PDF/DOCX».

---

## 4. Вне scope (не баг)

- OCR / vision по AutoCAD-plot
- Excel / CSV как формат проекта
- Импорт цен
- Phase 9 (retention 90d, публичный multi-user host)
- Автоудаление blob после apply

---

## 5. Что осталось до «Phase 8 принята»

1. **Gemini Notebook** — поведенческий аудит (живой AutoCAD-PDF + фикстуры + IMPORT_PDF).
2. **Локальный browser smoke** (Victor): `node server/db-migrate.cjs && node server/server.cjs` → upload → preview → apply.
3. **Явное «принято»** владельца → обновить `docs/ROADMAP.md` (сейчас merge выполнен, приёмка — нет).
4. **Skill maintenance** после приёмки ([smetacraft-skill-maintenance](../.agents/skills/smetacraft-skill-maintenance/SKILL.md)).

---

## 6. Рекомендации Cursor (следующие шаги)

| Приоритет | Действие | Когда |
|-----------|----------|-------|
| P0 | Дождаться отчёта Gemini Notebook | до приёмки |
| P1 | Обновить ROADMAP: merge `f512a5f` выполнен, Phase 8 ждёт приёмки | docs-only PR |
| P2 | После «принято» — ROADMAP + skill maintenance | одним коммитом |
| P3 | Не начинать Phase 9 без отдельного scope | — |

**Не делать без запроса:** менять parser под OCR; расширять форматы; трогать golden/core.

---

## 7. Источники

- Codex chat «Аудит Phase 8 после merge» (threat model, preflight, workbench limits)
- Cursor coordinator verification on `f512a5f`
- [IMPORT_PDF.md](IMPORT_PDF.md)
- PR #16 body and test suite
