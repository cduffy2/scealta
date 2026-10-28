import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { loadFonts, buildTitle3D, setLetterReveal, disposeTitle3D } from './title3d.js';
import { loadSalmon, createSwim, SALMON_LENGTH, SALMON_HEIGHT } from './salmon3d.js';
import { loadScene01, IMG, PLATE_DEPTH } from './scene01.js';
import { loadScene02 } from './scene02.js';
import { createRain } from './rain3d.js';

// The splash in 3D. World layout (camera never rotates, always looks down -z):
//
//   z = TITLE_Z + TITLE_DIST   camera start: the title fills the frame like the DOM layout
//   z = TITLE_Z                front faces of the extruded title
//   z = 0                      camera end: scene 01 framed exactly like its flat image
//   z = -9 … -14               the three trees
//   z = -30                    the painted plate (scene 01), and the pool's surface
//   z = -33                    camera, scene 02: under the water, its layers beyond
//
// The camera starts centred, flies through the counter (the letter's walls slide past,
// lit green by the well), then settles into scene 01's frame. Until it passes the title,
// scene 01 is only drawn where a stencil mask in the counter allows, and it starts
// shifted so the pool sits in the counter, gliding into its real place on the approach.
// Keeping the camera near the axis means the painting always fills the widening view.
//
// Then the dive: scene 01's trees and bushes draw back, the camera sinks towards the pool
// and through its surface (a wash of water green hides the crossing), and arrives in
// scene 02. The leaves part, and the salmon, who swam off at the start, swims back in.

const TITLE_Z = 10;
const TITLE_DIST = 8;
const NEAR_FACE = 0.03; // how close to the front face the first phase gets
const SPLIT = 0.55; // share of the flight spent approaching the title
// The pinned scroll: the flight takes the first FLIGHT of it (the salmon swims off left at
// the start), then scene 01's text comes in and holds before the page moves on.
const FLIGHT = 0.68;
const TEXT_IN = [0.72, 0.84];
const LANDED = TEXT_IN[1] + 0.02; // scene 01 fully in: where the Listen / Read buttons land
const SWIM_OFF = [0.005, 0.22];
// The whole pin, in screen heights of scroll. Scene 01 keeps its first S1 (all the
// fractions above are of that), then the dive and scene 02 follow.
const S1 = 3.2;
const TOTAL = 6.4;
const DIVE = [S1, 4.7];
const FISH_IN = [4.35, 5.3];
const TEXT2_IN = [5.0, 5.4];
const END_Z = -PLATE_DEPTH - 3; // the camera's rest under the water
const SURFACE = new THREE.Color('#2c5a1a');
const WELL = new THREE.Color('#9cc23a');

