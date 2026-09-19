# SmetaCraft: контракт переноса проектов (Phase 7.1)

Документ фиксирует контракт Phase 7 до написания кода. Он ничего не реализует и не разрешает реализацию. Статус фаз задаёт [`docs/ROADMAP.md`](ROADMAP.md), последовательность подшагов — [`docs/PHASES_6_9_EXECUTION_PLAN.md`](PHASES_6_9_EXECUTION_PLAN.md) §5.

База: `master`, commit `f7e60f6` (2026-09-19). Владелец Виктор Ставер утвердил только шаг 7.1.

---

## 1. Цель Phase 7 и граница шага 7.1

Цель Phase 7: дать пользователю явный, повторяемый и проверяемый перенос проекта из `localStorage` в серверное хранилище, сохранив локальную копию рабочей и не сломав работу при недоступном сервере.

Phase 7.1 — только контракт: этот документ. В 7.1 не создаются и не изменяются ни серверные модули, ни SQLite, ни UI, ни тесты.

| Подшаг | Содержание | Состояние |
| --- | --- | --- |
| 7.1 | Контракт миграции, API, envelope, канонизация, коды ошибок, схема БД, модель угроз, список тестов | этот документ, ожидает ревью владельца |
| 7.2 | Серверная запись, idempotency, readback, repository boundary, SQLite | не начат, требует отдельного разрешения |
| 7.3 | Клиентский модуль явного переноса и состояния UI | не начат, требует отдельного разрешения |
| 7.4 | Браузерная проверка и контрольный расчёт | не начат, требует отдельного разрешения |

Phase 7 хранит только JSON-проекты. Произвольные файлы, импорт строительных документов, аккаунты, entitlements и списки проектов в UI — вне Phase 7.

---

## 2. Уже принятые решения, на которых стоит контракт

1. **Phase 6 принята как локальный slice.** `server/server.cjs` — loopback-сервер со статической раздачей по allowlist и `POST /api/project-check`, который не хранит проект и не считает смету. Phase 7 расширяет этот сервер, а не заменяет его и не переписывает «заодно».
2. **SQLite в каталоге `data/` вне статического корня.** Файл БД не раздаётся static-handler, не попадает в git и не доступен ни по одному публичному URL.
3. **Сервер остаётся на `127.0.0.1`.** Fornex, публичный домен, TLS и CORS не включаются, пока владелец не скажет это отдельно. Никакая часть Phase 7 не должна зависеть от публичного хоста.
4. **Печатная шапка объекта/заказчика не входит в Phase 7.** Это отдельная продуктовая правка, не смешивать с миграцией.
5. **Файлы Phase 8** (`server/file-store.cjs`, `server/import/*`, blob-хранилище) в Phase 7 не создаются даже как заготовки.
6. **Backend не становится вторым расчётным движком.** Сервер хранит только вход. Ни одной производной величины — итогов, строк ведомости, цен, категорий, PDF — сервер не вычисляет, не хранит и не возвращает.
7. **GitHub Pages отдаёт `master`.** Мердж в `master` равен публикации. Любой код Phase 7 должен быть безвреден на статическом Pages: без сетевых запросов при загрузке страницы и без видимых ошибок при отсутствии сервера.

---

## 3. Что не меняется

### JSON v1

- `format: "smetacraft-project"`, числовая `version: 1`. Новая версия формата в Phase 7 не вводится.
- Границу проверяют существующие `validateProjectV1`, `projectV1ToModel`, `modelToProjectV1`, `parseProjectText` в `js/app/project.js`. Второй валидатор на клиенте не появляется.
- Действующие правила сохраняются: aliases `w/h/n`, явное `opening.locked: false`, лимит 500 строк в `openings`/`piles`, лимит файла 1 MiB, игнорирование неизвестных метаданных, отказ при известном ключе с неверным типом, атомарность отказа.
- Serverный envelope (раздел 5) **не является** частью JSON v1 и никогда не записывается внутрь проекта.

### localStorage

- Ключ проекта остаётся `smetacraft_project`.
- Он **никогда** не удаляется, не очищается и не перезаписывается автоматически в результате миграции — ни при успехе, ни при ошибке.
- Migration receipt хранится в отдельном ключе `smetacraft_project_migration_v1` и не смешивается с JSON проекта.

