// Test-only adapter: execute production functions from index.html and extracted cores in Node's VM.
// It supplies form values and bill elements; no calculation formula lives here.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const stripCoreSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'strip.js'), 'utf8');
const wallsCoreSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'walls.js'), 'utf8');
const stripScript = '<script src="js/core/strip.js"></script>';
const wallsScript = '<script src="js/core/walls.js"></script>';
if (html.indexOf(stripScript) < 0 || html.indexOf(wallsScript) < html.indexOf(stripScript) ||
    html.indexOf(wallsScript) > html.indexOf('<script>')) {
  throw new Error('Calculation cores must load before the inline application script');
}
const sourceHash = crypto.createHash('sha256').update(html).digest('hex');

function between(start, end) {
  const a = html.indexOf(start);
  const b = html.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`index.html boundary missing: ${start} / ${end}`);
  return html.slice(a, b);
}

const appSource =
  between('const CONCRETE_RESERVE =', '// MODULE: STATE & DOM REFS') + '\n' +
  between('function parseNumber(value)', '// MODULE: DOM EVENTS & BOOT') + '\n' +
  between('function handleProjectFileChange()', 'projectFileEl.addEventListener("change", handleProjectFileChange)');

function element(value = '') {
  return {
    value: String(value), checked: false, hidden: false, textContent: '', innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, removeAttribute() {},
  };
}

// Minimal table-row DOM for the production opening/pile templates and writers.
function tableBody() {
  const rows = [];
  return {
    get firstElementChild() { return rows[0] || null; },
    appendChild(row) { row.parent = rows; rows.push(row); return row; },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    querySelectorAll(selector) {
      if (selector === '.opening-row' || selector === '[data-opening-id]') return rows.filter(r => r.className === 'opening-row');
      if (selector === '.pile-row' || selector === 'tr.pile-row' || selector === '[data-pile-id]') return rows.filter(r => r.className === 'pile-row');
      return [];
    },
  };
}

function templateRow(tag) {
  const attrs = {};
  const children = [];
  return {
    tagName: tag.toUpperCase(), className: '', id: '', value: '', textContent: '', parent: null,
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return attrs[name] || null; },
    remove() { const at = this.parent.indexOf(this); if (at !== -1) this.parent.splice(at, 1); },
    appendChild(child) { child.parent = children; children.push(child); return child; },
    querySelector(selector) {
      const cls = selector.slice(1);
      for (const child of children) {
        if (child.className.split(' ').includes(cls)) return child;
        const nested = child.querySelector(selector);
        if (nested) return nested;
      }
      return null;
    },
  };
}

