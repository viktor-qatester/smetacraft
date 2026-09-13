// Inputs are explicit so a future migration can replay precisely the same project and prices.
// Expected outputs are generated separately from the unchanged index.html, never typed here.
const slab = {
  length: 10, width: 8, height: 0.3, grade: 'М250', concretePrice: 210,
  diameterMm: 12, stepMm: 200, meshCount: 2, rebarPrice: 3.2,
  wirePrice: 4.5, boardPrice: 14, timberPrice: 8,
  sandHeight: 0.2, sandPrice: 32, stoneHeight: 0.2, stonePrice: 55,
  hydroPrice: 28,
};
const strip = {
  length: 40, width: 0.4, height: 1, grade: 'М250', concretePrice: 210,
  diameterMm: 12, barCount: 4, rebarPrice: 3.2,
  stirrupMm: 8, stirrupStepMm: 300, wirePrice: 4.5,
  boardPrice: 14, timberPrice: 8, sandHeight: 0.2, sandPrice: 32,
  hydroPrice: 28, pilesEnabled: false, pileConcretePrice: 185,
  pileDrillingPrice: 45, pileHydroPrice: 2.8, piles: [],
};
const openings = [
  { id: 1, type: 'window', width: 1.5, height: 1.4, count: 4 },
  { id: 2, type: 'entry-door', width: 1, height: 2.1, count: 1 },
];
const walls = {
  perimeter: 40, loadMaterial: 'gas-silicate-300', height: 3, jointMm: 2,
  reinforceMesh: true, openings, armopoyas: true,
  armopoyasWidthMm: 250, armopoyasHeightMm: 250, armopoyasRebarMm: 12,
  lintels: true, partitionsEnabled: false, partitionMaterial: 'block-100',
  partitionLength: 0, partitionHeight: 0, stripRebarPrice: 3.2,
  prices: {
    blockPrice: 140, adhesivePrice: 9.5, meshPrice: 3.2,
    partitionBlockPrice: 150, concretePrice: 185,
    workMasonryPrice: 45, workPartitionPrice: 18, workArmopoyasPrice: 15,
  },
};
const floor = {
  type: 'wood', length: 10, width: 8, beamSection: '100x200', beamStep: 0.6,
  insulationMm: 150, boardClad: true, slabWidth: 1.2, monolith: false,
  concreteGrade: 'М250', woodBeamPrice: 450, insulationPrice: 95,
  membranePrice: 1.8, boardPrice: 380, concreteSlabPrice: 500,
  workWoodPrice: 25, workConcretePrice: 80, wallConcretePrice: 185,
  stripRebarPrice: 3.2,
};
const plaster = {
  length: 40, wallHeight: 3, sides: '1', excludeOpenings: false,
  mix: 'gypsum', thicknessMm: 15, mixPrice: 16.5, primerLayers: 1,
  primerPrice: 28, beaconStep: 1.2, beaconPrice: 3.2,
  useMesh: false, meshPrice: 60, workPrice: 10,
};
const roof = {
  type: 'gable', width: 8, length: 10, ridgeHeight: 2.5, eave: 0.5,
  rafterSection: '50x200', rafterStepMm: 600,
  mauerlatSection: '150x150', battenStepMm: 350, battenSection: '25x100',
  warmRoof: true, insulationMm: 150, covering: 'metal-tile',
  timberPrice: 450, boardPrice: 380, metalPrice: 28,
  insulationPrice: 95, membranePrice: 110, vaporPrice: 85,
  workPrice: 65,
};

