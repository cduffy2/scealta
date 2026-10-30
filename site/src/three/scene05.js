import * as THREE from 'three';
import meta from './s05-fire.json';
import { ribbon as markRibbon } from './marks.js';

// Scene 05, the thumb: Fionn roasting the salmon over the fire at night, by the water. The
// painting (mirrored, so the salmon lies on the right, clear of the text) is in three layers
// at different depths (scripts/s05_layers.py): the night, the trees, and near to us the
// water, the grill, the fire and the salmon. The camera pans along to it from scene 04 (a
// new place, a new time), so the trees and the night lag behind the fire; at rest they line
// up as painted. Here Fionn's hand reaches in from the right and now and then prods the
// salmon with his two sticks, the flames flicker, embers drift up from the fire and fade,
// now and then a blister swells on the salmon's skin, the stars twinkle, the trees stir and
// the water sways.
//
// Work is done in the painting's pixels (2912 x 1632, y down), mapped onto a plate D units
// wide at depth D in front of the camera's rest (cover framing, like scene 04); the far
// layers are further back and larger in proportion. On portrait screens it's shown across
// the top half, the salmon and the fire in view.

const D = 14;
const EXT = 0.35; // how far each layer runs on past its edges, mirrored (share of its size)
const FOOT = 1.4; // and the near one below its foot, where it's the night (the text sits there)
const [PW, PH] = meta.size;
const WATER = meta.water;
const [FX0, FY0, FX1, FY1] = meta.fire;
const toArt = (px, py) => [((px - PW / 2) * D) / PW, ((PH / 2 - py) * D) / PW];
const rand = (a, b) => a + Math.random() * (b - a);
const smooth = THREE.MathUtils.smoothstep;
// drawn before scene 04 (render order OVER = 10), which slides off over it
const UNDER = 2;
// how far back each layer is, as a share of D
const DEPTH = { sky: 1.5, trees: 1.18, near: 1 };
const GRILL = [1122, 1370, 2762]; // x0, top, x1 of the grill (it stands still in the water)
const NIGHT = 'vec3(0.012, 0.035, 0.012)';

