---
name: smetacraft-pdf-facts
description: "Извлекать из PDF/DOCX только доказанные факты с evidence, сверять их с annotations v0.1 и применять в калькулятор после preview. Не вызывать для нового формата, формул, OCR API и цен."
---

# Факты PDF с доказательствами

Применять к уже утверждённому импорту PDF/DOCX, когда нужны факты, evidence, разметка `data/training/annotations/v0.1` или честный preview/apply. Новый формат файла без образца владельца остаётся за [file-import](../smetacraft-file-import/SKILL.md): там parser не писать.

## Контракт

Цепочка: `PDF → факты с evidence → preview → явное «Применить» → JSON v1 → Calculation Core`.

Факт (`smetacraft-extracted-facts/1`) содержит `fieldId`, `rawValue`, `normalizedValue`, `unit`, `status`, `confidence`, `source` (`objectId`, `page`, `evidence`), `target`, `warnings`. Статусы: `confirmed`, `needs_review`, `not_found`, `unsupported`, `conflict`, `ocr_required`. Модуль `js/app/extracted-facts.js` не пишет в DOM и не вызывает `js/core/*`.

- Precision важнее recall: нет доказательства — поле пустое, не `0`.
- `needs_review`, конфликт, неподдержанное и OCR не выбираются и не применяются.
- Цены (`*-price`) и `currency` из строительного PDF не меняются.
- Класс B не переводится в марку М. Квадратное сечение сваи не становится диаметром.
- Объёмы и массы — справочные факты, не замена формулам.
- AutoCAD без подписей не заполняет размеры. Нет локального OCR — статус `ocr_required`, без платного API.
- Исходные PDF в Git не класть: права см. `dataset_manifest.csv`.

## Проверки

1. `node --test tests/pdf-facts.test.cjs tests/annotation-harness.test.cjs tests/file-import.test.cjs tests/document-import-ui.test.cjs`
2. `node data/training/annotations/v0.1/validate_annotations.mjs`
3. Полный `node --test tests/*.test.cjs` и `git diff --check`. `tests/golden.json` не обновлять.
4. Браузер через HTTP: upload → preview не меняет проект → снять галочку → «Применить» пишет только выбранное; валюта и цены на месте.

Карта полей и ограничений — [`docs/IMPORT_PDF.md`](../../../docs/IMPORT_PDF.md). Эталон разметки — [`data/training/annotations/v0.1/README.md`](../../../data/training/annotations/v0.1/README.md).