const scenarios = [
  { id: 'slab-one-mesh', title: 'Плита, одна сетка', purpose: 'Выбор одной сетки и закупка целых хлыстов', section: 'slab', input: { ...slab, meshCount: 1 } },
  { id: 'slab-two-meshes', title: 'Плита, две сетки', purpose: 'Текущий основной расчёт плиты', section: 'slab', input: slab },
  { id: 'strip', title: 'Лента', purpose: 'Лента без свай', section: 'strip', input: strip },
  { id: 'strip-piles', title: 'Лента со сваями', purpose: 'Одна группа свай и лента', section: 'strip', input: {
    ...strip, pilesEnabled: true,
    piles: [{ id: 1, name: 'Основная группа', diameterMm: 300, depthM: 2.5, count: 20 }],
  } },
  { id: 'walls-no-openings', title: 'Стены без проёмов', purpose: 'Чистая кладка без вычета окон и дверей', section: 'walls', input: { ...walls, openings: [] } },
  { id: 'walls-openings', title: 'Стены с окнами и дверью', purpose: 'Вычет нескольких проёмов', section: 'walls', input: walls },
  { id: 'floor-wood', title: 'Деревянное перекрытие', purpose: 'Балки, утеплитель и накат', section: 'floor', input: floor },
  { id: 'floor-concrete', title: 'ЖБ перекрытие', purpose: 'Плиты, швы, монолитный остаток и монтаж', section: 'floor', input: { ...floor, type: 'concrete', monolith: true } },
  { id: 'plaster-gross', title: 'Штукатурка без вычета', purpose: 'Полная площадь стен', section: 'plaster', input: plaster, openings },
  { id: 'plaster-openings', title: 'Штукатурка с вычетом', purpose: 'Вычет тех же окон и двери', section: 'plaster', input: { ...plaster, excludeOpenings: true }, openings },
  { id: 'roof-gable', title: 'Двускатная кровля', purpose: 'Утеплённая кровля с металлочерепицей', section: 'roof', input: roof },
  { id: 'summary-current', title: 'Пользовательская сводная', purpose: 'Фактический renderSummary: плита, стены, штукатурка', section: 'summary',
    input: { slab, strip, walls, floor, plaster: { ...plaster, excludeOpenings: true }, roof },
    openings, include: { found: true, walls: true, plaster: true, floor: false, roof: false },
  },
  { id: 'summary-all-sections', title: 'Полная сводная', purpose: 'Все пять разделов: плита, стены, штукатурка, кровля и перекрытие', section: 'summary',
    input: { slab, strip, walls, floor, plaster: { ...plaster, excludeOpenings: true }, roof },
    openings, include: { found: true, walls: true, plaster: true, roof: true, floor: true },
  },
  { id: 'summary-strip-piles-floor-roof', title: 'Лента, сваи, перекрытие и кровля', purpose: 'Альтернативный фундамент и исключённые стены со штукатуркой', section: 'summary',
    foundationType: 'strip', input: { slab, strip: { ...strip, pilesEnabled: true,
      piles: [{ id: 1, name: 'Основная группа', diameterMm: 300, depthM: 2.5, count: 20 }] },
    walls, floor: { ...floor, type: 'concrete', monolith: true }, plaster, roof },
    openings, include: { found: true, walls: false, plaster: false, roof: true, floor: true },
  },
  { id: 'summary-legacy-fixture-visible', title: 'Видимая сводная на геометрии старого теста',
    purpose: 'Сопоставление с legacy-контролем при тех же размерах и проёмах; текущие цены стен и работы отличаются по модели', section: 'summary',
    input: { slab, strip, walls: { ...walls, openings }, floor,
      plaster: { ...plaster, length: 44.444444, wallHeight: 2.7, excludeOpenings: false }, roof },
    openings, include: { found: true, walls: true, plaster: true, floor: false, roof: false },
  },
  { id: 'new-empty', title: 'Пустой проект', purpose: 'Выбрана плита без геометрии', section: 'slab', input: { ...slab, length: 0, width: 0, height: 0 } },
  { id: 'edge-8-1', title: 'Граница шага арматуры', purpose: 'Пролёт 8,1 м при шаге 200 мм', section: 'slab', input: { ...slab, width: 8.1 } },
  { id: 'invalid-slab-step', title: 'Некорректный шаг', purpose: 'Валидация нулевого шага сетки', section: 'slab', input: { ...slab, stepMm: 0 } },
  { id: 'invalid-strip-cover', title: 'Некорректное сечение ленты', purpose: 'Защитный слой не помещается в ленту', section: 'strip', input: { ...strip, width: 0.08 } },
  { id: 'invalid-walls-openings', title: 'Недопустимые проёмы', purpose: 'Площадь проёмов больше площади стен', section: 'walls', input: {
    ...walls, openings: [{ id: 1, type: 'window', width: 39, height: 3, count: 2 }],
  } },
  { id: 'invalid-plaster-area', title: 'Нет площади штукатурки', purpose: 'После вычета проёмов площадь не положительна', section: 'plaster',
    input: { ...plaster, excludeOpenings: true }, openings: [{ id: 1, type: 'window', width: 40, height: 3, count: 1 }],
  },
];

module.exports = { scenarios, slab, strip, walls, floor, plaster, roof, openings };
