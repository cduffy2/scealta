import * as THREE from 'three';
import { gsap } from 'gsap';
import manifest from './s02-layers.json';

// Scene 02, under the pool: the painting rebuilt as layers in depth, so the camera can
// arrive into it after diving through scene 01's water. The salmon itself is the 3D one
// from the splash (placed by splash3d.js, using fishPose() below).
//
// Everything is placed relative to the camera's final position (origin, looking down -z),
// like scene 01's foreground: at depth d the painting's frame is d units wide. On screens
// taller than 16:9 the view shows more above and below the painting, so the leaf corners
// are pinned to the screen's corners rather than the painting's.

const [FW, FH] = manifest.frame; // the painting's frame, 2912 x 1632
// the water: peaty green, lighter up towards the surface and deeper below. BG is the upper
// water, which scene 03's river fades down into on the rise. Coming up, both shift to the
// river's own deep green (sampled from the foot of its painting), so by the time you
// arrive the water below the river matches it (setRiver).
export const BG = new THREE.Color('#163020');
const DEEP = new THREE.Color('#040c07');
const WATER = [BG.clone(), DEEP.clone()];
const RIVER = [new THREE.Color('#0b3006'), new THREE.Color('#031a03')];
const SHAFT = new THREE.Color('#d6e8a8'); // light falling from the surface
const DEPTH = { particles: 13, leaves: 3.2, nuts: [5.5, 9] };
// the painted salmon: head tip and vertical extent in the frame (from s02_salmon.png, doubled)
const FISH = { tipX: 754, top: 250, bottom: 1270, depth: 10 };

const toWorld = (px, py, d) => ({ x: ((px - FW / 2) * d) / FW, y: ((FH / 2 - py) * d) / FW });

