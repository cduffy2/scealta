import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { measureCounter } from './title.js';

// Scroll from the splash into scene 01 through the counter of a title letter.
//
// Scene 01 sits behind the title, visible only inside the counter, as a miniature
// anchored on the pool. Scrolling zooms the title and the scene together (one camera),
// so the pool ends exactly where it sits when scene 01 fills the screen, and the
// letter's strokes have swept past the edges. Scene 01's own section is waiting under
// that final frame, so the hand-off is seamless.

const POOL = { x: 0.505, y: 0.78 }; // the pool's glow, as a fraction of the scene image
const IMG = { w: 2912, h: 1632 };

const smooth = gsap.parseEase('power2.inOut');

export function createPortal({ splash, title, letter, portal, image, fade, onChapter }) {
  let geo = null;
  let trigger = null;

  function measure() {
    gsap.set(title, { clearProps: 'transform,transformOrigin' });
    const hole = measureCounter(letter(), splash);
    if (!hole) return (geo = null);
    const W = splash.clientWidth;
    const H = splash.clientHeight;
    // where the pool lands when the image covers the frame (object-fit: cover)
    const c = Math.max(W / IMG.w, H / IMG.h);
    const P = { x: (W - IMG.w * c) / 2 + POOL.x * IMG.w * c, y: (H - IMG.h * c) / 2 + POOL.y * IMG.h * c };
    // the counter's ellipse must contain every corner of the frame when the zoom ends
    const rx = hole.rx * 1.14; // the window sits behind the letter: overshoot, and the stroke hides the edge
    const ry = hole.ry * 1.14;
    const S = Math.hypot(Math.max(P.x, W - P.x) / rx, Math.max(P.y, H - P.y) / ry) * 1.04;
    const t = title.getBoundingClientRect();
    const f = splash.getBoundingClientRect();
    geo = { hole, rx, ry, P, S, W, H, origin: { x: hole.x - (t.left - f.left), y: hole.y - (t.top - f.top) } };
  }

  function render(p) {
    onChapter?.(p);
    if (!geo) return;
    const { hole, rx, ry, P, S, origin, W, H } = geo;
    const s = S ** p; // exponential: reads as a steady push of the camera
    const m = smooth(p);
    const tx = (P.x - hole.x) * m;
    const ty = (P.y - hole.y) * m;
    const cx = hole.x + tx;
    const cy = hole.y + ty;
    title.style.transformOrigin = `${origin.x}px ${origin.y}px`;
    title.style.transform = p ? `translate(${tx}px, ${ty}px) scale(${s})` : '';
    portal.style.clipPath = `ellipse(${rx * s}px ${ry * s}px at ${cx}px ${cy}px)`;
    // The scene rides the same camera (scale s/S, reaching cover at the end), but is
    // never smaller than the visible part of the window, so the counter is always full.
    const vx0 = Math.max(0, cx - rx * s), vx1 = Math.min(W, cx + rx * s);
    const vy0 = Math.max(0, cy - ry * s), vy1 = Math.min(H, cy + ry * s);
    const k = Math.max(s / S, (cx - vx0) / P.x, (vx1 - cx) / (W - P.x), (cy - vy0) / P.y, (vy1 - cy) / (H - P.y)) * (p < 1 ? 1.01 : 1);
    image.style.transformOrigin = `${P.x}px ${P.y}px`;
    image.style.transform = `translate(${cx - P.x}px, ${cy - P.y}px) scale(${k})`;
    // black at rest, fading up from black as you scroll in
    image.style.filter = `brightness(${gsap.utils.clamp(0, 1, (p - 0.04) / 0.4)})`;
    const a = 1 - gsap.utils.clamp(0, 1, p / 0.18);
    if (a !== lastFade) gsap.set(fade, { autoAlpha: a }); // only once scrolling has begun, so the intro owns the start
    lastFade = a;
  }
  let lastFade = 1;

  return {
    refresh() {
      measure();
      render(trigger ? trigger.progress : 0);
    },
    enableZoom() {
      if (trigger) return;
      trigger = ScrollTrigger.create({
        trigger: splash,
        start: 'top top',
        end: '+=170%',
        pin: true,
        scrub: 0.6,
        onRefreshInit: () => gsap.set(title, { clearProps: 'transform' }),
        onRefresh: (self) => {
          measure();
          render(self.progress);
        },
        onUpdate: (self) => render(self.progress),
      });
      document.documentElement.classList.add('has-portal-zoom');
    },
    disableZoom() {
      if (trigger) trigger.kill(true);
      trigger = null;
      document.documentElement.classList.remove('has-portal-zoom');
      measure();
      render(0);
    },
  };
}
