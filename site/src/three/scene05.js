import * as THREE from 'three';
import meta from './s05-fire.json';

// Scene 05, the thumb: Fionn roasting the salmon over the fire at night, by the water. The
// painting (mirrored, so the salmon lies on the right, clear of the text) is in three layers
// at different depths (scripts/s05_layers.py): the night, the trees, and near to us the
// water, the grill, the fire and the salmon. The camera pans along to it from scene 04 (a
// new place, a new time), so the trees and the night lag behind the fire; at rest they line
// up as painted. Here Fionn's hand reaches in from the right and now and then prods the
// salmon with his stick, the salmon cooks slowly to a golden brown, the flames flicker,
// smoke rises off him and the heat shimmers over the trees, now and then a blister swells
// on his skin and bursts, the stars twinkle, a star shoots now and then, bats flit over the
// trees, the trees stir and the water sways. On the way back to scene 06 it's shrunk to sit
// on that one, and everything but the salmon fades from around him (setLeave).
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
const COOK = 30; // seconds for him to cook through
const FISH = [1272, 2622]; // the salmon, snout to tail (x, painting px)
// where the heat shimmers over the trees: x0, x1 (over him), and y where it starts and is
// at its strongest (his back)
const HAZE = [1330, 2560, 430, 960];
// the smoke off him: its box, its foot hidden behind his back
const SMOKE = [1330, 2560, 330, 1120];

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
  const [skyTex, treesTex, nearTex, flamesTex, fishTex, handTex] = await Promise.all([
    load(`/images/s05/sky-${size}.webp`),
    load(`/images/s05/trees-${size}.webp`),
    load(`/images/s05/near-${size}.webp`),
    load('/images/s05/flames.webp', false),
    load('/images/s05/fish.webp', false),
    load('/images/s05/hand.webp'),
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
  const cookU = { value: 0 }; // how far he has cooked, 0 -> 1
  const leaveU = { value: 0 }; // on the way to scene 06: 1 when only the salmon is left
  let leave = 0;

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
  // and now and then a few of their dashes catch the firelight. Over the salmon the heat
  // off the fire makes them shimmer faintly, in ripples rising, strongest just above him.
  layers.trees.add(
    plate(
      treesTex,
      `
      float fromTop = smoothstep(0.0, 0.5, wuv.y - 0.15);
      vec2 off = vec2(
        sin(py * 0.02 + wuv.x * 3.0 - uTime * 0.5) * 0.0008 + sin(py * 0.007 - wuv.x * 1.7 - uTime * 0.23) * 0.0006,
        sin(wuv.x * 9.0 - uTime * 0.4) * 0.0006
      ) * (0.4 + 0.6 * fromTop);
      float yd = ${PH}.0 - py; // painting px down from its top
      float heat = smoothstep(${HAZE[0] - 120}.0, ${HAZE[0] + 80}.0, wuv.x * ${PW}.0) * (1.0 - smoothstep(${HAZE[1] - 80}.0, ${HAZE[1] + 120}.0, wuv.x * ${PW}.0))
        * smoothstep(${HAZE[2]}.0, ${HAZE[3]}.0, yd);
      off += vec2(
        sin(yd * 0.045 + uTime * 3.5 + wuv.x * 37.0) * 0.00045 + sin(yd * 0.11 + uTime * 6.0 - wuv.x * 61.0) * 0.0002,
        sin(wuv.x * 90.0 + yd * 0.03 + uTime * 3.0) * 0.00025
      ) * heat;
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
    // He cooks: over half a minute his skin browns, to a golden brown and no further, most
    // on his belly over the flames and unevenly, in patches; his spots stay dark.
    float fish = texture2D(uFish, clamp(wuv, 0.0, 1.0)).r * step(0.0, wuv.x) * step(wuv.x, 1.0);
    float under = 1.0 - smoothstep(${PH - meta.salmon.bottom}.0, ${PH - meta.salmon.top}.0, py); // 0 on his back, 1 on his belly
    float blotch = 0.5 + 0.25 * sin(px.x * 0.021 + sin(px.y * 0.017) * 2.0) + 0.25 * sin(px.y * 0.043 - px.x * 0.009 + 1.3);
    float k = uCook * fish * (0.75 + 0.25 * under) * (0.8 + 0.4 * blotch);
    float lum = dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15));
    vec3 brown = lum * vec3(1.75, 0.62, 0.09); // golden brown (in linear light), deeper on his belly
    diffuseColor.rgb = mix(diffuseColor.rgb, brown, 0.92 * k) * (1.0 - k * (0.28 * under + 0.12 * blotch));
    // past the painting's sides only the water carries on (no second hand, no second fish)
    diffuseColor.a *= (wuv.x < 0.0 || wuv.x > 1.0) ? wet : 1.0;
    // past its foot it fades to the night (on phones the text sits there)
    // (quickly: mirrored, the grill and the fish would show there)
    float foot = smoothstep(0.0, 0.025, -wuv.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, ${NIGHT}, foot);
    diffuseColor.a = max(diffuseColor.a, foot);
    // on the way to scene 06 all but the salmon fades
    diffuseColor.a *= mix(1.0, fish, uLeave);
    `,
    { foot: FOOT, uniforms: { uFlames: { value: flamesTex }, uFish: { value: fishTex }, uCook: cookU, uLeave: leaveU }, order: UNDER + 2 },
  );
  flamesTex.wrapS = flamesTex.wrapT = fishTex.wrapS = fishTex.wrapT = THREE.ClampToEdgeWrapping;
  near.add(nearPlate);

  // the fire's warm light, over the flames and on his belly
  const fireGlow = new THREE.Mesh(new THREE.PlaneGeometry((1900 * D) / PW, (700 * D) / PW), glow('1.0, 0.5, 0.12', 1.6));
  fireGlow.position.set(...toArt((FX0 + FX1) / 2, FY0 + 60), 0.004);
  fireGlow.renderOrder = UNDER + 3;
  near.add(fireGlow);

  // Fionn's hand round his one stick (repainted), reaching in from the right. His arm is
  // turned up about where it comes in (arm.turn), so the stick rests on the salmon's
  // underside by his tail; every few seconds he prods him with it, in quickly and back
  // slowly, turning a touch further up as he pushes. Between, his hand bobs a little.
  const HAND = meta.hand;
  const ARM = meta.arm;
  const arm = new THREE.Group(); // turns about where his arm comes in
  near.add(arm);
  const pivot = toArt(...ARM.pivot);
  const hand = new THREE.Mesh(
    new THREE.PlaneGeometry((HAND.w * D) / PW, (HAND.h * D) / PW),
    new THREE.MeshBasicMaterial({ map: handTex, transparent: true, depthWrite: false }),
  );
  const [hx, hy] = toArt(HAND.x + HAND.w / 2, HAND.y + HAND.h / 2);
  hand.position.set(hx - pivot[0], hy - pivot[1], 0);
  hand.renderOrder = UNDER + 3.7; // over him: the stick's tip presses on his side
  arm.add(hand);
  const at = (p) => [p[0] - ARM.pivot[0], p[1] - ARM.pivot[1]];
  const reach = Math.hypot(...at(ARM.poke));
  const dir = at(ARM.poke).map((v) => v / reach); // along the stick, towards him
  const past = Math.hypot(...at(ARM.tip)) - reach; // how far the turned tip would reach into him
  const TURN = THREE.MathUtils.degToRad(ARM.turn);
  let prodT = 1.5; // seconds to the next
  let prod = -1; // 0 -> 1 through one, -1 between
  function poke(dt) {
    if (prod < 0 && (prodT -= dt) <= 0) prod = 0;
    if (prod >= 0 && (prod += dt / 0.9) >= 1) {
      prod = -1;
      prodT = rand(3, 5);
    }
    const k = prod < 0 ? 0 : prod < 0.28 ? 1 - (1 - prod / 0.28) ** 2 : 1 - smooth(prod, 0.28, 1);
    // px along the stick: its tip resting just on him, then pressed in
    const along = -past - 2 + 12 * k;
    const bob = 2 * Math.sin(time * 1.6) + Math.sin(time * 2.9 + 1);
    arm.position.set(...toArt(ARM.pivot[0] + dir[0] * along, ARM.pivot[1] + dir[1] * along + bob), 0.0055);
    arm.rotation.z = -(TURN + THREE.MathUtils.degToRad(0.8 * k)); // clockwise on screen: up to him
  }

  // The blister: now and then a small pale dome swells on his skin, shines, and bursts,
  // spattering a little towards Fionn's hand.
  const blisterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uK: { value: 0 }, uCook: cookU },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform float uK;
      uniform float uCook;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        vec3 n = normalize(vec3(p * 0.9, sqrt(max(0.0, 1.0 - r * r))));
        float lit = max(0.0, dot(n, normalize(vec3(-0.4, 0.6, 0.7))));
        vec3 skin = mix(vec3(0.7, 0.66, 0.2), vec3(1.0, 0.95, 0.6), lit);
        // on him as he cooks, a pale golden brown
        skin = mix(skin, mix(vec3(0.62, 0.36, 0.12), vec3(0.98, 0.78, 0.48), lit), 0.8 * uCook);
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
  // the spatter: small round drops of his juices, drawn out along their flight
  const dotMat = () =>
    new THREE.ShaderMaterial({
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
          vec3 c = mix(vec3(1.0, 0.95, 0.62), vec3(0.95, 0.55, 0.15), smoothstep(0.3, 0.9, r));
          gl_FragColor = vec4(c, (1.0 - smoothstep(0.75, 1.0, r)) * uK);
        }`,
    });
  const spatter = Array.from({ length: 10 }, () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), dotMat());
    m.renderOrder = UNDER + 4.6;
    m.visible = false;
    near.add(m);
    return { m, on: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, size: 8 };
  });
  // and where it burst, a wet smear on his skin, drawn out towards the hand, drying off
  const smear = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), dotMat());
  smear.renderOrder = UNDER + 4.1;
  smear.visible = false;
  near.add(smear);
  let smearAge = 1;
  const GRAVITY = 900; // px/s²
  let blisterT = 2.5; // seconds to the next
  let swell = -1; // 0 -> 1 through one, -1 between
  let blisterSize = 50;
  let burst = false;
  let bx = 0;
  let by = 0;
  function bubble(dt) {
    if (swell < 0 && (blisterT -= dt) <= 0) {
      const [x, y] = SKIN[Math.floor(Math.random() * SKIN.length)];
      bx = x + rand(-20, 20);
      by = y + rand(-10, 10);
      blister.position.set(...toArt(bx, by), 0.005);
      blisterSize = rand(50, 70);
      swell = 0;
      burst = false;
    }
    if (swell >= 0) {
      swell += dt / 2.6;
      if (swell >= 0.8 && !burst) {
        // it bursts: a few drops fly off towards his hand (to the right), and fall
        burst = true;
        for (let i = 0, n = 6 + Math.floor(Math.random() * 4); i < n; i++) {
          const q = spatter.find((o) => !o.on);
          if (!q) break;
          const a = rand(-0.8, 0.1); // up and to the right, a few nearly level
          const v = rand(150, 340);
          Object.assign(q, { on: true, x: bx + rand(-6, 6), y: by + rand(-6, 4), vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, size: rand(10, 20) });
        }
        smearAge = 0;
        smear.position.set(...toArt(bx + blisterSize * 0.45, by + 2), 0.0051);
      }
      if (swell >= 1) {
        swell = -1;
        blisterT = rand(6, 10);
      }
    }
    // up over a second or so, shines, then bursts flat
    const k = swell < 0 ? 0 : smooth(swell, 0, 0.45) * (1 - smooth(swell, 0.8, 0.86));
    const s = ((blisterSize * D) / PW) * (0.3 + 0.7 * k);
    blister.scale.set(s, s * 0.8, 1);
    blister.visible = k > 0;
    blisterMat.uniforms.uK.value = 0.9 * Math.min(1, k * 2);
    for (const q of spatter) {
      q.m.visible = q.on;
      if (!q.on) continue;
      q.age += dt;
      q.vy += GRAVITY * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.age > 0.9) {
        q.on = q.m.visible = false;
        continue;
      }
      const speed = Math.hypot(q.vx, q.vy);
      const stretch = 1 + Math.min(1.2, speed / 500);
      const size = (q.size * D) / PW;
      q.m.position.set(...toArt(q.x, q.y), 0.0058);
      q.m.rotation.z = Math.atan2(-q.vy, q.vx);
      q.m.scale.set(size * stretch, size / Math.sqrt(stretch), 1);
      q.m.material.uniforms.uK.value = 0.95 * (1 - smooth(q.age, 0.5, 0.9));
    }
    if (smearAge < 1) smearAge = Math.min(1, smearAge + dt / 1.6);
    smear.visible = smearAge < 1;
    const spread = smooth(smearAge, 0, 0.12); // out quickly as it bursts, then it dries
    smear.scale.set(((blisterSize * (0.6 + 1.1 * spread)) * D) / PW, ((blisterSize * 0.42) * D) / PW, 1);
    smear.material.uniforms.uK.value = 0.7 * (1 - smooth(smearAge, 0.25, 1));
  }

  // The smoke: pale wisps rise off him from behind his back, curling and leaning as they go,
  // spreading and thinning out above the trees; warm with the firelight low down.
  const NOISE = `
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
      return v;
    }`;
  const smokeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: timeU, uK: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uK;
      ${NOISE}
      void main() {
        float w = ${((SMOKE[1] - SMOKE[0]) / (SMOKE[3] - SMOKE[2])).toFixed(3)}; // its width per height
        vec2 p = vec2(vUv.x * w, vUv.y) * 3.2;
        // it rises, sways and leans a little to the left as it goes
        vec2 q = p - vec2(0.5 * sin(vUv.y * 2.5 + uTime * 0.25) + 0.9 * vUv.y, uTime * 0.32);
        float n = fbm(q + 1.4 * fbm(q * 0.8 + vec2(0.0, -uTime * 0.12)));
        // in a few wisps off his back, which spread into one another as they rise
        float wisps = 0.5 + 0.5 * sin(vUv.x * 21.0 + 3.0 * fbm(vec2(vUv.x * 4.0, vUv.y * 2.0 - uTime * 0.2)));
        float body = smoothstep(0.36, 0.74, n) * mix(wisps, 1.0, smoothstep(0.1, 0.6, vUv.y));
        float fade = smoothstep(0.08, 0.3, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y))
          * smoothstep(0.0, 0.14, vUv.x) * (1.0 - smoothstep(0.86, 1.0, vUv.x));
        vec3 c = mix(vec3(1.0, 0.72, 0.45), vec3(0.78, 0.8, 0.74), smoothstep(0.15, 0.5, vUv.y));
        gl_FragColor = vec4(c, body * fade * 0.55 * uK);
      }`,
  });
  const smoke = new THREE.Mesh(new THREE.PlaneGeometry(((SMOKE[1] - SMOKE[0]) * D) / PW, ((SMOKE[3] - SMOKE[2]) * D) / PW), smokeMat);
  smoke.position.set(...toArt((SMOKE[0] + SMOKE[1]) / 2, (SMOKE[2] + SMOKE[3]) / 2), -0.002);
  smoke.renderOrder = UNDER + 1.9; // behind him (the near plate): it rises from behind his back
  near.add(smoke);

  // A shooting star, now and then: a quick bright streak down across the night, its tail
  // trailing and fading, gone behind the trees or into the dark.
  const starMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uK: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform float uK;
      void main() {
        float y = (vUv.y - 0.5) * 2.0;
        float thick = 0.15 + 0.6 * vUv.x; // thin at the tail's end
        float tail = pow(vUv.x, 2.2) * exp(-y * y / (thick * thick) * 3.0);
        vec2 h = vec2((vUv.x - 0.96) * 14.0, y);
        float head = exp(-dot(h, h) * 2.5);
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * (tail * 0.9 + head * 1.4), 1.0) * uK;
      }`,
  });
  const STAR_LEN = 440; // px
  const starGeo = new THREE.PlaneGeometry(1, 1);
  starGeo.translate(-0.46, 0, 0); // about its head
  const star = new THREE.Mesh(starGeo, starMat);
  star.renderOrder = UNDER + 0.5;
  star.visible = false;
  layers.sky.add(star);
  const shooting = { t: 5, on: false, age: 0, life: 1, x: 0, y: 0, vx: 0, vy: 0 };
  function shoot(dt) {
    const o = shooting;
    if (!o.on && (o.t -= dt) <= 0) {
      // high in the night, over the trees on his side or the middle, down to either side
      const side = Math.random() < 0.6 ? -1 : 1;
      const a = rand(0.28, 0.6);
      const v = rand(1300, 1800);
      Object.assign(o, { on: true, age: 0, life: rand(0.6, 0.9), x: rand(1100, 2700), y: rand(40, 220), vx: side * Math.cos(a) * v, vy: Math.sin(a) * v });
    }
    star.visible = o.on;
    if (!o.on) return;
    o.age += dt;
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    if (o.age >= o.life) {
      o.on = star.visible = false;
      o.t = rand(9, 16);
      return;
    }
    const k = o.age / o.life;
    // the tail grows out behind it, then all of it fades
    const len = STAR_LEN * Math.min(1, k * 3);
    star.position.set(...toArt(o.x, o.y), 0.002);
    star.rotation.z = Math.atan2(-o.vy, o.vx);
    star.scale.set((len * D) / PW, (9 * D) / PW, 1);
    starMat.uniforms.uK.value = smooth(k, 0, 0.12) * (1 - smooth(k, 0.6, 1));
  }

  // Bats: now and then two flit over the trees, quick and jinking, wings flapping, dark
  // against the night with a thin warm edge from the fire (the painting's outlines).
  const FRAMES = 8;
  const FW = 128;
  const atlas = document.createElement('canvas');
  atlas.width = FW * FRAMES;
  atlas.height = 64;
  const ctx = atlas.getContext('2d');
  for (let i = 0; i < FRAMES; i++) {
    const flap = Math.cos((i / FRAMES) * Math.PI * 2); // 1 up, -1 down
    const cx = i * FW + FW / 2;
    const cy = 32;
    ctx.beginPath();
    for (const s of [-1, 1]) {
      const tip = [cx + s * 56, cy - 2 - flap * 22];
      const hip = [cx + s * 5, cy + 9];
      ctx.moveTo(cx + s * 4, cy - 4);
      // the leading edge, out to the wing's tip by its elbow
      ctx.quadraticCurveTo(cx + s * 30, cy - 8 - flap * 18, ...tip);
      // the trailing edge, scalloped between its fingers, back to his hip
      for (let j = 1; j <= 3; j++) {
        const t = j / 3;
        const px = tip[0] + (hip[0] - tip[0]) * t;
        const py = tip[1] + (hip[1] - tip[1]) * t;
        const mx = tip[0] + (hip[0] - tip[0]) * (t - 1 / 6);
        const my = tip[1] + (hip[1] - tip[1]) * (t - 1 / 6) - 7;
        ctx.quadraticCurveTo(mx, my, px, py);
      }
      ctx.closePath();
    }
    ctx.ellipse(cx, cy + 2, 6, 10, 0, 0, Math.PI * 2);
    ctx.moveTo(cx - 6, cy - 6);
    ctx.lineTo(cx - 5, cy - 15);
    ctx.lineTo(cx - 1, cy - 9);
    ctx.lineTo(cx + 1, cy - 9);
    ctx.lineTo(cx + 5, cy - 15);
    ctx.lineTo(cx + 6, cy - 6);
    ctx.closePath();
    ctx.fillStyle = '#0a110b';
    ctx.strokeStyle = 'rgba(232, 150, 72, 0.75)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fill();
  }
  const batTex = new THREE.CanvasTexture(atlas);
  batTex.colorSpace = THREE.SRGBColorSpace;
  batTex.repeat.set(1 / FRAMES, 1);
  const BAT_W = 112; // px, the frame's width (his wingspan a little less)
  const bats = Array.from({ length: 2 }, () => {
    const tex = batTex.clone();
    tex.needsUpdate = true;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry((BAT_W * D) / PW, ((BAT_W / 2) * D) / PW),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    m.renderOrder = UNDER + 1.5;
    m.visible = false;
    layers.trees.add(m);
    return { m, tex, on: false, age: 0, x0: 0, y0: 0, dir: 1, v: 0, ph: 0, flap: 0, rate: 0, x: 0, y: 0 };
  });
  let batT = 8; // seconds to the next pair
  function flit(dt) {
    if (!bats[0].on && !bats[1].on && (batT -= dt) <= 0) {
      // in from one side, across over the trees and out at the other
      const dir = Math.random() < 0.5 ? 1 : -1;
      const y0 = rand(220, 430);
      bats.forEach((b, i) =>
        Object.assign(b, { on: true, age: -i * rand(0.3, 0.9), x0: dir > 0 ? -120 : PW + 120, y0: y0 + rand(-70, 70), dir, v: rand(330, 420), ph: rand(0, 6), flap: rand(0, 1), rate: rand(8, 10) }),
      );
    }
    for (const b of bats) {
      b.m.visible = false;
      if (!b.on) continue;
      b.age += dt;
      if (b.age < 0) continue;
      const t = b.age;
      // along, with a flutter, and sudden jinks up and down
      const x = b.x0 + b.dir * (b.v * t + 40 * Math.sin(t * 2.3 + b.ph));
      const y = b.y0 + 45 * Math.sin(t * 1.6 + b.ph) + 22 * Math.sin(t * 4.7 + b.ph * 2) + 30 * Math.sin(t * 0.7 + b.ph) ** 3;
      const vx = dt > 0 ? (x - b.x) / dt : 0;
      const vy = dt > 0 ? (y - b.y) / dt : 0;
      b.x = x;
      b.y = y;
      if (x < -200 || x > PW + 200) {
        b.on = false;
        batT = rand(14, 24);
        continue;
      }
      b.flap = (b.flap + dt * b.rate) % 1;
      b.tex.offset.x = Math.floor(b.flap * FRAMES) / FRAMES;
      b.m.visible = true;
      b.m.position.set(...toArt(x, y), 0.003);
      b.m.scale.x = 1;
      b.m.rotation.z = THREE.MathUtils.clamp(Math.atan2(-vy, Math.abs(vx) + 1) * 0.5, -0.4, 0.4) * b.dir;
    }
  }

  function tick(dt) {
    time += dt;
    timeU.value = time;
    fireU.value = 0.85 + 0.1 * Math.sin(time * 7.3) + 0.06 * Math.sin(time * 13.1 + 1.0);
    cookU.value = smooth(time, 0, COOK); // he browns while you're here, then stays golden
    fireGlow.material.uniforms.uK.value = 0.2 * fireU.value * (1 - leave);
    smokeMat.uniforms.uK.value = (0.55 + 0.45 * cookU.value) * (1 - leave); // more as he cooks
    poke(dt);
    bubble(dt);
    shoot(dt);
    flit(dt);
    // leaving, the blister, the shooting star and the bats are gone at once
    if (leave > 0) for (const m of [blister, smear, star, ...spatter.map((d) => d.m), ...bats.map((b) => b.m)]) m.visible = false;
  }

  // On the way to scene 06: k 0 -> 1, the night, the trees, the fire and his hand fade
  // from around the salmon; fish 1 -> 0, then he fades too.
  const [skyPlate] = layers.sky.children;
  const [treesPlate] = layers.trees.children;
  function setLeave(k, fish = 1) {
    leave = leaveU.value = k;
    skyPlate.material.opacity = treesPlate.material.opacity = hand.material.opacity = 1 - k;
    nearPlate.material.opacity = fish;
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
    setLeave,
    // the salmon on the grill, in the group's space: his middle along his belly, and his
    // length, snout to tail
    fish() {
      const [x, y] = [(FISH[0] + FISH[1]) / 2, meta.salmon.bottom];
      return {
        x: frame.x + (frame.s * (x - PW / 2) * D) / PW,
        y: frame.y + (frame.s * (PH / 2 - y) * D) / PW,
        z: -D,
        len: (frame.s * (FISH[1] - FISH[0]) * D) / PW,
      };
    },
  };
}