function createApp() {
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  const context = {
    console,
    activeBlock: 'slab', billBlock: 'slab', lastFoundationBlock: 'slab',
    roofNeedsCalc: false, floorNeedsCalc: false, persistSuspended: true,
    roofWidthManual: false, roofLengthManual: false,
    floorLengthManual: false, floorWidthManual: false,
    wallsPerimeterManual: false, plasterLengthManual: false, plasterHeightManual: false,
    openingSeq: 1, pileSeq: 1,
    document: {
      getElementById: get,
      createElement: templateRow,
      querySelectorAll(selector) {
        if (selector === 'input[id], select[id]') return [...elements.values()].filter(x => x.id && x.type !== 'radio');
        if (selector === 'input[type="radio"][name]') return [...elements.values()].filter(x => x.type === 'radio');
        return [];
      },
    },
    window: { localStorage: (() => {
      const storage = new Map();
      return { getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, String(value)),
        removeItem: key => storage.delete(key) };
    })() },
  };
  context.wallsOpeningsBody = tableBody();
  context.pilesBodyEl = tableBody();
  const refs = [
    'billEmptyEl', 'billWrapEl', 'billPrintEl', 'billMetaEl', 'billBodyEl',
    'billTotalEl', 'billScopeEl', 'billExcludedEl', 'billNextEl',
    'printSubEl', 'printNodesEl', 'printDateEl',
    'errorEl', 'stripErrorEl', 'wallsErrorEl', 'plasterErrorEl',
    'roofErrorEl', 'floorErrorEl', 'summaryErrorEl',
    'summarySnapFoundEl', 'summarySnapWallsEl', 'summarySnapPlasterEl',
    'summarySnapRoofEl', 'summarySnapFloorEl',
    'plasterMeshPriceWrap', 'roofInsulationWrap',
  ];
  for (const name of refs) context[name] = element();
  context.billWrapEl.hidden = true;
  context.billPrintEl.hidden = true;
  context.summaryForm = {
    querySelector(selector) {
      if (selector === 'input[name="summary-found-type"]:checked') {
        return { value: context.foundationType || 'slab' };
      }
      return null;
    },
  };
  context.summaryFoundChoiceEl = { querySelectorAll: () => [] };
  for (const name of ['Found', 'Walls', 'Plaster', 'Roof', 'Floor']) {
    context[`summaryInclude${name}El`] = get(`summary-include-${name.toLowerCase()}`);
  }
  vm.createContext(context);
  vm.runInContext(stripCoreSource, context, { filename: 'js/core/strip.js' });
  vm.runInContext(wallsCoreSource, context, { filename: 'js/core/walls.js' });
  vm.runInContext(appSource, context, { filename: 'index.html' });
  // These are UI synchronization functions only. The fixture already holds their final values.
  for (const name of [
    'syncWallsUi', 'syncPilesUi', 'syncPlasterMeshUi', 'syncRoofInsulationUi',
    'syncRoofFootprintFromFoundation', 'syncFloorTypeUi', 'syncFloorFromFoundation',
    'syncSummaryUi', 'syncWallsPerimeterFromFoundation', 'syncPlasterFromWalls',
  ]) context[name] = () => {};
  return { context, elements, get };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function quantity(label) {
  const match = /^([\d\s\u00a0,.]+)\s*(.*)$/.exec(label || '');
  return match ? { displayed: match[1].trim(), unit: match[2] } : { displayed: label || '', unit: '' };
}

