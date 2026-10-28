import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createIcons, VolumeX, Volume2, Headphones, BookOpen, Pause, Play, ArrowDown, ChevronRight } from 'lucide';
import { state, save } from './state.js';
import { strings, applyStrings } from './i18n.js';
import { buildTitle, fontsReady, animateTitle, showTitle } from './title.js';
import { createPortal } from './portal.js';
import { createProgress } from './progress.js';

gsap.registerPlugin(ScrollTrigger);

const icons = { VolumeX, Volume2, Headphones, BookOpen, Pause, Play, ArrowDown, ChevronRight };
const root = document.documentElement;
const soundBtn = document.querySelector('[data-control="sound"]');
const motionBtn = document.querySelector('[data-control="motion"]');
const splash = document.getElementById('splash');
const titleEl = document.getElementById('splash-title');
const portalEl = splash.querySelector('.portal');

let title = null; // { chars, portal } for the current language
let portal = null; // 2D zoom (fallback)
let splash3d = null; // 3D title, salmon and fly-through
let introTl = null;
const progress = createProgress(document.querySelector('.progress'));

// With motion off there is no zoom to report progress, so the plain scroll does.
let plainProgress = null;
function trackPlainScroll(on) {
  plainProgress?.kill();
  plainProgress = on
    ? ScrollTrigger.create({
        trigger: splash,
        start: 'top top',
        end: 'bottom top',
        onUpdate: (self) => progress.set(self.progress),
        onRefresh: (self) => progress.set(self.progress),
      })
    : null;
}

// In the flat version each later scene is its own section: the next dot fills as it
// scrolls up into view. (In 3D the pinned splash reports the whole journey itself.)
let sceneProgress = [];
function trackScenes(on) {
  sceneProgress.forEach((t) => t.kill());
  sceneProgress = on
    ? [...document.querySelectorAll('.scene:not(.scene--first)')].map((el) => {
        const n = parseInt(el.id.slice(-2), 10);
        const set = (self) => self.progress > 0 && progress.set(n - 1 + self.progress);
        return ScrollTrigger.create({ trigger: el, start: 'top bottom', end: 'top top', onUpdate: set, onRefresh: set });
      })
    : [];
  // the breadcrumb and scroll cue belong to the scenes: show them once scene 01 is half in
  if (on)
    sceneProgress.push(
      ScrollTrigger.create({
        trigger: '#scene-01',
        start: 'top 50%',
        onEnter: () => root.classList.add('in-scene'),
        onLeaveBack: () => root.classList.remove('in-scene'),
      }),
    );
}

const webgl = (() => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
})();

function setIcon(button, name) {
  const old = button.querySelector('svg, i');
  const i = document.createElement('i');
  i.dataset.lucide = name;
  i.setAttribute('aria-hidden', 'true');
  old.replaceWith(i);
  createIcons({ icons, nameAttr: 'data-lucide' });
}

// ---- Language --------------------------------------------------------------
function renderLang() {
  applyStrings(state.lang);
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang));
  renderMotion(); // its label is language-dependent
}
for (const b of document.querySelectorAll('[data-lang]')) {
  b.addEventListener('click', () => {
    if (b.dataset.lang === state.lang) return;
    state.lang = b.dataset.lang;
    save();
    renderLang();
    setupTitle({ animate: false });
  });
}

// ---- Sound -----------------------------------------------------------------
// No audio files yet: this holds the state the scenes will listen to.
function renderSound() {
  soundBtn.setAttribute('aria-pressed', String(state.sound));
  setIcon(soundBtn, state.sound ? 'volume-2' : 'volume-x');
  root.dataset.sound = state.sound ? 'on' : 'off';
}
soundBtn.addEventListener('click', () => {
  state.sound = !state.sound;
  renderSound();
});

// ---- Motion ----------------------------------------------------------------
// Off (button or system setting): CSS animations hold still, the intro jumps to its end,
// and the zoom through the title becomes a plain scroll.
function renderMotion() {
  const off = state.motion === 'off';
  root.dataset.motion = state.motion;
  motionBtn.setAttribute('aria-pressed', String(off));
  motionBtn.querySelector('.pill__label').textContent = strings[state.lang][off ? 'playMotion' : 'pauseMotion'];
  setIcon(motionBtn, off ? 'play' : 'pause');
  if (!title) return; // first render, before the title exists
  if (off) {
    introTl?.progress(1); // never leave the title half-drawn
    if (splash3d) {
      splash3d.destroy();
      splash3d = null;
      moveCopy(false);
      startDOM({ animate: false });
    }
    portal?.disableZoom();
    trackPlainScroll(true);
  } else if (!splash3d) {
    setupTitle({ animate: false }); // try 3D again, or re-enable the 2D zoom
  }
}
motionBtn.addEventListener('click', () => {
  state.motion = state.motion === 'off' ? 'on' : 'off';
  save();
  renderMotion();
});

// ---- Read or listen --------------------------------------------------------
for (const b of document.querySelectorAll('[data-choose]')) {
  b.addEventListener('click', () => {
    state.mode = b.dataset.choose;
    root.dataset.mode = state.mode;
    if (state.mode === 'listen' && !state.sound) {
      state.sound = true; // this click is the gesture that lets the browser play audio
      renderSound();
    }
    save();
    if (splash3d) return splash3d.goToScene(state.motion === 'off' ? 'auto' : 'smooth');
    const target = document.getElementById('scene-01');
    target.scrollIntoView({ behavior: state.motion === 'off' ? 'auto' : 'smooth' });
    target.focus({ preventScroll: true });
  });
}

