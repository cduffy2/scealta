import { gsap } from 'gsap';

// The splash title, built letter by letter so each one can grow from Gaillimh Thin
// to Light like a weight axis.
//
// Source syntax (see i18n.js): "\n" breaks the line, [x] marks the portal letter whose
// counter opens onto scene 01.

const WEIGHTS = ['100', '300'];

export function fontsReady() {
  return Promise.all(WEIGHTS.map((w) => document.fonts.load(`${w} 100px Gaillimh`, 'Bradán Knowledge')));
}

export function buildTitle(el, source) {
  el.textContent = '';
  el.setAttribute('aria-label', source.replace(/[[\]]/g, '').replace(/\n/g, ' '));
  const chars = [];
  let portal = null;
  source.split('\n').forEach((line, i) => {
    if (i) el.append(document.createElement('br'));
    const lineEl = document.createElement('span');
    lineEl.className = 'title__line';
    lineEl.setAttribute('aria-hidden', 'true');
    for (const m of line.matchAll(/\[(.)\]|(.)/gu)) {
      const span = document.createElement('span');
      span.className = 'title__char';
      span.textContent = m[1] ?? m[2];
      if (m[1]) {
        portal = span;
        // zero-height inline-block: its bottom edge sits exactly on the baseline
        const base = document.createElement('span');
        base.className = 'title__baseline';
        span.append(base);
      }
      lineEl.append(span);
      chars.push(span);
    }
    // the line's own baseline, read by the 3D title to place its letters
    const lineBase = document.createElement('span');
    lineBase.className = 'title__baseline';
    lineEl.append(lineBase);
    el.append(lineEl);
  });
  return { chars, portal };
}

// Fix every letter at its Light width so the line doesn't shuffle as weights change.
function lockWidths(el, chars) {
  el.classList.remove('title--locked');
  const size = parseFloat(getComputedStyle(el).fontSize);
  const widths = chars.map((c) => c.getBoundingClientRect().width / size);
  chars.forEach((c, i) => (c.style.width = `${widths[i]}em`));
  el.classList.add('title--locked');
}

function release(el, chars) {
  el.classList.remove('title--locked'); // back to plain inline text, so kerning returns
  chars.forEach((c) => (c.style.width = ''));
}

export function animateTitle(el, chars, { onPortalLetterDone } = {}) {
  lockWidths(el, chars);
  return gsap.fromTo(
    chars,
    { fontWeight: 100, autoAlpha: 0, yPercent: 10, filter: 'blur(10px)' },
    {
      fontWeight: 300,
      autoAlpha: 1,
      yPercent: 0,
      filter: 'blur(0px)',
      duration: 1.8,
      ease: 'power2.out',
      stagger: { each: 0.055, from: 'start' },
      onComplete() {
        release(el, chars);
        gsap.set(chars, { clearProps: 'filter,transform' });
        onPortalLetterDone?.();
      },
    },
  );
}

export function showTitle(el, chars) {
  release(el, chars);
  gsap.set(chars, { clearProps: 'all' });
}

// The counter (enclosed hole) of the portal letter, measured from the real glyph:
// draw it on a canvas, flood the outside, and what's left unfilled inside is the hole.
// Returns centre and radii in px, relative to `frame`.
export function measureCounter(letter, frame) {
  const cs = getComputedStyle(letter);
  const size = parseFloat(cs.fontSize);
  const k = 4; // supersample
  const ch = letter.firstChild.textContent;
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  ctx.font = `300 ${size * k}px Gaillimh`;
  const m = ctx.measureText(ch);
  const pad = 4;
  const w = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + pad * 2;
  const h = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + pad * 2;
  ctx.canvas.width = w;
  ctx.canvas.height = h;
  ctx.font = `300 ${size * k}px Gaillimh`;
  const ox = pad + m.actualBoundingBoxLeft;
  const oy = pad + m.actualBoundingBoxAscent;
  ctx.fillText(ch, ox, oy);
  const a = ctx.getImageData(0, 0, w, h).data;
  const ink = (i) => a[i * 4 + 3] > 110;

  const outside = new Uint8Array(w * h);
  const stack = [0];
  outside[0] = 1;
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i / w) | 0;
    for (const j of [x > 0 && i - 1, x < w - 1 && i + 1, y > 0 && i - w, y < h - 1 && i + w]) {
      if (j !== false && !outside[j] && !ink(j)) {
        outside[j] = 1;
        stack.push(j);
      }
    }
  }
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < w * h; i++) {
    if (!outside[i] && !ink(i)) {
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 <= x0) return null; // letter has no counter

  const box = letter.getBoundingClientRect();
  const fr = frame.getBoundingClientRect();
  const baseline = letter.querySelector('.title__baseline').getBoundingClientRect().bottom;
  // locked: the glyph is centred in a fixed-width box. Released: it starts at the box's
  // left edge (kerning only changes the advance, which must not shift the origin).
  const locked = letter.closest('.title--locked');
  const originX = locked ? box.left + (box.width - m.width / k) / 2 : box.left;
  return {
    x: originX + ((x0 + x1) / 2 - ox) / k - fr.left,
    y: baseline + ((y0 + y1) / 2 - oy) / k - fr.top,
    rx: (x1 - x0) / 2 / k,
    ry: (y1 - y0) / 2 / k,
  };
}