function runScenario(scenario) {
  const { context: app } = createApp();
  const input = plain(scenario.input);
  const section = scenario.section;
  const readers = {
    slab: 'readForm', strip: 'readStripForm', walls: 'readWallsForm',
    floor: 'readFloorForm', plaster: 'readPlasterForm', roof: 'readRoofForm',
  };
  const functions = {
    slab: 'renderSlab', strip: 'renderStrip', walls: 'renderWalls',
    floor: 'renderFloor', plaster: 'renderPlaster', roof: 'renderRoof',
    summary: 'renderSummary',
  };
  if (!functions[section]) throw new Error(`Unknown section: ${section}`);
  for (const [key, reader] of Object.entries(readers)) {
    app[reader] = () => plain(section === 'summary' ? input[key] : input);
  }
  app.getOpeningsData = () => plain(scenario.openings || input.openings || []);
  app.billBlock = section;
  app.activeBlock = section;
  app.foundationType = scenario.foundationType || 'slab';
  if (section === 'summary') {
    for (const name of ['Found', 'Walls', 'Plaster', 'Roof', 'Floor']) {
      app[`summaryInclude${name}El`].checked = Boolean(scenario.include?.[name.toLowerCase()]);
    }
  }
  let bill = null;
  const originalShowBill = app.showBill;
  app.showBill = (rows, total, meta, options) => {
    bill = { rows: plain(rows), total, meta, options: plain(options || {}) };
    return originalShowBill(rows, total, meta, options);
  };
  app[functions[section]](false);
  const rows = (bill?.rows || []).map(row => ({
    category: app.classifyMaterial(row.name),
    name: row.name,
    netLabel: row.netLabel,
    net: quantity(row.netLabel),
    coefficient: row.k,
    orderLabel: row.orderLabel,
    order: quantity(row.orderLabel),
    cost: row.cost,
  }));
  const prices = {};
  function collectPrices(obj, prefix = '') {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      if (key.toLowerCase().includes('price') && typeof value !== 'object') prices[prefix + key] = value;
      else if (value && typeof value === 'object' && !Array.isArray(value)) collectPrices(value, prefix + key + '.');
    }
  }
  collectPrices(input);
  const categorySubtotals = {};
  for (const row of rows) {
    categorySubtotals[row.category] = (categorySubtotals[row.category] || 0) + row.cost;
  }
  let calculationDetails = null;
  let sectionSubtotals = null;
  if (bill && bill.rows.length) {
    if (section === 'summary') {
      sectionSubtotals = {};
      const selected = scenario.include || {};
      if (selected.found) {
        sectionSubtotals.foundation = app[app.foundationType === 'strip' ? 'calculateStrip' : 'calculateSlab'](input[app.foundationType || 'slab']).total;
      }
      for (const key of ['walls', 'plaster', 'roof', 'floor']) {
        if (selected[key]) sectionSubtotals[key] = app[({ walls:'calculateWalls', plaster:'calculatePlaster', roof:'calculateRoof', floor:'calculateFloor' })[key]](input[key]).total;
      }
    } else {
      const result = app[({ slab:'calculateSlab', strip:'calculateStrip', walls:'calculateWalls',
        floor:'calculateFloor', plaster:'calculatePlaster', roof:'calculateRoof' })[section]](input);
      calculationDetails = plain(Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'rows' && key !== 'total')));
    }
  }
  return {
    id: scenario.id, title: scenario.title, purpose: scenario.purpose,
    projectSchemaVersion: 1, section, input, prices,
    selection: scenario.include || null,
    openings: scenario.openings || null,
    rows, intermediate: bill ? { ...bill.options, meta: bill.meta,
      categorySubtotals, sectionSubtotals, calculationDetails } : null,
    total: bill ? bill.total : null,
    displayedTotal: app.billTotalEl.textContent,
    display: {
      tableHtml: app.billBodyEl.innerHTML,
      scope: app.billScopeEl.hidden ? '' : app.billScopeEl.textContent,
      excluded: app.billExcludedEl.hidden ? '' : app.billExcludedEl.textContent,
      meta: app.billMetaEl.textContent,
      empty: app.billEmptyEl.hidden ? '' : app.billEmptyEl.textContent,
      error: app[({ slab:'errorEl', strip:'stripErrorEl', walls:'wallsErrorEl',
        floor:'floorErrorEl', plaster:'plasterErrorEl', roof:'roofErrorEl', summary:'summaryErrorEl' })[section]].textContent,
      printTitle: app.printSubEl.textContent,
      printNodes: app.printNodesEl.textContent,
    },
  };
}