### Ведомость

Строки `name/netLabel/k/orderLabel/cost`, их порядок, количества, коэффициенты и итоги не меняются. `js/core/**` в Phase 7 не трогается. `tests/golden.json` не перезаписывается.

---

## 4. Канонические байты и `sha256`

Второй формат проекта не вводится. Канонизация — это правило о байтах, а не о новой структуре данных.

### Правило

Канонические байты проекта — это UTF-8-кодирование результата

```js
JSON.stringify(parseProjectText(JSON.stringify(exportProjectV1Snapshot())))
```

то есть ровно та строка, которую клиент уже формирует в `js/app/backend-check.js` для `POST /api/project-check`.

Свойства этой строки, которые и делают её канонической:

1. `JSON.stringify` вызывается без `replacer` и без `space`: ни пробелов, ни переводов строк, ни отступов, ни завершающего символа новой строки.
2. Порядок ключей — порядок вставки, детерминированно заданный `validateProjectV1` и `modelToProjectV1`: `format`, `version`, `fields`, `checks`, `radios`, `flags`, `block`, `billBlock`, `openings`, `piles`. Ключи **не сортируются**: сортировка была бы вторым форматом.
3. Кодировка — UTF-8 без BOM. Кириллица в `piles[].name` остаётся литеральными UTF-8-байтами; `TextEncoder` в браузере и `Buffer` в Node дают одинаковую последовательность.
4. `JSON.stringify` начиная с ES2019 well-formed: одиночные суррогаты экранируются как `\uXXXX`, поэтому байты всегда валидный UTF-8.
5. `sha256` — SHA-256 этих байтов, hex в нижнем регистре. Это в точности то, что сервер уже делает в `server/server.cjs` (`crypto.createHash('sha256').update(body).digest('hex')`).

### Обязанности сторон

- **Клиент** формирует канонические байты сам и отправляет их как тело `POST` без изменений. Свой digest он вычисляет локально (`crypto.subtle.digest("SHA-256", ...)`) до отправки и сохраняет для сверки.
- **Сервер** хеширует принятые байты **как есть**, до и без какой-либо повторной сериализации, и сохраняет тот же байтовый буфер как BLOB. У сервера нет и не появляется собственного сериализатора проекта.
- **`GET`** отдаёт сохранённые байты дословно: envelope собирается подстановкой сохранённого BLOB в строку ответа, а не через `JSON.parse` + `JSON.stringify` на сервере.
- **Клиент при readback** прогоняет полученный проект через ту же границу (`parseProjectText`) и заново вычисляет digest канонических байтов. Совпасть должны три значения: digest до `POST`, `sha256` из envelope и digest после readback.

### Запрещено

- Сравнивать проекты по длине строки, по количеству ключей или по форматированию JSON.
- Вводить RFC 8785 / JCS или любую иную схему канонизации — это создаёт второй формат.
- Пересобирать проект на сервере (`JSON.parse` → `JSON.stringify`) перед хешированием или хранением.
- Хранить pretty-printed вариант или «нормализованную копию» рядом с оригиналом.

Если digest принятых байтов не совпадает с digest, который клиент ожидал, миграция считается неуспешной на клиенте; запись при этом уже могла быть создана и остаётся валидной — клиент показывает состояние `failed` и не помечает проект как перенесённый.

---

## 5. Серверный envelope записи

Envelope — служебная оболочка записи, живущая только в БД и в ответах API.

| Поле | Тип | Правило |
| --- | --- | --- |
| `recordVersion` | integer | Версия envelope. В Phase 7 всегда `1`. Не связана с `version: 1` внутри JSON v1. |
| `projectId` | string | Непрозрачный идентификатор: 16 случайных байт из `crypto.randomBytes`, hex, 32 символа `[0-9a-f]`. Не производный от содержимого проекта. |
| `revision` | integer | Положительное целое. Первая запись — `1`. В Phase 7 не увеличивается: обновления не реализуются, поле существует для optimistic concurrency в будущем. |
| `project` | JSON v1 | Исходный проверенный проект, хранится как канонические байты (BLOB) без изменений. |
| `sha256` | string | Hex lowercase, digest канонических принятых байтов по разделу 4. |
| `createdAt` | string | Серверное UTC-время создания, ISO 8601 с `Z`, миллисекундная точность (`new Date().toISOString()`). |
| `updatedAt` | string | То же правило. В Phase 7 равно `createdAt`. |
| `capabilityHash` | string | `sha256(projectId + ":" + token)`, hex lowercase. Сам секрет в БД не хранится. Привязка к `projectId` исключает переиспользование одного hash между записями. |
| `ownerId` | null | Всегда `null` до Phase 9. Колонка существует, значение из тела запроса не принимается никогда. |

