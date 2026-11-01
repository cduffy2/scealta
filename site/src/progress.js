// Reading progress, driven by the scroll: a counter bottom left, and a rail on the right
// showing how much further to the next scene.
//
// `pos` runs from 0 (the splash) to the number of scenes; whole numbers are "landed on
// that scene". The stretch to the next scene is a long pill between its two dots, filling
// as the reader goes. It wakes while they scroll and shrinks once they stop on a scene (on
// a phone it goes altogether). Stopping part way between scenes asks them to keep going.

import { state } from './state.js';
import { strings } from './i18n.js';

const LANDED = 0.001; // this close to a whole number is on the scene
const NUDGE_FROM = 0.03; // the story text is still fading out before this
const ARRIVED_MS = 800; // the next scene's name stays green this long
const SLEEP_MS = 1000;
const NUDGE_MS = 1500;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad = (n) => String(n).padStart(2, '0');

export function createProgress(el, rail) {
  const count = el.querySelector('.progress__count');
  const capsule = rail.querySelector('.rail__capsule');
  const number = rail.querySelector('.rail__number');
  const name = rail.querySelector('.rail__name');
  const total = 6;

  // a slot for each stretch, the first before scene 01 and the last after scene 06
  const slot = '<span class="rail__slot"><span class="rail__fill"></span></span>';
  capsule.innerHTML = slot + '<span class="rail__dot"></span>'.concat(slot).repeat(total);
  const slots = [...capsule.querySelectorAll('.rail__slot')];
  const fills = [...capsule.querySelectorAll('.rail__fill')];
  const dots = [...capsule.querySelectorAll('.rail__dot')];

  let last = null;
  let arrived = null; // the scene just reached, until it is time to show the next stretch
  let arrivedTimer = 0;
  let idleTimer = 0;
  let touching = false;

  function paint() {
    const whole = Math.floor(last);
    const leg = arrived ?? whole;
    const stretch = arrived === null ? leg : leg - 1;
    const fill = arrived === null ? last - whole : 1;
    slots.forEach((s, i) => s.classList.toggle('is-open', i === stretch));
    fills.forEach((f, i) => (f.style.transform = `translateY(${i === stretch ? (fill - 1) * 100 : -100}%)`));
    dots.forEach((d, i) => {
      d.classList.toggle('is-read', i < whole);
      d.classList.toggle('is-next', i === stretch);
    });
    rail.style.setProperty('--leg', stretch);
    rail.classList.toggle('is-arrived', arrived !== null);
    rail.classList.toggle('is-last', stretch >= total);
    if (stretch < total) {
      number.textContent = pad(stretch + 1);
      name.textContent = strings[state.lang][`s${pad(stretch + 1)}Title`];
    }
  }

  // the flat scenes can be read part way through a stretch, so only the 3D journey asks
  function stoppedBetweenScenes() {
    return document.documentElement.classList.contains('is-3d') && last - Math.floor(last) >= NUDGE_FROM;
  }

  function settle() {
    clearTimeout(idleTimer);
    if (touching) return;
    const nudge = stoppedBetweenScenes();
    idleTimer = setTimeout(
      () => {
        rail.classList.toggle('is-nudge', nudge);
        rail.classList.toggle('is-awake', nudge);
        if (!nudge) endArrival();
      },
      nudge ? NUDGE_MS : SLEEP_MS,
    );
  }

  function wake() {
    rail.classList.add('is-awake');
    rail.classList.remove('is-nudge');
    settle();
  }

  function endArrival() {
    clearTimeout(arrivedTimer);
    if (arrived === null) return;
    arrived = null;
    paint();
  }

  function set(pos) {
    pos = clamp(pos, 0, total);
    if (Math.abs(pos - Math.round(pos)) < LANDED) pos = Math.round(pos);
    if (last !== null && Math.abs(pos - last) < 0.0005) return;
    const moving = last !== null;
    const prev = last;
    last = pos;

    if (moving && pos === Math.floor(pos) && pos > 0 && prev < pos) {
      arrived = pos;
      clearTimeout(arrivedTimer);
      arrivedTimer = setTimeout(endArrival, ARRIVED_MS);
    } else if (arrived !== pos) {
      clearTimeout(arrivedTimer);
      arrived = null;
    }
    paint();
    // no chapter yet on the splash: the counter fades in as the first stretch fills
    count.textContent = `${pad(clamp(Math.round(pos), 1, total))} / ${pad(total)}`;
    count.style.opacity = clamp((pos - 0.3) / 0.4, 0, 1);
    if (moving) wake();
  }

  window.addEventListener('scroll', wake, { passive: true });
  window.addEventListener(
    'touchstart',
    () => {
      touching = true;
      wake();
    },
    { passive: true },
  );
  for (const type of ['touchend', 'touchcancel']) {
    window.addEventListener(
      type,
      () => {
        touching = false;
        settle();
      },
      { passive: true },
    );
  }

  set(0);
  return { set, refresh: paint };
}
