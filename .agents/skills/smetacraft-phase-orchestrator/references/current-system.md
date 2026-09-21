# Карта SmetaCraft для фаз 3–9

Карта архитектуры: расчётный и frontend-контракты после Phase 5, локальный сервер Phase 6–7 (project-check + SQLite migrate/readback). Последовательность и проверенный статус фаз хранятся в `docs/ROADMAP.md`; перед каждой фазой сверяй эту карту с актуальным кодом, тестами и заданием владельца.

## Архитектура и смета

- `index.html`, `js/core/*.js`, `js/ui/*.js` и `js/app/*.js`: Vanilla HTML/CSS/JS без сборки, БД и LLM для расчётов. Параметры слева, закреплённая ведомость справа. Анкета «Мой дом», прайс-лист, печать, JSON import/export и `localStorage` уже существуют. Локальный `server/server.cjs`: loopback static + `POST /api/project-check` (Phase 6) + SQLite migrate/readback (Phase 7, `docs/PROJECT_MIGRATION.md`) + закрытое файловое хранилище и explicit-text import PDF/DOCX (Phase 8, `docs/IMPORT_PDF.md`); UI «Перенести копию на server» в `js/app/project-migration.js`, upload/preview/apply в `js/app/document-import.js` (loopback only). Расчёты остаются в браузере.
- `read*Form` читает DOM, `validate*` проверяет ввод; `calculateSlab`, `calculateStrip`, `calculateWalls`, `calculatePlaster`, `calculateRoof`, `calculateFloor` находятся в `js/core/*.js` с явными зависимостями от действующих констант и чистых помощников. `renderSummary` агрегирует выбранные части в `js/app/summary.js`. Потоки плиты и ленты находятся в `js/ui`, остальные frontend-потоки — в `js/app`; `index.html` содержит разметку, стили и порядок загрузки.
- Строка расчётной ведомости содержит `name`, `netLabel`, `k`, `orderLabel`, `cost`. `netLabel`/`orderLabel` — отображаемые количества; отдельной машинной цены каждой строки нет. Сумма — в Br. Отличай округление количества к закупке от форматирования текста.
- `AGENTS.md` и `PRODUCT_SPEC.md` фиксируют бетон +5%, нахлёст арматуры 40d, хлысты 11,7 м, гидроизоляцию +15% и трамбование подушки ×1,10. Другие нормы и условия ищи в текущих константах и функциях. Не выдавай заложенные в код коэффициенты за независимо подтверждённые нормы.
- `barCount(span, step)` учитывает край: 8,1 м / 200 мм → 42 стержня на сетку. Контрольная плита 10×8 м с двумя сетками и ценами эталона показывает 12 099,19 Br. Видимая сводная и старый контроль 19 678,29 Br — разные контракты; см. `docs/regression-baseline.md`.

## Данные проекта и безопасность

- `collectProject()` экспортирует `format: "smetacraft-project"`, числовую `version: 1`, `block`, `billBlock`, `fields`, `checks`, `radios`, `openings`, `piles`, `flags`. `parseProjectText()`/`validateProjectV1()` проверяют всё до `applyProject()`.
- Точные allowlists в `PROJECT_*_IDS` в `js/app/config.js`: на момент снимка 99 полей, 15 checkbox, одно radio и 10 flags. Неизвестные ключи игнорируются, известные с неверным типом отклоняют импорт. Файл ограничен 1 MiB до `FileReader`, каждый массив — 500 строк.
- Явное boolean `opening.locked` сохраняется; при отсутствующем ключе первая строка получает прежний fallback `true`. Строки проёмов и свай создаются DOM API. Общий `billBodyEl.innerHTML` не переделан: анализируй источник данных до него, прежде чем объявлять риск или менять рендер.
- Ключ `localStorage` — `smetacraft_project`. Менять или мигрировать формат v1 можно только в рамках явно согласованной задачи и с round-trip проверкой.

## Проверки

- `tests/scenarios.cjs` задаёт входы. `tests/runtime.cjs` исполняет рабочие функции из `js/core`, `js/ui` и `js/app` в Node VM в порядке загрузки страницей, пропуская браузерные `state.js` и `boot.js`. `tests/golden.json` фиксирует строки, количества, цены, суммы и вывод; его `sourceSha256` — происхождение, не условие автоматического переписывания.
- Полный набор: `node --test tests/*.test.cjs` — **154/154** на `master` @ Phase 8 accepted (`f512a5f`: golden, security, project-model, backend-check, project-migration, project-migration-ui, file-import, file-storage, document-import-ui). Числа могут измениться после одобренной работы; проверяй актуальный набор и не перезаписывай golden ради зелёного теста.
- Минимальная Node-модель DOM не заменяет браузер для загрузки файла, печати и XSS smoke-test. Изменение калькулятора проверяй контрольным вводом → конкретные строки ведомости → итог.
- Не трогай готовые модули вне согласованного scope. Учитывай пользовательские и неотслеживаемые файлы; не добавляй их в commit автоматически.