Envelope не содержит и не может содержать итогов, строк ведомости, цен и категорий.

---

## 6. API

Ровно два endpoint. `PUT`, `PATCH`, `DELETE`, список проектов и share-ссылки в Phase 7 не вводятся.

### 6.1 `POST /api/projects/migrate`

Принять один JSON v1 и создать запись.

- Тело — сам проект JSON v1, без обёртки. Обёртка провоцировала бы второй формат.
- `Content-Type: application/json` или `application/json; charset=utf-8` — та же проверка, что в `handleCheck`.
- Лимит тела 1 MiB, проверяется и по `Content-Length`, и по фактическому потоку, как уже сделано в `server/server.cjs`.
- Host/Origin — действующая loopback-политика `validLocalAuthority`.
- Авторизация не требуется: capability создаётся этим запросом.
- Заголовок `Idempotency-Key` обязателен.

Успех, новая запись — `201`:

```json
{
  "ok": true,
  "recordVersion": 1,
  "projectId": "3f1c…",
  "revision": 1,
  "bytes": 4821,
  "sha256": "9a…",
  "createdAt": "2026-09-19T12:00:00.000Z",
  "updatedAt": "2026-09-19T12:00:00.000Z",
  "capabilityToken": "…",
  "replayed": false
}
```

Успех, повтор с тем же ключом и тем же digest — `200`, тот же envelope, `"replayed": true`, **без** `capabilityToken`: секрет выдаётся один раз.

### 6.2 `GET /api/projects/:projectId`

Доказать чтение сохранённого проекта.

- Маршрут: `^/api/projects/([0-9a-f]{32})$`. Любое иное значение — `404 not_found`.
- Требуется `Authorization: Bearer <token>`.
- Host/Origin — та же loopback-политика.

Успех — `200`:

```json
{
  "ok": true,
  "recordVersion": 1,
  "projectId": "3f1c…",
  "revision": 1,
  "bytes": 4821,
  "sha256": "9a…",
  "createdAt": "2026-09-19T12:00:00.000Z",
  "updatedAt": "2026-09-19T12:00:00.000Z",
  "ownerId": null,
  "project": { "format": "smetacraft-project", "version": 1, "…": "…" }
}
```

`capabilityToken` и `capabilityHash` в ответе `GET` отсутствуют всегда.

### 6.3 Общие требования к обоим endpoint

