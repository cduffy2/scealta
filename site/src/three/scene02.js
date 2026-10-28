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
export const BG = new THREE.Color('#000600');
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
  const sprite = (name, w, h) => {
    const m = new THREE.MeshBasicMaterial({ map: tex[name], transparent: true, depthWrite: false });
    materials.push(m);
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  };
  // a full-frame layer's box (in frame px) as a plane at depth d
  const layer = (name, d) => {
    const b = manifest.layers[name];
    const mesh = sprite(name, (b.w * d) / FW, (b.h * d) / FW);
    const c = toWorld(b.x + b.w / 2, b.y + b.h / 2, d);
    mesh.position.set(c.x, c.y, -d);
    return mesh;
  };

  // the dark water behind everything, well past the furthest layer
  const backMat = new THREE.MeshBasicMaterial({ color: BG, transparent: true });
  materials.push(backMat);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), backMat);
  back.position.z = -24;
  back.renderOrder = -2;
  group.add(back);

  const particles = layer('s02_particles', DEPTH.particles);
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
    for (const m of materials) m.opacity = k;
    group.visible = front.visible = k > 0;
  }

  // where the 3D salmon goes (camera-relative). Landscape: head tip on the painted one,
  // same height. Portrait (Figma: Mobile 02): across the top quarter, head near the left
  // edge, so the text can sit below him. view: the view's width and height per unit depth.
  function fishPose(length, height, view) {
    const d = FISH.depth;
    if (view.w < view.h) {
      const scale = (view.h * d * 0.25) / height;
      return { x: -view.w * d * 0.45 + (length * scale) / 2, y: view.h * d * 0.3, z: -d, scale, viewW: view.w * d };
    }
    const h = ((FISH.bottom - FISH.top) * d) / FW;
    const scale = h / height;
    const tip = toWorld(FISH.tipX, (FISH.top + FISH.bottom) / 2, d);
    return { x: tip.x + (length * scale) / 2, y: tip.y, z: -d, scale, viewW: view.w * d };
  }

  setArrive(0);
  setBrightness(0);
  return { group, front, layout, setArrive, setBrightness, tick, fishPose };
}