// a soft round light, uK its strength
const glow = (color, falloff = 2.0) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uK: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform float uK;
      void main() {
        float r = length((vUv - 0.5) * 2.0);
        gl_FragColor = vec4(vec3(${color}), pow(max(0.0, 1.0 - r), ${falloff.toFixed(1)}) * uK);
      }`,
  });

export async function loadScene05() {
  const loader = new THREE.TextureLoader();
  const load = async (url, color = true) => {
    const t = await loader.loadAsync(url);
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const size = window.innerWidth < 1000 ? 1600 : 2912;
  const [skyTex, treesTex, nearTex, flamesTex, handTex, ...emberTex] = await Promise.all([
    load(`/images/s05/sky-${size}.webp`),
    load(`/images/s05/trees-${size}.webp`),
    load(`/images/s05/near-${size}.webp`),
    load('/images/s05/flames.webp', false),
    load('/images/s05/hand.webp'),
    ...meta.embers.map((e) => load(`/images/s05/${e.name.slice(4)}.webp`)),
  ]);

  const group = new THREE.Group();
  // each layer is the painting's frame (D wide, centred) at its own depth
  const layers = Object.fromEntries(Object.keys(DEPTH).map((k) => [k, new THREE.Group()]));
  group.add(...Object.values(layers));
  const near = layers.near;
  let time = 0;
  const timeU = { value: 0 };

  // A layer's plate: it runs on past its edges, mirrored, so its frame never shows on the
  // way along. `body` is GLSL that samples `map` at `wuv` (+ any offset) into diffuseColor.
  function plate(tex, body, { foot = 0, uniforms = {}, order }) {
    tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    mat.customProgramCacheKey = () => `s05-${order}`; // the layers share this code, not their shaders
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { uTime: timeU }, uniforms);
      const decl = ['uniform float uTime;', ...Object.entries(uniforms).map(([k, u]) => `uniform ${typeof u.value === 'number' ? 'float' : 'sampler2D'} ${k};`)].join('\n');
      shader.fragmentShader = `${decl}\n${shader.fragmentShader}`.replace(
        '#include <map_fragment>',
        `vec2 wuv = vMapUv;\nfloat py = wuv.y * ${PH}.0; // painting px up from its foot\n${body}`,
      );
    };
    const h = (D * PH) / PW;
    const geo = new THREE.PlaneGeometry(D * (1 + 2 * EXT), h * (1 + 2 * EXT + foot));
    geo.translate(0, (h * -foot) / 2, 0);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (1 + 2 * EXT) - EXT, uv.getY(i) * (1 + 2 * EXT + foot) - EXT - foot);
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = order;
    return m;
  }

  const fireU = { value: 1 }; // the fire's brightness, flickering

  // The night: its stars twinkle, each in its own time.
  layers.sky.add(
    plate(
      skyTex,
      `
      vec4 texel = texture2D(map, wuv);
      diffuseColor *= texel;
      vec2 cell = floor(wuv * vec2(${(PW / 14).toFixed(1)}, ${(PH / 14).toFixed(1)}));
      float seed = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
      float tw = 0.5 + 0.5 * sin(uTime * (0.8 + seed * 1.6) + seed * 40.0);
      float lum = dot(texel.rgb, vec3(0.3, 0.59, 0.11));
      diffuseColor.rgb *= mix(1.0, 0.45 + 0.9 * tw * tw, smoothstep(0.05, 0.25, lum));
      `,
      { order: UNDER },
    ),
  );

  // The trees: they stir in slow, broad waves, as if in a light breeze (their tops too),
  // and now and then a few of their dashes catch the firelight.
  layers.trees.add(
    plate(
      treesTex,
      `
      float fromTop = smoothstep(0.0, 0.5, wuv.y - 0.15);
      vec2 off = vec2(
        sin(py * 0.02 + wuv.x * 3.0 - uTime * 0.5) * 0.0008 + sin(py * 0.007 - wuv.x * 1.7 - uTime * 0.23) * 0.0006,
        sin(wuv.x * 9.0 - uTime * 0.4) * 0.0006
      ) * (0.4 + 0.6 * fromTop);
      vec4 texel = texture2D(map, wuv + off);
      diffuseColor *= texel;
      float lum = dot(texel.rgb, vec3(0.3, 0.59, 0.11));
      float tw = pow(max(0.0, sin(wuv.x * 61.0 + uTime * 0.35 + sin(wuv.y * 9.0) * 2.0) * sin(wuv.y * 47.0 - uTime * 0.27 + wuv.x * 5.0)), 10.0);
      // the firelight on them, warmest near the fire
      float fx = (wuv.x - ${((FX0 + FX1) / 2 / PW).toFixed(4)}) / 0.3;
      float fy = (py - ${PH - (FY0 + FY1) / 2}.0) / 500.0;
      float lit = exp(-fx * fx - fy * fy);
      diffuseColor.rgb *= 1.0 + 0.3 * tw * smoothstep(0.03, 0.12, lum) + lit * fireU * vec3(0.25, 0.1, 0.0);
      `,
      { uniforms: { fireU }, order: UNDER + 1 },
    ),
  );

  // The near layer: the flames flicker, licking up and swaying, more towards their tips;
  // the water sways and shimmers around the grill, which stands still.
  const nearPlate = plate(
    nearTex,
    `
    float below = ${(1 - WATER / PH).toFixed(4)} - wuv.y; // > 0 in the water
    float wet = step(0.0, below);
    float flame = texture2D(uFlames, clamp(wuv, 0.0, 1.0)).r * step(0.0, wuv.x) * step(wuv.x, 1.0);
    float tip = clamp((py - ${PH - FY1}.0) / ${FY1 - FY0}.0, 0.0, 1.0); // 0 at their base, 1 at their tips
    vec2 off = vec2(
      sin(wuv.x * 190.0 + uTime * 7.0 + py * 0.02) * 0.0016 + sin(wuv.x * 70.0 - uTime * 4.3) * 0.0011,
      -(0.5 + 0.5 * sin(wuv.x * 150.0 + uTime * 9.0 - py * 0.05)) * 0.006
    ) * flame * tip;
    // the water, clear of the grill
    vec2 px = vec2(wuv.x * ${PW}.0, ${PH}.0 - py);
    float grill = (1.0 - smoothstep(0.0, 20.0, max(${GRILL[0]}.0 - px.x, px.x - ${GRILL[2]}.0))) * smoothstep(${GRILL[1] - 20}.0, ${GRILL[1]}.0, px.y);
    off += vec2(
      sin(py * 0.9 + uTime * 1.3) * 0.0016 + sin(py * 0.37 - uTime * 0.8) * 0.0012 + sin(py * 0.11 + wuv.x * 6.0 - uTime * 0.45) * 0.0011,
      sin(wuv.x * 55.0 + uTime * 0.9 + py * 0.05) * 0.0010
    ) * wet * smoothstep(0.0, 0.01, below) * (1.0 - grill);
    vec4 texel = texture2D(map, wuv + off);
    diffuseColor *= texel;
    diffuseColor.rgb *= 1.0 + wet * (1.0 - grill) * (0.08 * sin(wuv.x * 40.0 + py * 0.25 + uTime * 0.8) +
      0.07 * pow(0.5 + 0.5 * sin(wuv.x * 90.0 - uTime * 0.6 + sin(py * 0.2 + uTime * 0.3) * 2.0), 6.0));
    // the flames brighten and dim, in patches
    diffuseColor.rgb *= 1.0 + flame * (0.12 * sin(wuv.x * 40.0 - uTime * 5.0) + 0.08 * sin(uTime * 11.0 + wuv.x * 13.0));
    // past the painting's sides only the water carries on (no second hand, no second fish)
    diffuseColor.a *= (wuv.x < 0.0 || wuv.x > 1.0) ? wet : 1.0;
    // past its foot it fades to the night (on phones the text sits there)
    // (quickly: mirrored, the grill and the fish would show there)
    float foot = smoothstep(0.0, 0.025, -wuv.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, ${NIGHT}, foot);
    diffuseColor.a = max(diffuseColor.a, foot);
    `,
    { foot: FOOT, uniforms: { uFlames: { value: flamesTex } }, order: UNDER + 2 },
  );
  flamesTex.wrapS = flamesTex.wrapT = THREE.ClampToEdgeWrapping;
  near.add(nearPlate);

  // the fire's warm light, over the flames and on his belly
  const fireGlow = new THREE.Mesh(new THREE.PlaneGeometry((1900 * D) / PW, (700 * D) / PW), glow('1.0, 0.5, 0.12', 1.6));
  fireGlow.position.set(...toArt((FX0 + FX1) / 2, FY0 + 60), 0.004);
  fireGlow.renderOrder = UNDER + 3;
  near.add(fireGlow);

  // Fionn's hand and his two sticks, held a little apart, reaching in to the salmon's
  // underside by his tail. Every few seconds he prods him: in quickly, back slowly; between,
  // his hand bobs a little.
  const HAND = meta.hand;
  const hand = new THREE.Mesh(
    new THREE.PlaneGeometry((HAND.w * D) / PW, (HAND.h * D) / PW),
    new THREE.MeshBasicMaterial({ map: handTex, transparent: true, depthWrite: false }),
  );
  hand.renderOrder = UNDER + 3.7; // over the ends of his sticks
  near.add(hand);
  const stickMat = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  // each stick: a dark edge, the wood, and the light along its top (as painted)
  const sticks = meta.grip.map(() =>
    [stickMat('#3a2404'), stickMat('#f2c414'), stickMat('#ffe95a')].map((m, i) => {
      const r = markRibbon(2, m, toArt);
      r.mesh.renderOrder = UNDER + 3.4 + i * 0.05;
      near.add(r.mesh);
      return r;
    }),
  );
  const [gx, gy] = meta.grip[0];
  const [px, py] = meta.prod[0];
  const len = Math.hypot(px - gx, py - gy);
  const dir = [(px - gx) / len, (py - gy) / len]; // along the sticks, towards him
  const up = dir[0] < 0 ? [dir[1], -dir[0]] : [-dir[1], dir[0]]; // across them, upwards
  let prodT = 1.5; // seconds to the next
  let prod = -1; // 0 -> 1 through one, -1 between
  function poke(dt) {
    if (prod < 0 && (prodT -= dt) <= 0) prod = 0;
    if (prod >= 0 && (prod += dt / 0.9) >= 1) {
      prod = -1;
      prodT = rand(3, 5);
    }
    const k = prod < 0 ? 0 : prod < 0.28 ? 1 - (1 - prod / 0.28) ** 2 : 1 - smooth(prod, 0.28, 1);
    // px along the sticks: resting just short of him, in to just past his edge
    const along = -9 + 14 * k;
    const bob = 2.5 * Math.sin(time * 1.6) + 1.2 * Math.sin(time * 2.9 + 1);
    const ox = dir[0] * along;
    const oy = dir[1] * along + bob;
    hand.position.set(...toArt(HAND.x + HAND.w / 2 + ox, HAND.y + HAND.h / 2 + oy), 0.0055);
    meta.grip.forEach(([x0, y0], i) => {
      const [x1, y1] = meta.prod[i];
      // from inside his grip (his fingers cover the ends) to the tip
      const from = [x0 - dir[0] * 16 + ox, y0 - dir[1] * 16 + oy];
      const to = [x1 + ox, y1 + oy];
      const [edge, wood, light] = sticks[i];
      edge.set([from, to], (t) => 8.5 - 1.5 * t);
      wood.set([from, to], (t) => 6 - 1.2 * t);
      light.set(
        [from, to].map(([x, y]) => [x + up[0] * 1.6, y + up[1] * 1.6]),
        (t) => 1.8 - 0.6 * t,
      );
    });
  }

  // The blister: now and then a small pale dome swells on his skin, shines, and goes down.
  const blisterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uK: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform float uK;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        vec3 n = normalize(vec3(p * 0.9, sqrt(max(0.0, 1.0 - r * r))));
        float lit = max(0.0, dot(n, normalize(vec3(-0.4, 0.6, 0.7))));
        vec3 skin = mix(vec3(0.7, 0.66, 0.2), vec3(1.0, 0.95, 0.6), lit);
        skin += pow(max(0.0, dot(reflect(vec3(0.0, 0.0, -1.0), n), normalize(vec3(-0.4, 0.6, 0.7)))), 18.0) * 0.6;
        // a thin warm rim where it rises from the skin
        skin = mix(skin, vec3(0.9, 0.45, 0.12), smoothstep(0.7, 0.95, r) * 0.6);
        gl_FragColor = vec4(skin, (1.0 - smoothstep(0.85, 1.0, r)) * uK);
      }`,
  });
  const blister = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blisterMat);
  blister.renderOrder = UNDER + 4;
  near.add(blister);
  // places on his side, clear of his spots' thickest patches and his gill
  const SKIN = [
    [2152, 1090],
    [2007, 1060],
    [1872, 1130],
    [1732, 1075],
    [1622, 1140],
    [2272, 1150],
  ];
  let blisterT = 2.5; // seconds to the next
  let swell = -1; // 0 -> 1 through one, -1 between
  let blisterSize = 50;
  function bubble(dt) {
    if (swell < 0 && (blisterT -= dt) <= 0) {
      const [x, y] = SKIN[Math.floor(Math.random() * SKIN.length)];
      blister.position.set(...toArt(x + rand(-20, 20), y + rand(-10, 10)), 0.005);
      blisterSize = rand(50, 70);
      swell = 0;
    }
    if (swell >= 0) {
      swell += dt / 3.2;
      if (swell >= 1) {
        swell = -1;
        blisterT = rand(6, 10);
      }
    }
    // up over a second or so, holds, then goes down
    const k = swell < 0 ? 0 : smooth(swell, 0, 0.4) * (1 - smooth(swell, 0.75, 1));
    const s = ((blisterSize * D) / PW) * (0.3 + 0.7 * k);
    blister.scale.set(s, s * 0.8, 1);
    blister.visible = k > 0;
    blisterMat.uniforms.uK.value = 0.9 * Math.min(1, k * 2);
  }

  // The embers: the painted ones drift on up and fade; then more keep rising from the fire,
  // from behind him, each glowing faintly.
  const embers = meta.embers.map((e, i) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry((e.w * D) / PW, (e.h * D) / PW),
      new THREE.MeshBasicMaterial({ map: emberTex[i], transparent: true, depthWrite: false }),
    );
    m.renderOrder = UNDER + 6;
    const light = new THREE.Mesh(new THREE.PlaneGeometry((e.w * 2.6 * D) / PW, (e.w * 2.6 * D) / PW), glow('1.0, 0.55, 0.2', 1.6));
    light.renderOrder = UNDER + 5;
    near.add(m, light);
    const y = e.y + e.h / 2;
    return { m, light, x: e.x + e.w / 2, y, x0: e.x + e.w / 2, top: y - rand(260, 420), vy: -rand(45, 80), age: 1, phase: rand(0, 6), wait: 0 };
  });
  function rise(dt) {
    for (const e of embers) {
      if (e.wait > 0) {
        e.wait -= dt;
        e.m.visible = e.light.visible = false;
        if (e.wait <= 0) {
          // from the fire, up from behind him
          e.x = e.x0 = rand(1392, 2432);
          e.y = rand(980, 1020);
          e.top = rand(470, 700);
          e.vy = -rand(45, 85);
          e.age = 0;
        }
        continue;
      }
      e.age += dt;
      e.y += e.vy * dt;
      const x = e.x0 + 14 * Math.sin(time * 1.3 + e.phase) + 6 * Math.sin(time * 3.1 + e.phase * 2);
      // in quickly, out as it nears its height
      const a = Math.min(1, e.age / 0.5) * smooth(e.y, e.top, e.top + 120);
      if (e.y <= e.top) {
        e.wait = rand(0.2, 1.6);
        continue;
      }
      e.m.visible = e.light.visible = true;
      e.m.position.set(...toArt(x, e.y), 0.008);
      e.m.rotation.z = 0.15 * Math.sin(time * 2 + e.phase);
      e.m.material.opacity = a;
      e.light.position.set(...toArt(x, e.y), 0.007);
      e.light.material.uniforms.uK.value = 0.35 * a * (0.75 + 0.25 * Math.sin(time * 8 + e.phase));
    }
  }

  function tick(dt) {
    time += dt;
    timeU.value = time;
    fireU.value = 0.85 + 0.1 * Math.sin(time * 7.3) + 0.06 * Math.sin(time * 13.1 + 1.0);
    fireGlow.material.uniforms.uK.value = 0.2 * fireU.value;
    poke(dt);
    rise(dt);
    bubble(dt);
  }

  // view: the view's width and height per unit depth at the camera's rest
  let frame = { x: 0, y: 0, s: 1 };
  function layout(view) {
    if (view.w < view.h) {
      // portrait: the painting across the top of the screen, the salmon and the fire in view
      const s = (0.45 * view.h) / (PH / PW); // scale so its height is 45% of the view
      const u = 0.67; // the painting's x at the screen's centre
      frame = { x: (0.5 - u) * D * s, y: ((view.h - (PH / PW) * s) * D) / 2, s };
    } else frame = { x: 0, y: 0, s: 1 };
    // each layer further back is larger in proportion, so they line up from the rest
    for (const [k, layer] of Object.entries(layers)) {
      const f = DEPTH[k];
      layer.position.set(frame.x * f, frame.y * f, -D * f);
      layer.scale.setScalar(frame.s * f);
    }
  }

  tick(0);
  return {
    group,
    layout,
    tick,
    // the near painting's left (-1) or right (+1) edge, in the group's space
    edge: (side) => frame.x + (side * frame.s * D) / 2,
  };
}
