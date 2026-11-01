import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { loadFonts, buildTitle3D, setLetterReveal, disposeTitle3D } from './title3d.js';
import { loadSalmon, createSwim, SALMON_LENGTH, SALMON_HEIGHT } from './salmon3d.js';
import { createScene01, IMG, PLATE_DEPTH } from './scene01.js';
import { createScene02 } from './scene02.js';
import { createScene03 } from './scene03.js';
import { createScene04 } from './scene04.js';
import { createScene05 } from './scene05.js';
import { createScene06 } from './scene06.js';
import { createRain } from './rain3d.js';

// The splash in 3D. World layout (camera never rotates, always looks down -z):
//
//   z = TITLE_Z + TITLE_DIST   camera start: the title fills the frame like the DOM layout
//   z = TITLE_Z                front faces of the extruded title
//   z = 0                      camera end: scene 01 framed exactly like its flat image
//   z = -9 … -14               the three trees
//   z = -30                    the painted plate (scene 01), and the pool's surface
//   z = -33                    camera, scene 02: under the water, its layers beyond
//   (and RISE_Y above it)      camera, scene 03: up on the river, Finegas on the bank
//   … and on down through it   camera, scene 04: through the river where his line goes in
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
// Then up: the salmon swims off, the camera rises through the water (scene 02's layers
// drop away below) and comes up on the river, where Finegas is fishing (scene 03).
// Then in: the camera follows his line down to where it goes into the river and through
// the water (a wash of river gold hides the crossing), and arrives close on the catch
// (scene 04), the salmon straining on that same line.
// Then along: to the right, to the fire, where Fionn is cooking him (scene 05).
// Then back: from the salmon on the fire to the same salmon on the grass, the next morning
// (scene 06). As the camera draws back the fire and the night fade from around him, the
// morning comes up, and he settles into the salmon lying beside Finegas and Fionn.

const TITLE_Z = 10;
const TITLE_DIST = 8;
const NEAR_FACE = 0.03; // how close to the front face the first phase gets
const SPLIT = 0.55; // share of the flight spent approaching the title
// The pinned scroll: the flight takes the first FLIGHT of it (the salmon swims off left at
// the start), then scene 01's text comes in and the dive starts straight after.
const FLIGHT = 0.907;
const TEXT_IN = [0.945, 0.985];
const LANDED = 0.99; // scene 01 fully in: where the Listen / Read buttons land
const SWIM_OFF = [0.007, 0.293];
// The whole pin, in screen heights of scroll. Scene 01 keeps its first S1 (all the
// fractions above are of that), then the dive and scene 02 follow. Each scene's way out starts
// where its text is fully in, so the next scroll after an arrival moves something.
const S1 = 2.4;
const TOTAL = 12.3;
const DIVE = [S1, 3.9];
const FISH_IN = [3.55, 4.25];
const FISH_GLIDE = 3; // how quickly he closes on his place in scene 02 (per second)
const TEXT2_IN = [4.2, 4.25];
const RISE = [4.25, 5.85];
const TEXT3_IN = [6.05, 6.1];
const DIVE4 = [6.1, 7.7];
const TEXT4_IN = [7.9, 7.95];
const PAN5 = [7.95, 9.75];
const TEXT5_IN = [9.95, 10.0];
const PULL6 = [10.0, 12.0];
const TEXT6_IN = [12.2, 12.25];
// Arrivals, in screen heights. From the first number, as a stretch of the rail is about to
// fill, the scene finishes coming in by itself: the rail fills, the camera lands and the text
// comes up, ending where the second number's scroll would have put them. The scroll itself is
// left alone, and has nothing to move until it passes the second number: that short gap is all
// that catches a flick's momentum before it carries on out of the scene.
const arrival = (from, text) => [from + (text[0] - from) * 0.85, text[1]];
const ARRIVALS = [
  [S1 * FLIGHT * 0.94, S1 * TEXT_IN[1]],
  arrival(DIVE[0], TEXT2_IN),
  arrival(RISE[0], TEXT3_IN),
  arrival(DIVE4[0], TEXT4_IN),
  arrival(PAN5[0], TEXT5_IN),
  arrival(PULL6[0], TEXT6_IN),
];
const LET_GO = 0.1; // how far back before an arrival undoes itself, so a nudge back doesn't
const SNAP = 5; // how quickly the scene closes on the scroll (per second; about 0.6s to land)
// shares of the way back: everything but the salmon fades from around him, scene 06 comes
// up out of the dark behind him (slowly, so Finegas and Fionn don't appear at once), the
// morning comes up, and he fades into the one on the grass
const LEAVE5 = [0, 0.35];
const SHOW6 = [0.12, 0.6];
const DAWN6 = [0.08, 0.92];
const SETTLE6 = [0.45, 0.75];
// Scene 04 opens out of scene 03's river at this size, just in front of it, so the camera
// keeps coming in at the same pace and the catch is as near as the river was
const CATCH_K = 0.45;
const REVEAL4 = [0.25, 0.8]; // share of the way in over which it opens out
const RISE_Y = 13; // how far up the river is from the camera's rest under the pool
const END_Z = -PLATE_DEPTH - 3; // the camera's rest under the water
const SURFACE = new THREE.Color('#2c5a1a');
const WELL = new THREE.Color('#9cc23a');

