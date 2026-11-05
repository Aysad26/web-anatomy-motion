const scenes = [
  ['Знак из точек', 'Из точек', 'Три облака собираются в монограмму. Точки остаются видимыми и после сборки.', 'Двигай курсором', 'mark-motion', 'createParticles', '<circle cx="5" cy="6" r="1"/><circle cx="11" cy="4" r="1"/><circle cx="18" cy="6" r="1"/><circle cx="7" cy="13" r="1"/><circle cx="13" cy="11" r="1"/><circle cx="19" cy="14" r="1"/><circle cx="11" cy="18" r="1"/>'],
  ['Знак над волновым полем', 'Волновое поле', 'Волна проходит по полю линий, пока знак сохраняет форму.', 'Двигай курсором', 'mark-motion', 'createWaves', '<path d="M2 6c5 0 5-4 10-4s5 4 10 4M2 12c5 0 5-4 10-4s5 4 10 4M2 18c5 0 5-4 10-4s5 4 10 4"/>'],
  ['Анатомический срез', 'Срез', 'Плоскость движется сквозь медленно вращающийся знак и разделяет гранёную и стеклянную части.', 'Потяни по горизонтали', 'optics', 'createSlice', '<path d="m3 10 9-6 9 6-9 6zM3 14l9 6 9-6M12 2v20"/>'],
  ['Логотип как линза', 'Линза', 'Стеклянная монограмма преломляет строки кода, которые сменяются внутри круга.', 'Двигай курсором', 'optics', 'createLens', '<path d="M2 8h20M2 14h20"/><ellipse cx="12" cy="11" rx="6" ry="9"/>'],
  ['Анатомия сайта', 'Слои сайта', 'Сетка, текст, изображение и интерфейс раскрываются как слои одного макета.', 'Потяни, чтобы раскрыть слои', 'layouts', 'createAnatomy', '<path d="m3 8 9-5 9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>'],
  ['Невозможная петля', 'Петля', 'Линия поднимается над плоскостью и замыкается в перекрученную ленту.', 'Двигай курсором', 'type-ribbon', 'createRibbon', '<path d="M12 11C7 2 2 5 2 11s5 9 10 0 10-6 10 0-5 9-10 0z"/>'],
  ['Скрытый рельеф', 'Рельеф', 'Линии расходятся по синей поверхности. Знак проявляется только там, где они огибают рельеф.', 'Двигай курсором', 'relief', 'createRelief', '<path d="M2 7c4 0 5-4 10-4s6 4 10 4M2 12c4 0 6-5 10-5s6 5 10 5M2 17c4 0 6-6 10-6s6 6 10 6M2 22c4 0 6-7 10-7s6 7 10 7"/>'],
  ['Светлая линза', 'Светлая линза', 'Чёрные символы прокручиваются, как на счётчике. Стеклянный знак преломляет их внутри светлого круга.', 'Двигай курсором', 'optics', 'createLightLens', '<circle cx="12" cy="12" r="8"/><path d="M4 9h9m3 0h5M3 13h6m3 0h9M7 17h9m3 0h2"/>'],
  ['Пульс рельефа', 'Пульс', 'Высота рельефа меняется двумя ударами. Бегущие линии показывают, как знак поднимается и опускается.', 'Двигай курсором', 'relief', 'createPulseRelief', '<path d="M2 13h4l2-4 2 6 3-11 3 16 2-7h4"/>']
];
const byId = id => document.getElementById(id);
const panel = byId('scene-panel'), stage = byId('stage'), status = byId('scene-message');
const pause = byId('pause'), replay = byId('replay'), selector = byId('scenes');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)');
const input = {x: 0, y: 0, active: false, dragX: 0, dragY: 0, dragging: false};
const indexText = index => String(index + 1).padStart(2, '0');
const fromHash = () => {
  const i = Number(location.hash.slice(1)) - 1;
  return Number.isInteger(i) && i >= 0 && i < scenes.length ? i : 0;
};
const tabs = scenes.map((data, index) => {
  const id = indexText(index);
  const tab = document.createElement('button');
  tab.className = 'scene-tab';
  tab.type = 'button';
  tab.id = 'tab-' + id;
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-controls', panel.id);
  tab.setAttribute('aria-label', id + '. ' + data[0]);
  tab.innerHTML = '<span class="tab-top"><span class="tab-id">' + id + '</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round">' + data[6] + '</svg></span><span class="tab-name">' + data[1] + '</span>';
  tab.addEventListener('click', () => selectScene(index));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    tabs[next].focus({preventScroll: true});
    selectScene(next);
  });
  selector.append(tab);
  return tab;
});
let selected = -1, renderer, layer, activeLoad, requestId = 0, raf = 0;
let last = 0, t = 0, paused = false, inView = true, pointerId = null, dragStart = null;
let loadedReduced = false;
const modules = {
  'mark-motion': () => import('./scenes/mark-motion.js'),
  optics: () => import('./scenes/optics.js'),
  layouts: () => import('./scenes/layouts.js'),
  'type-ribbon': () => import('./scenes/type-ribbon.js'),
  relief: () => import('./scenes/relief.js')
};
function updateTransport() {
  pause.setAttribute('aria-label', paused ? 'Продолжить' : 'Пауза');
  pause.title = paused ? 'Продолжить' : 'Пауза';
  byId('pause-label').textContent = paused ? 'Продолжить' : 'Пауза';
  byId('pause-shape').setAttribute('d', paused ? 'M8 5l11 7-11 7Z' : 'M9 5v14M15 5v14');
}
function schedule() {
  if (renderer && !document.hidden && inView && !raf) raf = requestAnimationFrame(draw);
}
function draw(now) {
  raf = 0;
  if (!renderer || document.hidden || !inView) { last = 0; return; }
  const dt = last && !paused ? Math.min(.075, (now - last) / 1000) : 0;
  last = now;
  t += dt;
  try {
    renderer.frame(t, dt, input);
  } catch (error) {
    fail(error);
    return;
  }
  if (!paused) schedule();
}
function resetInput() {
  if (pointerId !== null && stage.hasPointerCapture(pointerId)) stage.releasePointerCapture(pointerId);
  pointerId = null;
  dragStart = null;
  Object.assign(input, {x: 0, y: 0, active: false, dragX: 0, dragY: 0, dragging: false});
}
function fail(error) {
  console.error(error);
  status.textContent = 'Не удалось запустить эту сцену. Нажми «Повторить», чтобы попробовать ещё раз.';
  status.className = 'stage-message is-error';
  status.hidden = false;
  panel.setAttribute('aria-busy', 'false');
  stage.dataset.ready = 'error';
  pause.disabled = true;
  replay.disabled = false;
  cancelAnimationFrame(raf);
  raf = 0;
  renderer?.dispose();
  renderer = undefined;
}
async function selectScene(index, force = false, playOverride = false) {
  if (index === selected && !force) return;
  const token = ++requestId;
  selected = index;
  activeLoad?.abort();
  activeLoad = new AbortController();
  const signal = activeLoad.signal;
  cancelAnimationFrame(raf);
  raf = 0;
  renderer?.dispose();
  renderer = undefined;
  last = 0;
  resetInput();
  const [title, , description, hint, moduleName, method] = scenes[index];
  const id = indexText(index);
  byId('scene-number').textContent = id;
  byId('stage-index').textContent = id;
  byId('scene-title').textContent = title;
  byId('scene-description').textContent = description;
  byId('scene-hint').lastElementChild.textContent = coarse.matches && hint.includes('курсором') ? 'Проведи пальцем' : hint;
  panel.setAttribute('aria-labelledby', tabs[index].id);
  panel.setAttribute('aria-busy', 'true');
  stage.dataset.scene = id;
  stage.dataset.drag = String([2, 4].includes(index));
  stage.dataset.ready = 'loading';
  tabs.forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
  });
  history.replaceState(null, '', '#' + id);
  loadedReduced = reduce.matches && !playOverride;
  paused = loadedReduced;
  updateTransport();
  pause.disabled = replay.disabled = true;
  status.className = 'stage-message';
  status.textContent = 'Загружаем сцену';
  status.hidden = false;
  layer = document.createElement('div');
  layer.className = 'scene-layer';
  stage.replaceChildren(layer);
  const currentLayer = layer;
  try {
    const module = await modules[moduleName]();
    if (signal.aborted) return;
    const next = await module[method]({el: currentLayer, signal, reduced: loadedReduced, isPaused: () => paused});
    if (signal.aborted || token !== requestId) { next.dispose(); return; }
    renderer = next;
    const bounds = stage.getBoundingClientRect();
    renderer.resize(bounds.width, bounds.height);
    t = loadedReduced ? 3 : 0;
    renderer.frame(t, 0, input);
    pause.disabled = replay.disabled = false;
    status.hidden = true;
    panel.setAttribute('aria-busy', 'false');
    stage.dataset.ready = 'true';
    if (!paused) schedule();
  } catch (error) {
    if (!signal.aborted && token === requestId) fail(error);
  }
}
pause.addEventListener('click', () => {
  if (!renderer) return;
  if (loadedReduced) { selectScene(selected, true, true); return; }
  paused = !paused;
  last = 0;
  updateTransport();
  if (!paused) schedule();
});
replay.addEventListener('click', () => {
  if (!renderer) { selectScene(selected, true); return; }
  if (loadedReduced) { selectScene(selected, true, true); return; }
  resetInput();
  paused = false;
  t = 0;
  last = 0;
  updateTransport();
  schedule();
});
function pointer(event) {
  const box = stage.getBoundingClientRect();
  input.x = Math.max(-1, Math.min(1, 2 * (event.clientX - box.left) / box.width - 1));
  input.y = Math.max(-1, Math.min(1, 2 * (event.clientY - box.top) / box.height - 1));
  input.active = true;
  if (input.dragging && event.pointerId === pointerId) {
    input.dragX = dragStart.x + 2 * (event.clientX - dragStart.clientX) / box.width;
    input.dragY = dragStart.y + 2 * (event.clientY - dragStart.clientY) / box.height;
  }
  schedule();
}
stage.addEventListener('pointermove', pointer);
stage.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.target.closest('button,input,select,a,.scene-control')) return;
  pointerId = event.pointerId;
  dragStart = {x: input.dragX, y: input.dragY, clientX: event.clientX, clientY: event.clientY};
  input.dragging = true;
  stage.setPointerCapture(pointerId);
  pointer(event);
});
function endPointer(event) {
  if (event.pointerId !== pointerId) return;
  pointerId = null;
  input.dragging = false;
  if (event.pointerType !== 'mouse') input.active = false;
  schedule();
}
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(event, endPointer);
stage.addEventListener('pointerleave', () => { input.active = false; schedule(); });
new ResizeObserver(() => {
  if (!renderer) return;
  const box = stage.getBoundingClientRect();
  renderer.resize(box.width, box.height);
  schedule();
}).observe(stage);
new IntersectionObserver(([entry]) => {
  inView = entry.isIntersecting;
  if (!inView) { cancelAnimationFrame(raf); raf = 0; last = 0; }
  else schedule();
}).observe(panel);
document.addEventListener('visibilitychange', () => { last = 0; if (!document.hidden && !paused) schedule(); });
reduce.addEventListener('change', () => selectScene(selected, true));
window.addEventListener('hashchange', () => selectScene(fromHash()));
selectScene(fromHash());