const easeIO = gsap.parseEase('power2.inOut');
const easeOut = gsap.parseEase('power2.out');
const smoothstep = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export async function createSplash3D({ splash, host, titleEl, getTitle, salmonEl, fade, onScene, onChapter }) {
  const [font, salmon, scene01, scene02] = await Promise.all([loadFonts(), loadSalmon(), loadScene01(), loadScene02()]);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.005, 80);
  scene.add(scene01.group, scene02.group, salmon.group, camera);
  camera.add(scene01.foreground, scene02.front); // the foregrounds travel with the camera
  scene.add(new THREE.AmbientLight(0xe8e4d4, 0.9)); // lights the letter walls (parchment lip, bog green deeper in)
  const key = new THREE.DirectionalLight(0xfff6e0, 0.9);
  key.position.set(-4, 6, 10);
  scene.add(key);
  const well = new THREE.PointLight(WELL, 0, 0, 2); // light from the well, on the counter walls
  scene.add(well);
  const swim = createSwim(salmon);
  scene.add(swim.bubbles);
  const rain = createRain(window.innerWidth < 600 ? 220 : 420);
  scene.add(rain.mesh);
  // the pool's surface as the camera goes through: a wash of water over the whole view
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: SURFACE, transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
  );
  surface.position.z = -0.05;
  surface.renderOrder = 999;
  camera.add(surface);

  const maskMat = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
    depthTest: false,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  });
  let mask = null;
  let title = null;
  let geo = null; // layout-dependent numbers
  let progress = 0;
  const intro = { salmon: 0, exit: 0, letters: null }; // salmon offset (in view widths), per-letter progress
  const fish = { under: false, k: 0 }; // under: he's in scene 02, k: view widths right of his place there
  let poses = null; // the salmon's place on the splash and in scene 02
  let trigger = null;

  // ---- layout ----------------------------------------------------------------
  function layout() {
    const W = splash.clientWidth;
    const H = splash.clientHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // Field of view as a dolly-zoom: at the end it is the plate's cover framing (view
    // height per unit depth t2End); further back it narrows in proportion, so the painting
    // keeps filling as much of the frame as possible on the way in.
    const t2End = Math.min(IMG.h / IMG.w, H / W);
    const t2At = (z) => Math.min(t2End, (t2End * PLATE_DEPTH) / (z + PLATE_DEPTH));
    const t2 = t2At(TITLE_Z + TITLE_DIST);

    const unit = (TITLE_DIST * t2) / H; // world units per px on the title plane, seen from the start
    // provisional mapping with the camera at (0, 0); shifted once the hole is known
    const toWorld0 = (x, y) => new THREE.Vector2((x - W / 2) * unit, (H / 2 - y) * unit);

    if (title) {
      scene.remove(title.group);
      disposeTitle3D(title);
    }
    title = buildTitle3D({ font, title: getTitle(), frame: splash, toWorld: toWorld0, unit, z: TITLE_Z });
    const hole0 = title.hole;
    // shift scene 01 so the sightline from the start, through the counter, hits the pool
    const reach = (TITLE_Z + TITLE_DIST + PLATE_DEPTH) / TITLE_DIST;
    const start = new THREE.Vector2(0, 0);
    const sceneShift = new THREE.Vector2(hole0.x * reach - scene01.pool.x, hole0.y * reach - scene01.pool.y);
    title.group.position.set(start.x, start.y, 0);
    scene.add(title.group);
    const hole = new THREE.Vector2(hole0.x + start.x, hole0.y + start.y);

    // stencil mask in the counter (overshoots a little: the letter's front face hides it)
    if (mask) {
      scene.remove(mask);
      mask.geometry.dispose();
    }
    const pts = hole0.points.map((p) => new THREE.Vector2(hole0.x + (p.x - hole0.x) * 1.15, hole0.y + (p.y - hole0.y) * 1.15));
    mask = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)), maskMat);
    mask.position.set(start.x, start.y, TITLE_Z + 0.001);
    mask.renderOrder = -10;
    scene.add(mask);

    // the 3D salmon takes the place of the DOM one (slightly in front of the title)
    const sr = salmonEl.getBoundingClientRect();
    const fr = splash.getBoundingClientRect();
    const sd = TITLE_DIST - 0.4;
    const su = (sd * t2) / H;
    const cx = sr.left - fr.left + sr.width / 2;
    const cy = sr.top - fr.top + sr.height / 2;
    // scene 02 sits around the camera's rest under the pool
    const pool = new THREE.Vector2(hole.x + scene01.pool.x, hole.y + scene01.pool.y);
    scene02.group.position.set(pool.x, pool.y, END_Z);
    scene02.layout(t2End);
    const fp = scene02.fishPose(SALMON_LENGTH, SALMON_HEIGHT, { w: (t2End * W) / H, h: t2End });
    poses = {
      splash: {
        rest: new THREE.Vector3(start.x + (cx - W / 2) * su, start.y + (H / 2 - cy) * su, TITLE_Z + 0.4),
        scale: (sr.width * su) / SALMON_LENGTH,
        viewW: W * su,
      },
      under: { rest: new THREE.Vector3(pool.x + fp.x, pool.y + fp.y, END_Z + fp.z), scale: fp.scale, viewW: fp.viewW },
    };

    well.position.set(hole.x, hole.y, TITLE_Z - title.letters[0].size * 0.2);
    well.distance = title.letters[0].size * 3;

    rain.setBounds({
      x0: Math.min(start.x, hole.x, 0) - 9,
      x1: Math.max(start.x, hole.x, 0) + 9,
      y0: Math.min(start.y, hole.y, 0) - 7,
      y1: Math.max(start.y, hole.y, 0) + 7,
      z0: -PLATE_DEPTH + 2,
      z1: TITLE_Z + TITLE_DIST - 0.6,
    });

    intro.letters?.forEach((t, i) => title.letters[i] && setLetterReveal(title.letters[i], t));
    geo = { start, hole, sceneShift, pool, size: title.letters[0].size, t2At, t2End };
    setProgress(progress);
  }

  // ---- camera path -----------------------------------------------------------
  function cameraAt(p) {
    const { start, hole } = geo;
    let z;
    if (p <= SPLIT) {
      // exponential approach: the title grows at a steady visual rate
      z = TITLE_Z + TITLE_DIST * (NEAR_FACE / TITLE_DIST) ** (p / SPLIT);
    } else {
      z = (TITLE_Z + NEAR_FACE) * (1 - easeIO((p - SPLIT) / (1 - SPLIT)));
    }
    const pos = new THREE.Vector3(0, 0, z);
    if (z >= TITLE_Z) {
      // along the sightline from the start, through the counter
      const f = (z - TITLE_Z) / TITLE_DIST;
      pos.x = hole.x + (start.x - hole.x) * f;
      pos.y = hole.y + (start.y - hole.y) * f;
    } else {
      // Through the letter and on into the scene in a straight line: no sideways move at
      // the end. Scene 01 is offset by the same amount instead (see setProgress).
      pos.x = hole.x;
      pos.y = hole.y;
    }
    return pos;
  }

  // the dive (d 0 -> 1): down towards the pool, through its surface, on to the rest below
  function diveAt(d) {
    const { hole, pool } = geo;
    const g = smoothstep(0, 0.75, d);
    return new THREE.Vector3(
      THREE.MathUtils.lerp(hole.x, pool.x, g),
      THREE.MathUtils.lerp(hole.y, pool.y, g),
      END_Z * easeIO(d),
    );
  }

  function setProgress(pin) {
    progress = pin;
    if (!geo) return;
    const u = pin * TOTAL; // screen heights scrolled
    const scroll = Math.min(1, u / S1); // scene 01's part of the pin
    const dive = THREE.MathUtils.clamp((u - DIVE[0]) / (DIVE[1] - DIVE[0]), 0, 1);
    const p = Math.min(1, scroll / FLIGHT); // flight progress
    // the salmon carries on his way, off to the left, as the camera moves in
    intro.exit = smoothstep(SWIM_OFF[0], SWIM_OFF[1], scroll);
    onScene?.(1, smoothstep(TEXT_IN[0], TEXT_IN[1], scroll) * (1 - smoothstep(0, 0.1, dive)));
    onScene?.(2, smoothstep(TEXT2_IN[0], TEXT2_IN[1], u));
    // the first dot fills on the way in, the second on the way down
    onChapter?.(dive > 0 ? 1 + smoothstep(0, 1, (u - DIVE[0]) / (TEXT2_IN[0] - DIVE[0])) : p);
    camera.position.copy(dive > 0 ? diveAt(dive) : cameraAt(p));
    // The scene glides from 'pool in the counter' to its final place (centred on the
    // camera's line through the counter) and is fully settled before the view opens up.
    const g = smoothstep(0.05, SPLIT * 0.9, p);
    scene01.group.position.set(
      THREE.MathUtils.lerp(geo.sceneShift.x, geo.hole.x, g),
      THREE.MathUtils.lerp(geo.sceneShift.y, geo.hole.y, g),
      0,
    );
    const t2 = camera.position.z <= 0 ? geo.t2End : geo.t2At(camera.position.z);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(t2 / 2));
    camera.updateProjectionMatrix();
    // keep the foreground the same size on screen while the field of view narrows
    scene01.foreground.scale.setScalar(t2 / geo.t2At(0));
    // trees and bushes come in at the end of the flight, and draw back as the dive begins
    scene01.setRise(dive > 0 ? 1 - smoothstep(0, 0.4, dive) : smoothstep(SPLIT + 0.04, 0.97, p));
    const through = camera.position.z < TITLE_Z;
    scene01.setMasked(!through);
    scene01.setBrightness(smoothstep(0.04, SPLIT * 0.8, p)); // hidden at rest, fades up as you scroll in
    scene01.setRippleFade(1 - 0.85 * smoothstep(0.2, 0.75, dive)); // calm before the plunge
    scene01.setNuts(p >= 0.99 && dive === 0); // hazelnuts drop now and then while you rest on scene 01
    mask.visible = !through;
    // through the surface: scene 01 is behind now, scene 02 opens up around the camera
    const z = camera.position.z;
    const under = z < -PLATE_DEPTH;
    scene01.group.visible = !under;
    rain.mesh.visible = z > -PLATE_DEPTH + 1;
    scene02.setBrightness(smoothstep(-PLATE_DEPTH + 1.2, -PLATE_DEPTH - 0.4, z));
    scene02.setArrive(smoothstep(0.78, 1, dive));
    surface.material.opacity = 1 - smoothstep(0.15, 2.4, Math.abs(z + PLATE_DEPTH));
    fish.under = dive > 0;
    fish.k = 1.4 * (1 - easeOut(THREE.MathUtils.clamp((u - FISH_IN[0]) / (FISH_IN[1] - FISH_IN[0]), 0, 1)));
    // the well lights the counter walls as you come close, and fades once you're past
    const near = Math.min(1, p / SPLIT);
    const peak = (geo.size * 0.6) ** 2 * 0.7; // scales with the letter size so the glow looks the same on every screen
    well.intensity = peak * (through ? 1 - smoothstep(SPLIT, SPLIT + 0.12, p) : 0.92 * near ** 3); // dark at rest, like the scene
    // ScrollTrigger reports tiny progress values while it measures; ignore those
    const a = p < 0.002 ? 1 : 1 - THREE.MathUtils.clamp(p / 0.18, 0, 1);
    if (a !== lastFade) gsap.set(fade, { autoAlpha: a }); // leaves the intro alone until scrolling starts
    lastFade = a;
  }
  let lastFade = 1;

  // ---- loop ------------------------------------------------------------------
  const clock = new THREE.Clock();
  let running = false;
  // the eye blinks now and then: a quick close and open, sometimes twice
  let nextBlink = 2.5;
  let blinkT = -1;
  function blink(dt) {
    if (import.meta.env.DEV && window.__freeze) return; // lets tests hold a blink pose
    const t = salmon.uniforms.uTime.value;
    if (blinkT < 0 && t > nextBlink) {
      blinkT = 0;
      nextBlink = t + 3 + Math.random() * 4;
      if (Math.random() < 0.25) nextBlink = t + 0.45; // double blink
    }
    if (blinkT >= 0) {
      blinkT += dt;
      const d = 0.22; // seconds closed-and-open
      salmon.uniforms.uBlink.value = Math.sin(Math.min(1, blinkT / d) * Math.PI);
      if (blinkT >= d) (blinkT = -1), (salmon.uniforms.uBlink.value = 0);
    }
  }

  // Where he is on the way in (intro.salmon: view widths right of his rest spot, set by
  // the intro tween), and how fast he's going, which drives the swim.
  let lastK = intro.salmon;
  let speed = 0;
  function placeSalmon(dt) {
    // on the splash: swimming in, then off to the left. Under the pool: swimming back in.
    const pose = fish.under ? poses.under : poses.splash;
    const k = fish.under ? fish.k : intro.salmon - intro.exit * 1.4; // + right of rest, - left
    const v = dt > 0 ? Math.abs(k - lastK) / dt : 0;
    lastK = k;
    speed += (Math.min(1, v / 0.55) - speed) * Math.min(1, dt * 6);
    const g = salmon.group;
    g.scale.setScalar(pose.scale);
    const o = swim.update(dt, speed, g.matrixWorld);
    const len = SALMON_LENGTH * pose.scale;
    g.position.set(pose.rest.x + k * pose.viewW + o.surge * len, pose.rest.y + o.bob * len, pose.rest.z);
    g.rotation.y = o.yaw;
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    salmon.uniforms.uTime.value += dt;
    blink(dt);
    placeSalmon(dt);
    scene01.tick(dt);
    scene02.tick(dt);
    rain.update(dt);
    renderer.render(scene, camera);
  }
  const io = new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    renderer.setAnimationLoop(running ? frame : null);
    clock.getDelta();
  });
  io.observe(splash);

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  };
  window.addEventListener('resize', onResize);

  layout();
  if (import.meta.env.DEV) window.__splash3d = { camera, scene, scene01, salmon, setProgress };

  return {
    // the title forms from stippled dots, then the salmon swims in under it
    intro() {
      const tl = gsap.timeline();
      intro.letters = title.letters.map(() => 0);
      const proxies = intro.letters.map(() => ({ t: 0 }));
      title.letters.forEach((l) => setLetterReveal(l, 0));
      tl.to(proxies, {
        t: 1,
        duration: 1.6,
        ease: 'power1.inOut',
        stagger: 0.06,
        onUpdate() {
          proxies.forEach((pr, i) => {
            intro.letters[i] = pr.t;
            if (title.letters[i]) setLetterReveal(title.letters[i], pr.t);
          });
        },
        onComplete: () => (intro.letters = null),
      });
      // the salmon swims in head first from beyond the right edge
      const s = { k: 1.1 };
      const place = () => (intro.salmon = s.k); // placeSalmon() applies it each frame
      place();
      tl.to(s, { k: 0, duration: 3.6, ease: 'power2.out', onUpdate: place }, 1.4);
      tl.fromTo(fade, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out', immediateRender: true }, 2.4);
      return tl;
    },
    showStill() {
      title.letters.forEach((l) => setLetterReveal(l, 1));
    },
    relayout: layout,
    enableZoom() {
      if (trigger) return;
      trigger = ScrollTrigger.create({
        trigger: splash,
        start: 'top top',
        end: `+=${TOTAL * 100}%`,
        pin: true,
        scrub: 0.6,
        onUpdate: (self) => setProgress(self.progress),
        onRefresh: (self) => setProgress(self.progress),
      });
    },
    // jump to where scene 01 is fully in (the Listen / Read buttons)
    goToScene(behavior = 'smooth') {
      if (!trigger) return;
      window.scrollTo({ top: trigger.start + (trigger.end - trigger.start) * ((LANDED * S1) / TOTAL), behavior });
    },
    destroy() {
      trigger?.kill(true);
      trigger = null;
      gsap.set(fade, { clearProps: 'opacity,visibility' });
      io.disconnect();
      window.removeEventListener('resize', onResize);
      renderer.setAnimationLoop(null);
      swim.dispose();
      disposeTitle3D(title);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