function projectFixture(fixtures) {
  const { context: app, get } = createApp();
  const { slab, strip, walls, plaster, floor, roof, openings } = fixtures;
  const fields = {};
  const assign = (source, mapping) => {
    for (const [key, id] of Object.entries(mapping)) fields[id] = source[key];
  };
  assign(slab, { length:'length', width:'width', height:'height', grade:'grade', concretePrice:'concrete-price',
    diameterMm:'bar-diameter', stepMm:'bar-step', meshCount:'slab-mesh-count', rebarPrice:'rebar-price',
    wirePrice:'wire-price', boardPrice:'board-price', timberPrice:'timber-price', sandHeight:'sand-height',
    sandPrice:'sand-price', stoneHeight:'stone-height', stonePrice:'stone-price', hydroPrice:'hydro-price' });
  assign(strip, { length:'strip-length', width:'strip-width', height:'strip-height', grade:'strip-grade',
    concretePrice:'strip-concrete-price', diameterMm:'strip-bar-diameter', barCount:'strip-bar-count',
    rebarPrice:'strip-rebar-price', stirrupMm:'strip-stirrup-diameter', stirrupStepMm:'strip-stirrup-step',
    wirePrice:'strip-wire-price', boardPrice:'strip-board-price', timberPrice:'strip-timber-price',
    sandHeight:'strip-sand-height', sandPrice:'strip-sand-price', hydroPrice:'strip-hydro-price',
    pileConcretePrice:'pile-concrete-price', pileDrillingPrice:'pile-work-drilling-price', pileHydroPrice:'pile-hydro-price' });
  assign(walls, { perimeter:'walls-perimeter', loadMaterial:'walls-load-bearing-material', height:'walls-height',
    jointMm:'walls-joint-mm', armopoyasWidthMm:'wall-armopoyas-width', armopoyasHeightMm:'wall-armopoyas-height',
    armopoyasRebarMm:'walls-armopoyas-rebar', partitionMaterial:'walls-partition-material',
    partitionLength:'walls-partition-length', partitionHeight:'walls-partition-height' });
  assign(walls.prices, { blockPrice:'wall-block-price', adhesivePrice:'wall-adhesive-price', meshPrice:'wall-mesh-price',
    partitionBlockPrice:'partition-block-price', concretePrice:'wall-concrete-price', workMasonryPrice:'wall-work-masonry-price',
    workPartitionPrice:'wall-work-partition-price', workArmopoyasPrice:'wall-work-armopoyas-price' });
  assign(plaster, { length:'plaster-length', wallHeight:'plaster-height', sides:'plaster-sides', mix:'plaster-mix',
    thicknessMm:'plaster-thick', mixPrice:'plaster-mix-price', primerLayers:'plaster-primer-layers',
    primerPrice:'plaster-primer-price', beaconStep:'plaster-beacon-step', beaconPrice:'plaster-beacon-price',
    meshPrice:'plaster-mesh-price', workPrice:'plaster-work-price' });
  assign(floor, { type:'floor-type', length:'floor-length', width:'floor-width', beamSection:'floor-beam-section',
    beamStep:'floor-beam-step', insulationMm:'floor-insulation-mm', slabWidth:'floor-slab-width',
    woodBeamPrice:'floor-wood-beam-price', insulationPrice:'floor-insulation-price', membranePrice:'floor-membrane-price',
    boardPrice:'floor-board-price', concreteSlabPrice:'floor-concrete-slab-price', workWoodPrice:'floor-work-wood-price',
    workConcretePrice:'floor-work-concrete-price' });
  assign(roof, { type:'roof-type', width:'roof-width', length:'roof-length', ridgeHeight:'roof-ridge-height',
    eave:'roof-eave', rafterSection:'roof-rafter-section', rafterStepMm:'roof-rafter-step',
    mauerlatSection:'roof-mauerlat-section', battenStepMm:'roof-batten-step', battenSection:'roof-batten-section',
    insulationMm:'roof-insulation-mm', covering:'roof-covering', timberPrice:'roof-timber-price',
    boardPrice:'roof-board-price', metalPrice:'roof-metal-price', insulationPrice:'roof-insulation-price',
    membranePrice:'roof-membrane-price', vaporPrice:'roof-vapor-price', workPrice:'roof-work-price' });
  for (const [id, value] of Object.entries(fields)) {
    const el = get(id); el.id = id; el.type = 'text'; el.value = String(value);
  }
  const checks = { 'strip-piles-enabled': true, 'walls-reinforce-mesh': walls.reinforceMesh,
    'walls-armopoyas': walls.armopoyas, 'walls-lintels': walls.lintels,
    'walls-partitions-enabled': walls.partitionsEnabled, 'plaster-exclude-openings': true,
    'plaster-mesh': plaster.useMesh, 'floor-board-clad': floor.boardClad,
    'floor-monolith': floor.monolith, 'roof-warm': roof.warmRoof,
    'summary-include-found': true, 'summary-include-walls': true,
    'summary-include-plaster': true, 'summary-include-floor': true, 'summary-include-roof': true };
  for (const [id, checked] of Object.entries(checks)) {
    const el = get(id); el.id = id; el.type = 'checkbox'; el.checked = checked;
  }
  for (const value of ['slab', 'strip']) {
    const el = get(`summary-found-${value}`); el.id = `summary-found-${value}`;
    el.type = 'radio'; el.name = 'summary-found-type'; el.value = value; el.checked = value === 'strip';
  }
  for (const value of ['slab', 'strip']) {
    const el = get(`summary-found-${value}`);
    let selected = el.checked;
    Object.defineProperty(el, 'checked', { get: () => selected, set: next => {
      selected = Boolean(next);
      if (selected) {
        const other = get(`summary-found-${value === 'slab' ? 'strip' : 'slab'}`);
        other.checked = false;
      }
    } });
  }
  app.foundationType = 'strip';
  app.gradeEl = get('grade'); app.concretePriceEl = get('concrete-price');
  app.stripGradeEl = get('strip-grade'); app.stripConcretePriceEl = get('strip-concrete-price');
  app.pilesEnabledEl = get('strip-piles-enabled'); app.pilesBoxEl = element();
  app.wallsPerimeterEl = get('walls-perimeter');
  app.plasterLengthEl = get('plaster-length'); app.plasterHeightEl = get('plaster-height');
  app.plasterMixEl = get('plaster-mix'); app.plasterMixPriceEl = get('plaster-mix-price');
  app.plasterMeshEl = get('plaster-mesh');
  app.floorTypeEl = get('floor-type'); app.floorLengthEl = get('floor-length'); app.floorWidthEl = get('floor-width');
  app.roofWidthEl = get('roof-width'); app.roofLengthEl = get('roof-length'); app.roofWarmEl = get('roof-warm');
  app.wallsArmopoyasEl = get('walls-armopoyas'); app.wallsPartitionsEl = get('walls-partitions-enabled');
  app.wallsArmopoyasBoxEl = element(); app.wallsPartitionsBoxEl = element();
  app.writeOpeningsState(openings.map((o, i) => ({ ...o, locked: i === 0 })));
  app.writePilesState([{ id: 1, locked: true, name: 'Основная группа', diameterMm: 300, depthM: '2.5', count: '20' }]);
  app.roofWidthManual = true; app.floorLengthManual = true; app.wallsPerimeterManual = true;
  app.plasterLengthManual = true; app.lastFoundationBlock = 'strip';
  app.activeBlock = 'summary'; app.billBlock = 'summary';
  app.render = () => {};
  app.setActiveBlock = block => { app.activeBlock = block; };
  app.summaryForm.querySelector = selector => selector.endsWith(':checked')
    ? ['slab', 'strip'].map(value => get(`summary-found-${value}`)).find(el => el.checked) || null : null;
  return { app, get };
}

