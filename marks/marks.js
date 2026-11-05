// Each mark has a deliberate, reversible motion state. No ambient loop is required.
const artboards = [...document.querySelectorAll('.art')];
for (const art of artboards) {
  const label = art.querySelector('.motion-label');
  const idleLabel = label.textContent;
  let latched = false;
  function update(active) {
    art.dataset.active = String(active);
    art.setAttribute('aria-pressed', String(latched));
    label.textContent = active ? 'Коснись ещё раз — собрать знак' : idleLabel;
  }
  art.addEventListener('click', () => { latched = !latched; update(latched); });
  art.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') update(true); });
  art.addEventListener('pointerleave', () => update(latched));
  art.addEventListener('blur', () => update(latched));
}
