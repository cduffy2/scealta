import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

let loader = null;
export function gltfLoader() {
  if (!loader) {
    const draco = new DRACOLoader().setDecoderPath('/draco/');
    loader = new GLTFLoader().setDRACOLoader(draco);
  }
  return loader;
}

// Model units (from Blender): length 3.27 along x, head at -x, height along y, thickness z.
export const SALMON_LENGTH = 3.27;
export const SALMON_HEIGHT = 0.99; // fin tip to fin tip

// The eye in the texture (uv, measured from the upscaled cut-out; v runs downwards for glTF
// textures), and the blink: a lid of the skin from just behind the eye (the eye sits too
// close to the top of the head to borrow from above) slides down over it and back up.
const EYE = { u: 0.1006, v: 0.5333, ru: 0.0124, rv: 0.037 };
const BLINK = `
  vec2 eyeD = (vMapUv - vec2(${EYE.u}, ${EYE.v})) / vec2(${EYE.ru * 1.5}, ${EYE.rv * 1.5});
  if (uBlink > 0.0 && dot(eyeD, eyeD) < 1.0) {
    float edge = -1.0 + 2.3 * uBlink - 0.2 * (1.0 - eyeD.x * eyeD.x);
    float cover = 1.0 - smoothstep(edge - 0.15, edge, eyeD.y); // soft lower edge
    cover *= 1.0 - smoothstep(0.8, 1.0, dot(eyeD, eyeD));       // and soft rim
    vec4 lid = texture2D(map, vMapUv + vec2(${EYE.ru * 3.4}, 0.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, lid.rgb * 0.92, cover);
  }
`;

// The swim from the Blender "Swim" node group, as a vertex shader: a wave travels
// head to tail, the head holds steady and the tail sweeps. Phase and amplitude come from
// swim() below, so the tail beats harder and faster while he's moving.
const SWIM = `
  float swimW = pow(max((position.x + 1.1) / 2.75, 0.0), 2.0);
  transformed.z += sin(position.x * 2.0944 - uPhase) * swimW * uAmp;
`;

// The mouth: the lower jaw swings down a little about its hinge and back, like breathing.
// Measured on s00_salmon_complete.png (model x = (px - 829) * 0.002, y = (259 - py) * 0.002):
// the gap between the jaws runs from the snout back to the hinge at about (150, 328), and
// slopes down at 0.389 px per px. Below that line and in front of the hinge is the jaw.
const MOUTH = `
  vec2 hinge = vec2(-1.358, -0.139);
  float below = smoothstep(0.012, -0.012, position.y - (hinge.y - 0.389 * (position.x - hinge.x)));
  float jaw = below * smoothstep(hinge.x + 0.06, hinge.x - 0.04, position.x);
  float ang = uMouth * 0.14 * jaw;
  vec2 rel = transformed.xy - hinge;
  transformed.xy = hinge + mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * rel;
`;

// The gill cover: a crescent whose front edge is attached (x ≈ 312 px) and whose free back
// edge curves out to x ≈ 392 at its widest (y 190-375); a half-ellipse centred on the front
// edge fits it. It lifts outwards and a little back, most at the free edge, and its lines
// catch the light as it does. vGill carries the weight to the fragment shader.
const GILL_VERT = `
  vec2 gq = (position.xy - vec2(-1.034, -0.058)) / vec2(0.16, 0.196);
  vGill = smoothstep(-0.05, 0.7, gq.x) * (1.0 - smoothstep(0.8, 1.15, dot(gq, gq)));
  transformed.x += vGill * uGill * 0.016;
  transformed.z += sign(position.z) * vGill * uGill * 0.03;
`;
const GILL_FRAG = `
  diffuseColor.rgb *= 1.0 + vGill * uGill * 0.18;
`;

