# Импорт PDF и DOCX (Phase 8)

Контракт парсера явного текста. Не описывает OCR чертежей, LLM и Excel. Формулы `js/core/*` не вызываются.

## Форматы

| Формат | MIME | Magic bytes | Макс. размер |
| --- | --- | --- | --- |
| PDF | `application/pdf` | `%PDF-` | 5 MiB |
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `PK\x03\x04` + `[Content_Types].xml` с `wordprocessingml` | 5 MiB |

JSON-проект по-прежнему загружается кнопкой «Загрузить свой проект» в браузере (1 MiB, без сервера). XLSX, CSV и изображения **не** являются форматом проекта Phase 8.

## Хранение

- Blob: `data/blobs/<objectId>` вне web root. `objectId` — 32 hex, не имя файла пользователя.
- Metadata: SQLite `file_objects` (миграция `002_file_objects.sql`).
- Статусы: `quarantine` → `validated` → `available`. Ошибка разбора → `rejected`, blob удаляется.
- После apply файл **не** удаляется (`available`).
- Выдача только с Bearer capability того же проекта, что и Phase 7. Static URL `/data/blobs/...` → 404.
- Download: `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`.

## Neutral import model

Parser (`js/app/explicit-text.js`, сервер реэкспортирует `server/import/explicit-text.cjs`) читает текст PDF (литералы / UTF-16BE hex / FlateDecode) или `word/document.xml` в DOCX и возвращает:

```json
{
  "format": "pdf",
  "pageCount": 2,
  "extractedChars": 80,
  "sourceKind": "explicit-text | drawing-plot",
  "message": "…",
  "fields": [
    { "fieldId": "strip-length", "label": "Периметр / длина ленты", "unit": "m", "status": "found|manual", "value": 42, "snippet": "…" }
  ],
  "parameters": { "strip-length": "42" },
  "warnings": [],
  "errors": []
}
```

`parameters` содержит **только** найденные поля. Ключи цен в модель не попадают.

## Mapping явных подписей

Текст нормализуется: `ё→е`, нижний регистр, сжатие пробелов. Число без **подписи** не мапится (чертёж AutoCAD).

| Подпись рядом с числом | Поле | Единица |
| --- | --- | --- |
| лента / ленточный фундамент + периметр / длина | `strip-length` | m |
| лента + ширина | `strip-width` | m |
| лента + высота | `strip-height` | m |
| хомуты + диаметр | `strip-stirrup-diameter` | mm |
| хомуты + шаг | `strip-stirrup-step` | mm |
| стены + периметр / длина | `walls-perimeter` | m |
| стены + высота | `walls-height` | m |
| плита + длина / ширина / толщина | `length` / `width` / `height` | m |
| штукатурка + длина / высота | `plaster-length` / `plaster-height` | m |
| перекрытие + длина / ширина | `floor-length` / `floor-width` | m |
| кровля + длина / ширина | `roof-length` / `roof-width` | m |

Единицы `мм`/`см`/`м` пересчитываются в единицу поля. Нет единицы — принимается единица поля, без догадок «это миллиметры, потому что число большое».

Дубли с разными значениями: первое совпадение, warning. Пустые и неизвестные строки игнорируются.

**Цены** (`*-price`) никогда не импортируются, даже если в тексте есть «цена 85».

## Извлечённые факты

Поверх подписей калькулятора parser добавляет массив `facts` схемы `smetacraft-extracted-facts/1`. Факт не пишет в DOM и не вызывает `js/core/*`.

```json
{
  "fieldId": "foundation.slab.thickness_mm",
  "rawValue": "монолитная ж/б плита h=200 мм",
  "normalizedValue": 200,
  "unit": "mm",
  "status": "confirmed",
  "confidence": 0.95,
  "source": { "objectId": null, "page": null, "evidence": "монолитная ж/б плита h=200 мм" },
  "target": { "projectFieldId": "height", "conversion": "mm_to_m", "applyValue": "0.2", "kind": "field" },
  "warnings": ["Толщина плиты переводится в метры поля «Толщина»."],
  "selectable": true,
  "defaultSelected": true
}
```

Статусы: `confirmed`, `needs_review`, `not_found`, `unsupported`, `conflict`, `ocr_required`.

Страница заполняется только если в PDF одна страница и фрагмент снят с неё. На многостраничном файле без координат страница остаётся пустой: номер не выдумывается.

Галочка в preview стоит только у `defaultSelected`. `needs_review`, конфликт, OCR и поля без безопасного `target` не выбираются. «Применить» пишет только отмеченные строки. Ошибка любого выбранного факта отменяет весь пакет: форма не меняется частично.

### Что извлекается

| Факт | Куда | Условие |
| --- | --- | --- |
| Тип `pile_grillage_slab` или `slab_with_strip_ribs` | никуда | только эти формулировки, справочно |
| Толщина плиты | `height` | есть слово плиты/slab и единица мм, см или м |
| Длина и ширина плиты | `length`, `width` | подпись и единица |
| Класс B | никуда | в марку М не переводится |
| Марка М150–М500 | `grade` | фраза «марка бетона»; галочка снята; цена не меняется |
| Верхний диаметр 8/10/12/14/16 и шаг | `bar-diameter`, `bar-step` | явная зона или «стержни d… мм» |
| Две зоны армирования | `slab-mesh-count` = 2 | «верхняя» и «нижняя» зоны |
| Число, сечение, длина основных свай | первая строка свай, только по галочке | сечение `300x300` в диаметр не пишется; включение свай не переключается |
| Объём бетона и масса арматуры | никуда | справочно, формулы не заменяются |
| Рёбра плиты | никуда | в ленту сами не переносятся |

