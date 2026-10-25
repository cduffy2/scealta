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
  const [gltf, plateTex] = await Promise.all([
    gltfLoader().loadAsync('/3d/s01-layers.glb'),
    new THREE.TextureLoader().loadAsync('/images/s01-calm-2912.webp'),
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
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTex, vertexColors: true });
  const plate = new THREE.Mesh(geom, plateMat);
  plate.position.z = -PLATE_DEPTH;
  group.add(plate);
  materials.push([plateMat, 1]);

  const sources = {};
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const old = o.material;
    old.map.colorSpace = THREE.SRGBColorSpace;
    // unlit, so the colours match the painting
    const mat = new THREE.MeshBasicMaterial({ map: old.map, alphaTest: 0.5, side: THREE.DoubleSide });
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
    uniforms: { uTime: { value: 0 }, uBright: { value: 0 }, uColor: { value: new THREE.Color('#d8f080') } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime, uBright;
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
        gl_FragColor = vec4(uColor * band * 0.85 * uBright, 1.0);
      }`,
  });
  const ripple = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * IMG.h) / IMG.w), ripples);
  ripple.position.z = -PLATE_DEPTH + 0.02;
  group.add(ripple);
  materials.push([ripples, null]);

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

  // brightness 0 (black) -> 1: the scene fades up from black as you scroll towards it
  function setBrightness(k) {
    for (const [m, base] of materials) {
      if (base === null) m.uniforms.uBright.value = k;
      else m.color.setScalar(k * base);
    }
  }
  setBrightness(0);
  const tick = (dt) => ((ripples.uniforms.uTime.value += dt), sway(dt));
  return { group, foreground, setRise, setMasked, setBrightness, tick, pool: imageToWorld(0.505 * IMG.w, 0.78 * IMG.h, PLATE_DEPTH) };
}