const easeIO = gsap.parseEase('power2.inOut');
const smoothstep = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export async function createSplash3D({ splash, host, titleEl, getTitle, salmonEl, fade, onScene, onChapter }) {
  // Only the title and the salmon hold up the opening. The scenes are built now, and their
  // images come in later (see the stages below).
  const [font, salmon] = await Promise.all([loadFonts(), loadSalmon()]);
  const scene01 = createScene01();
  const scene02 = createScene02();
  const scene03 = createScene03();
  const scene04 = createScene04();
  const scene05 = createScene05();
  const scene06 = createScene06();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' });
  const fullRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(fullRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.005, 80);
  scene.add(scene01.group, scene02.group, scene03.group, scene04.group, scene05.group, scene06.group, salmon.group, camera);
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
  let entry = null; // where Finegas's line goes into the river (world), once the way in to scene 04 starts
  let trigger = null;

  // ---- stages ----------------------------------------------------------------
  // Scene 01 is dark at rest, so its images follow once the page has settled, ready for the
  // first scroll. The rest wait for a sign of the reader, then come in one scene at a time,
  // the nearest first. A scene stays hidden until its images are all here.
  const ready = new Set();
  const uploads = [];
  let destroyed = false;
  const prepare = async (s) => {
    try {
      await s.assets.load();
      if (destroyed) return;
      // shaders and textures go up ahead of time, so a scene's arrival doesn't stall a frame
      for (const root of s.roots) await renderer.compileAsync(root, camera, scene);
      if (destroyed) return;
      uploads.push(...s.assets.textures);
      ready.add(s);
      setProgress(progress);
    } catch (e) {
      console.warn('Scene unavailable:', e);
    }
  };
  const later = [
    [scene02, RISE[1]],
    [scene03, DIVE4[1]],
    [scene04, PAN5[1]],
    [scene05, PULL6[1]],
    [scene06, TOTAL],
  ];
  const WAKE = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'keydown'];
  let woken = false;
  const wake = async () => {
    if (woken) return;
    woken = true;
    for (const e of WAKE) window.removeEventListener(e, wake);
    while (later.length && !destroyed) {
      const u = progress * TOTAL;
      const i = Math.max(0, later.findIndex(([, end]) => end >= u)); // a scene not yet left behind
      const [[s]] = later.splice(i, 1);
      await prepare(s);
    }
  };
  for (const e of WAKE) window.addEventListener(e, wake, { passive: true });
  const whenIdle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 200));
  whenIdle(() => destroyed || prepare(scene01), { timeout: 1500 });

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
    scene03.group.position.set(pool.x, pool.y + RISE_Y, END_Z);
    scene03.layout({ w: (t2End * W) / H, h: t2End });
    scene04.layout({ w: (t2End * W) / H, h: t2End });
    scene05.layout({ w: (t2End * W) / H, h: t2End });
    scene06.layout({ w: (t2End * W) / H, h: t2End });
    entry = null; // the line's way in is found again on the next way down
    // his head stays clear of scene 02's text, with room for the swim's surge
    const copy2 = splash.querySelector('.scene__copy[data-scene-copy="2"]')?.getBoundingClientRect();
    const clearX = copy2?.width ? (copy2.right - fr.left + Math.max(40, W * 0.035)) / W : 0;
    const fp = scene02.fishPose(SALMON_LENGTH, SALMON_HEIGHT, { w: (t2End * W) / H, h: t2End }, clearX);
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
    const rise = THREE.MathUtils.clamp((u - RISE[0]) / (RISE[1] - RISE[0]), 0, 1);
    const dive4 = THREE.MathUtils.clamp((u - DIVE4[0]) / (DIVE4[1] - DIVE4[0]), 0, 1);
    const pan5 = THREE.MathUtils.clamp((u - PAN5[0]) / (PAN5[1] - PAN5[0]), 0, 1);
    const pull6 = THREE.MathUtils.clamp((u - PULL6[0]) / (PULL6[1] - PULL6[0]), 0, 1);
    const p = Math.min(1, scroll / FLIGHT); // flight progress
    // the salmon carries on his way, off to the left, as the camera moves in
    intro.exit = smoothstep(SWIM_OFF[0], SWIM_OFF[1], scroll);
    onScene?.(1, smoothstep(TEXT_IN[0], TEXT_IN[1], scroll) * (1 - smoothstep(0, 0.1, dive)));
    onScene?.(2, smoothstep(TEXT2_IN[0], TEXT2_IN[1], u) * (1 - smoothstep(0, 0.1, rise)));
    onScene?.(3, smoothstep(TEXT3_IN[0], TEXT3_IN[1], u) * (1 - smoothstep(0, 0.1, dive4)));
    onScene?.(4, smoothstep(TEXT4_IN[0], TEXT4_IN[1], u) * (1 - smoothstep(0, 0.1, pan5)));
    onScene?.(5, smoothstep(TEXT5_IN[0], TEXT5_IN[1], u) * (1 - smoothstep(0, 0.1, pull6)));
    onScene?.(6, smoothstep(TEXT6_IN[0], TEXT6_IN[1], u));
    // the rail's first stretch fills on the way in, the second on the way down, the third on
    // the way up, the fourth on the way in through the river, the fifth on the way along, the
    // sixth on the way back
    onChapter?.(
      pull6 > 0
        ? 5 + smoothstep(0, 1, (u - PULL6[0]) / (TEXT6_IN[0] - PULL6[0]))
        : pan5 > 0
        ? 4 + smoothstep(0, 1, (u - PAN5[0]) / (TEXT5_IN[0] - PAN5[0]))
        : dive4 > 0
        ? 3 + smoothstep(0, 1, (u - DIVE4[0]) / (TEXT4_IN[0] - DIVE4[0]))
        : rise > 0
        ? 2 + smoothstep(0, 1, (u - RISE[0]) / (TEXT3_IN[0] - RISE[0]))
        : dive > 0
          ? 1 + smoothstep(0, 1, (u - DIVE[0]) / (TEXT2_IN[0] - DIVE[0]))
          : p,
    );
    // the river's surface in scene 03 (its painting), which the way in to scene 04 goes through
    const riverZ = scene03.group.position.z + scene03.lineEntry().z;
    const reveal4 = smoothstep(REVEAL4[0], REVEAL4[1], dive4);
    if (dive4 > 0) {
      // in along Finegas's line, towards where it goes into the river: the catch opens out
      // from there, the salmon breaking the water where the line went in, and the camera
      // comes to rest framing it
      entry ??= scene03.lineEntry().add(scene03.group.position);
      const at = scene04.focus().multiplyScalar(CATCH_K);
      scene04.group.scale.setScalar(CATCH_K);
      scene04.group.position.set(entry.x - at.x, entry.y - at.y, riverZ + 0.03 - at.z);
      scene04.setReveal(reveal4);
      const g = smoothstep(0, 0.8, dive4);
      camera.position.set(
        THREE.MathUtils.lerp(geo.pool.x, scene04.group.position.x, g),
        THREE.MathUtils.lerp(geo.pool.y + RISE_Y, scene04.group.position.y, g),
        THREE.MathUtils.lerp(END_Z, scene04.group.position.z, easeIO(dive4)),
      );
      // then along to the right, to scene 05: a new place, a new time. It lies beside the
      // catch at the same size and depth, the two paintings edge to edge.
      if (pan5 > 0) {
        scene05.group.scale.setScalar(CATCH_K);
        scene05.group.position.copy(scene04.group.position);
        scene05.group.position.x += CATCH_K * (scene04.edge(1) - scene05.edge(-1));
        camera.position.x = THREE.MathUtils.lerp(scene04.group.position.x, scene05.group.position.x, easeIO(pan5));
      }
      scene04.setLeave(smoothstep(0, 0.12, pan5));
      // then back, to scene 06, the next morning. It lies where scene 05 was, at the same
      // size; scene 05 shrinks about the camera to sit on it, its salmon over the one on
      // the grass (belly on belly) and just in front, so the view is just as it was, and the camera draws
      // back from there to scene 06's rest.
      if (pull6 > 0) {
        const rest = scene05.group.position.clone();
        scene06.group.scale.setScalar(CATCH_K);
        scene06.group.position.copy(rest);
        const f5 = scene05.fish();
        const f6 = scene06.fish();
        const k5 = (CATCH_K * f6.len) / f5.len;
        scene05.group.scale.setScalar(k5);
        scene05.group.position.set(
          rest.x + CATCH_K * f6.x - k5 * f5.x,
          rest.y + CATCH_K * f6.y - k5 * f5.y,
          rest.z + CATCH_K * f6.z - k5 * f5.z + 0.002,
        );
        camera.position.lerpVectors(scene05.group.position, rest, easeIO(pull6));
      }
      scene05.setLeave(smoothstep(LEAVE5[0], LEAVE5[1], pull6), 1 - smoothstep(SETTLE6[0], SETTLE6[1], pull6));
      scene06.setShow(smoothstep(SHOW6[0], SHOW6[1], pull6));
      scene06.setDawn(smoothstep(DAWN6[0], DAWN6[1], pull6));
    } else if (rise > 0) {
      entry = null;
      camera.position.set(geo.pool.x, geo.pool.y + RISE_Y * easeIO(rise), END_Z);
    } else camera.position.copy(dive > 0 ? diveAt(dive) : cameraAt(p));
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
    const scene01Bright = smoothstep(0.04, SPLIT * 0.8, p);
    scene01.setBrightness(scene01Bright); // hidden at rest, fades up as you scroll in
    scene01.setRippleFade(1 - 0.85 * smoothstep(0.2, 0.75, dive)); // calm before the plunge
    scene01.setNuts(p >= 0.99 && dive === 0); // hazelnuts drop now and then while you rest on scene 01
    mask.visible = !through;
    // through the surface: scene 01 is behind now, scene 02 opens up around the camera
    const z = camera.position.z;
    const under = z < -PLATE_DEPTH;
    scene01.group.visible = !under && ready.has(scene01) && scene01Bright > 0;
    scene01.foreground.visible &&= ready.has(scene01);
    rain.mesh.visible = z > -PLATE_DEPTH + 1;
    scene02.setBrightness(smoothstep(-PLATE_DEPTH + 1.2, -PLATE_DEPTH - 0.4, z));
    // the leaves part outwards again as the camera starts up
    scene02.setArrive(smoothstep(0.78, 1, dive) * (1 - smoothstep(0, 0.35, rise)));
    scene02.setRiver(smoothstep(0.05, 0.75, rise)); // the water takes on the river's green as you come up
    // the water's surface: a wash as the camera plunges through the pool (coming up into
    // scene 03 needs none: the river fades into the water below it)
    surface.material.opacity = 1 - smoothstep(0.15, 2.4, Math.abs(z + PLATE_DEPTH));
    scene03.group.visible = rise > 0 && reveal4 < 1;
    if (dive4 > 0 || !ready.has(scene02)) scene02.group.visible = scene02.front.visible = false; // its water would cover the catch
    scene03.group.visible &&= ready.has(scene03);
    scene04.group.visible = reveal4 > 0 && pan5 < 1 && ready.has(scene04);
    scene05.group.visible = pan5 > 0 && pull6 < SETTLE6[1] && ready.has(scene05);
    scene06.group.visible = pull6 > 0 && ready.has(scene06);
    scene03.setActive(u >= TEXT3_IN[0] && dive4 === 0); // Finegas casts now and then once you've arrived
    fish.under = dive > 0;
    // in from the right, then off to the left as the camera rises
    fish.k = 1.4 * (1 - smoothstep(FISH_IN[0], FISH_IN[1], u)) - 1.8 * smoothstep(0, 0.5, rise);
    // the well lights the counter walls as you come close, and fades once you're past
    const near = Math.min(1, p / SPLIT);
    const peak = (geo.size * 0.6) ** 2 * 0.7; // scales with the letter size so the glow looks the same on every screen
    well.intensity = peak * (through ? 1 - smoothstep(SPLIT, SPLIT + 0.12, p) : 0.92 * near ** 3); // dark at rest, like the scene
    // ScrollTrigger reports tiny progress values while it measures; ignore those
    const a = p < 0.002 ? 1 : 1 - THREE.MathUtils.clamp(p / 0.18, 0, 1);
    // leaves the intro alone until scrolling starts; once it has, the intro's fade in (if it
    // hasn't run yet, as when the page opens part way down) mustn't bring them back
    if (a !== lastFade) {
      if (a < 1) gsap.killTweensOf(fade);
      gsap.set(fade, { autoAlpha: a, y: 0 });
    }
    lastFade = a;
  }
  let lastFade = 1;

  // ---- arrivals --------------------------------------------------------------
  let want = 0; // where the scene should be, in screen heights
  let arriving = null; // the arrival the scroll is inside
  let catching = false; // the scene is closing on `want` by itself, each frame
  function follow(pin) {
    const u = pin * TOTAL;
    const was = arriving;
    if (arriving && (u >= arriving[1] || u < arriving[0] - LET_GO)) arriving = null;
    arriving ??= ARRIVALS.find(([from, to]) => u >= from && u < to) ?? null;
    want = arriving ? arriving[1] : u;
    catching ||= arriving !== was;
    if (!catching) setProgress(want / TOTAL);
  }
  function catchUp(dt) {
    const at = progress * TOTAL;
    const next = Math.abs(want - at) < 0.002 ? want : at + (want - at) * (1 - Math.exp(-SNAP * dt));
    catching = next !== want;
    setProgress(next / TOTAL);
  }

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
    // under the pool he glides after where the scroll puts him, so its steps don't jerk him along
    fish.at = fish.under ? (fish.at ?? fish.k) + (fish.k - (fish.at ?? fish.k)) * (1 - Math.exp(-FISH_GLIDE * dt)) : null;
    const k = fish.under ? fish.at : intro.salmon - intro.exit * 1.4; // + right of rest, - left
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

  // Sharpness gives way once if a device can't keep up: after a run of slow frames the canvas
  // drops to a lower pixel ratio, and it never drops on a device that can. Not counted: the
  // opening seconds and uploads, which are slow anywhere, and long gaps, which are pauses.
  const SLOW = 22; // ms, averaged over a run of frames
  const RUN = 60;
  let eased = fullRatio <= 1.5;
  let slowSum = 0;
  let slowCount = 0;
  function watchPace(rawDt) {
    if (eased || clock.elapsedTime < 3 || uploads.length || rawDt > 0.25) return;
    slowSum += rawDt * 1000;
    if (++slowCount < RUN) return;
    if (slowSum / slowCount > SLOW) {
      eased = true;
      renderer.setPixelRatio(1.5);
    }
    slowSum = slowCount = 0;
  }

  function frame() {
    const rawDt = clock.getDelta();
    watchPace(rawDt);
    const dt = Math.min(rawDt, 0.05);
    if (catching) catchUp(dt);
    if (uploads.length) renderer.initTexture(uploads.shift()); // one a frame
    salmon.uniforms.uTime.value += dt;
    blink(dt);
    placeSalmon(dt);
    if (scene01.group.visible) scene01.tick(dt);
    if (scene02.group.visible) scene02.tick(dt);
    if (scene03.group.visible) scene03.tick(dt);
    if (scene04.group.visible) scene04.tick(dt);
    if (scene05.group.visible) scene05.tick(dt);
    if (scene06.group.visible) scene06.tick(dt);
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
      // opened part way down: the reader is already in the story
      if (window.scrollY > 0) requestAnimationFrame(wake);
      trigger = ScrollTrigger.create({
        trigger: splash,
        start: 'top top',
        end: `+=${TOTAL * 100}%`,
        pin: true,
        scrub: 0.6,
        onUpdate: (self) => follow(self.progress),
        // a new layout, or a page opened part way down: straight there, with no arrival to watch
        onRefresh: (self) => {
          catching = false;
          arriving = null;
          follow(self.progress);
          catching = false;
          setProgress(want / TOTAL);
        },
      });
    },
    // jump to where scene 01 is fully in (the Listen / Read buttons)
    goToScene(behavior = 'smooth') {
      if (!trigger) return;
      window.scrollTo({ top: trigger.start + (trigger.end - trigger.start) * ((LANDED * S1) / TOTAL), behavior });
    },
    destroy() {
      destroyed = true;
      for (const e of WAKE) window.removeEventListener(e, wake);
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
