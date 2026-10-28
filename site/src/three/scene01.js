import * as THREE from 'three';
import { gsap } from 'gsap';
import { gltfLoader } from './salmon3d.js';

// Scene 01 as layers in depth: the original painting as the plate, and separately
// generated foreground pieces (trees A and B, a band of bushes) as inflated meshes.
// The foreground travels with the camera (so it never swells as the camera flies in) and
// eases into place once you're through the title: the bushes rise from below the frame,
// the trees slide in from either side, then sway a little. Positions are camera-relative at
// the end of the flight (origin, looking down -z); at depth d the frame is about d units
// wide and 0.56 d tall on a 16:9 screen.

export const IMG = { w: 2912, h: 1632 };
export const PLATE_DEPTH = 30;
// The new pieces are brighter than the night painting; tint them down to sit in it.
const LAYER_TINT = 0.72;
// [mesh, x, y (centre), depth, scale, mirrored]. Tree bases sit behind the bushes.
const PLACES = [
  ['s01_tree_a', -3.1, -0.14, 8, 2.5, false],
  ['s01_tree_b', 3.85, -0.19, 9.5, 2.9, false],
  ['s01_bushes', -3.3, -1.62, 6, 1.38, false],
  ['s01_bushes', 0, -1.7, 6.2, 1.38, true],
  ['s01_bushes', 3.3, -1.62, 6, 1.38, false],
];

// at depth d the frame is d units wide (the camera's cover framing assumes this)
export const imageToWorld = (px, py, d) => ({
  x: ((px - IMG.w / 2) * d) / IMG.w,
  y: ((IMG.h / 2 - py) * d) / IMG.w,
});

