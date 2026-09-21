# Phase 8 v1 — поведенческий аудит (Gemini Notebook)

Обновлено: 2026-09-21  
**Источник:** `audit-report-smetacraft-phase8.pdf` (владелец)  
**Диапазон:** `master` @ `f512a5f`, PR #16  
**Вердикт:** ✅ **ПРИНЯТО (PASSED)**

Документный и сценарный аудит: контракт IMPORT_PDF, памятка UI, живой AutoCAD-PDF, тестовые фикстуры.

---

## Краткий вердикт

Phase 8 v1 **полностью соответствует** архитектурному контракту:

- Parser — только явные метки («лента», «стены», «хомуты») + геометрия.
- **Цены never**; LLM/OCR/Excel вне scope.
- AutoCAD plot (живой 16×A3 + `phase-8-autocad-like.pdf`) → viewer, **автоподстановка = 0**.
- Preview обязателен; apply только по кнопке «Применить».

---

## Матрица сценариев (из отчёта)

| Файл | Подписи | Автоподстановка | Preview | Риск |
|------|---------|-----------------|---------|------|
| Живой AutoCAD A3 (16 листов) | Нет | 0 | Viewer + «вручную» | Нулевой |
| phase-8-autocad-like.pdf | Нет | 0 | Viewer + «вручную» | Нулевой |
| phase-8-explicit-labels.pdf | Да (strip-*, walls-*) | Только подписи | Таблица найдено/вручную | Низкий |
| phase-8-explicit-labels.docx | Да | Только подписи | Таблица найдено/вручную | Низкий |

---

## Сверка «обещание ↔ IMPORT_PDF ↔ памятка»

🟢 Расхождений нет по ключевым пунктам: цены, AutoCAD без подписей, preview, запрет LLM/OCR, JSON отдельно.

---

## Рекомендации (не блокеры приёмки)

1. **Баннер в viewer** — «чертежи без меток → ручной ввод».
2. **Цвета в preview** — зелёный «найдено», серый «вручную».
3. **Синхронизация терминов** — памятка ↔ `docs/IMPORT_PDF.md`.

Реализация — отдельный UI scope по запросу владельца; **не блокирует** формальную приёмку Phase 8.

---

## Чеклист прораба (localhost)

Upload PDF/DOCX работает только с loopback `node server/server.cjs`:

1. Живой AutoCAD A3 → viewer 16 листов, preview «всё вручную».
2. explicit-labels pdf/docx → strip-*, walls-*, stirrup-*; цены пусты.
3. До «Применить» калькulator не меняется.
4. «Загрузить свой проект» — только `.json`.

---

## Связанные документы

- [PHASE_8_CODEX_AUDIT.md](PHASE_8_CODEX_AUDIT.md) — security/code (⚠️ условно)
- [IMPORT_PDF.md](IMPORT_PDF.md) — контракт parser
- [user-guide-project-upload.md](/cursor/stores/bc-5cb6fff8-d548-4081-a619-b84dd2cc20ba/docs/user-guide-project-upload.md) — памятка UI (Agent Store)
