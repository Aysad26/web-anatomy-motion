const concepts = [
  {
    theme: 'contour', color: '#eef3f8', darkColor: '#122db4', composition: 'poster', compositionName: 'Синий постер', field: 'FIELD', name: 'ИМПУЛЬС', lines: ['ФОРМА', 'ЖИВЁТ'],
    description: 'Делаем сайты, которые чувствуются.', hint: 'Коснись, чтобы пустить волну',
    load: () => import('./scenes/contour.js').then(module => module.createContourHero)
  },
  {
    theme: 'scan', color: '#f4f6f8', darkColor: '#080d1b', composition: 'base', compositionName: 'Ночной слой', field: 'MATTER', name: 'СБОРКА', lines: ['ИЗ ТОЧЕК', 'В ЗНАК'],
    description: 'Придаём сложному ясную форму.', hint: 'Коснись или веди — сканируй знак',
    load: () => import('./scenes/scan.js').then(module => module.createScanHero)
  },
  {
    theme: 'lens', color: '#f3f5f7', darkColor: '#0b101c', composition: 'portal', compositionName: 'Оптическое окно', field: 'FOCUS', name: 'ОПТИКА', lines: ['МЕНЯЕМ', 'ОПТИКУ'],
    description: 'Дизайн, который меняет взгляд.', hint: 'Веди линзу. Удерживай, чтобы усилить фокус',
    load: () => import('./scenes/lens.js').then(module => module.createLensHero)
  },
  {
    theme: 'lens', color: '#f3f5f7', darkColor: '#0b101c', composition: 'portal', compositionName: 'Оптическое окно', field: 'WAVES', name: 'ЛИНЗА / КРУГИ', lines: ['МЕНЯЕМ', 'ОПТИКУ'],
    description: 'Новый взгляд на простые вещи.', hint: 'Веди линзу — преломляй волны',
    load: () => import('./scenes/lens.js').then(module => module.createRingLensHero)
  },
  {
    theme: 'contour', color: '#eef3f8', darkColor: '#122db4', composition: 'poster', compositionName: 'Синий постер', field: 'RELIEF', name: 'ПЛОТНЫЙ РЕЛЬЕФ', lines: ['ФОРМА', 'ЖИВЁТ'],
    description: 'Точная форма. Мягкое движение.', hint: 'Коснись, чтобы пустить волну',
    load: () => import('./scenes/contour-dense.js').then(module => module.createDenseContourHero)
  },
  {
    theme: 'scan', color: '#f4f6f8', darkColor: '#080d1b', composition: 'base', compositionName: 'Ночной слой', field: 'SERVICES', name: 'УСЛУГИ / ЧАСТИЦЫ', lines: ['ФОРМА', 'РЕШЕНИЯ'],
    description: 'Идея обретает форму.', hint: 'Веди — меняй ракурс',
    services: true,
    load: () => import('./scenes/services.js').then(module => module.createServicesHero)
  },
  {
    theme: 'contour', color: '#eef3f8', darkColor: '#122db4', composition: 'field', compositionName: 'Свободное поле', field: 'CHROMA', name: 'ГРАДИЕНТНЫЙ РЕЛЬЕФ', lines: ['ЦВЕТ', 'В ФОРМЕ'],
    description: 'Цвет под линиями. Объём в линиях.', hint: 'Веди — смещай круги. Коснись, чтобы пустить волну',
    backdrop: true,
    load: () => import('./scenes/contour-gradient.js').then(module => module.createGradientContourHero)
  },
  {
    theme: 'scan', color: '#f4f6f8', darkColor: '#080d1b', composition: 'base', compositionName: 'Ночной слой', field: 'MORPH', name: 'ЗНАК / УСЛУГИ', lines: ['ЗНАК', 'В ДЕЛЕ'],
    description: 'Один знак, три направления.', hint: 'Наведи или коснись услуги. Веди по сцене — сканируй форму',
    services: true, servicePreview: true,
    load: () => import('./scenes/services.js').then(module => module.createHoverServicesHero)
  },
  {
    theme: 'contour', color: '#eef3f8', darkColor: '#122db4', composition: 'field', compositionName: 'Свободное поле', field: 'BEVEL', name: 'ГРАДИЕНТ / ФАСКИ', lines: ['ЦВЕТ', 'В ФОРМЕ'],
    description: 'Линии огибают грани знака.', hint: 'Коснись сцены, чтобы пустить волну',
    backdrop: true, impulse: true,
    load: () => import('./scenes/contour-gradient-bevel.js').then(module => module.createBevelGradientContourHero)
  },
  {
    theme: 'print', color: '#f6f3f5', darkColor: '#0b0b12', composition: 'poster', compositionName: 'Растровый постер', field: 'SCREEN', name: 'РАСТР', lines: ['СВЕТ', 'ПО ТОЧКАМ'],
    description: 'Свет и знак в едином растре.', hint: 'Веди по полю. Коснись, чтобы пустить волну',
    load: () => import('./scenes/raster-studies.js').then(module => module.createHalftoneHero)
  },
  {
    theme: 'scan', color: '#f4f6f8', darkColor: '#080d1b', composition: 'poster', compositionName: 'Ночное поле', field: 'FIBER', name: 'ЛУЧЕВОЙ УЗЕЛ', lines: ['ТОЧКА', 'СХОЖДЕНИЯ'],
    description: 'Из одной точки — в узнаваемый знак.', hint: 'Веди, чтобы сместить узел. Коснись для вспышки',
    load: () => import('./scenes/line-studies.js').then(module => module.createFiberHero)
  },
  {
    theme: 'print', color: '#f6f3f5', darkColor: '#0b0b12', composition: 'poster', compositionName: 'Растровый постер', field: 'MATRIX', name: 'МАТРИЦА', lines: ['КОД', 'В ФОРМЕ'],
    description: 'Сотни символов. Один характер.', hint: 'Веди, чтобы сместить фокус. Коснись, чтобы собрать знак',
    load: () => import('./scenes/raster-studies.js').then(module => module.createMatrixHero)
  },
  {
    theme: 'lens', color: '#f3f5f7', darkColor: '#0b101c', composition: 'poster', compositionName: 'Оптический постер', field: 'VORTEX', name: 'ВИХРЬ', lines: ['СВЕТ', 'В ВИХРЕ'],
    description: 'Свет скользит. Форма остаётся.', hint: 'Веди, чтобы сместить линзу. Коснись для импульса',
    load: () => import('./scenes/optical-studies.js').then(module => module.createVortexHero)
  },
  {
    theme: 'scan', color: '#f4f6f8', darkColor: '#080d1b', composition: 'poster', compositionName: 'Чертёжное поле', field: 'PLOT', name: 'ПЛОТТЕР', lines: ['ЛИНИИ', 'В ДВИЖЕНИИ'],
    description: 'Точный контур. Живые линии.', hint: 'Веди по траекториям. Коснись, чтобы запустить проход',
    load: () => import('./scenes/line-studies.js').then(module => module.createPlotterHero)
  },
  {
    theme: 'lens', color: '#f3f5f7', darkColor: '#0b101c', composition: 'poster', compositionName: 'Оптический постер', field: 'PRISM', name: 'ПРИЗМА', lines: ['СДВИГ', 'СВЕТА'],
    description: 'Один знак. Несколько преломлений.', hint: 'Веди, чтобы наклонить призмы. Коснись для импульса',
    load: () => import('./scenes/optical-studies.js').then(module => module.createPrismHero)
  },
  {
    theme: 'lens', color: '#f3f5f7', darkColor: '#0b101c', composition: 'poster', compositionName: 'Градиентный постер', field: 'TILE', name: 'ФРАГМЕНТ', lines: ['ЦЕЛОЕ', 'ИЗ ЧАСТЕЙ'],
    description: 'Анимация повторяется сама.', hint: 'Коснись знака, чтобы начать цикл заново',
    gradientPanel: true,
    load: () => import('./scenes/griddler.js').then(module => module.createGriddlerHero)
  },
  {
    theme: 'lens', color: '#f3f5f7', darkColor: '#0b101c', composition: 'poster', compositionName: 'Градиентный постер', field: 'FOCUS', name: 'ФРАГМЕНТ / ФОКУС', lines: ['СОБЕРИ', 'ЗНАК'],
    description: 'Наведи на знак — он соберётся.', hint: 'Или коснись знака / нажми кнопку',
    gradientPanel: true, assembly: true,
    load: () => import('./scenes/griddler-variants.js').then(module => module.createAssemblyFragmentHero)
  },
  {
    theme: 'lens', color: '#f3f5f7', darkColor: '#0b101c', composition: 'poster', compositionName: 'Градиентный постер', field: 'TILT', name: 'ФРАГМЕНТ / ПЕРСПЕКТИВА', lines: ['ПОД ДРУГИМ', 'УГЛОМ'],
    description: 'Фазы плавно сменяют друг друга.', hint: 'Веди курсором или пальцем, чтобы наклонить знак',
    gradientPanel: true, perspective: true,
    load: () => import('./scenes/griddler-variants.js').then(module => module.createPerspectiveFragmentHero)
  }
];
const get = id => document.getElementById(id);
const root = document.documentElement;
const stage = get('stage'), hero = get('hero'), heading = get('headline'), message = get('message');
const gradientBackdrop = get('gradient-backdrop');
const pause = get('pause'), replay = get('replay'), pulse = get('pulse');
const assemble = get('assemble'), assembleLabel = get('assemble-label');
const tabs = concepts.map((_, index) => get('tab-' + String(index + 1).padStart(2, '0')));
const variantGroups = [get('variant-core'),get('variant-studies')];
const groupBoundary = 9;
const groupFor = index => Number(index >= groupBoundary);
const lastInGroup = [0,groupBoundary];
const services = [
  {id: 'design', name: 'Дизайн', description: 'Идея обретает форму.'},
  {id: 'development', name: 'Разработка', description: 'Дизайн становится сайтом.'},
  {id: 'support', name: 'Поддержка', description: 'Сайт работает и развивается.'}
];
const serviceControls = get('service-controls');
const serviceButtons = services.map(service => get('service-' + service.id));
const requestedService = new URLSearchParams(location.search).get('service');
let activeService = Math.max(0, services.findIndex(service => service.id === requestedService));
let hoverService = -1, focusService = -1, pinnedService = -1;
const previewService = () => hoverService >= 0 ? hoverService : focusService >= 0 ? focusService : pinnedService;
const sceneService = () => concepts[selected]?.servicePreview ? previewService() : activeService;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const themeColor = document.querySelector('meta[name="theme-color"]');
const appearances = ['light', 'dark', 'mixed'];
const themeButtons = appearances.map(mode => get('theme-' + mode));
const requestedAppearance = new URLSearchParams(location.search).get('theme');
let appearance = appearances.includes(requestedAppearance) ? requestedAppearance : 'light';
function syncAppearance() {
  root.dataset.mode = appearance;
  get('mixed-label').textContent = root.dataset.fragment === 'true' ? 'Градиент' : 'Комби';
  themeButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(appearance === appearances[i])));
}
syncAppearance();
const idOf = index => String(index + 1).padStart(2, '0');
function indexFromHash() {
  const index = Number(location.hash.slice(1)) - 1;
  return Number.isInteger(index) && index >= 0 && index < concepts.length ? index : 0;
}