export async function loadScene01() {
  const [gltf, plateTex, nutTex] = await Promise.all([
    gltfLoader().loadAsync('/3d/s01-layers.glb'),
    new THREE.TextureLoader().loadAsync('/images/s01-calm-2912.webp'),
    new THREE.TextureLoader().loadAsync('/images/s02/s02_hazelnut_01.webp'),
  ]);
  const group = new THREE.Group();
  const materials = []; // [material, base brightness]

  plateTex.colorSpace = THREE.SRGBColorSpace;
  plateTex.anisotropy = 4;
  plateTex.wrapS = plateTex.wrapT = THREE.MirroredRepeatWrapping;
  // The plate runs well past the painting's frame: the foliage carries on (mirrored),
  // then fades to night, so the frame's edges never show while the camera approaches.
  const F = 2.2;
  const w = PLATE_DEPTH * 1.003;
  const geom = new THREE.PlaneGeometry(w * F, ((w * IMG.h) / IMG.w) * F, 44, 44);
  const uv = geom.attributes.uv;
  const colors = [];
  for (let i = 0; i < uv.count; i++) {
    const u = (uv.getX(i) - 0.5) * F + 0.5;
    const v = (uv.getY(i) - 0.5) * F + 0.5;
    uv.setXY(i, u, v);
    const out = Math.max(0, -u, u - 1, -v, v - 1); // distance outside the painting, in frames
    const k = THREE.MathUtils.lerp(1, 0, THREE.MathUtils.smoothstep(out, 0.02, 0.18));
    colors.push(k, k, k);
  }
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTex, vertexColors: true, transparent: true });
  const plate = new THREE.Mesh(geom, plateMat);
  plate.position.z = -PLATE_DEPTH;
  plate.renderOrder = -1; // transparent (for the fade), so pin it first: always behind the rings
  group.add(plate);
  materials.push([plateMat, 1]);

  const sources = {};
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const old = o.material;
    old.map.colorSpace = THREE.SRGBColorSpace;
    // unlit, so the colours match the painting
    const mat = new THREE.MeshBasicMaterial({ map: old.map, alphaTest: 0.5, side: THREE.DoubleSide, transparent: true });
    old.dispose();
    o.material = mat;
    materials.push([mat, LAYER_TINT]);
    sources[o.name.replace(/\.?\d+$/, '')] = o;
  });
  const foreground = new THREE.Group();
  const layers = [];
  for (const [name, x, y, d, scale, mirrored] of PLACES) {
    const src = sources[name];
    if (!src) continue;
    src.geometry.computeBoundingBox();
    const bb = src.geometry.boundingBox;
    const h = (bb.max.y - bb.min.y) * scale;
    // pivot at the base, so trees sway from the ground
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(src.geometry, src.material);
    mesh.scale.set(mirrored ? -scale : scale, scale, scale);
    mesh.position.y = h / 2;
    pivot.add(mesh);
    pivot.position.set(x, y - h / 2, -d);
    foreground.add(pivot);
    const tree = name.includes('tree');
    const w = (bb.max.x - bb.min.x) * scale;
    layers.push({
      pivot,
      baseX: x,
      baseY: pivot.position.y,
      drop: d * 0.56 * 0.6, // bushes: from below the frame
      slide: Math.sign(x) * (d * 0.5 - Math.abs(x) + w * 0.6), // trees: from just outside their edge
      tree,
      seed: layers.length * 1.7,
      d,
      w,
      h,
    });
  }
  // bushes first, then the trees
  const order = [...layers.filter((l) => !l.tree), ...layers.filter((l) => l.tree)];
  const rise = gsap.parseEase('power3.out'); // settles without overshoot
  function setRise(r) {
    foreground.visible = r > 0;
    order.forEach((l, i) => {
      const a = (i / order.length) * 0.45;
      const t = THREE.MathUtils.clamp((r - a) / 0.55, 0, 1);
      const k = 1 - rise(t);
      if (l.tree) l.pivot.position.x = l.baseX + l.slide * k;
      else l.pivot.position.y = l.baseY - l.drop * k;
    });
  }
  let time = 0;
  function sway(dt) {
    time += dt;
    for (const l of layers) if (l.tree) l.pivot.rotation.z = Math.sin(time * 0.7 + l.seed) * 0.012;
  }
  setRise(0);

  // Ripples: the pool's rings, drawn in a shader over the calm plate (its painted rings are
  // removed) so they move outward and stay sharp at any zoom.
  const ripples = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uBright: { value: 0 }, uFade: { value: 1 }, uColor: { value: new THREE.Color('#d8f080') } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime, uBright, uFade;
      uniform vec3 uColor;
      void main() {
        // pool centre and radii in the painting (v up), rings are wide flat ellipses
        vec2 d = (vUv - vec2(0.505, 0.22)) / vec2(0.34, 0.125);
        float r = length(d);
        if (r > 1.15) discard;
        // rings travel outward; each line is a thin bright stroke, slightly uneven
        float ph = r * 9.0 - uTime * 0.35;
        float d2 = abs(fract(ph) - 0.5) * 2.0;                     // 0 on a ring, 1 between
        float aa = fwidth(ph) * 2.0;
        float w = 0.16 + 0.05 * sin(atan(d.y, d.x) * 7.0 + floor(ph) * 2.3);
        float line = 1.0 - smoothstep(w, w + aa, 1.0 - d2);
        line = 1.0 - line;
        line = smoothstep(1.0 - w - aa, 1.0 - w, 1.0 - d2) * 0.0 + (1.0 - smoothstep(w - aa, w + aa, d2));
        // when lines are finer than a pixel (far away), blend to an even glow: no shimmer
        line = mix(line, w, smoothstep(0.35, 1.0, fwidth(ph)));
        float pulse = 0.65 + 0.35 * sin(floor(ph) * 1.7 + uTime * 0.4); // rings vary in strength
        float fade = (1.0 - smoothstep(0.75, 1.15, r)) * smoothstep(0.0, 0.08, r);
        float band = line * pulse * fade;
        float rings = 1.0;
        // additive: the colour is weighted by alpha, and alpha must fall to 0 too, or the
        // rings' plane paints opaque black over the page while the scene is hidden
        gl_FragColor = vec4(uColor, band * 0.85 * uBright * uFade);
      }`,
  });
  const ripple = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * IMG.h) / IMG.w), ripples);
  // clear of the plate by a few depth-buffer steps (near is 0.005, so precision is coarse
  // out here), and drawn after the plate and the layers so the bushes still cover it
  ripple.position.z = -PLATE_DEPTH + 0.1;
  ripple.renderOrder = 1;
  group.add(ripple);
  materials.push([ripples, null]);

  // Now and then a hazelnut drops from one of the two near trees into the pool. It falls
  // in the trees' layer, from inside the crown on the side nearest the pool, to the spot on
  // screen where the pool lies beneath it; a small ring then spreads on the water there
  // (the same point on the plate, along the camera's line of sight). Only while resting on
  // scene 01 (camera at its end point: foreground and plate are both camera-centred then).
  nutTex.colorSpace = THREE.SRGBColorSpace;
  const nutMat = new THREE.MeshBasicMaterial({ map: nutTex, transparent: true, alphaTest: 0.4, depthWrite: false });
  materials.push([nutMat, 0.85]);
  const nut = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), nutMat);
  nut.visible = false;
  foreground.add(nut);
  const splashMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uAge: { value: 1 }, uBright: { value: 0 }, uColor: { value: new THREE.Color('#d8f080') } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform float uAge, uBright;
      uniform vec3 uColor;
      void main() {
        float r = length((vUv - 0.5) * 2.0);
        // two thin rings, the second a moment behind the first, growing and fading out
        float a = 0.0;
        for (int i = 0; i < 2; i++) {
          float t = clamp(uAge - float(i) * 0.18, 0.0, 1.0);
          float rad = 0.12 + 0.85 * (1.0 - pow(1.0 - t, 2.0));
          float aa = fwidth(r) * 1.5;
          a += (1.0 - smoothstep(0.035, 0.035 + aa, abs(r - rad))) * (1.0 - t) * step(0.001, t);
        }
        gl_FragColor = vec4(uColor, a * 0.55 * uBright);
      }`,
  });
  materials.push([splashMat, null]);
  // flat on the water like the pool's own rings (they're 0.34 x 0.125 of the frame)
  const splash = new THREE.Mesh(new THREE.PlaneGeometry(1.5, (1.5 * 0.125 * IMG.h) / (0.34 * IMG.w)), splashMat);
  splash.position.z = -PLATE_DEPTH + 0.12;
  splash.renderOrder = 2;
  splash.visible = false;
  group.add(splash);

  const trees = layers.filter((l) => l.tree);
  const POOL = { u: 0.505, v: 0.22, ru: 0.34, rv: 0.125 }; // the rings' ellipse on the plate (v up)
  const plateH = (w * IMG.h) / IMG.w;
  let fall = null; // { t, T, x0, y0, y1, plate: {x, y}, spin }
  let splashAge = 1;
  let wait = 4;
  let dropping = false;
  function dropNut() {
    const tree = trees[Math.floor(Math.random() * trees.length)];
    const d = tree.d + 0.25; // just behind the crown's front, so it emerges from the leaves
    const inward = -Math.sign(tree.baseX);
    // a column at the crown's inner edge (the part that hangs over the pool), at the nut's
    // depth: it slips out from the leaves there and is seen all the way down
    const x = ((tree.baseX + inward * tree.w * (0.46 + Math.random() * 0.08)) * d) / tree.d;
    const u = 0.5 + x / d; // where that column meets the plate, as a fraction of its width
    const du = (u - POOL.u) / POOL.ru;
    if (Math.abs(du) > 0.96) return; // that column misses the water
    const v = POOL.v + (Math.random() - 0.2) * POOL.rv * Math.sqrt(1 - du * du) * 0.7;
    const py = (v - 0.5) * plateH;
    const y1 = (py * d) / PLATE_DEPTH;
    const y0 = ((tree.baseY + tree.h * (0.5 + Math.random() * 0.15)) * d) / tree.d;
    if (y0 <= y1) return;
    const size = 0.075 * (d / 8);
    nut.scale.set(size, size, 1);
    fall = { t: 0, T: 1.1 + 0.3 * Math.sqrt((y0 - y1) / d), x0: x, y0, y1, d, plate: { x: (x * PLATE_DEPTH) / d, y: py }, spin: (Math.random() - 0.5) * 6 };
  }
  function nuts(dt) {
    if (fall) {
      fall.t += dt;
      const k = Math.min(1, fall.t / fall.T);
      nut.visible = true;
      nut.position.set(fall.x0 + Math.sin(k * 5) * 0.012 * fall.d, fall.y0 + (fall.y1 - fall.y0) * k * k, -fall.d);
      nut.rotation.z = fall.spin * k;
      nutMat.opacity = Math.min(1, fall.t / 0.15);
      if (k >= 1) {
        nut.visible = false;
        splash.position.x = fall.plate.x;
        splash.position.y = fall.plate.y;
        splashAge = 0;
        fall = null;
      }
    } else if (dropping && (wait -= dt) <= 0) {
      wait = 6 + Math.random() * 6;
      dropNut();
    }
    if (splashAge < 1) splashAge = Math.min(1, splashAge + dt / 2.6);
    splash.visible = splashAge < 1;
    splashMat.uniforms.uAge.value = splashAge;
  }
  if (import.meta.env.DEV) window.__nuts = () => ({ fall, wait, dropping, splashAge, nut: nut.position.toArray().map((v) => +v.toFixed(2)) });
  // on only while resting on scene 01; a nut already falling finishes its fall
  const setNuts = (on) => {
    if (on && !dropping) wait = 2 + Math.random() * 3;
    dropping = on;
  };

  // seen only through the portal letter until the camera passes the title
  function setMasked(masked) {
    for (const [m] of materials) {
      m.stencilWrite = masked;
      m.stencilRef = 1;
      m.stencilFunc = THREE.EqualStencilFunc;
      m.stencilFail = m.stencilZFail = m.stencilZPass = THREE.KeepStencilOp;
    }
  }
  setMasked(true);

  // brightness 0 -> 1: the scene fades up from dark as you scroll towards it. At 0 it is
  // fully transparent, so the counter shows the page behind it like every other letter.
  function setBrightness(k) {
    for (const [m, base] of materials) {
      if (base === null) m.uniforms.uBright.value = k;
      else if (m === nutMat) m.color.setScalar(k * base);
      else {
        m.color.setScalar(k * base);
        m.opacity = Math.min(1, k * 2);
      }
    }
  }
  setBrightness(0);
  // 1 -> 0: the rings fade as the camera sinks towards the pool (they'd fill the view)
  const setRippleFade = (k) => (ripples.uniforms.uFade.value = k);
  const tick = (dt) => ((ripples.uniforms.uTime.value += dt), sway(dt), nuts(dt));
  return { group, foreground, setRise, setMasked, setBrightness, setRippleFade, setNuts, tick, pool: imageToWorld(0.505 * IMG.w, 0.78 * IMG.h, PLATE_DEPTH) };
}
