const FONT = 'ui-monospace, SFMono-Regular, Consolas, monospace';
const CELL_W = 27, CELL_H = 46;
const TAU = Math.PI * 2;
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = n => { const v = clamp(n); return v * v * (3 - 2 * v); };
const fraction = n => n - Math.floor(n);

function timing(t, count) {
  if (count === 1) return { from: 0, to: 0, roll: 0, burst: 0, jump: 0 };
  const elapsed = Math.max(0, t), period = 4.5;
  const cycle = Math.floor(elapsed / period), seconds = elapsed % period;
  const from = cycle % count, to = (from + 1) % count;
  const roll = clamp((seconds - 3.24) / 1.12);
  const tick = Math.floor(seconds * 30);
  // Two short scan slips, under 100ms each, tied to the character roll.
  const burst = (tick >= 101 && tick <= 103) || (tick >= 120 && tick <= 122)
    ? (tick % 3 === 1 ? 1 : 0.62) : 0;
  return { from, to, roll, burst, jump: tick % 2 === 0 ? 1 : -1 };
}

function paper(canvas, w, h, dpr) {
  const ratio = Math.min(dpr, 1.55, 1600 / Math.max(w, h));
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  const ctx = canvas.getContext('2d', { alpha: false });
  const sx = canvas.width / w, sy = canvas.height / h;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  ctx.fillStyle = '#f2f2f1'; ctx.fillRect(0, 0, w, h);
  const r = Math.min(w * .432, h * .412);
  const cx = w * (w > h * 1.2 ? .485 : .5), cy = h * .5;
  const ring = r + Math.min(13, r * .062);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#c6d0dd';
  ctx.beginPath(); ctx.arc(cx, cy, ring, 0, TAU); ctx.stroke();
  for (let i = 0; i < 32; i++) {
    const a = TAU * i / 32, major = i % 8 === 0, size = major ? 7 : 2.5;
    ctx.strokeStyle = major ? '#6480ab' : '#aebbcf';
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * ring, cy + Math.sin(a) * ring);
    ctx.lineTo(cx + Math.cos(a) * (ring + size), cy + Math.sin(a) * (ring + size)); ctx.stroke();
  }
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
  const ground = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ground.addColorStop(0, '#ffffff'); ground.addColorStop(.47, '#fbfcff'); ground.addColorStop(1, '#e0ebf9');
  ctx.fillStyle = ground; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  const x = cx - r * .57, y = cy - r * .36, width = r * 1.43, height = r * .94;
  const divider = cx - r * .615;
  ctx.strokeStyle = '#91a7c25c'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx - r, cy - r * .405); ctx.lineTo(cx + r, cy - r * .405);
  ctx.moveTo(divider, y); ctx.lineTo(divider, y + height); ctx.stroke();
  ctx.font = `600 ${Math.max(7, r * .059)}px ${FONT}`;
  ctx.fillStyle = '#1f2a3e'; ctx.fillText('SOURCE BUFFER', cx - r * .59, cy - r * .505);
  ctx.fillStyle = '#3156a4'; ctx.textAlign = 'right';
  ctx.fillText('0x08', cx + r * .60, cy - r * .505);
  ctx.fillStyle = '#596579'; ctx.font = `500 ${Math.max(6, r * .052)}px ${FONT}`;
  for (let row = 0; row < 7; row++) ctx.fillText(String(row + 1).padStart(2, '0'), cx - r * .662, y + (row + .725) * height / 7);
  ctx.textAlign = 'left';
  ctx.restore();
  ctx.strokeStyle = '#a0b2cb'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(cx, cy, Math.max(0, r - .5), 0, TAU); ctx.stroke();
  return { w, h, sx, sy, cx, cy, r, x, y, width, height };
}