export async function loadScene02() {
  const loader = new THREE.TextureLoader();
  const load = (name) =>
    loader.loadAsync(`/images/s02/${name}.webp`).then((t) => ((t.colorSpace = THREE.SRGBColorSpace), (t.anisotropy = 4), t));
  const names = [...Object.keys(manifest.layers), ...manifest.nuts.map((n) => n.name)];
  const tex = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await load(n)])));

  const group = new THREE.Group();
  const materials = [];
  const sprite = (name, w, h, opacity = 1) => {
    const m = new THREE.MeshBasicMaterial({ map: tex[name], transparent: true, depthWrite: false });
    m.userData.opacity = opacity;
    materials.push(m);
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  };
  // a full-frame layer's box (in frame px) as a plane at depth d
  const layer = (name, d, opacity) => {
    const b = manifest.layers[name];
    const mesh = sprite(name, (b.w * d) / FW, (b.h * d) / FW, opacity);
    const c = toWorld(b.x + b.w / 2, b.y + b.h / 2, d);
    mesh.position.set(c.x, c.y, -d);
    return mesh;
  };

  // the water behind everything, well past the furthest layer: darker with depth, with
  // shafts of light slanting down from the surface and slowly swaying
  const waterTime = { value: 0 };
  const backMat = new THREE.MeshBasicMaterial({ transparent: true });
  backMat.userData.opacity = 1;
  backMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uTop: { value: BG }, uDeep: { value: DEEP }, uShaft: { value: SHAFT }, uTime: waterTime });
    shader.vertexShader = `varying vec2 vPos;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvPos = position.xy;',
    );
    // at this depth the view is about 13 units tall, centred on y = 0
    shader.fragmentShader = `uniform vec3 uTop;\nuniform vec3 uDeep;\nuniform vec3 uShaft;\nuniform float uTime;\nvarying vec2 vPos;\n${shader.fragmentShader}`.replace(
      '#include <color_fragment>',
      `
      float y = vPos.y;
      vec3 water = mix(uDeep, uTop, smoothstep(-8.0, 6.5, y));
      float x = vPos.x + y * 0.32;
      float shafts =
        0.6 * pow(0.5 + 0.5 * sin(x * 0.55 + sin(x * 0.21 + uTime * 0.11) * 1.4 + uTime * 0.04), 7.0) +
        0.4 * pow(0.5 + 0.5 * sin(x * 1.35 - uTime * 0.06 + 1.7), 11.0);
      shafts *= smoothstep(-7.5, 7.0, y);
      diffuseColor.rgb = water + uShaft * shafts * 0.09;
      `,
    );
  };
  materials.push(backMat);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), backMat);
  back.position.z = -24;
  back.renderOrder = -2;
  group.add(back);

  // the far specks sink into the murk, so they read as motes in the water, not stars
  const particles = layer('s02_particles', DEPTH.particles, 0.6);
  particles.renderOrder = -1;
  group.add(particles);

  // hazelnuts, nearer ones larger; each drifts and turns a little on its own
  const nuts = manifest.nuts.map((n, i) => {
    const d = THREE.MathUtils.lerp(DEPTH.nuts[0], DEPTH.nuts[1], (i * 0.618) % 1);
    const mesh = sprite(n.name, (n.w * d) / FW, (n.h * d) / FW);
    const c = toWorld(n.cx, n.cy, d);
    mesh.position.set(c.x, c.y, -d);
    group.add(mesh);
    return { mesh, base: c, d, seed: i * 2.1 };
  });

  // leaf corners, nearest the camera; they part as you arrive. They travel with the camera
  // (splash3d adds `front` to it), so they're framed to the screen even while it's still
  // sinking into place.
  const front = new THREE.Group();
  const leaves = ['tl', 'tr', 'bl', 'br'].map((k) => {
    const mesh = layer(`s02_hazel-leaves_${k}`, DEPTH.leaves);
    front.add(mesh);
    return { mesh, sx: k[1] === 'l' ? -1 : 1, sy: k[0] === 't' ? 1 : -1, base: mesh.position.clone() };
  });

  let extraY = 0; // how much taller the view is than the painting, per unit depth (half)
  function layout(viewH) {
    // viewH: view height per unit depth at the end (the camera's t2)
    extraY = Math.max(0, (viewH - FH / FW) / 2);
  }

  // arrive 0 -> 1: the leaves drift in from just beyond their corners (always outwards of
  // their place: each layer is cut straight where the painting's frame ends, so those
  // edges stay off screen), and the nuts settle.
  const ease = gsap.parseEase('power2.out');
  let arrival = 0;
  function setArrive(a) {
    arrival = a;
    const k = 1 - ease(a);
    const d = DEPTH.leaves;
    for (const l of leaves) {
      const { width: w, height: h } = l.mesh.geometry.parameters;
      l.mesh.position.set(l.base.x + l.sx * k * w * 0.5, l.base.y + l.sy * (extraY * d + k * h * 0.6), l.base.z);
    }
  }

  let time = 0;
  function tick(dt) {
    time += dt;
    waterTime.value = time;
    for (const n of nuts) {
      const s = n.seed;
      n.mesh.position.x = n.base.x + Math.sin(time * 0.23 + s) * 0.012 * n.d;
      n.mesh.position.y = n.base.y + Math.sin(time * 0.31 + s * 1.3) * 0.016 * n.d + (1 - ease(arrival)) * 0.05 * n.d;
      n.mesh.rotation.z = Math.sin(time * 0.17 + s) * 0.25;
    }
    for (const l of leaves) l.mesh.rotation.z = Math.sin(time * 0.4 + l.sx + l.sy * 2) * 0.01;
  }

  // 0 -> 1 as the camera comes through the surface
  function setBrightness(k) {
    for (const m of materials) m.opacity = k * m.userData.opacity;
    group.visible = front.visible = k > 0;
  }

  // where the 3D salmon goes (camera-relative). Landscape: head tip on the painted one,
  // same height, but never under the text: clearX is the share of the view's width, from
  // the left, that his head must stay right of. Portrait (Figma: Mobile 02): across the top
  // quarter, head near the left edge, so the text can sit below him. view: the view's
  // width and height per unit depth.
  function fishPose(length, height, view, clearX = 0) {
    const d = FISH.depth;
    if (view.w < view.h) {
      const scale = (view.h * d * 0.25) / height;
      return { x: -view.w * d * 0.45 + (length * scale) / 2, y: view.h * d * 0.3, z: -d, scale, viewW: view.w * d };
    }
    const h = ((FISH.bottom - FISH.top) * d) / FW;
    const scale = h / height;
    const tip = toWorld(FISH.tipX, (FISH.top + FISH.bottom) / 2, d);
    tip.x = Math.max(tip.x, (clearX - 0.5) * view.w * d);
    return { x: tip.x + (length * scale) / 2, y: tip.y, z: -d, scale, viewW: view.w * d };
  }

  // 0 -> 1 on the rise into scene 03: the water turns to the river's green (BG is shared
  // with scene 03's river, so it follows)
  function setRiver(k) {
    BG.lerpColors(WATER[0], RIVER[0], k);
    DEEP.lerpColors(WATER[1], RIVER[1], k);
  }

  setArrive(0);
  setBrightness(0);
  return { group, front, layout, setArrive, setBrightness, setRiver, tick, fishPose };
}