let renderer, loadController, generation = 0, selected = -1;
let time = 0, last = 0, raf = 0, paused = false, reduced = false, inView = true;
let pointerId = null, startX = 0, startY = 0, pressPending = false;
const input = {x: 0, y: 0, type: '', assembled: false, active: false, dragging: false, dragX: 0, dragY: 0, pressed: false, pressX: 0, pressY: 0};
const clamp = v => Math.max(-1, Math.min(1, v));

function fitTitle() {
  // Measure the text column itself: on desktop the picture occupies its own column.
  const desktop = window.innerWidth >= 900, tablet = window.innerWidth >= 600;
  const ceiling = desktop ? Math.min(144, window.innerHeight * .17) : tablet ? 100 : concepts[selected]?.services ? (window.innerHeight <= 700 ? 43 : 60) : (window.innerHeight <= 700 ? 54 : 76);
  const available = heading.clientWidth || hero.clientWidth;
  const preferred = Math.min(ceiling, Math.max(46, available * (desktop ? .24 : tablet ? .17 : .16)));
  for (const line of heading.children) {
    const inner = line.firstElementChild;
    inner.style.fontSize = preferred + 'px';
    if (inner.offsetWidth && line.clientWidth) {
      inner.style.fontSize = Math.min(preferred, preferred * (line.clientWidth - 1) / inner.offsetWidth) + 'px';
    }
  }
}
function titleFor(lines, animate) {
  const elements = lines.map((text, i) => {
    const outer = document.createElement('span'), inner = document.createElement('span');
    outer.className = 'line';
    inner.textContent = text;
    if (i === lines.length - 1) {
      const accent = document.createElement('i');
      accent.textContent = '.';
      inner.append(accent);
    }
    outer.append(inner);
    return outer;
  });
  heading.replaceChildren(...elements);
  heading.setAttribute('aria-label', lines.join(' ') + '.');
  fitTitle();
  if (animate) {
    elements.forEach((line, i) => line.animate?.(
      [{ opacity: .22, transform: 'translateY(11px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 420, delay: i * 50, easing: 'cubic-bezier(.17,.84,.29,1)', fill: 'backwards' }
    ));
  }
}
function updatePause() {
  const label = paused ? 'Продолжить' : 'Пауза';
  pause.setAttribute('aria-label', label);
  pause.title = label;
  get('pause-shape').setAttribute('d', paused ? 'M8 5l11 7-11 7Z' : 'M9 5v14M15 5v14');
}
function syncService() {
  const concept = concepts[selected], index = sceneService();
  serviceButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  if (!concept?.services) return;
  const service = services[index];
  get('description').textContent = service?.description ?? concept.description;
  stage.setAttribute('aria-label', concept.servicePreview
    ? (service?.name ?? 'Логотип Веб Анатомии') + ' из частиц со сканером. ' + concept.hint
    : service.name + '. Объект из частиц. Веди, чтобы повернуть.');
}
function previewChange(update) {
  if (!concepts[selected]?.servicePreview) return;
  const before = previewService();
  update();
  const next = previewService();
  if (before === next) return;
  syncService();
  renderer?.setService(next, {immediate: paused || reduced});
  schedule();
}
function paintBackdrop() {
  if (!concepts[selected]?.backdrop) return;
  const hue = 163 + 14 * Math.sin((time + 2.18) * Math.PI * 2 / 8.6);
  gradientBackdrop.style.setProperty('--gradient-hue', hue.toFixed(2));
}
function chooseService(index) {
  if (index === activeService) return;
  activeService = index;
  const url = new URL(location.href);
  url.searchParams.set('service', services[index].id);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  syncService();
  if (concepts[selected]?.services) {
    renderer?.setService(index, {immediate: paused || reduced});
    schedule();
  }
}
function stopFrame() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  last = 0;
}
function schedule() {
  if (renderer && inView && !document.hidden && !raf) raf = requestAnimationFrame(draw);
}
function draw(now) {
  raf = 0;
  if (!renderer || document.hidden || !inView) { last = 0; return; }
  const dt = last && !paused ? Math.min(.075, (now - last) / 1000) : 0;
  last = now;
  time += dt;
  paintBackdrop();
  input.pressed = pressPending;
  pressPending = false;
  try { renderer.frame(time, dt, input); }
  catch (error) { showError(error); return; }
  finally { input.pressed = false; }
  if (!paused && (renderer.needsFrame?.() ?? true)) schedule();
  else last = 0;
}
function resetInput() {
  const old = pointerId;
  pointerId = null;
  if (old !== null && stage.hasPointerCapture(old)) stage.releasePointerCapture(old);
  pressPending = false;
  Object.assign(input,{x:0,y:0,type:'',assembled:false,active:false,dragging:false,dragX:0,dragY:0,pressed:false,pressX:0,pressY:0});
}
function clearScene() {
  stopFrame();
  const previous = renderer;
  renderer = undefined;
  previous?.dispose();
}
function showError(error) {
  console.error(error);
  clearScene();
  stage.dataset.ready = 'error';
  hero.setAttribute('aria-busy', 'false');
  message.hidden = false;
  message.textContent = 'Сцена не загрузилась. Нажми «Повторить».';
  pause.disabled = true;
  pulse.disabled = true;
  assemble.disabled = true;
  replay.hidden = false;
  replay.disabled = false;
}
async function select(index, force = false, playOverride = false, preservePlayback = false) {
  if (index === selected && !force) return;
  const playback = preservePlayback ? {time, paused, reduced, assembled: input.assembled} : null;
  const token = ++generation;
  selected = index;
  clearScene();
  loadController?.abort();
  loadController = new AbortController();
  const signal = loadController.signal;
  resetInput();
  const id = idOf(index), concept = concepts[index];
  input.assembled = !!playback?.assembled;
  assemble.hidden = !concept.assembly;
  assemble.disabled = true;
  syncAssembly();
  pause.hidden = replay.hidden = !!concept.assembly;
  if (!playback) hoverService = focusService = pinnedService = -1;
  time = playback ? playback.time : reduce.matches && !playOverride ? 3.5 : 0;
  gradientBackdrop.hidden = !concept.backdrop;
  pulse.hidden = !concept.impulse;
  pulse.disabled = true;
  paintBackdrop();
  root.dataset.theme = concept.theme;
  root.dataset.scene = id;
  root.dataset.fragment = String(!!concept.gradientPanel);
  const group = groupFor(index);
  root.dataset.variantGroup = group ? 'studies' : 'core';
  lastInGroup[group] = index;
  variantGroups.forEach((button, i) => button.setAttribute('aria-pressed', String(i === group)));
  root.dataset.composition = concept.composition;
  root.style.setProperty('--scene-base', concept.darkColor);
  themeColor?.setAttribute('content', appearance === 'mixed' ? '#ffffff' : appearance === 'dark' ? concept.darkColor : concept.color);
  syncAppearance();
  history.replaceState(null, '', '#' + id);
  hero.setAttribute('aria-labelledby', tabs[index].id);
  hero.setAttribute('aria-busy', 'true');
  stage.dataset.ready = 'loading';
  stage.dataset.scene = id;
  tabs.forEach((tab, i) => {
    tab.hidden = groupFor(i) !== group;
    tab.setAttribute('aria-selected', String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
  });
  get('kicker').textContent = id + ' / ' + concept.name;
  get('composition-label').textContent = concept.compositionName;
  get('composition-label').hidden = appearance !== 'mixed';
  get('scene-index').textContent = concept.field + ' / ' + id;
  get('scene-index').hidden = appearance !== 'mixed';
  get('description').textContent = concept.description;
  get('hint').textContent = concept.hint;
  stage.setAttribute('aria-label', concept.name + '. ' + concept.hint);
  serviceControls.hidden = !concept.services;
  serviceButtons.forEach(button => { button.disabled = !!concept.services; });
  syncService();
  reduced = playback ? playback.reduced : reduce.matches && !playOverride;
  paused = playback ? playback.paused : reduced;
  titleFor(concept.lines, !reduced && !playback);
  updatePause();
  pause.disabled = replay.disabled = true;
  message.hidden = false;
  message.textContent = 'Загружаю сцену…';
  const mount = document.createElement('div');
  mount.className = 'scene-mount';
  stage.replaceChildren(mount);
  try {
    const create = await concept.load();
    if (signal.aborted) return;
    const next = await create({el: mount, signal, reduced, theme: appearance === 'mixed' ? (concept.gradientPanel ? 'gradient' : concept.backdrop ? 'light' : 'dark') : appearance, service: sceneService(), isPaused: () => paused});
    if (signal.aborted || token !== generation) { next.dispose(); return; }
    renderer = next;
    resize();
    if (concept.services && playback) renderer.setService(sceneService(), {immediate: true});
    renderer.frame(time, 0, input);
    message.hidden = true;
    pause.disabled = replay.disabled = false;
    assemble.disabled = !concept.assembly;
    pulse.disabled = !concept.impulse;
    serviceButtons.forEach(button => { button.disabled = false; });
    stage.dataset.ready = 'true';
    hero.setAttribute('aria-busy', 'false');
    if (!paused) schedule();
  } catch (error) {
    if (!signal.aborted && token === generation) showError(error);
  }
}
function resize() {
  fitTitle();
  if (!renderer) return;
  const rect = stage.getBoundingClientRect();
  renderer.resize(Math.max(1, rect.width), Math.max(1, rect.height));
  schedule();
}

serviceButtons.forEach((button, index) => {
  button.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') previewChange(() => { hoverService = index; });
  });
  button.addEventListener('pointerleave', () => {
    previewChange(() => { if (hoverService === index) hoverService = -1; });
  });
  button.addEventListener('focus', () => {
    if (button.matches(':focus-visible')) previewChange(() => { focusService = index; });
  });
  button.addEventListener('blur', () => {
    previewChange(() => { if (focusService === index) focusService = -1; });
  });
  button.addEventListener('click', () => {
    if (!concepts[selected]?.servicePreview) { chooseService(index); return; }
    if (hoverService === index) return;
    previewChange(() => {
      if (focusService === index) return;
      pinnedService = pinnedService === index ? -1 : index;
    });
  });
  button.addEventListener('keydown', event => {
    if (event.key === 'Escape' && concepts[selected]?.servicePreview) {
      event.preventDefault();
      previewChange(() => { hoverService = focusService = pinnedService = -1; });
      return;
    }
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % services.length;
    if (event.key === 'ArrowLeft') next = (index + services.length - 1) % services.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = services.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    serviceButtons[next].focus({preventScroll: true});
    if (concepts[selected]?.servicePreview) previewChange(() => { focusService = next; hoverService = -1; });
    else chooseService(next);
  });
});

