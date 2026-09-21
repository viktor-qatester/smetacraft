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

## Preview и apply

1. Upload → storage + preview JSON. DOM и `smetacraft_project` не меняются.
2. UI показывает таблицу «найдено / введите вручную» и viewer (PDF: blob URL в iframe; DOCX: текст).
3. «Применить» накладывает `parameters` на текущий `collectProject()`, гоняет `validateProjectV1` и `applyProject`. Цены текущей сметы сохраняются.
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
| **Найдено автоматически** (зелёный) | будет подставлено после «Применить» |
| **Требуется ввод вручную** (серый) | введите по чертежу в калькуляторе |

Ничего не меняется **молча** — только после кнопки **«Применить»**.

### Если файл — чертежи AutoCAD (как на стройке)

PDF из AutoCAD — **картинки листов** с размерами на чертеже, **без текстовых подписей** «лента 40 м». В этом случае:

- файл **виден** в просмотрщике, листы листаются;
- смета считается как обычно;
- **автоподстановка размеров — 0** — вводите параметры **вручную**, глядя на PDF рядом;
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
| GET | `/api/projects/:projectId/files/:objectId/preview` | повторный preview |
| POST | `/api/projects/:projectId/files/:objectId/apply` | status `available` |

Ошибки: `unsupported_media_type`, `body_too_large`, `invalid_file`, `origin_forbidden`, `capability_required`, `not_found`, `file_limit_exceeded`.

`origin_forbidden` — Host/Origin вне loopback и вне `SMETACRAFT_PUBLIC_ORIGIN`. GitHub Pages в allowlist не входит. Публичный bind: `SMETACRAFT_BIND=0.0.0.0`. Инструкция testers: [`DEPLOY_FORNEX.md`](DEPLOY_FORNEX.md).

Фикстуры тестов: `tests/phase8-fixtures.cjs` (явные подписи и AutoCAD-like без подписей). Живой 16-листовый plot владельца не требуется: автоподстановка из него = 0.
