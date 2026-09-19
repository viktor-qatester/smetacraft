# SmetaCraft: план выполнения Phase 6–9

Документ предназначен для продолжения работы в Cursor или другом агенте. Он задаёт последовательность, границы, проверяемые результаты и точки решения владельца. Сам по себе план не разрешает начинать фазу, делать commit, push, PR или deploy.

## 1. Исходная точка

Состояние на 2026-09-19:

- Phase 1–5 приняты; расчётное ядро находится в `js/core/*.js`, frontend-потоки — в `js/ui/*.js` и `js/app/*.js`.
- Phase 6 реализует локальный `POST /api/project-check`, статическую раздачу приложения и явную кнопку проверки серверного приёма JSON v1.
- Сервер не хранит проект, не рассчитывает смету и слушает только `127.0.0.1`.
- Граница `Host`/`Origin` ограничена фактическим loopback authority: допускаются `127.0.0.1` и `localhost` на реальном порту сервера; matching foreign host/origin отклоняется.
- Автоматический набор проходит 94/94 теста; `tests/golden.json` не изменён.
- Браузерный контроль подтвердил расчёт `21 791,68 Br`, server receipt, безопасный отказ без backend и реальный `export → изменение → import` с восстановлением 115 полей и прежней суммы.
- Chromium print сформировал одну страницу A4; строки, единицы, стоимости и итог читаемы, обрезания и наложения не обнаружены.
- Phase 6 ещё не отмечена владельцем как принятая и не зафиксирована отдельным разрешённым commit.

Перед любой работой Cursor обязан перечитать:

1. `AGENTS.md`.
2. `docs/ROADMAP.md`.
3. Этот документ.
4. `PRODUCT_SPEC.md` и `docs/regression-baseline.md`.
5. Актуальные `git status`, `git diff`, untracked-файлы и последние commits.

Код и тесты имеют приоритет над устаревшим текстом. Пользовательские изменения нельзя удалять, переформатировать или включать в commit без проверки состава.

## 2. Неизменяемые контракты для всех фаз

- Не менять формулы, нормы, округления, строки и суммы `js/core/*.js` без отдельного утверждённого расчётного scope.
- Сохранять строку ведомости `name/netLabel/k/orderLabel/cost`, порядок строк и действующие итоги.
- Не переписывать `tests/golden.json` ради прохождения тестов.
- JSON проекта остаётся `format: "smetacraft-project"`, числовая `version: 1` до отдельного решения о новой версии.
- Ключ `localStorage` остаётся `smetacraft_project`; Phase 7 не удаляет его автоматически.
- Явное `opening.locked: false`, aliases `w/h/n`, неизвестные метаданные и атомарность отказа сохраняют действующее поведение.
- Пользовательский текст не передавать HTML-парсеру; использовать DOM API, `.value` и `.textContent`.
- Backend не становится расчётным ядром: одинаковый ввод и цены должны давать прежнюю ведомость в браузере.
- Сетевые ошибки не должны повреждать форму, ведомость, локальный проект или сохранённые цены.
- Данные, служебные каталоги, база и загруженные файлы не должны находиться в статическом корне или раздаваться общим static-handler.
- Каждая фаза выполняется отдельными ограниченными шагами и принимается владельцем до начала следующей.
- Commit, push, PR, deploy, подключение облачных сервисов и платёжных провайдеров — только по отдельному разрешению.

## 3. Общий рабочий цикл для Cursor

Для каждого шага:

1. Зафиксировать исходный commit, рабочий diff и untracked-файлы.
2. Показать владельцу точный scope: файлы, API, данные, неизменяемые контракты, тесты, риски и откат.
3. Получить подтверждение именно этого шага.
4. Реализовать только утверждённый scope.
5. Запустить узкие тесты, затем полный обязательный набор.
6. Выполнить реальный HTTP/browser smoke-test.
7. Провести read-only domain/security review итогового diff.
8. Показать findings, результаты, остаточный риск и способ отката.
9. Остановиться для приёмки. Не начинать следующий шаг автоматически.