- Ответы — `application/json; charset=utf-8`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` (уже реализовано в `sendJson`).
- Ошибка — существующая форма `{ "ok": false, "error": "<code>" }`. Текст ошибки не содержит содержимого проекта, токена и пути к файлу БД.
- Сервер не выставляет `Access-Control-Allow-Origin`: чужой origin отклоняется, а не обслуживается.
- Никакого directory listing и никакого доступа к `data/` через static-handler.

---

## 7. Заголовки

| Заголовок | Endpoint | Правило |
| --- | --- | --- |
| `Authorization: Bearer <token>` | `GET` | Единственный способ передать capability token. Отсутствует или не по схеме `Bearer` → `401 capability_required`. |
| `Idempotency-Key: <key>` | `POST` | Обязателен. ASCII `[A-Za-z0-9_-]{16,128}`. |
| `Content-Type` | `POST` | `application/json` или `application/json; charset=utf-8`. |

### Capability token

- 32 случайных байта из `crypto.randomBytes`, base64url без padding (43 символа).
- Показывается клиенту ровно один раз — в ответе `201`. Восстановление потерянного токена в Phase 7 не предусмотрено; claim flow относится к Phase 9.
- В БД хранится только `capabilityHash` (раздел 5). Сравнение — `crypto.timingSafeEqual` по байтам hash одинаковой длины.
- Токен **никогда** не появляется в URL, query string, fragment, `Referer`, теле `GET`-ответа и логах. В Phase 7 сервер не пишет request-логи вообще; если логирование появится, redaction `Authorization` и `Idempotency-Key` обязательна вместе с ним.
- TTL и ревокация токена в Phase 7 отсутствуют. Это осознанный долг: он приемлем только пока сервер слушает loopback, и должен быть закрыт до любого публичного хоста.

### Idempotency

- Ключ генерирует клиент: один `crypto.randomUUID()` на одну попытку переноса.
- Ключ сохраняется в receipt **до** отправки, поэтому повтор после сетевой ошибки или таймаута использует тот же ключ и не создаёт дубль.
- Сервер хранит `sha256(key)`, не сам ключ.
- Тот же ключ + тот же digest тела → `200` с прежним envelope, новая запись не создаётся.
- Тот же ключ + другой digest тела → `409 idempotency_key_conflict`, запись не создаётся и не изменяется.
- Другой ключ + то же содержимое → новая запись. Дедупликация по содержимому не выполняется: пользователь вправе перенести одинаковый проект дважды.
- Записи ключей не истекают в Phase 7. TTL вводится отдельно, если объём это потребует.
- Одновременные одинаковые запросы разрешаются уникальным индексом по `key_hash` внутри одной транзакции: ровно одна запись, второй запрос получает `200` replay.

---

## 8. Критерий успеха миграции

Успешная миграция = `POST` → `GET` readback → повторная валидация полученного JSON существующим parser/model.

Формально, все пять условий обязаны выполниться:

1. `POST` вернул `201` или `200` с `ok: true` и непустым `projectId`.
2. `GET /api/projects/:projectId` с полученным токеном вернул `200`.
3. `parseProjectText` на полученном `project` не бросил ошибку.
4. Канонические байты после readback дают digest, равный `sha256` из envelope.
5. Тот же digest равен digest, вычисленному клиентом до `POST`.

`POST` сам по себе успехом не является и не может переводить UI в состояние «перенесено». Если любое из условий 2–5 не выполнено, состояние — `failed`, локальный проект остаётся единственным источником истины.

---

## 9. Коды ошибок и HTTP-статусы

Коды из Phase 6 сохраняются как есть; новые добавляются к ним.

### `POST /api/projects/migrate`

| Статус | `error` | Условие |
| --- | --- | --- |
| `201` | — | Запись создана |
| `200` | — | Повтор с тем же ключом и тем же digest |
| `400` | `invalid_json` | Тело не разбирается как JSON |
| `400` | `idempotency_key_required` | Заголовок отсутствует |
| `400` | `invalid_idempotency_key` | Заголовок не соответствует `[A-Za-z0-9_-]{16,128}` |
| `403` | `origin_forbidden` | Host/Origin вне loopback-политики |
| `405` | `method_not_allowed` | Метод не `POST` |
| `409` | `idempotency_key_conflict` | Тот же ключ, другой digest |
| `413` | `body_too_large` | Тело больше 1 MiB |
| `415` | `unsupported_media_type` | Неверный `Content-Type` |
| `422` | `invalid_project_v1` | Тело не проходит серверную проверку JSON v1 |
| `503` | `storage_unavailable` | БД недоступна или транзакция не завершилась |

### `GET /api/projects/:projectId`

| Статус | `error` | Условие |
| --- | --- | --- |
| `200` | — | Запись прочитана |
| `401` | `capability_required` | Нет `Authorization` или не схема `Bearer` |
| `403` | `origin_forbidden` | Host/Origin вне loopback-политики |
| `404` | `not_found` | Неверный формат `projectId`, неизвестный `projectId`, неверный токен, токен от другой записи |
| `405` | `method_not_allowed` | Метод не `GET` и не `HEAD` |
| `503` | `storage_unavailable` | БД недоступна |

`404 not_found` намеренно един для всех четырёх случаев: различать «записи нет» и «токен не тот» означало бы дать оракул существования `projectId`. Форма ответа и объём работы до ответа одинаковы во всех четырёх случаях.

### Атомарность отказа

Любой отказ (`4xx` или `5xx`) не оставляет частичной записи, не создаёт строку в `idempotency_keys` и не меняет существующие записи. Запись проекта и запись ключа создаются в одной транзакции.

---

## 10. Хранилище: схема и миграции

### Размещение

- Файл: `data/smetacraft.sqlite` относительно корня репозитория.
- Каталог `data/` добавляется в `.gitignore` и не входит в static allowlist. Действующий `handleStatic` разрешает только `index.html` и `js/(core|ui|app)/<name>.js`, поэтому `data/` уже недостижим; это свойство закрепляется отдельным тестом, а не считается само собой разумеющимся.
- Драйвер — встроенный `node:sqlite` (Node 22+). Внешние npm-зависимости в проект не вводятся: свойство «ноль runtime-зависимостей» сохраняется.
- `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`, `PRAGMA synchronous = FULL`.

### Схема (`server/migrations/001_init.sql`)

```sql
CREATE TABLE projects (
  project_id      TEXT    PRIMARY KEY,
  record_version  INTEGER NOT NULL,
  revision        INTEGER NOT NULL,
  project_bytes   BLOB    NOT NULL,
  bytes           INTEGER NOT NULL,
  sha256          TEXT    NOT NULL,
  capability_hash TEXT    NOT NULL,
  owner_id        TEXT,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

CREATE TABLE idempotency_keys (
  key_hash   TEXT    PRIMARY KEY,
  sha256     TEXT    NOT NULL,
  project_id TEXT    NOT NULL REFERENCES projects(project_id),
  created_at TEXT    NOT NULL
);

CREATE TABLE schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT    NOT NULL
);
```

- `project_bytes` — BLOB, а не TEXT: хранятся ровно принятые байты.
- `owner_id` допускает `NULL` и в Phase 7 всегда `NULL`.
- Индекс по `capability_hash` не создаётся: поиск идёт по `project_id`, hash только сравнивается.

### Миграции

- Каталог `server/migrations/`, файлы вида `NNN_<name>.sql`, только вперёд. Downgrade-скрипты не пишутся.
- Применение идемпотентно: применённые версии читаются из `schema_migrations`, каждая миграция выполняется в транзакции.
- Применение запускается явной командой, а не молча при первом запросе; сервер при несовпадении версии схемы отвечает `503 storage_unavailable` вместо автоматического изменения БД.
- Миграция никогда не удаляет пользовательские записи.

### Repository boundary

HTTP-слой не знает SQL. Интерфейс:

```text
createProject({ projectId, bytes, sha256, capabilityHash, idempotencyKeyHash, now })
  -> { record, replayed }   | throws ConflictError | throws StorageError