function atlasFor(lines, columns, rows) {
  const canvas = document.createElement('canvas');
  canvas.width = columns * CELL_W; canvas.height = rows * CELL_H;
  const ctx = canvas.getContext('2d');
  ctx.font = `650 39px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  for (const [row, line] of lines.entries()) {
    ctx.fillStyle = line.trimStart().startsWith('//') ? 'rgba(13,20,29,.77)' : '#0d141d';
    for (const [column, glyph] of Array.from(line).entries()) {
      if (glyph !== ' ') ctx.fillText(glyph, column * CELL_W + 1.8, row * CELL_H + 33, CELL_W - 3.6);
    }
  }
  return canvas;
}

export function createLightField(excerpts, reduced) {
  const lines = excerpts.slice(0, reduced ? 1 : excerpts.length).map(excerpt => excerpt[1]);
  const columns = Math.max(...excerpts.flatMap(excerpt => excerpt[1].map(line => line.length)));
  const rows = Math.max(...excerpts.map(excerpt => excerpt[1].length));
  const backdrop = document.createElement('canvas');
  const atlases = lines.map(code => atlasFor(code, columns, rows));
  let bounds;
  return {
    backdrop, atlases, columns, rows, lines,
    timing: t => timing(t, atlases.length),
    resize(w, h, dpr) { bounds = paper(backdrop, w, h, dpr); return bounds; },
    get bounds() { return bounds; },
  };
}

export const LIGHT_FIELD_SHADER = `
  uniform sampler2D uPaper;
  uniform sampler2D uGlyphA;
  uniform sampler2D uGlyphB;
  uniform vec4 uCodeRect;
  uniform vec4 uCircle;
  uniform vec2 uGrid;
  uniform vec2 uCell;
  uniform vec3 uScan;

  float inkAt(vec2 local) {
    if (any(lessThan(local, vec2(0.))) || any(greaterThanEqual(local, vec2(1.)))) return 0.;
    vec2 coordinate = local * uGrid;
    vec2 slot = floor(coordinate);
    vec2 within = fract(coordinate);
    float stagger = mod(slot.x * 13. + slot.y * 7., 17.) / 17. * .31 + slot.y * .015;
    float roll = smoothstep(stagger, stagger + .55, uScan.x);
    float slide = within.y + roll;
    within.y = fract(slide);
    within = clamp(within, .5 / uCell, 1. - .5 / uCell);
    vec2 atlas = (slot + within) / uGrid;
    atlas.y = 1. - atlas.y;
    return slide < 1. ? texture2D(uGlyphA, atlas).a : texture2D(uGlyphB, atlas).a;
  }

  vec4 sampleField(vec2 uv) {
    vec4 base = texture2D(uPaper, uv);
    vec2 top = vec2(uv.x, 1. - uv.y);
    vec2 radial = (top - uCircle.xy) * uCircle.zw;
    float mask = 1. - smoothstep(.986, 1., length(radial));
    if (mask <= 0.) return base;
    vec2 local = (top - uCodeRect.xy) / uCodeRect.zw;
    if (uScan.y > 0. && local.y >= 0. && local.y < 1.) {
      float bandA = 1. - step(.012, abs(local.y - .40));
      float bandB = 1. - step(.007, abs(local.y - .70));
      float band = max(bandA, bandB);
      if (band > 0.) {
        local.x += (bandA - .69 * bandB) * uScan.z * (.019 + .016 * uScan.y);
        float fringe = .005 * uScan.y;
        float r = inkAt(local + vec2(fringe, 0.));
        float g = inkAt(local);
        float b = inkAt(local - vec2(fringe, 0.));
        base.rgb = mix(base.rgb, vec3(.004, .007, .012), vec3(r,g,b) * mask);
        base.rgb = mix(base.rgb, vec3(.45,.60,.90), .055 * band * uScan.y);
        return base;
      }
    }
    base.rgb = mix(base.rgb, vec3(.004, .007, .012), inkAt(local) * mask);
    return base;
  }
`;

export function createLightFieldCanvas(excerpts, reduced, dpr) {
  const field = createLightField(excerpts, reduced);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  let key = '', bounds;
  function resize(w, h) {
    bounds = field.resize(w, h, dpr());
    canvas.width = field.backdrop.width; canvas.height = field.backdrop.height;
    key = '';
  }
  function frame(t) {
    const { from, to, roll, burst, jump } = field.timing(t);
    const settled = roll === 0 || roll === 1;
    const id = settled ? String(roll === 0 ? from : to) : `${from}/${roll}/${burst}`;
    if (id === key) return canvas;
    key = id;
    const { cx, cy, r, x, y, width, height, sx, sy } = bounds;
    const { rows, columns, atlases, lines } = field;
    const dw = width / columns, dh = height / rows;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(field.backdrop, 0, 0);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
    if (settled) {
      ctx.drawImage(atlases[roll === 0 ? from : to], x, y, width, height);
    } else {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          const stagger = ((col * 13 + row * 7) % 17) / 17 * .31 + row * .015;
          const dy = smooth((roll - stagger) / .55), dx = x + col * dw, yy = y + row * dh;
          const ax = col * CELL_W, ay = row * CELL_H;
          if ((lines[from][row]?.[col] || ' ') !== ' ' && dy < .999) {
            ctx.drawImage(atlases[from], ax, ay + dy * CELL_H, CELL_W, (1 - dy) * CELL_H,
              dx, yy, dw, (1 - dy) * dh);
          }
          if ((lines[to][row]?.[col] || ' ') !== ' ' && dy > .001) {
            ctx.drawImage(atlases[to], ax, ay, CELL_W, dy * CELL_H,
              dx, yy + (1 - dy) * dh, dw, dy * dh);
          }
        }
      }
      if (burst) {
        for (const [position, breadth, direction] of [[.40, .024, 1], [.70, .014, -.69]]) {
          const shift = width * (.019 + .016 * burst) * jump * direction;
          const top = y + height * (position - breadth * .5), hh = height * breadth;
          ctx.save(); ctx.beginPath(); ctx.rect(x, top, width, hh); ctx.clip();
          ctx.drawImage(canvas, (x + shift) * sx, top * sy, width * sx, hh * sy, x, top, width, hh);
          ctx.fillStyle = direction > 0 ? 'rgba(84,137,235,.11)' : 'rgba(149,104,173,.08)';
          ctx.fillRect(x, top, width, hh);
          ctx.restore();
        }
      }
    }
    ctx.restore();
    return canvas;
  }
  return { resize, frame };
}