Обязательный базовый набор после каждого runtime-изменения:

```text
node --test tests/golden.test.cjs tests/security.test.cjs tests/project-model.test.cjs tests/backend.test.cjs
node scripts/validate-skills.cjs
node --check <каждый изменённый .js/.cjs>
git diff --check
```
Дополнительные тесты новой фазы добавляются к этому набору, а не заменяют его.

---

## 4. Phase 6 — принять минимальный backend vertical slice

### Цель

Зафиксировать доказанный HTTP-путь «действие пользователя → JSON v1 → серверная валидация → receipt → видимый статус», не добавляя хранение, аккаунты, миграцию или серверные расчёты.

### Текущий scope Phase 6

- `server/server.cjs`: loopback HTTP-сервер, static allowlist, `POST /api/project-check`, лимит 1 MiB, валидация JSON v1, byte count и SHA-256.
- `js/app/backend-check.js`: явный запрос по кнопке, timeout, проверка receipt и безопасный отказ.
- `index.html`, `js/app/boot.js`, `tests/runtime.cjs`: UI и порядок загрузки.
- `tests/backend.test.cjs`: успешный HTTP-путь и отрицательные случаи.
- `README.md`, `PRODUCT_SPEC.md`, `docs/FRONTEND_MODULES.md`, `docs/ROADMAP.md`: описание архитектуры и статуса.
- Проектные скиллы Phase 6 и карта текущей системы.

### Phase 6.1 — финальная проверка состава

Cursor должен:

- проверить все tracked и untracked-файлы Phase 6;
- не потерять `server/`, `js/app/backend-check.js`, `tests/backend.test.cjs` и новый backend skill при будущей фиксации;
- отдельно решить с владельцем, входит ли `docs/UX_REMEDIATION_PLAN.md` в commit Phase 6 или остаётся самостоятельным плановым артефактом;
- убедиться, что временные PDF, browser profiles, downloads и тестовые данные не попадают в репозиторий;
- не менять `tests/golden.json`.

### Phase 6.2 — обязательные доказательства

- 94/94 или больше актуальных тестов проходят без изменения golden.
- `127.0.0.1:<port>` и `localhost:<port>` с matching Origin получают `200`.
- Matching foreign `Host`/`Origin`, foreign Host без Origin и неправильный порт получают `403 origin_forbidden`.
- Повреждённый JSON, неверная версия/типы, чужой Origin, неверный method/media type и body > 1 MiB отклоняются ожидаемыми кодами.
- Browser server-check показывает успех; при остановленном сервере проект и ведомость не меняются.
- Реальный export/import восстанавливает поля, цены, проёмы, сваи, flags, выбранные разделы и сумму.
- Печатный A4/PDF читаем и совпадает с экранной ведомостью.

### Exit Criteria Phase 6

- Read-only review не содержит findings P0–P2.
- Владелец явно принимает Phase 6.
- Только после принятия статус в `docs/ROADMAP.md` меняется на «Принята» с фактическим commit.
- Commit/push выполняются только после отдельной команды владельца.
- После принятия запускается `smetacraft-skill-maintenance`; затем готовится точный план Phase 7.

### Откат

Удалить только файлы и подключения Phase 6, вернуть документацию и порядок скриптов; расчётные и JSON-модули не трогать. До commit откат определяется точным diff, а не `git reset --hard`.

---

## 5. Phase 7 — безопасный перенос локальных проектов

### Цель

Дать пользователю явный, повторяемый и проверяемый перенос проекта из `localStorage` в серверное хранилище проектов, сохранив локальную копию и возможность работы при недоступном сервере.

### Обязательное решение владельца до кода

Нужно утвердить хранилище серверных записей проектов.

Рекомендуемый минимальный вариант:

- Node.js остаётся сервером;
- repository interface отделён от HTTP;
- первая реализация — SQLite с транзакциями в закрытом каталоге `data/`, не доступном static-handler;
- проект хранится как проверенный JSON v1 плюс серверный envelope;
- до появления аккаунтов доступ обеспечивается непрозрачным capability token, на сервере хранится только его hash;
- если планируется сразу multi-instance deployment, вместо SQLite заранее выбрать PostgreSQL. Cursor не должен самостоятельно менять этот выбор.

Phase 7 хранит только JSON-проекты. Произвольные пользовательские файлы и импорт строительных документов относятся к Phase 8.

### Серверный envelope проекта

Он не заменяет и не изменяет JSON v1:

```text
recordVersion: 1
projectId: случайный непрозрачный идентификатор
revision: положительное целое
project: исходный проверенный JSON v1
sha256: digest канонических принятых байтов
createdAt / updatedAt: серверное UTC-время
capabilityHash: hash секрета доступа, сам секрет в БД не хранится
ownerId: null до Phase 9
```

Точный canonicalization JSON нужно описать в `docs/PROJECT_MIGRATION.md`. Нельзя сравнивать проекты только по длине строки или форматированию JSON.

### Phase 7.1 — контракт миграции и repository boundary

До реализации UI создать и согласовать:

- `docs/PROJECT_MIGRATION.md` с состояниями и отказами;
- API-контракт, idempotency и error codes;
- repository interface без привязки HTTP к SQLite;
- схему данных и миграцию БД;
- threat model для capability token, localStorage и loopback/production origin.

Рекомендуемые endpoint-границы:

- `POST /api/projects/migrate` — принять один JSON v1 и idempotency key;
- `GET /api/projects/:projectId` — доказать чтение сохранённого проекта;
- обновление и удаление не включать, пока отдельно не утверждены.

Правила:

- тот же idempotency key + тот же digest возвращает прежний результат;
- тот же key + другое содержимое возвращает conflict;
- успешный POST недостаточен: клиент обязан выполнить GET/readback и повторно проверить JSON через существующий parser/model;
- capability token передаётся только в header, не в URL и не в логах;
- токен показывается клиенту один раз; сервер хранит hash;
- все endpoint используют loopback/production host policy, размерные лимиты и `nosniff`/`no-store`.

Рекомендуемые новые файлы после утверждения структуры:

- `server/config.cjs`;
- `server/project-validator.cjs`;
- `server/project-repository.cjs`;
- `server/sqlite-project-repository.cjs` или согласованный PostgreSQL adapter;
- `server/migrations/*`;
- `tests/project-migration.test.cjs`.

Не разбивать `server/server.cjs` «заодно» шире необходимой границы.

### Phase 7.2 — серверная запись и readback

Реализовать:

- транзакционную запись проекта и receipt;
- idempotency без дублей;
- optimistic revision для будущих обновлений;
- readback с capability authorization;
- отсутствие directory listing и доступа к файлу БД через static routes;
- атомарный отказ: неверный проект не создаёт частичную запись.

Тесты:

- миграция и точный readback;
- повтор запроса с тем же idempotency key;
- conflict при другом body;
- неизвестный/неверный token;
- чужой projectId/token;
- повреждённая БД/ошибка записи без успешного receipt;
- restart сервера и повторное чтение;
- одновременные одинаковые запросы создают одну запись.

### Phase 7.3 — явный клиентский перенос

Рекомендуемый frontend-модуль: `js/app/project-migration.js`.

Пользовательский поток:

1. Приложение обнаруживает валидный `smetacraft_project`.
2. Показывает понятную кнопку «Перенести копию на сервер»; автоматической отправки нет.
3. Перед отправкой использует существующий `parseProjectText`/model boundary.
4. Получает receipt и capability token.
5. Выполняет GET/readback.
6. Повторно валидирует полученный JSON и сравнивает модель/digest.
7. Сохраняет отдельный migration receipt, например `smetacraft_project_migration_v1`.
8. Оригинальный `smetacraft_project` остаётся без изменений.
9. UI показывает состояния: local only, sending, server verified, failed, server unavailable.

Запрещено:

- автоматически удалять или очищать localStorage;
- считать POST без readback успешной миграцией;
- заменять текущую форму ответом сервера без повторной валидации;
- смешивать migration receipt с JSON проекта v1;
- скрыто отправлять проект при загрузке страницы.

### Phase 7.4 — браузерная проверка

- существующий локальный проект переносится и читается обратно;
- после reload локальная работа продолжается;
- offline/error/timeout не меняют форму и ведомость;
- повторный click не создаёт дубль;
- изменённый локальный проект требует нового явного переноса/revision;
- imported file → localStorage → migration сохраняет поля, проёмы, сваи, flags и сумму;
- серверная копия не появляется в static URL.

### Exit Criteria Phase 7

- JSON v1 и `localStorage` полностью совместимы.
- Никакого автоматического удаления локальной копии.
- Миграция считается успешной только после валидированного readback.
- Tenant/capability isolation тестируется до появления UI списка проектов.
- Golden/security/model/backend/migration тесты зелёные.
- Read-only domain и security review не содержат P0–P2.
- Владелец принимает Phase 7; только затем обновляются ROADMAP и скиллы.

### Откат

Frontend feature flag скрывает миграцию; локальный проект остаётся рабочим. Серверная схема откатывается только согласованной DB migration, без удаления пользовательских записей. Не использовать destructive reset.

---

## 6. Phase 8 — закрытое файловое хранилище и один доказанный импорт

### Цель

Добавить приватное хранение загруженных исходных файлов и безопасный импорт ровно одного утверждённого формата с preview перед применением.

### Решение владельца до кода

Владелец предоставляет реальный обезличенный пример файла и утверждает:

- формат и MIME type;
- максимальный размер;
- какие листы/разделы/поля читаются;
- единицы измерения и правила округления;
- обработку пустых, дублирующихся и неизвестных строк;
- ожидаемый preview и способ применения к проекту;
- нужно ли хранить оригинал после импорта и срок хранения.

Без образца и mapping-contract Cursor не выбирает CSV/XLSX/PDF/иной формат сам и не пишет универсальный импортёр.

### Phase 8.1 — storage boundary

Архитектура:

- blob-файлы вне web root;
- случайный server object ID вместо имени пользователя в пути;
- metadata в БД: objectId, projectId, owner/capability, originalName, mediaType, bytes, sha256, status, timestamps;
- состояния `quarantine → validated → available` или `rejected`;
- получение только через авторизованный endpoint;
- `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, запрещён inline HTML/SVG;
- отсутствие directory listing и прямых файловых URL;
- временная запись + fsync/атомарное переименование либо эквивалент гарантированного backend;
- лимиты размера и количества файлов проверяются до полного буферирования.

Если формат архивный (например XLSX), отдельно ограничить число entries, распакованный размер, compression ratio и глубину путей. Макросы, формулы и внешние ссылки не исполнять.

Рекомендуемые файлы:

- `server/file-store.cjs`;
- `server/file-metadata-repository.cjs`;
- `server/import/<approved-format>.cjs`;
- `tests/file-storage.test.cjs`;
- `tests/import-<approved-format>.test.cjs`;
- `docs/IMPORT_<FORMAT>.md`.

### Phase 8.2 — безопасная загрузка

Проверить до сохранения как available:

- реальный размер и server limit;
- allowlisted media type и magic bytes;
- безопасное имя только как metadata;
- digest и duplicate policy;
- структура утверждённого формата;
- отсутствие `../`, абсолютных путей, alternate data streams и separator tricks;
- cleanup незавершённых временных файлов.

Неверный файл не меняет проект и не становится доступным для скачивания.

### Phase 8.3 — parser и neutral import model

Parser не пишет напрямую в DOM и не вызывает расчётные функции. Он возвращает нейтральную модель импорта:

- исходная строка/позиция;
- распознанные значения;
- единица;
- warnings/errors;
- однозначное mapping к разрешённым полям проекта.

Сначала показывается preview. Применение требует отдельного действия пользователя и проходит через существующий NormalizedProjectModel/валидатор. Исходный файл не становится JSON v1 и не смешивается с проектным export.

### Phase 8.4 — тесты и browser flow

- valid sample → ожидаемый neutral model → preview → явное применение;
- malformed/truncated/MIME mismatch/oversize/path traversal/polyglot;
- архивные бомбы и external links, если применимо;
- duplicate upload и повтор запроса;
- unauthorized read другого файла;
- static URL не выдаёт blob;
- restart и повторное чтение;
- ошибка parser не меняет DOM, JSON v1 и localStorage;
- экранная ведомость после применения совпадает с независимым ожидаемым результатом.

### Exit Criteria Phase 8

- Поддерживается ровно один документированный формат.
- Оригиналы приватны и недоступны через static hosting.
- Preview и применение разделены.
- Ошибки атомарны; временные файлы очищаются.
- Storage/import/security/golden тесты зелёные.
- Проведён browser upload/import/download smoke-test.
- Владелец принимает Phase 8 до Phase 9.

### Откат

Отключить upload/import feature flag, сохранив уже загруженные blobs и metadata. Удаление данных не является частью отката и требует отдельной retention/deletion процедуры.

---

## 7. Phase 9 — accounts, entitlements, usage, audit, backups и commercial readiness

### Цель

Сделать серверные проекты и файлы пригодными для контролируемого многопользовательского продукта: владение, серверные ограничения, аудит, восстановление и эксплуатационные процедуры.

### Обязательные решения владельца

До кода утвердить:

- deployment: single instance или multi-instance;
- база: сохранить SQLite или перейти на PostgreSQL;
- identity provider либо собственная аутентификация;
- планы/роли и конкретные entitlements;
- лимиты проектов, storage и операций;
- нужен ли платёжный провайдер и какой;
- retention, удаление аккаунта и экспорт данных;
- RPO/RTO резервного копирования;
- юрисдикция, privacy/terms и требования к журналу аудита.

Cursor не должен придумывать тарифы, цены, юридические тексты или автоматически подключать billing.

### Phase 9.1 — security policy и threat model

Создать/утвердить `SECURITY.md` и threat model:

- активы: проекты, файлы, capability tokens, sessions, audit и backups;
- роли и trust boundaries;
- tenant isolation;
- credential/session lifecycle;
- abuse cases для upload, import, migration и API;
- логирование без секретов и содержимого проекта;
- production origin/TLS/proxy policy;
- rate limits и resource exhaustion.

### Phase 9.2 — identity, sessions и ownership

- серверная session/auth boundary;
- CSRF-защита для cookie sessions либо иной доказанный механизм;
- secure, httpOnly, sameSite cookies при cookie-based auth;
- ownership на каждом project/file endpoint;
- claim flow для Phase 7 capability-проектов после входа;
- capability token инвалидируется или переводится в recovery mode после успешного claim;
- никакого доверия к ownerId/plan/role из browser body.

Обязательные тесты: horizontal/vertical access control, session expiry, logout, token replay, claim race, чужой projectId/objectId.

### Phase 9.3 — entitlements и usage ledger

- entitlements проверяются на сервере до side effect;
- план пользователя — серверная запись, не checkbox/UI flag;
- usage ledger append-only или эквивалентно аудируемый;
- у операции есть idempotency key и requestId;
- failed/retried запрос не списывает usage дважды;
- concurrent requests не обходят quota;
- UI только объясняет серверное решение.

Если добавляется billing, webhook проверяет подпись, timestamp и idempotency; платёжные данные в SmetaCraft не сохраняются.

### Phase 9.4 — audit

Audit event содержит минимум:

- server timestamp и requestId;
- actor/tenant;
- action и target ID;
- result/error code;
- revision/bytes при необходимости;
- источник операции без записи capability/session token;
- redaction пользовательского содержимого.

Проверить события login/logout, migrate/read/update, upload/download/import, entitlement denial, admin action и restore. Пользовательский текст не должен позволять log injection.

### Phase 9.5 — backups и restore drill

- согласованный RPO/RTO;
- резервируются DB и blobs как согласованный snapshot;
- encryption at rest/in transit для backup destination;
- retention и rotation;
- checksum/manifest;
- restore выполняется в изолированную среду;
- тест доказывает чтение проекта, файла, revision и ownership после восстановления;
- секреты и signing keys имеют отдельную процедуру восстановления.

Backup без успешного restore drill не считается готовым.

### Phase 9.6 — эксплуатационная и коммерческая готовность

- production config validation и отсутствие dev defaults;
- TLS/reverse proxy/allowed origins;
- health/readiness endpoints без утечки деталей;
- structured logs, metrics и alerts;
- rate limiting и body/time limits;
- dependency/SBOM и security update process;
- privacy export/delete flow;
- incident, rollback и data recovery runbooks;
- staging E2E и release checklist;
- load test для утверждённого профиля, а не произвольный benchmark.

### Exit Criteria Phase 9

- Tenant isolation доказана отрицательными тестами.
- Entitlements и quotas невозможно обойти через прямой API.
- Audit не содержит secrets/project payload и покрывает критические события.
- Backup восстановлен в тестовой среде в пределах RPO/RTO.
- Privacy export/delete проверены end-to-end.
- Staging security review и release checklist закрыты.
- Владелец отдельно разрешил production deploy.

### Откат

Feature flags отключают commercial gates без удаления данных; schema rollback сохраняет записи. Billing/webhooks можно отключить независимо. Production rollback использует проверенный предыдущий release и совместимую схему, а не восстановление из backup без необходимости.

---

## 8. Матрица зависимостей

| Работа | Зависит от | Не должна включать |
| --- | --- | --- |
| Приёмка Phase 6 | Текущий diff, 94/94, browser/PDF smoke | Storage, accounts, migration |
| Phase 7 migration | Принятая Phase 6, выбранная DB/repository | Произвольные файлы, billing |
| Phase 8 storage/import | Принятая Phase 7, реальный sample и mapping | Универсальный importer, LLM parsing |
| Phase 9 ownership/entitlements | Принятые Phase 7–8, deployment/identity decisions | Неутверждённые тарифы и deploy |
| Production deploy | Полностью принятая Phase 9 | Автоматическое выполнение агентом |

## 9. Definition of Done для любой фазы

Фаза завершена только когда одновременно выполнено:

- утверждённый scope реализован без соседних изменений;
- все новые и старые тесты зелёные;
- настоящий браузерный сценарий пройден;
- расчётный golden-контракт сохранён либо каждое изменение отдельно согласовано;
- JSON/localStorage compatibility доказана;
- security/domain review не содержит незакрытых P0–P2;
- документация соответствует фактическому коду;
- способ отката проверяем и не удаляет данные;
- владелец явно принял фазу;
- commit/push/deploy выполнены только по отдельному разрешению.

## 10. Стартовая инструкция для Cursor

```text
Работай в репозитории SmetaCraft строго по AGENTS.md, docs/ROADMAP.md и
docs/PHASES_6_9_EXECUTION_PLAN.md. Сначала прочитай актуальный git status,
включая untracked-файлы, и проверь состояние Phase 6. Не удаляй и не
переформатируй существующие пользовательские изменения.

Первый шаг — только финальная приёмка Phase 6. Покажи владельцу точный состав
diff, результаты полного тестового набора, browser export/import/PDF evidence,
остаточные риски и предлагаемый commit scope. Не делай commit/push и не начинай
Phase 7 без отдельного разрешения.

Для каждой следующей фазы сначала представь отдельный конкретный план файлов,
API, данных, тестов, отката и Exit Criteria. Сохраняй js/core, golden, JSON v1
и localStorage, если владелец явно не утвердил обратное. Не добавляй LLM в
расчёты или импорт. Любой storage, auth, billing и deploy требуют соответствующих
решений владельца, перечисленных в плане.
```