getProject({ projectId })
  -> record | null          | throws StorageError
```

Реализация SQLite живёт отдельно от интерфейса. `server/server.cjs` разбивается только в объёме, необходимом для этой границы, — не «заодно».

---

## 11. Клиентский поток и состояния UI

Модуль: `js/app/project-migration.js`. Он добавляется в порядок `<script src>` в `index.html` перед `boot.js` и в список `tests/runtime.cjs`; `docs/FRONTEND_MODULES.md` обновляется в том же шаге — это действующий контракт загрузки.

### Поток

1. Приложение обнаруживает валидный `smetacraft_project`.
2. Показывает кнопку «Перенести копию на сервер». Ничего не отправляется до клика.
3. По клику проект проходит существующую границу `parseProjectText` и превращается в канонические байты; digest вычисляется локально.
4. Ключ идемпотентности и digest записываются в receipt до отправки.
5. `POST /api/projects/migrate` → `projectId`, `revision`, `sha256`, `capabilityToken`.
6. `GET /api/projects/:projectId` с токеном.
7. Полученный проект повторно валидируется и сверяется по digest (раздел 8).
8. Receipt дописывается в `smetacraft_project_migration_v1`.
9. `smetacraft_project` остаётся без изменений.

### Состояния

| Состояние | Когда | Что видит пользователь |
| --- | --- | --- |
| `local only` | receipt отсутствует или проект изменён после переноса | «Проект хранится только в этом браузере» + кнопка переноса |
| `sending` | от клика до завершения readback | «Отправка и проверка…», кнопка заблокирована |
| `server verified` | все пять условий раздела 8 выполнены | «Копия на сервере проверена чтением», `projectId` и время |
| `failed` | сервер ответил ошибкой или readback не сошёлся | «Перенос не выполнен. Локальный проект не изменён.» + код ошибки |
| `server unavailable` | сеть недоступна, таймаут, не-loopback хост | «Сервер недоступен. Локальный проект не изменён.» |

Все тексты пишутся через `.textContent`. Ни одно значение с сервера не попадает в HTML-конструктор.

Как и `backend-check`, блок миграции скрывается целиком вне loopback-хоста, поэтому на GitHub Pages он не показывается и не делает запросов.

### Запрещено

- Автоматически отправлять проект при загрузке страницы или при любом изменении формы.
- Удалять, очищать или перезаписывать `smetacraft_project` после миграции.
- Считать `POST` без readback успешной миграцией.
- Заменять текущую форму или ведомость ответом сервера без повторной валидации; в Phase 7 ответ сервера вообще не применяется к форме.
- Писать receipt, `projectId`, токен или envelope внутрь JSON v1 проекта или в экспортируемый файл.
- Передавать токен в URL, в query или в `location.hash`.
- Показывать сырой текст сервера в ведомости.

### Receipt

Ключ `smetacraft_project_migration_v1`, отдельный от проекта:

```json
{
  "receiptVersion": 1,
  "projectId": "3f1c…",
  "revision": 1,
  "sha256": "9a…",
  "idempotencyKey": "…",
  "capabilityToken": "…",
  "verifiedAt": "2026-09-19T12:00:00.000Z",
  "state": "server verified"
}
```

Если локальный проект изменился (его текущий digest не равен `sha256` из receipt), UI возвращается в `local only` и требует нового явного переноса.

---

## 12. Модель угроз

| Актив | Угроза | Ответ Phase 7 | Остаточный риск |
| --- | --- | --- | --- |
| Capability token в `localStorage` | Любой скрипт на origin читает токен; `localStorage` не истекает и общий для вкладок | Токен существует только на loopback; в URL не попадает; TTL и ревокации нет | Принимается только для loopback. До публичного хоста нужен `HttpOnly; Secure; SameSite` cookie либо TTL + ревокация |
| Ведомость и XSS | `js/app/bill.js` содержит единственный `innerHTML`, функции экранирования в проекте нет. Безопасность держится на инварианте «весь текст строк — литерал кода или значение из закрытого `<select>`» | Сервер не возвращает ни имён строк, ни подписей; ответ сервера не применяется к форме и ведомости; статусы пишутся `.textContent` | Инвариант остаётся недокументированным в коде. Любая будущая серверная строка в ведомости обязана сначала получить экранирование |
| Проект как персональные данные | Смета уходит с машины пользователя | Отправка только по явному клику; сервер на `127.0.0.1`; локальная копия не удаляется | Нет |
| Публичный хост | Pages работает по HTTPS: запрос к loopback или к HTTP-эндпоинту будет заблокирован как mixed content | Блок миграции скрыт вне loopback, запросов не делает | Переход на Fornex требует домена, TLS, origin policy, ревокации токена и повторной модели угроз — отдельное решение владельца |
| Файл БД | Чтение `data/smetacraft.sqlite` через static URL | Static allowlist разрешает только `index.html` и `js/(core|ui|app)/*.js`; закрепляется тестом; `data/` в `.gitignore` | Нет, пока allowlist не расширяют |
| Перебор `projectId` | Угадывание чужой записи | 128 бит энтропии в `projectId`, 256 бит в токене; единый `404` без оракула существования; сравнение hash в постоянном времени | Rate limit отсутствует; для loopback приемлемо, для публичного хоста обязателен |
| Второй расчётный движок | Сервер начинает хранить или отдавать производные величины | Сервер хранит только вход; envelope не содержит итогов; отдельный тест грепает серверные исходники на идентификаторы и константы ядра | Нет, пока тест на месте |
| Логи | Токен или содержимое проекта в логах | Request-логов в Phase 7 нет; при их появлении redaction `Authorization`/`Idempotency-Key` обязательна | Нет |

---

## 13. Список тестов для 7.2–7.4

Имена и случаи, не реализации. Базовый набор Phase 6 остаётся обязательным и не заменяется:

```text
node --test tests/golden.test.cjs tests/security.test.cjs tests/project-model.test.cjs tests/backend.test.cjs
```

### 7.2 — `tests/project-migration.test.cjs`

1. `migrate stores project and readback returns identical canonical bytes`
2. `readback sha256 matches the digest computed before POST`
3. `same idempotency key and same digest returns the first receipt and creates no second row`
4. `same idempotency key and different body returns 409 idempotency_key_conflict`
5. `missing Idempotency-Key returns 400 idempotency_key_required`
6. `malformed Idempotency-Key returns 400 invalid_idempotency_key`
7. `GET without Authorization returns 401 capability_required`
8. `GET with unknown projectId returns 404 not_found`
9. `GET with wrong token for an existing project returns 404 not_found`
10. `capability token of project A cannot read project B`
11. `malformed projectId in the route returns 404 not_found`
12. `invalid JSON v1 returns 422 and creates no row`
13. `body over 1 MiB returns 413 and creates no row`
14. `foreign Host or Origin returns 403 on both endpoints`
15. `wrong method and wrong media type are rejected`
16. `storage failure returns 503 and leaves no partial row`
17. `records survive server restart and are readable with the same token`
18. `concurrent identical migrate requests create exactly one row`
19. `capabilityToken never appears in a GET response`
20. `revision is 1 on create and unchanged by replay`
21. `static routes never serve data/ or the SQLite file`
22. `server sources contain no calculation core identifiers or constants`
23. `migrations apply idempotently and record their version`

### 7.3 — клиент (`tests/runtime.cjs` + модульные проверки)

1. `project-migration loads in the documented script order`
2. `no request is issued on page load or on form change`
3. `POST without readback is reported as failed, not as migrated`
4. `receipt is written only to smetacraft_project_migration_v1`
5. `smetacraft_project is byte-identical after success, failure and timeout`
6. `server response never modifies form fields or bill rows`
7. `retry after a network error reuses the stored idempotency key`
8. `changed local project returns the UI to local only`
9. `status text is written through textContent`
10. `migration block is hidden on a non-loopback host`

### 7.4 — браузерный чеклист (ручной, через HTTP)

1. Существующий локальный проект переносится, readback проходит, UI показывает `server verified`.
2. После reload локальная работа продолжается без обращения к серверу.
3. Сервер остановлен: форма, ведомость и локальный проект не меняются, состояние `server unavailable`.
4. Таймаут и `5xx` дают `failed` без изменения локальных данных.
5. Повторный клик не создаёт вторую запись.
6. Изменённый локальный проект требует нового явного переноса.
7. `import файла → localStorage → миграция` сохраняет поля, проёмы, сваи, flags, цены и итог ведомости.
8. `http://127.0.0.1:<port>/data/smetacraft.sqlite` возвращает `404`.
9. Контрольный расчёт: строки, количества и итог ведомости до и после миграции совпадают до копейки.
10. Консоль чистая, кроме известного 404 favicon.

---

## 14. Exit Criteria

### Phase 7.1 (этот шаг)

- Этот документ существует в репозитории и прочитан владельцем.
- Владелец утвердил или исправил решения раздела 15.
- Код не изменён: `server/`, `js/`, `tests/`, `tests/golden.json` не трогались.
- В `docs/ROADMAP.md` и `docs/PHASES_6_9_EXECUTION_PLAN.md` добавлена только ссылка на этот документ. Статус Phase 7 остаётся «Не начиналась».
- PR открыт как draft против `master` и не мерджится: `master` публикуется на Pages.

### Дальнейшие шаги (не входят в 7.1)

- 7.2 закрыт, когда зелёный `tests/project-migration.test.cjs` вместе с базовым набором, без изменения `tests/golden.json`.
- 7.3 закрыт, когда клиентские тесты зелёные и порядок скриптов обновлён в `index.html`, `tests/runtime.cjs` и `docs/FRONTEND_MODULES.md`.
- 7.4 закрыт, когда пройден браузерный чеклист раздела 13.4 с контрольным расчётом.
- Phase 7 принимается владельцем отдельно; только затем обновляются `docs/ROADMAP.md` и скиллы.

---

## 15. Решения, принятые в этом документе

План Phase 7 не задавал перечисленное ниже. Выбраны конвенции, согласованные с существующим `server/server.cjs`. Любое из них владелец может заменить.

| # | Решение | Основание |
| --- | --- | --- |
| Д1 | Токен передаётся как `Authorization: Bearer <token>` | Стандартная схема; редактируется прокси и инструментами логирования по умолчанию, в отличие от собственного `X-`-заголовка |
| Д2 | Заголовок идемпотентности — `Idempotency-Key`, ASCII `[A-Za-z0-9_-]{16,128}` | De facto стандарт; формат совместим с `crypto.randomUUID()` |
| Д3 | Тело `POST` — сам JSON v1 без обёртки | Совпадает с `POST /api/project-check`; обёртка создала бы второй формат |
| Д4 | Канонические байты = `JSON.stringify(parseProjectText(...))` в UTF-8, порядок ключей без сортировки | Ровно то, что клиент уже отправляет, а сервер уже хеширует. Любая схема канонизации была бы вторым форматом |
| Д5 | Клиент не передаёт свой digest в заголовке; сервер считает сам, клиент сверяет ответ | Повторяет проверенное поведение `js/app/backend-check.js` |
| Д6 | `projectId` — 16 случайных байт, hex, маршрут `^/api/projects/([0-9a-f]{32})$` | Непрозрачность и простая проверка маршрута без утечки формата хранилища |
| Д7 | `capabilityHash = sha256(projectId + ":" + token)`, сравнение `timingSafeEqual` | 256-битный случайный секрет не требует KDF; привязка к записи исключает межзаписный replay |
| Д8 | Неизвестный `projectId`, неверный токен, чужой токен и неверный формат id дают один `404 not_found` | Нет оракула существования записи |
| Д9 | Отсутствующий `Authorization` даёт `401 capability_required`, а не `404` | Отличает «не прислал учётные данные» от «не совпало», не раскрывая существование записи |
| Д10 | Повтор по idempotency key возвращает `200` и не повторяет `capabilityToken` | Секрет показывается один раз; восстановление — Phase 9 |
| Д11 | Дедупликация по содержимому не выполняется | Повторный перенос того же проекта — законное действие пользователя |
| Д12 | Записи `idempotency_keys` не истекают в Phase 7 | Гарантия «тот же ключ — тот же результат» без окна |
| Д13 | Драйвер SQLite — встроенный `node:sqlite` (проверено на Node 22.14) | Сохраняет ноль runtime-зависимостей. Модуль помечен как experimental и печатает `ExperimentalWarning`; альтернатива — внешний драйвер, то есть первая npm-зависимость проекта |
| Д14 | Миграции применяются явной командой; при несовпадении версии сервер отвечает `503` | Схема не меняется молча на пользовательских данных |
| Д15 | Ответ `GET` собирается подстановкой сохранённого BLOB, без `JSON.parse`/`JSON.stringify` на сервере | У сервера не появляется своего сериализатора проекта |
| Д16 | Блок миграции скрыт вне loopback-хоста, как уже сделано для `backend-check` | `master` публикуется на Pages; никаких запросов у публичных посетителей |
| Д17 | `revision` создаётся равным `1` и в Phase 7 не увеличивается | Обновления не входят в scope; поле готово для optimistic concurrency |
| Д18 | Файл БД — `data/smetacraft.sqlite`, каталог в `.gitignore` | Требование «вне статического корня»; БД не попадает в репозиторий и на Pages |

---

## 16. Откат

### Откат 7.1

Документ и две ссылки. Откат — `git revert` одного коммита либо закрытие draft PR. Runtime не затронут.

### Откат 7.2–7.4 (когда будут выполняться)

- Frontend: feature flag скрывает блок миграции; `js/app/project-migration.js` удаляется из порядка загрузки вместе со строкой в `tests/runtime.cjs`. Локальный проект остаётся полностью рабочим.
- Сервер: маршруты `/api/projects/*` отключаются; `POST /api/project-check` и статическая раздача не затрагиваются.
- БД: откат только согласованной forward-миграцией. Удаление пользовательских записей и `data/smetacraft.sqlite` не является частью отката. `git reset --hard` и destructive reset не применяются.
- `js/core/**`, `tests/golden.json` и JSON v1 в откате не участвуют, потому что в Phase 7 не менялись.