themeButtons.forEach((button, index) => button.addEventListener('click', () => {
  const next = appearances[index];
  if (next === appearance) return;
  appearance = next;
  const url = new URL(location.href);
  url.searchParams.set('theme', appearance);
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  select(selected, true, false, true);
}));

variantGroups.forEach((button,index) => button.addEventListener('click', () => {
  if (groupFor(selected) !== index) select(lastInGroup[index]);
}));
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => select(index));
  tab.addEventListener('keydown', e => {
    const start = groupFor(index) ? groupBoundary : 0;
    const end = groupFor(index) ? tabs.length : groupBoundary;
    const size = end - start;
    let next;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = start + (index - start + 1) % size;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = start + (index - start + size - 1) % size;
    if (e.key === 'Home') next = start;
    if (e.key === 'End') next = end - 1;
    if (next === undefined) return;
    e.preventDefault();
    tabs[next].focus({preventScroll: true});
    select(next);
  });
});
pause.addEventListener('click', () => {
  if (!renderer) return;
  if (reduced) { select(selected, true, true); return; }
  paused = !paused;
  updatePause();
  stopFrame();
  if (!paused) schedule();
});
replay.addEventListener('click', () => {
  if (!renderer || reduced) { select(selected, true, true); return; }
  resetInput();
  stopFrame();
  time = 0;
  paused = false;
  previewChange(() => { hoverService = focusService = pinnedService = -1; });
  updatePause();
  schedule();
});
pulse.addEventListener('click', async () => {
  const index = selected;
  if (!renderer || !concepts[index]?.impulse) return;
  if (reduced) await select(index, true, true);
  if (!renderer || selected !== index) return;
  if (paused) {
    paused = false;
    updatePause();
    stopFrame();
  }
  input.pressX = 0;
  input.pressY = .12;
  pressPending = true;
  schedule();
});
function syncAssembly() {
  assembleLabel.textContent = input.assembled ? 'Разобрать знак' : 'Собрать знак';
}
function toggleAssembly() {
  if (!renderer || !concepts[selected]?.assembly) return;
  input.assembled = !input.assembled;
  syncAssembly();
  schedule();
}
assemble.addEventListener('click', toggleAssembly);
function updatePointer(event) {
  const box = stage.getBoundingClientRect();
  input.x = clamp(2 * (event.clientX - box.left) / Math.max(1, box.width) - 1);
  input.y = clamp(2 * (event.clientY - box.top) / Math.max(1, box.height) - 1);
  input.active = true;
  input.type = event.pointerType;
  if (pointerId === event.pointerId) {
    input.dragX = 2 * (event.clientX - startX) / Math.max(1, box.width);
    input.dragY = 2 * (event.clientY - startY) / Math.max(1, box.height);
  }
  schedule();
}
stage.addEventListener('pointerdown', e => {
  if (e.button !== 0 || pointerId !== null) return;
  pointerId = e.pointerId;
  startX = e.clientX;
  startY = e.clientY;
  input.dragging = true;
  stage.setPointerCapture(pointerId);
  updatePointer(e);
  input.pressX = input.x;
  input.pressY = input.y;
  pressPending = !concepts[selected]?.assembly;
});
stage.addEventListener('pointerenter', e => {
  if (e.pointerType === 'mouse' && (concepts[selected]?.assembly || concepts[selected]?.perspective)) updatePointer(e);
});
stage.addEventListener('pointermove', e => { if (pointerId === null || pointerId === e.pointerId) updatePointer(e); });
for (const name of ['pointerup','pointercancel','lostpointercapture']) {
  stage.addEventListener(name, e => {
    if (pointerId !== e.pointerId) return;
    pointerId = null;
    input.dragging = false;
    if (e.pointerType !== 'mouse') input.active = false;
    else if (concepts[selected]?.assembly || concepts[selected]?.perspective) {
      const box = stage.getBoundingClientRect();
      input.active = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
    }
    if (name === 'pointerup' && concepts[selected]?.assembly && Math.hypot(e.clientX-startX,e.clientY-startY)<12) toggleAssembly();
    schedule();
  });
}
stage.addEventListener('pointerleave', () => { if (!input.dragging) input.active = false; schedule(); });
new ResizeObserver(resize).observe(stage);
document.fonts?.ready.then(fitTitle);
new IntersectionObserver(([entry]) => {
  inView = entry.isIntersecting;
  if (!inView) stopFrame(); else schedule();
}).observe(hero);
document.addEventListener('visibilitychange', () => { stopFrame(); if (!paused) schedule(); });
window.addEventListener('hashchange', () => select(indexFromHash()));
reduce.addEventListener('change', () => select(selected, true));
select(indexFromHash());