export async function loadSalmon() {
  const gltf = await gltfLoader().loadAsync('/3d/salmon.glb');
  let mesh = null;
  gltf.scene.traverse((o) => o.isMesh && (mesh = o));
  const uniforms = { uTime: { value: 0 }, uBlink: { value: 0 }, uPhase: { value: 0 }, uAmp: { value: 0.2 }, uMouth: { value: 0 }, uGill: { value: 0 } };
  const m = mesh.material;
  // The glTF material is BLEND, which the loader also gives depthWrite: false. Without
  // depth writes the far side (double-sided) draws over the near side in triangle order.
  m.transparent = false;
  m.depthWrite = true;
  m.alphaTest = 0.5;
  m.alphaToCoverage = true; // anti-aliased cut-out edge (the renderer has MSAA)
  m.emissiveMap = null; // emissive follows the (blinked) diffuse colour instead
  m.emissive = new THREE.Color(0x000000);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPhase = uniforms.uPhase;
    shader.uniforms.uAmp = uniforms.uAmp;
    shader.uniforms.uBlink = uniforms.uBlink;
    shader.uniforms.uMouth = uniforms.uMouth;
    shader.uniforms.uGill = uniforms.uGill;
    shader.fragmentShader = `uniform float uBlink, uGill;\nvarying float vGill;\n${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `#include <map_fragment>\n${BLINK}\n${GILL_FRAG}`,
    ).replace(
      '#include <emissivemap_fragment>',
      // the engraved lines keep their glow in the dark (and the lid glows like the skin)
      '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.6;',
    );
    shader.vertexShader = `uniform float uPhase, uAmp, uMouth, uGill;\nvarying float vGill;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n${MOUTH}\n${GILL_VERT}\n${SWIM}`,
    );
  };
  mesh.removeFromParent();
  mesh.position.set(0, 0, 0);
  mesh.rotation.set(0, 0, 0);
  const group = new THREE.Group();
  group.add(mesh);
  return { group, uniforms };
}

// Swimming through water. `speed` is 0 (idling) to 1 (swimming in at full pace).
//  - tail beats: 0.5 -> 2 per second, amplitude 0.2 -> 0.42
//  - the body surges forward with each beat, the head sways against the tail, and he
//    bobs gently; returns offsets in model units for the caller to apply
//  - bubbles trail up from the gills, more of them the faster he goes
export function createSwim(salmon) {
  const { uniforms } = salmon;
  let phase = 0;
  let pace = 0;

  const N = 36;
  const bubbleMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#d8ecb0'), transparent: true, opacity: 0.5, depthWrite: false });
  const ring = new THREE.RingGeometry(0.55, 1, 16);
  const bubbles = new THREE.InstancedMesh(ring, bubbleMat, N);
  bubbles.frustumCulled = false;
  const live = Array.from({ length: N }, () => ({ age: 1e9, life: 1, x: 0, y: 0, z: 0, r: 0, w: 0, rise: 0 }));
  const m4 = new THREE.Matrix4();
  let spawn = 0;
  const GILL = new THREE.Vector3(-1.05, 0.12, 0.22); // just behind the gill cover, in front of the body (model units)

  let breath = 0;
  function update(dt, speed, world) {
    pace += (speed - pace) * Math.min(1, dt * 4); // ease the tail into and out of its beat
    const freq = 0.5 + 1.5 * pace;
    phase += Math.PI * 2 * freq * dt;
    uniforms.uPhase.value = phase;
    uniforms.uAmp.value = 0.2 + 0.22 * pace;
    // breathing: the mouth opens and closes slowly, a touch quicker while he swims
    breath += dt * (1.9 + 1.2 * pace);
    uniforms.uMouth.value = (0.5 - 0.5 * Math.cos(breath)) ** 1.6;
    // the gill cover lifts a beat later, as the mouth closes: water in, then out
    uniforms.uGill.value = (0.5 - 0.5 * Math.cos(breath - 2.2)) ** 1.6;

    // bubbles, in world space (they stay behind as he moves)
    spawn += dt * (0.6 + 9 * pace);
    while (spawn >= 1) {
      spawn -= 1;
      const b = live.find((q) => q.age >= q.life);
      if (!b) break;
      const p = GILL.clone().applyMatrix4(world);
      b.age = 0;
      b.life = 1.4 + Math.random() * 1.2;
      b.x = p.x + (Math.random() - 0.5) * 0.03;
      b.y = p.y;
      b.z = p.z;
      const len = SALMON_LENGTH * world.getMaxScaleOnAxis(); // fish length in world units
      b.r = len * (0.0035 + Math.random() * 0.006);
      b.rise = len * (0.05 + Math.random() * 0.05);
      b.w = Math.random() * 6;
    }
    for (let i = 0; i < N; i++) {
      const b = live[i];
      b.age += dt;
      const t = b.age / b.life;
      if (t >= 1) {
        m4.makeScale(0, 0, 0);
      } else {
        b.y += dt * b.rise;
        const s = b.r * (t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1);
        m4.makeScale(s, s, s).setPosition(b.x + Math.sin(b.age * 5 + b.w) * b.r * 0.8, b.y, b.z);
      }
      bubbles.setMatrixAt(i, m4);
    }
    bubbles.instanceMatrix.needsUpdate = true;

    return {
      surge: -Math.sin(phase) * 0.035 * pace, // forward (-x) pulses on each beat
      bob: Math.sin(phase * 0.5) * 0.012 * (0.4 + pace),
      yaw: -Math.sin(phase + 0.9) * (0.015 + 0.05 * pace),
    };
  }

  return { bubbles, update, dispose: () => (ring.dispose(), bubbleMat.dispose()) };
}