function disturbProject(app, get) {
  get('roof-metal-price').value = '1';
  get('summary-include-roof').checked = false;
  get('summary-found-slab').checked = true;
  app.roofWidthManual = false;
}

function projectSummary(app) {
  let bill;
  const showBill = app.showBill;
  app.showBill = (rows, total, meta, options) => {
    bill = { rows: plain(rows), total, meta, options: plain(options) };
    return showBill(rows, total, meta, options);
  };
  app.renderSummary();
  app.showBill = showBill;
  return { ...bill, displayedTotal: app.billTotalEl.textContent,
    scope: app.billScopeEl.textContent, excluded: app.billExcludedEl.textContent };
}

function runJsonRoundTrip(fixtures) {
  const { app, get } = projectFixture(fixtures);
  const before = plain(app.collectProject());
  const summaryBefore = projectSummary(app);
  const exported = JSON.stringify(before);
  app.resetProjectToZero();
  disturbProject(app, get);
  const afterClear = plain(app.collectProject());
  const parsed = app.parseProjectText(exported);
  const appliedFields = app.applyProject(parsed);
  const after = plain(app.collectProject());
  const summaryAfter = projectSummary(app);
  return { projectSchemaVersion: before.version, exported: before,
    afterClear: { length: afterClear.fields.length, width: afterClear.fields.width,
      openings: afterClear.openings, piles: afterClear.piles,
      metalPrice: afterClear.fields['roof-metal-price'],
      foundType: afterClear.radios['summary-found-type'] },
    imported: after, appliedFields, summaryBefore, summaryAfter };
}