Нет текстового слоя (`contentChars` < 8) — факт `document.ocr_required`. Локальный OCR в этой сборке не подключён (`createLocalOcrAdapter().available === false`). Платные OCR API не вызываются.

Эталон разметки `data/training/annotations/v0.1` гоняется отдельно от маппинга: совпадение значения и решение «можно ли писать в поле» — разные проверки. Исходные PDF в Git не хранятся.

```bash
node data/training/annotations/v0.1/validate_annotations.mjs
node --test tests/annotation-harness.test.cjs tests/pdf-facts.test.cjs
```

Если корпус лежит локально: `SMETACRAFT_CORPUS_DIR=/path/to/pdfs node --test tests/annotation-harness.test.cjs`.

## Preview и apply

1. Upload → на allowed origin (loopback / Fornex) клиент сам создаёт server project через `POST /api/projects/migrate`, без кнопки «Перенести копию». Storage + preview JSON. DOM и `smetacraft_project` не меняются.
2. UI показывает таблицу фактов: значение, страница, доказательство, поле калькулятора, статус и галочка. Viewer: PDF в iframe, DOCX текстом. «Удалить файл» снимает preview, iframe и object URL; при `objectId` вызывает `DELETE /api/projects/:id/files/:objectId`.
3. «Применить» берёт только отмеченные строки, собирает один пакет, гоняет `validateProjectV1` и затем `applyProject`. Ошибка пакета не меняет форму. Цены и валюта текущей сметы сохраняются. Если в DOM нет чекбоксов, остаётся прежний путь `parameters` для старых вызовов.
4. `POST .../files/:objectId/apply` только ставит `available`. Расчёт сметы на сервере не выполняется.

AutoCAD-plot без подписей: `sourceKind = drawing-plot`, `parameters = {}`, apply нечего переносить, viewer работает.

## Памятка пользователя

Терминология совпадает с блоком загрузки в `index.html` (вкладка «Проект») и памяткой Phase 8.

### Загрузите файл проекта

Поддерживаются **PDF** и **DOCX** — листы чертежей, пояснительная записка, комплект дома. После загрузки файл **сохраняется у вашей сметы** и **открывается в окне просмотра** — можно листать листы.

### Автоподстановка размеров — по возможности

SmetaCraft **пытается автоматически** перенести в калькулятор **только то, что явно написано в файле** — словами, с подписью («лента», «стены», «хомуты» и др. рядом с числом). **Цены не подставляются** — у каждого свои поставщики; цены вы вводите сами.

### Перед применением — всегда «Предпросмотр»

Таблица предпросмотра показывает статус каждого поля:

| Статус в UI | Значение |
| --- | --- |
| **Подтверждено** | галочка стоит; в калькулятор попадёт после «Применить» |
| **Проверить / конфликт** | галочка снята, само не применяется |
| **Не найдено / нужен OCR** | введите вручную; пустое значение не становится нулём |

Ничего не меняется **молча** — только отмеченные строки и только после кнопки **«Применить»**. Цены и валюта из PDF не берутся.

### Если файл — чертежи AutoCAD (как на стройке)

PDF из AutoCAD — **картинки листов** с размерами на чертеже, **без текстовых подписей** «лента 40 м». В этом случае:

- файл **виден** в просмотрщике, листы листаются;
- смета считается как обычно;
- **автоподстановка размеров — 0** — вводите параметры **вручную**, глядя на PDF рядом. Это не «сервер недоступен»;
- над PDF показывается баннер: «Для чертежей без текстовых меток используйте просмотрщик для ручного ввода параметров».

Это **нормально**, не ошибка. Программа не «смотрит глазами» на чертёж — только читает **явный текст**.

### JSON-проект

Файл `.json` загружается кнопкой **«Загрузить свой проект»** (как раньше): восстанавливаются все поля и цены.

## API

| Метод | Путь | Назначение |
| --- | --- | --- |
| POST | `/api/projects/:projectId/files` | raw body PDF/DOCX, заголовок `X-Smetacraft-Filename` |
| GET | `/api/projects/:projectId/files` | список metadata |
| GET/HEAD | `/api/projects/:projectId/files/:objectId` | скачать blob |
| DELETE | `/api/projects/:projectId/files/:objectId` | убрать blob, status `rejected` |
| GET | `/api/projects/:projectId/files/:objectId/preview` | повторный preview |
| POST | `/api/projects/:projectId/files/:objectId/apply` | status `available` |

Ошибки: `unsupported_media_type`, `body_too_large`, `invalid_file`, `origin_forbidden`, `capability_required`, `not_found`, `file_limit_exceeded`.

`origin_forbidden` — Host/Origin вне loopback и вне `SMETACRAFT_PUBLIC_ORIGIN`. GitHub Pages в allowlist не входит. Публичный bind: `SMETACRAFT_BIND=0.0.0.0`. Инструкция testers: [`DEPLOY_FORNEX.md`](DEPLOY_FORNEX.md).

Фикстуры тестов: `tests/phase8-fixtures.cjs` (явные подписи и AutoCAD-like без подписей). Живой 16-листовый plot владельца не требуется: автоподстановка из него = 0.
