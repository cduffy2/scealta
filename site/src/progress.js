// Chapter progress, bottom left: one dot per scene, driven by the scroll.
//
// `pos` runs from 0 (the splash) to the number of scenes; whole numbers are "landed on
// that scene". The current scene's dot is a long pill. Between scenes the pill shrinks
// back as the next dot widens and fills from the left, so the reader can see where they
// are on the way. Read scenes stay filled (green); scenes still to come are faint.

const DOT = 8;
const PILL = 28;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad = (n) => String(n).padStart(2, '0');

export function createProgress(el) {
  const dots = [...el.querySelectorAll('.dots i')];
  const count = el.querySelector('.progress__count');
  const total = dots.length;
  let last = null;

  function set(pos) {
    pos = clamp(pos, 0, total);
    if (last !== null && Math.abs(pos - last) < 0.0005) return;
    last = pos;
    dots.forEach((d, i) => {
      const near = clamp(1 - Math.abs(pos - (i + 1)), 0, 1);
      d.style.width = `${DOT + (PILL - DOT) * near}px`;
      d.style.setProperty('--fill', clamp(pos - i, 0, 1));
    });
    // no chapter yet on the splash: the counter fades in as the first dot fills
    count.textContent = `${pad(clamp(Math.round(pos), 1, total))} / ${pad(total)}`;
    count.style.opacity = clamp((pos - 0.3) / 0.4, 0, 1);
  }

  set(0);
  return { set };
}