function runLocalStorageRoundTrip(fixtures) {
  const { app, get } = projectFixture(fixtures);
  const before = plain(app.collectProject());
  app.persistSuspended = false;
  app.saveToLocalStorage();
  const saved = app.window.localStorage.getItem('smetacraft_project');
  app.persistSuspended = true;
  app.resetProjectToZero();
  disturbProject(app, get);
  const cleared = plain(app.collectProject());
  const loaded = app.loadFromLocalStorage();
  return { before, saved: JSON.parse(saved), cleared,
    loaded, restored: plain(app.collectProject()) };
}

function runIntakeSlabSmoke(fixtures) {
  const { context: app, get } = createApp();
  const input = fixtures.slab;
  const fields = {
    'intake-length': input.length, 'intake-width': input.width,
    'intake-slab-thick': input.height, 'intake-wall-height': 0,
    'intake-windows': 0, 'intake-doors': 0,
    'intake-ridge-height': 0, 'intake-eave': 0,
    grade: input.grade, 'concrete-price': input.concretePrice,
    'bar-diameter': input.diameterMm, 'bar-step': input.stepMm,
    'slab-mesh-count': input.meshCount, 'rebar-price': input.rebarPrice,
    'wire-price': input.wirePrice, 'board-price': input.boardPrice,
    'timber-price': input.timberPrice, 'sand-height': input.sandHeight,
    'sand-price': input.sandPrice, 'stone-height': input.stoneHeight,
    'stone-price': input.stonePrice, 'hydro-price': input.hydroPrice,
  };
  for (const [id, value] of Object.entries(fields)) get(id).value = String(value);
  get('intake-include-found').checked = true;
  for (const part of ['walls', 'plaster', 'floor', 'roof']) {
    get(`intake-include-${part}`).checked = false;
  }
  app.gradeEl = get('grade');
  app.concretePriceEl = get('concrete-price');
  app.intakeErrorEl = element();
  app.intakeStatusEl = element();
  app.plasterMeshEl = element();
  app.pilesEnabledEl = element();
  app.writeOpeningsState = () => {};
  app.writePilesState = () => {};
  app.saveToLocalStorage = () => {};
  app.setActiveBlock = block => { app.activeBlock = block; app.billBlock = block; };
  app.summaryForm.querySelector = selector => selector.includes('[value="slab"]') || selector.endsWith(':checked')
    ? { value: 'slab', checked: false } : null;
  app.readStripForm = () => fixtures.strip;
  app.readWallsForm = () => fixtures.walls;
  app.readFloorForm = () => fixtures.floor;
  app.readPlasterForm = () => fixtures.plaster;
  app.readRoofForm = () => fixtures.roof;
  app.getOpeningsData = () => [];
  const applied = app.applyIntakeQuestionnaire();
  const afterIntake = plain(app.readForm());
  let bill = null;
  const showBill = app.showBill;
  app.showBill = (rows, total, meta, options) => {
    bill = { rows: plain(rows), total };
    return showBill(rows, total, meta, options);
  };
  app.renderSummary();
  return {
    applied, activeBlock: app.activeBlock, afterIntake, bill,
    displayedTotal: app.billTotalEl.textContent,
    scope: app.billScopeEl.textContent, excluded: app.billExcludedEl.textContent,
    next: app.billNextEl.textContent, error: app.summaryErrorEl.textContent,
  };
}