// ---- Rain ------------------------------------------------------------------
function makeRain() {
  const box = document.querySelector('.splash__rain');
  const count = window.innerWidth < 600 ? 40 : 70;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const frag = document.createDocumentFragment();
  for (let k = 0; k < count; k++) {
    const s = document.createElement('span');
    s.style.left = `${rand() * 100}%`;
    s.style.top = `${rand() * 100}%`;
    s.style.height = `${[5, 7, 9, 12][Math.floor(rand() * 4)]}px`;
    s.style.opacity = [0.18, 0.28, 0.4][Math.floor(rand() * 3)];
    s.style.animationDuration = `${1.6 + rand() * 1.6}s`;
    s.style.animationDelay = `${-rand() * 3}s`;
    frag.append(s);
  }
  box.append(frag);
}

// ---- Title, portal and 3D ---------------------------------------------------
// With motion on and WebGL available the title, salmon and fly-through are 3D
// (src/three/). Otherwise, or if 3D takes too long to load, the 2D version runs.
function showPortal(animate) {
  gsap.to(portalEl, { autoAlpha: 1, duration: animate ? 1.4 : 0, ease: 'power1.out' });
}

const FADE = ['.splash__salmon', '.splash__choice', '.splash__rain'];

function startDOM({ animate }) {
  root.classList.remove('is-3d');
  portal ??= createPortal({
    splash,
    title: titleEl,
    letter: () => title.portal,
    portal: portalEl,
    image: portalEl.querySelector('.portal__img'),
    fade: FADE,
    onChapter: progress.set,
  });
  if (animate) {
    // letters thicken in, and the window into scene 01 opens once its letter is drawn
    introTl = gsap
      .timeline()
      .add(
        animateTitle(titleEl, title.chars, {
          onPortalLetterDone: () => {
            portal.refresh(); // kerning returns once the letters are released, so re-measure
            showPortal(true);
          },
        }),
      )
      .from('.splash__salmon img', { xPercent: -6, autoAlpha: 0, duration: 2, ease: 'power3.out' }, 0.9)
      .from('.splash__choice', { y: 12, autoAlpha: 0, duration: 0.9, ease: 'power3.out' }, 1.8);
  } else {
    showTitle(titleEl, title.chars);
    showPortal(false);
  }
  portal.refresh();
  if (state.motion === 'on') portal.enableZoom();
  trackPlainScroll(state.motion !== 'on');
  trackScenes(true);
  ScrollTrigger.refresh();
}

// In 3D each scene's text sits on the pinned splash, over the live scene; it goes back
// into its own section for the flat version. data-scene-copy is the scene number.
const sceneCopy = [...document.querySelectorAll('[data-scene-copy]')];
const sceneOf = (el) => document.getElementById(`scene-${el.dataset.sceneCopy.padStart(2, '0')}`);
const moveCopy = (to3d) => {
  for (const el of sceneCopy) (to3d ? splash : sceneOf(el)).append(el);
  gsap.set(sceneCopy, { clearProps: 'all' });
  root.classList.toggle('in-scene', !to3d);
};
const shown = {};
function showScene(n, t) {
  // t: 0 hidden -> 1 shown, scrubbed with the scroll as you arrive in scene n
  if (shown[n] === t) return;
  shown[n] = t;
  gsap.set(sceneCopy.filter((el) => el.dataset.sceneCopy === String(n)), { autoAlpha: t, y: (1 - t) * 14 });
  root.classList.toggle('in-scene', Object.values(shown).some((v) => v > 0.5));
}

async function start3D({ animate }) {
  root.classList.add('is-3d');
  moveCopy(true);
  showTitle(titleEl, title.chars); // the invisible DOM title is the 3D title's layout
  if (animate) gsap.set('.splash__choice', { autoAlpha: 0 }); // the 3D intro brings the choice in
  if (!splash3d) {
    const pending = import('./three/splash3d.js').then(({ createSplash3D }) =>
      createSplash3D({
        splash,
        host: splash.querySelector('.splash__stage'),
        titleEl,
        getTitle: () => title,
        salmonEl: splash.querySelector('.splash__salmon'),
        fade: '.splash__choice',
        onScene: showScene,
        onChapter: progress.set,
      }),
    );
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 2500));
    splash3d = await Promise.race([pending, timeout]).catch((e) => (console.warn('3D unavailable:', e), null));
    if (!splash3d) pending.then((late) => late?.destroy()).catch(() => {});
  } else {
    splash3d.relayout();
  }
  if (!splash3d || state.motion !== 'on') {
    splash3d?.destroy();
    splash3d = null;
    root.classList.remove('is-3d');
    moveCopy(false);
    gsap.set('.splash__choice', { clearProps: 'opacity,visibility' });
    return false;
  }
  portal?.disableZoom();
  trackPlainScroll(false);
  trackScenes(false);
  if (animate) introTl = splash3d.intro();
  else splash3d.showStill();
  splash3d.enableZoom();
  ScrollTrigger.refresh();
  return true;
}

async function setupTitle({ animate }) {
  title = buildTitle(titleEl, strings[state.lang].title);
  await fontsReady();
  if (state.motion === 'on' && webgl && (await start3D({ animate }))) return;
  startDOM({ animate: animate && state.motion === 'on' });
}

root.dataset.mode = state.mode;
createIcons({ icons, nameAttr: 'data-lucide' });
renderLang();
renderSound();
makeRain();
setupTitle({ animate: state.motion === 'on' });
requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('ready')));
