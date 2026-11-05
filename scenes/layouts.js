// Two self-contained DOM scenes. Positions live in a fixed virtual coordinate
// space; the whole composition fits the actual stage, including on mobile.
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (a, b, amount) => a + (b - a) * amount;
const smooth = (a, b, value) => {
  const x = clamp((value - a) / (b - a));
  return x * x * (3 - 2 * x);
};
const ease = (dt, speed = 11) => 1 - Math.exp(-Math.max(0, dt) * speed);

function mount(el, kind, markup) {
  const root = document.createElement('div');
  root.className = `wa-lo wa-lo-${kind}`;
  root.innerHTML = `<style>${CSS}</style>${markup}`;
  el.append(root);
  return root;
}

function controls(signal) {
  const controller = new AbortController();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', () => controller.abort(), {once: true, signal: controller.signal});
  return controller;
}

function contourArt() {
  const rings = Array.from({length: 23}, (_, index) => {
    const r = 12 + index * 4.62;
    const path = Array.from({length: 105}, (_, step) => {
      const a = step / 104 * 2 * Math.PI;
      const shape = r * (1 + .21 * Math.sin(3 * a + index * .078) + .14 * Math.cos(2 * a - index * .088));
      const x = 155 + index * 1.3 + shape * Math.cos(a);
      const y = 129 + index * .2 + shape * Math.sin(a) * .83;
      return `${step ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
    return `<path d="${path}Z" fill="none" stroke="${index < 13 ? '#e1e8ff' : '#adc3ff'}" opacity="${(.95 - index * .026).toFixed(2)}" stroke-width=".82"/>`;
  }).join('');
  return `<svg viewBox="0 0 320 254" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="wa-lo-field" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7f9cfe"/><stop offset=".45" stop-color="#355cff"/><stop offset="1" stop-color="#172798"/></linearGradient><pattern id="wa-lo-field-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0v16" fill="none" stroke="#edf0ff" stroke-opacity=".14" stroke-width=".7"/></pattern></defs><rect width="320" height="254" fill="url(#wa-lo-field)"/><rect width="320" height="254" fill="url(#wa-lo-field-grid)"/>${rings}<path d="M157 115v28m-14-14h28" stroke="#fff" stroke-width="1"/><circle cx="157" cy="129" r="2.7" fill="#efff99"/><path d="M16 24V16h8m272 0h8v8M16 230v8h8m272 0h8v-8" stroke="#dbe4ff" stroke-width=".8" fill="none"/><text x="20" y="32" fill="#e9edff" font-size="7" font-family="monospace">FIG.01 / CONTOUR STUDY</text></svg>`;
}

export async function createAnatomy({el, signal, reduced = false, isPaused = () => false}) {
  const root = mount(el, 'anatomy', `
    <div class="wa-lo-halo" aria-hidden="true"></div>
    <div class="wa-lo-anatomy-shell" aria-hidden="true"><div class="wa-lo-anatomy-stack">
      <div class="wa-lo-layer wa-lo-grid"><span class="wa-lo-callout">01 / СЕТКА</span><div class="wa-lo-gridlines">${'<i></i>'.repeat(12)}</div><div class="wa-lo-cross"></div></div>
      <div class="wa-lo-layer wa-lo-art"><span class="wa-lo-callout">02 / ИЗОБРАЖЕНИЕ</span><div class="wa-lo-atlas-art">${contourArt()}</div></div>
      <div class="wa-lo-layer wa-lo-type"><span class="wa-lo-callout">03 / ТИПОГРАФИКА</span><div class="wa-lo-atlas-kicker">ИССЛЕДОВАНИЕ / 01</div><div class="wa-lo-atlas-title">Атлас<br>форм<span>.</span></div><div class="wa-lo-atlas-deck">Визуальная система<br>для сложных данных</div></div>
      <div class="wa-lo-layer wa-lo-ui"><span class="wa-lo-callout">04 / ИНТЕРФЕЙС</span><div class="wa-lo-browser"><i></i><i></i><i></i><span>atlas.form</span></div><div class="wa-lo-atlas-nav"><b>ATLAS®</b><span>ПРОЕКТ &nbsp;&nbsp; МЕТОД &nbsp;&nbsp; ↗</span></div><div class="wa-lo-atlas-action">Открыть атлас <span>↗</span></div><div class="wa-lo-atlas-footer"><b>01 / СИСТЕМА</b><span>ТОПОГРАФИЯ &nbsp; / &nbsp; ВИЗУАЛИЗАЦИЯ</span></div></div>
    </div></div>
    <div class="wa-lo-bottom"><button class="scene-control wa-lo-switch" type="button" aria-pressed="false"><span class="wa-lo-layer-icon" aria-hidden="true"></span><span>Раздвинуть слои</span></button></div>`);
  const shell = root.querySelector('.wa-lo-anatomy-shell');
  const stack = root.querySelector('.wa-lo-anatomy-stack');
  const layers = [...root.querySelectorAll('.wa-lo-layer')];
  const grid = root.querySelector('.wa-lo-gridlines');
  const button = root.querySelector('.wa-lo-switch');
  const buttonLabel = button.lastElementChild;
  const listeners = controls(signal);
  const vectors = [[-145, 54, -72], [-48, 19, -22], [49, -19, 22], [145, -54, 72]];
  let w = el.clientWidth, h = el.clientHeight, display = 0, target = 0, manual = false;
  let wasDragging = false, startX = 0, startY = 0, startP = 0, lastT = 0, isOpen = false;

  function reflectButton(open) {
    if (open === isOpen) return;
    isOpen = open;
    button.setAttribute('aria-pressed', String(open));
    buttonLabel.textContent = open ? 'Собрать экран' : 'Раздвинуть слои';
  }
  button.addEventListener('click', () => {
    manual = true;
    target = target > .5 || display > .55 ? 0 : 1;
    reflectButton(target > .5);
    if (reduced || isPaused()) { display = target; render(display); }
  }, {signal: listeners.signal});

  function render(p, input) {
    const scale = Math.max(.15, Math.min(1.16, (w - 26) / (650 + 310 * p), (h - 63) / (410 + 120 * p)));
    shell.style.setProperty('--wa-scale', scale.toFixed(5));
    root.style.setProperty('--wa-open', p.toFixed(5));
    const orbit = !reduced && input?.active ? (input.x || 0) * 3 : 0;
    stack.style.transform = `rotateX(${p * 17}deg) rotateY(${-p * 20 + orbit * p}deg)`;
    layers.forEach((layer, index) => {
      const [x, y, z] = vectors[index];
      layer.style.transform = `translate3d(${(x * p).toFixed(2)}px,${(y * p).toFixed(2)}px,${(z * p).toFixed(2)}px)`;
    });
    grid.style.opacity = (.047 + p * .76).toFixed(3);
  }
  function frame(t, dt, input = {}) {
    if (t + .06 < lastT) {
      manual = false; display = 0; target = 0; wasDragging = false; reflectButton(false);
    }
    lastT = t;
    const intro = reduced ? 0 : smooth(.08, .77, t) * (1 - smooth(1.16, 2.03, t));
    if (input.dragging && !wasDragging) {
      manual = true; startP = display;
      startX = input.dragX || 0; startY = input.dragY || 0; target = display;
    }
    if (input.dragging) {
      const movement = Math.max(Math.abs((input.dragX || 0) - startX), Math.abs((input.dragY || 0) - startY));
      target = clamp(startP + (startP > .55 ? -1 : 1) * movement * 2);
    } else if (wasDragging) {
      target = target > .45 ? 1 : 0;
      reflectButton(target > .5);
    }
    wasDragging = !!input.dragging;
    display = manual ? (reduced || isPaused() ? target : mix(display, target, ease(dt, 15))) : intro;
    render(display, input);
  }
  function resize(width, height) { w = width; h = height; render(display); }
  render(0);
  return {frame, resize, dispose() { listeners.abort(); root.remove(); }};
}

function iceArt() {
  return `<svg viewBox="0 0 460 344" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>
    <linearGradient id="wa-lo-polar-sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#9eafc8"/><stop offset=".68" stop-color="#dae6ee"/><stop offset="1" stop-color="#f9e9d6"/></linearGradient>
    <linearGradient id="wa-lo-polar-water" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#64859f"/><stop offset=".35" stop-color="#315a79"/><stop offset="1" stop-color="#112c46"/></linearGradient>
    <linearGradient id="wa-lo-polar-ice" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#fffaf0"/><stop offset=".63" stop-color="#e9f1fa"/><stop offset="1" stop-color="#8bb4d0"/></linearGradient>
    <linearGradient id="wa-lo-polar-shadow" x1=".1" y1=".2" x2="1" y2="1"><stop stop-color="#a5c0d8"/><stop offset="1" stop-color="#4d759b"/></linearGradient>
    <linearGradient id="wa-lo-polar-refl" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#c7e0ee" stop-opacity=".64"/><stop offset="1" stop-color="#92bbd4" stop-opacity="0"/></linearGradient>
  </defs><rect width="460" height="344" fill="url(#wa-lo-polar-sky)"/><circle cx="348" cy="80" r="44" fill="#f6ead6" opacity=".75"/>
  <path d="M0 155L33 144l32 8 25-14 26 8 28-9 27 16 22-13 30 12 34-8 19 8 37-14 31 10 31-8 31 8 26-4 28 10v37H0Z" fill="#839cb4" opacity=".65"/>
  <path d="M0 168l28-4 29 4 30-9 38 9 27-5 30 6 45-8 47 11 43-9 35 8 25-7 36 9 47-5v37H0Z" fill="#d9e7ef" opacity=".85"/>
  <path d="M0 179h460v165H0Z" fill="url(#wa-lo-polar-water)"/>
  <path d="M44 201l47-12 39-42 21 14 31-51 44-31 20-37 22 38 21-12 15 40 41 21 20 43 49 21-25 17H82Z" fill="url(#wa-lo-polar-ice)"/>
  <path d="M246 42l-4 59 20 32-13 31 13 43 127 3 25-17-49-21-20-43-41-21-15-40-21 12Z" fill="url(#wa-lo-polar-shadow)"/>
  <path d="M151 161l22 13 36-48 32-25 5-59-20 37-44 31Zm111-28 25-29 22 21-5-17-15-40-21 12-22-38 15 50Zm-13 31-42 18-18 25h73Z" fill="#e8f1f8" opacity=".8"/>
  <path d="M130 147l9 40-48 2 45-11Zm88-38 14 22-28 36 12-24-12 7Zm76 12 20 21 25 12-14-18Zm-38 46 42-15-21 22 32 10-40-6Zm89-39 7 44 26 17-17-17Z" fill="#668fb1" opacity=".69"/>
  <path d="M81 208l53 15 23-5 34 24 40 9 18 25 44-39 32-5 37-18 31-5Z" fill="url(#wa-lo-polar-refl)"/>
  <path d="M11 212h122m19 0h122m49 0h116M37 225h123m38 7h70m74-8h105M0 246h91m60 8h133m26-15h114M15 281h151m89 1h158M73 313h103m74 5h190M0 331h143" stroke="#a4c7de" stroke-width="1" opacity=".47"/>
  <path d="M15 65q6-6 12 0 6-7 12-4m14 21q4-4 8 1 5-4 10-2m302 46q5-5 10-1 4-5 9-3" fill="none" stroke="#3b5367" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M19 19h19m-19 0v19m403-19h19v19M19 307v18h19m384 0h19v-18" fill="none" stroke="#f1f7ff" stroke-width="1" opacity=".8"/>
  </svg>`;
}

// x, y, width, height, type size at mobile, tablet and desktop respectively.
const PROFILES = [
  {width: 296, brand: [17,43,220,16,10], title: [16,68,263,86,40], art: [17,164,262,142,0], copy: [17,319,254,44,13], cta: [17,372,176,29,10], foot: [17,422,261,12,8]},
  {width: 514, brand: [24,48,240,16,11], title: [22,104,275,105,47], art: [255,73,235,291,0], copy: [24,241,216,67,14], cta: [24,333,176,30,10], foot: [24,423,466,12,9]},
  {width: 720, brand: [28,52,310,16,12], title: [25,106,340,132,62], art: [357,75,336,294,0], copy: [28,252,275,62,16], cta: [28,333,185,33,10], foot: [28,423,665,12,10]}
];

export async function createResponsive({el, signal, reduced = false, isPaused = () => false}) {
  const root = mount(el, 'responsive', `
    <div class="wa-lo-halo" aria-hidden="true"></div>
    <div class="wa-lo-responsive-shell" aria-hidden="true"><div class="wa-lo-responsive-page">
      <div class="wa-lo-browser"><i></i><i></i><i></i><span>help-antarctica / концепт</span></div>
      <div class="wa-lo-polar-brand" data-box="brand"><i></i> ПОЛЯРНАЯ ЭКСПЕДИЦИЯ</div>
      <div class="wa-lo-polar-title" data-box="title">HELP<br>ANTARCTICA<span>.</span></div>
      <div class="wa-lo-polar-art" data-box="art">${iceArt()}<span>АНТАРКТИКА / 01</span></div>
      <div class="wa-lo-polar-copy" data-box="copy">Путешествие к континенту,<br>который важно сохранить.</div>
      <div class="wa-lo-polar-cta" data-box="cta">Начать экспедицию <span>↘</span></div>
      <div class="wa-lo-polar-foot" data-box="foot"><b>01 / ПОВЕРХНОСТЬ</b><span>ПОЛЯРНЫЙ АТЛАС &nbsp;↗</span></div>
    </div></div>
    <div class="wa-lo-width-controls"><div class="wa-lo-width-head"><label>ШИРИНА ЭКРАНА <input class="scene-control wa-lo-range" type="range" min="0" max="1000" step="1" value="1000" aria-label="Ширина экрана"></label><output aria-live="off">1440 px</output></div><div class="wa-lo-stops" role="group" aria-label="Размеры экрана"><button type="button" class="scene-control" data-width="0">Телефон</button><button type="button" class="scene-control" data-width="0.5">Планшет</button><button type="button" class="scene-control" data-width="1" aria-pressed="true">Компьютер</button></div></div>`);
  const shell = root.querySelector('.wa-lo-responsive-shell');
  const range = root.querySelector('input');
  const output = root.querySelector('output');
  const buttons = [...root.querySelectorAll('[data-width]')];
  const boxes = Object.fromEntries([...root.querySelectorAll('[data-box]')].map(box => [box.dataset.box, box]));
  const listeners = controls(signal);
  let w = el.clientWidth, h = el.clientHeight, q = 1, target = 1, lastT = 0;
  let manual = false, wasDragging = false, startX = 0, startQ = 1, lastPx = 0;

  function pick(value) {
    manual = true;
    target = clamp(value);
    if (reduced || isPaused()) { q = target; render(q); }
  }
  range.addEventListener('input', () => pick(Number(range.value) / 1000), {signal: listeners.signal});
  for (const button of buttons) button.addEventListener('click', () => pick(Number(button.dataset.width)), {signal: listeners.signal});

  function render(value) {
    const left = value < .5 ? 0 : 1, p = value * 2 - left;
    const a = PROFILES[left], b = PROFILES[left + 1];
    const width = mix(a.width, b.width, p);
    // Keep the visual transform fixed across breakpoints so the actual page
    // edges, elements and type move together when the viewport contracts.
    const scale = Math.max(.15, Math.min(1.14, (w - 25) / 720, (h - 75) / 450));
    // On a narrow stage the mobile frame can grow into the released space.
    const focus = w < 560 ? Math.min((w - 34) / width, (h - 75) / 450, 1.02) : scale;
    shell.style.width = `${width.toFixed(2)}px`;
    shell.style.setProperty('--wa-scale', Math.max(scale, focus).toFixed(5));
    for (const [name, box] of Object.entries(boxes)) {
      let [x,y,bw,bh,size] = a[name].map((v, i) => mix(v, b[name][i], p));
      if (left === 0) {
        // A staged move keeps the image from sweeping through the title and
        // caption when the same content moves between columns and a stack.
        const lift = smooth(.67, 1, p);
        if (name === 'art') {
          x = mix(a.art[0], b.art[0], smooth(.02, .69, p));
          y = mix(a.art[1], b.art[1], lift) + 15 * Math.sin(Math.PI * p);
          bw = Math.min(bw, width - x - 17);
          bh = mix(Math.min(a.art[3], a.copy[1] - y - 11), b.art[3], lift);
        } else if (name === 'copy' || name === 'cta') {
          y = mix(a[name][1], b[name][1], lift);
        }
      }
      box.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
      box.style.width = `${bw.toFixed(2)}px`;
      box.style.height = `${bh.toFixed(2)}px`;
      if (size) box.style.fontSize = `${size.toFixed(2)}px`;
    }
    if (document.activeElement !== range || !manual) range.value = String(Math.round(value * 1000));
    const px = Math.round(value < .5 ? mix(390, 768, p) : mix(768, 1440, p));
    if (px !== lastPx) {
      lastPx = px; output.value = `${px} px`; range.setAttribute('aria-valuetext', `${px} пикселей`);
      root.style.setProperty('--wa-width-progress', `${(value * 100).toFixed(2)}%`);
      const nearest = value < .25 ? 0 : value > .75 ? 2 : 1;
      buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === nearest)));
    }
  }
  function frame(t, dt, input = {}) {
    if (t + .06 < lastT) { manual = false; target = 1; q = 1; wasDragging = false; }
    lastT = t;
    if (input.dragging && !wasDragging) { manual = true; startX = input.dragX || 0; startQ = q; target = q; }
    if (input.dragging) target = clamp(startQ + ((input.dragX || 0) - startX) * 1.3);
    wasDragging = !!input.dragging;
    const intro = reduced ? 1 : 1 - .5 * smooth(.26, .95, t) - .5 * smooth(1.09, 1.93, t);
    q = manual ? (reduced || isPaused() ? target : mix(q, target, ease(dt, 14))) : intro;
    render(q);
  }
  function resize(width, height) { w = width; h = height; render(q); }
  render(1);
  return {frame, resize, dispose() { listeners.abort(); root.remove(); }};
}

const CSS = `
.wa-lo{position:absolute;inset:0;overflow:hidden;isolation:isolate;color:#171b23;font-family:inherit;--wa-open:0;--wa-width-progress:100%;pointer-events:none}
.wa-lo *{box-sizing:border-box}
.wa-lo-halo{position:absolute;inset:12% 4% 8%;background:radial-gradient(ellipse at 50% 58%,#dbe2f0 0%,#e9edf5 28%,transparent 67%);opacity:.72}
.wa-lo-anatomy-shell,.wa-lo-responsive-shell{position:absolute;left:50%;top:calc(50% - 20px);transform:translate(-50%,-50%) scale(var(--wa-scale,1));transform-origin:center;width:636px;height:386px}
.wa-lo-anatomy-shell{perspective:1120px}
.wa-lo-anatomy-stack{position:absolute;inset:0;transform-style:preserve-3d}
.wa-lo-layer{position:absolute;inset:0;border-radius:15px;backface-visibility:hidden;border:1px solid rgb(66 93 164 / calc(.03 + var(--wa-open) * .25));background:rgb(250 251 255 / calc(var(--wa-open) * .45));box-shadow:0 18px 45px rgb(45 63 105 / calc(var(--wa-open) * .08))}
.wa-lo-grid{background:#fcfdff;border-color:#c6d0e3;box-shadow:0 21px 56px #27416528,0 2px 7px #172a4215}
.wa-lo-gridlines{position:absolute;inset:43px 20px 21px;display:grid;grid-template-columns:repeat(12,1fr);gap:6px;overflow:hidden;border-block:1px solid #4761aa44;background:repeating-linear-gradient(0deg,transparent 0px,transparent 25px,#657fc12d 25px,#657fc12d 26px)}
.wa-lo-gridlines i{border-inline:1px solid #425bb655;background:#9eb3f441}
.wa-lo-cross{position:absolute;left:50%;top:50%;width:12px;height:12px;background:linear-gradient(#4467e5,#4467e5) center/1px 100% no-repeat,linear-gradient(#4467e5,#4467e5) center/100% 1px no-repeat;opacity:var(--wa-open)}
.wa-lo-callout{position:absolute;left:9px;top:-24px;white-space:nowrap;padding:4px 8px;border-radius:4px;background:#334fb9;color:white;font:600 9px/1.1 ui-monospace,monospace;letter-spacing:.045em;opacity:clamp(0,calc((var(--wa-open) - .21) * 2.9),1);z-index:2}
.wa-lo-layer:nth-child(2) .wa-lo-callout{background:#5268ba}.wa-lo-layer:nth-child(3) .wa-lo-callout{background:#283974}.wa-lo-layer:nth-child(4) .wa-lo-callout{background:#202b52}
.wa-lo-atlas-art{position:absolute;left:302px;top:82px;width:307px;height:239px;overflow:hidden;border-radius:7px}
.wa-lo-atlas-art svg,.wa-lo-polar-art svg{display:block;width:100%;height:100%}
.wa-lo-atlas-kicker{position:absolute;left:25px;top:114px;color:#4b5a80;font:600 10px/1 ui-monospace,monospace;letter-spacing:.075em}
.wa-lo-atlas-title{position:absolute;left:21px;top:137px;font:800 68px/.86 Arial,sans-serif;letter-spacing:-.09em;color:#17274a}
.wa-lo-atlas-title span{color:#3959ec}.wa-lo-atlas-deck{position:absolute;left:26px;top:265px;font:500 13px/1.3 Arial,sans-serif;color:#56647a}
.wa-lo-browser{height:29px;position:absolute;inset:0 0 auto;display:flex;gap:5px;align-items:center;padding:0 12px;border-bottom:1px solid #dce4ef;background:#e9eef7;border-radius:14px 14px 0 0;color:#50617b;font:500 8px/1 ui-monospace,monospace;letter-spacing:.04em;white-space:nowrap}
.wa-lo-browser i{flex:0 0 5px;width:5px;height:5px;border:1px solid #8c9cbb;border-radius:50%}.wa-lo-browser i:first-child{background:#4a64cf;border-color:#4a64cf}.wa-lo-browser span{position:absolute;left:50%;transform:translateX(-50%)}
.wa-lo-atlas-nav,.wa-lo-atlas-footer{position:absolute;display:flex;justify-content:space-between;align-items:center;left:25px;right:25px;font:500 9px/1 ui-monospace,monospace;letter-spacing:.035em;color:#4e5e7d}
.wa-lo-atlas-nav{top:47px}.wa-lo-atlas-nav b{font:800 13px/1 Arial,sans-serif;letter-spacing:.045em;color:#202d56}.wa-lo-atlas-footer{top:347px;border-top:1px solid #bfcce1;padding-top:13px}
.wa-lo-atlas-action,.wa-lo-polar-cta{position:absolute;display:flex;justify-content:space-between;align-items:center;border-radius:4px;padding:0 10px;background:#3655df;color:white;font:700 10px/1 Arial,sans-serif}
.wa-lo-atlas-action{left:25px;top:309px;width:147px;height:25px}.wa-lo-atlas-action span,.wa-lo-polar-cta span{font-size:13px}
.wa-lo-bottom,.wa-lo-width-controls{position:absolute;bottom:13px;left:50%;transform:translateX(-50%);z-index:4}
.wa-lo-switch{pointer-events:auto;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:8px;border-radius:999px;border:1px solid #bcc8de;padding:8px 13px;color:#253253;background:#f8faff;font:600 11px/1.15 Arial,sans-serif;box-shadow:0 2px 7px #2337600c}
.wa-lo-switch:hover{border-color:#465ed2;color:#2e49c2}.wa-lo-switch:focus-visible,.wa-lo-stops button:focus-visible,.wa-lo-range:focus-visible{outline:2px solid #354dcb;outline-offset:3px}
.wa-lo-layer-icon{position:relative;display:inline-block;width:12px;height:11px;flex:none}.wa-lo-layer-icon:before,.wa-lo-layer-icon:after{content:'';position:absolute;width:8px;height:6px;border:1px solid #465ed2;transform:rotate(-22deg) skew(24deg);left:1px;top:1px;border-radius:1px}.wa-lo-layer-icon:after{top:4px;opacity:.54}
.wa-lo-responsive-shell{top:calc(50% - 31px);height:450px}
.wa-lo-responsive-page{position:absolute;inset:0;border:1px solid #c2cee0;border-radius:15px;background:#edf1f6;box-shadow:0 22px 58px #24456927,0 3px 7px #15304d17;overflow:hidden}
.wa-lo-responsive-page .wa-lo-browser{background:#dce5f2;border-color:#cbd8e8}
.wa-lo-responsive-page [data-box]{position:absolute;left:0;top:0;transform-origin:top left}
.wa-lo-polar-brand{display:flex;align-items:center;gap:7px;color:#445a74;font:700 11px/1 ui-monospace,monospace;letter-spacing:.12em;white-space:nowrap}
.wa-lo-polar-brand i{display:inline-block;width:7px;height:7px;background:#3359a6;border-radius:50%;box-shadow:0 0 0 2px #3359a62b}
.wa-lo-polar-title{font-family:Arial,Helvetica,sans-serif;font-weight:900;line-height:.88;letter-spacing:-.091em;color:#122b44;white-space:nowrap;z-index:1}.wa-lo-polar-title span{color:#3c6aab}
.wa-lo-polar-art{overflow:hidden;border-radius:5px;background:#8ba9c4}.wa-lo-polar-art>span{position:absolute;bottom:10px;left:11px;color:#f0f6ff;font:600 8px/1 ui-monospace,monospace;letter-spacing:.09em;white-space:nowrap}
.wa-lo-polar-copy{color:#3f5671;font-family:Arial,sans-serif;font-weight:500;line-height:1.35}
.wa-lo-polar-cta{background:#183d60;white-space:nowrap}
.wa-lo-polar-foot{display:flex;justify-content:space-between;gap:8px;color:#476078;font-family:ui-monospace,monospace;white-space:nowrap;border-top:1px solid #becddd;padding-top:6px}
.wa-lo-width-controls{width:min(284px,calc(100% - 30px));bottom:11px;color:#40516d;font:600 9px/1.2 ui-monospace,monospace;letter-spacing:.05em}
.wa-lo-width-head{display:grid;grid-template-columns:1fr auto;align-items:start;gap:10px}.wa-lo-width-head label{display:block}.wa-lo-width-head output{color:#24419a;font-weight:700;min-width:59px;text-align:right}
.wa-lo-range{pointer-events:auto;display:block;margin:0;width:calc(100% + 69px);height:24px;appearance:none;-webkit-appearance:none;border:0;background:transparent;cursor:ew-resize;accent-color:#3655df}
.wa-lo-range::-webkit-slider-runnable-track{height:2px;background:linear-gradient(to right,#3a56cf 0 var(--wa-width-progress),#bdc9dd var(--wa-width-progress) 100%);border-radius:4px}.wa-lo-range::-moz-range-track{height:2px;background:#bdc9dd;border-radius:4px}.wa-lo-range::-moz-range-progress{height:2px;background:#3a56cf}
.wa-lo-range::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:10px;height:10px;border:2px solid white;box-shadow:0 0 0 1px #3a56cf;border-radius:50%;background:#3a56cf;margin-top:-4px}.wa-lo-range::-moz-range-thumb{width:7px;height:7px;border:2px solid white;box-shadow:0 0 0 1px #3a56cf;border-radius:50%;background:#3a56cf}
.wa-lo-stops{display:flex;justify-content:space-between;gap:5px}.wa-lo-stops button{pointer-events:auto;cursor:pointer;border:0;min-height:24px;padding:3px 0;background:none;color:#566680;font:600 10px/1.2 Arial,sans-serif;white-space:nowrap}.wa-lo-stops button[aria-pressed=true],.wa-lo-stops button:hover{color:#304bbc}
@media(max-width:620px){.wa-lo-width-controls{left:calc(50% - 8px);width:min(236px,calc(100% - 115px))}.wa-lo-stops button{font-size:9px}}
`;