function runLegacyControl(slabInput, plasterInput) {
  const { context: app } = createApp();
  const openingRows = [
    { w: 1.5, h: 1.4, n: 4, blank: false },
    { w: 1, h: 2.1, n: 1, blank: false },
  ];
  const legacyWalls = {
    perimeter: 40, height: 3, material: 'block',
    block: { length: 0.6, thick: 0.3, height: 0.2 },
    brick: { name: '1 НФ', length: 0.25, width: 0.12, height: 0.065 },
    thick: 0.3, rowHeight: 0.2, glueType: 'bag',
    blockPrice: 5.5, gluePrice: 18, brickPrice: 0.42,
    mortarPrice: 7.5, meshPrice: 8, rebarPrice: 3.2,
    lintelPrice: 28, screwPrice: 12,
    openings: app.summarizeOpenings('list', 0, openingRows),
    openingMode: 'list', openingRows,
  };
  const oldPlaster = {
    ...plasterInput, length: 44.444444, wallHeight: 2.7, excludeOpenings: false,
  };
  const slabBill = app.calculateSlab(slabInput);
  const wallBill = app._calculateWallsLegacy(legacyWalls);
  const plasterBill = app.calculatePlaster(oldPlaster);
  const total = slabBill.total + wallBill.total + plasterBill.materialsCost;
  return plain({
    purpose: 'Existing computeRegressionSummaryTotal: slab + legacy walls + plaster materials only',
    input: { slab: slabInput, legacyWalls, plaster: oldPlaster },
    components: {
      slab: slabBill.total, legacyWalls: wallBill.total,
      plasterMaterials: plasterBill.materialsCost,
      plasterWorkExcluded: plasterBill.workCost,
    },
    rows: {
      slab: slabBill.rows, legacyWalls: wallBill.rows,
      plasterMaterials: plasterBill.rows.filter(row => !row.name.startsWith('Штукатурные работы')),
    },
    total, displayedTotal: app.formatMoney(total),
  });
}

function runExistingRegression(fixtures) {
  const { context: app, get } = createApp();
  const legacy = runLegacyControl(fixtures.slab, fixtures.plaster);
  const sixWindows = [{ id: 1, type: 'window', width: 1.5, height: 1.5, count: 6 }];
  let phase = 'base';
  app.applyRegressionFixtures = () => {
    phase = 'base';
    get('slab-mesh-count').value = '2';
    app.summaryIncludeFoundEl.checked = true;
    app.summaryIncludeWallsEl.checked = true;
    app.summaryIncludePlasterEl.checked = true;
    get('plaster-exclude-openings').checked = false;
  };
  app.applyStripPilesRegressionFixtures = () => { phase = 'strip'; };
  app.applyRoofRegressionFixtures = () => { phase = 'roof'; };
  app.applyWallsRegressionFixtures = () => { phase = 'walls'; };
  app.applyPlasterRegressionFixtures = () => {
    phase = 'plaster'; get('plaster-exclude-openings').checked = true;
  };
  app.applyFloorRegressionFixtures = () => { phase = 'floor'; };
  app.readForm = () => ({ ...fixtures.slab, meshCount: Number(get('slab-mesh-count').value) });
  app.readStripForm = () => ({ ...fixtures.strip, pilesEnabled: true,
    piles: [{ id: 1, name: 'Основная группа', diameterMm: 300, depthM: 2.5, count: 20 }] });
  app.readRoofForm = () => fixtures.roof;
  app.readWallsForm = () => ({ ...fixtures.walls, perimeter: 36, openings: sixWindows });
  app.readPlasterForm = () => phase === 'plaster'
    ? { ...fixtures.plaster, excludeOpenings: true }
    : legacy.input.plaster;
  app.readFloorForm = () => fixtures.floor;
  app._readWallsFormLegacy = () => legacy.input.legacyWalls;
  app.getOpeningsData = () => phase === 'plaster' ? sixWindows : [];
  app.setActiveBlock = block => { app.activeBlock = block; };
  const passed = app.runRegressionTests();
  return { passed, badge: get('regression-badge').textContent };
}

module.exports = { html, sourceHash, createApp, projectFixture, runScenario, runJsonRoundTrip, runLocalStorageRoundTrip, runIntakeSlabSmoke, runLegacyControl, runExistingRegression, plain };
