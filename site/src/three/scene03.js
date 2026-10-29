import * as THREE from 'three';
import { gsap } from 'gsap';
import { BG } from './scene02.js';
import finegas from './s03-finegas.json';

// Scene 03, on the riverbank above the water: Finegas fishing. The painting is a plate with
// his rod and line painted out (scripts/s03_plate.py); both are drawn live here, and every
// so often he casts: he leans back and lifts his arm, taking the rod back over his shoulder,
// then drives it forward; the line unrolls out over the river, cuts into the water with a
// small ring, and stays there, hanging in the water, until he casts again. He's cut into layers for this
// (scripts/s03_finegas.py): his legs stay in the painting, his upper body leans from the
// hips and his arm swings from the shoulder, with the rod in his hand.
//
// Work is done in the painting's pixels (2912 x 1632, y down) and mapped onto the plate.
// The plate sits at depth D in front of the camera's rest (cover framing: D units wide at
// 16:9). On portrait screens it's shown across the top half instead (Figma: Mobile 03).

const D = 14;
const [PW, PH] = [2912, 1632];
const EXT = 1.0; // the plate runs on below the painting (mirrored water, fading to dark)
const WATER_BAND = 0.12; // the share of the painting at its foot that's open water
const [HIP, SHOULDER] = [finegas.hip, finegas.shoulder];
const HANDS = { x: 1002, y: 1138 };
// the painted rod: leaves his hands at TH degrees, bends BEND along LEN px (fitted)
const ROD = { th: 53.3, bend: 47.7, len: 780 };
const WATER = 1302; // the river's surface, in the painting's px
const LAND_MAX = 1880; // past this the far bank's grass covers the water
const SINK = 70; // how deep the line's end hangs in the water (px)
const REST_FLOAT = { x: 1520, y: WATER + SINK }; // out in the middle of the river
const LINE = { n: 36, len: 780 };
const COLORS = { rod: new THREE.Color('#dcef36'), line: new THREE.Color('#c8e83d') };

const toArt = (px, py) => [((px - PW / 2) * D) / PW, ((PH / 2 - py) * D) / PW];
const rad = THREE.MathUtils.degToRad;

// a flat strip through points (painting px), with a width (px) and opacity along it
function ribbon(max, material) {
  const pos = new Float32Array(max * 2 * 3);
  const col = new Float32Array(max * 2 * 4).fill(1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  material.vertexColors = true;
  const index = [];
  for (let i = 0; i < max - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  function set(pts, width, alpha = () => 1) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      let tx = b[0] - a[0];
      let ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      const w = width(i / (n - 1)) / 2;
      const [x1, y1] = toArt(pts[i][0] - ty * w, pts[i][1] + tx * w);
      const [x2, y2] = toArt(pts[i][0] + ty * w, pts[i][1] - tx * w);
      pos.set([x1, y1, 0, x2, y2, 0], i * 6);
      col[i * 8 + 3] = col[i * 8 + 7] = alpha(i / (n - 1));
    }
    geo.attributes.color.needsUpdate = true;
    geo.setDrawRange(0, Math.max(0, (n - 1) * 6));
    geo.attributes.position.needsUpdate = true;
  }
  return { mesh, set };
}

function rodPoints(hand, th, bend, n = 24) {
  const pts = [[hand[0], hand[1]]];
  let [x, y] = hand;
  for (let i = 0; i < n; i++) {
    const a = rad(th - (bend * (i + 0.5)) / n);
    x += (Math.cos(a) * ROD.len) / n;
    y -= (Math.sin(a) * ROD.len) / n;
    pts.push([x, y]);
  }
  return pts;
}

// The cast, by time since it began (s). Each pose: the rod's angle at his hands and how
// much it bends, his arm's swing at the shoulder and his lean at the hips (degrees,
// anticlockwise on screen: + lifts the arm, + leans him back).
const REST = { th: ROD.th, bend: ROD.bend, arm: 0, lean: 0 };
const BACK = { th: 118, bend: 18, arm: 68, lean: 6 }; // hand up by his head, rod over his shoulder
const FWD = { th: 34, bend: 60, arm: -16, lean: -6 }; // driven forward and down, leaning in
const inOut = gsap.parseEase('power2.inOut');
const snap = gsap.parseEase('power2.in');
const lerp = THREE.MathUtils.lerp;
const mix = (a, b, e) => Object.fromEntries(Object.keys(a).map((k) => [k, lerp(a[k], b[k], e)]));
function castPose(t) {
  if (t < 0.85) return mix(REST, BACK, inOut(t / 0.85)); // back, winding up
  if (t < 1.0) return BACK;
  if (t < 1.4) return mix(BACK, FWD, snap((t - 1.0) / 0.4)); // the forward stroke
  const e = Math.min(1, (t - 1.4) / 1.8); // settling back, the rod springing a little
  const k = Math.exp(-4.5 * e) * (1 - e);
  const body = 1 - inOut(e); // his body eases back without the spring
  return {
    th: REST.th + (FWD.th - REST.th) * k * Math.cos(9 * e),
    bend: REST.bend + (FWD.bend - REST.bend) * k * Math.cos(11 * e),
    arm: FWD.arm * body,
    lean: FWD.lean * body,
  };
}

// a point turned about a pivot (painting px, y down) by deg anticlockwise on screen
function turn([x, y], [px, py], deg) {
  const a = rad(deg);
  const dx = x - px;
  const dy = py - y;
  return [px + dx * Math.cos(a) - dy * Math.sin(a), py - (dx * Math.sin(a) + dy * Math.cos(a))];
}
const handAt = (pose) => turn(turn([HANDS.x, HANDS.y], SHOULDER, pose.arm), HIP, pose.lean);

export async function loadScene03() {
  const [tex, waterTex] = await Promise.all([
    new THREE.TextureLoader().loadAsync(`/images/s03-norod-${window.innerWidth < 1000 ? 1600 : 2912}.webp`),
    new THREE.TextureLoader().loadAsync('/images/s03/water.webp'),
  ]);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapT = THREE.MirroredRepeatWrapping;

  const group = new THREE.Group();
  const art = new THREE.Group(); // the painting's frame: D wide, centred; moved for portrait
  group.add(art);

  // the plate, running on below the painting: just its water band, mirrored and stretched,
  // fading to scene 02's water and then away into it, so the rise up through the surface
  // has no edge
  const h = (D * PH) / PW;
  const geom = new THREE.PlaneGeometry(D, h * (1 + EXT), 1, 24);
  geom.translate(0, (-h * EXT) / 2, 0);
  const uv = geom.attributes.uv;
  const colors = [];
  for (let i = 0; i < uv.count; i++) {
    let v = 1 - (1 - uv.getY(i)) * (1 + EXT); // 1 at the top, 0 at the painting's foot
    const below = v;
    if (v < 0) v = (v / EXT) * WATER_BAND; // below the foot: only the bottom water band, mirrored
    uv.setY(i, v);
    const k = 1 - THREE.MathUtils.smoothstep(-below, 0.0, 0.14); // the painting's foot melts into the water
    colors.push(k, k, k, THREE.MathUtils.smoothstep(below, -EXT, -EXT * 0.55)); // and fades out lower down
  }
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  const plateMat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true });
  // The river moves: below the surface the painting sways a little from side to side and
  // its stripes undulate, more towards the front than out by the far bank, with a faint
  // shimmer. A mask (scripts/s03_water.py) keeps the banks still, and no bank pixel is
  // ever pulled into the water. The vertex colour blends the foot towards scene 02's water.
  const waterTime = { value: 0 };
  plateMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uBg: { value: BG }, uWater: { value: waterTex }, uTime: waterTime });
    shader.fragmentShader = `uniform vec3 uBg;\nuniform sampler2D uWater;\nuniform float uTime;\n${shader.fragmentShader}`
      .replace(
        '#include <map_fragment>',
        `
        vec2 wuv = vMapUv;
        float wet = wuv.y < 0.0 ? 1.0 : texture2D(uWater, wuv).r;
        float near = clamp((${(1 - WATER / PH).toFixed(4)} - wuv.y) / 0.2, 0.0, 1.0);
        float py = wuv.y * ${PH}.0;
        vec2 off = vec2(
          sin(py * 0.9 + uTime * 1.3) * 0.0011 + sin(py * 0.37 - uTime * 0.8) * 0.0008,
          sin(wuv.x * 55.0 + uTime * 0.9 + py * 0.05) * 0.0011
        ) * (0.3 + 0.7 * near) * wet;
        float wet2 = wuv.y + off.y < 0.0 ? 1.0 : texture2D(uWater, wuv + off).r;
        off *= step(0.5, wet2);
        diffuseColor *= texture2D(map, wuv + off);
        diffuseColor.rgb *= 1.0 + 0.06 * wet * sin(wuv.x * 38.0 + py * 0.3 + uTime * 0.7);
        `,
      )
      .replace('#include <color_fragment>', 'diffuseColor.rgb = mix(uBg, diffuseColor.rgb, vColor.r);\ndiffuseColor.a *= vColor.a;');
  };
  const plate = new THREE.Mesh(geom, plateMat);
  art.add(plate);

  // Finegas: upper body (pivots at the hips) and arm (at the shoulder, riding on the body)
  const loader = new THREE.TextureLoader();
  const layerTex = async (name) => {
    const t = await loader.loadAsync(`/images/s03/${name}.webp`);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const [torsoTex, armTex] = await Promise.all([layerTex('torso'), layerTex('arm')]);
  const sprite = (tex, box, pivot, order) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry((box.w * D) / PW, (box.h * D) / PW),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    const [cx, cy] = toArt(box.x + box.w / 2, box.y + box.h / 2);
    const [px, py] = toArt(...pivot);
    m.position.set(cx - px, cy - py, 0);
    m.renderOrder = order;
    return m;
  };
  const body = new THREE.Group();
  body.position.set(...toArt(...HIP), 0.004);
  body.add(sprite(torsoTex, finegas.layers.torso, HIP, 3));
  const arm = new THREE.Group();
  const [sx, sy] = toArt(...SHOULDER);
  const [hx, hy] = toArt(...HIP);
  arm.position.set(sx - hx, sy - hy, 0.002);
  arm.add(sprite(armTex, finegas.layers.arm, SHOULDER, 5));
  body.add(arm);
  art.add(body);

  const strip = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const rod = ribbon(25, strip(COLORS.rod, 1));
  const line = ribbon(LINE.n + 2, strip(COLORS.line, 0.85));
  const under = ribbon(LINE.n + 2, strip(COLORS.line, 1)); // the part in the water, fading with depth
  rod.mesh.position.z = line.mesh.position.z = 0.01;
  under.mesh.position.z = 0.003;
  rod.mesh.renderOrder = 4; // between his body and his arm: his hand closes over it
  line.mesh.renderOrder = 4;
  under.mesh.renderOrder = 1;
  art.add(rod.mesh, line.mesh, under.mesh);

  // the ring where the line lands, flat on the water
  const splashMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uAge: { value: 1 }, uStrength: { value: 1 }, uColor: { value: new THREE.Color('#d8f080') } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec2 vUv;
      uniform float uAge, uStrength;
      uniform vec3 uColor;
      void main() {
        float r = length((vUv - 0.5) * 2.0);
        float a = 0.0;
        for (int i = 0; i < 2; i++) {
          float t = clamp(uAge - float(i) * 0.2, 0.0, 1.0);
          float rad = 0.1 + 0.85 * (1.0 - pow(1.0 - t, 2.0));
          float aa = fwidth(r) * 1.5;
          a += (1.0 - smoothstep(0.04, 0.04 + aa, abs(r - rad))) * (1.0 - t) * step(0.001, t);
        }
        gl_FragColor = vec4(uColor, a * 0.6 * uStrength);
      }`,
  });
  const splash = new THREE.Mesh(new THREE.PlaneGeometry((150 * D) / PW, (34 * D) / PW), splashMat);
  splash.position.z = 0.005;
  splash.visible = false;
  art.add(splash);
  let splashAge = 1;
  let lapT = 2; // seconds to the next small ring where the line goes in

  // ---- the line: a rope of points under gravity, held at the rod's tip ----------------
  // The line pays out to its full length for the cast; once it's in the water he reels in
  // the slack, so it runs from the rod's tip down into the water with only a gentle sag.
  let seg = LINE.len / LINE.n;
  const taut = () => (Math.hypot(tip[0] - float.x, tip[1] - float.y) * 1.03) / LINE.n;
  const P = Array.from({ length: LINE.n + 1 }, () => [0, 0]);
  const O = Array.from({ length: LINE.n + 1 }, () => [0, 0]);
  let float = { ...REST_FLOAT }; // where the end lies on the water, or null while it's flying
  let tip = rodPoints([HANDS.x, HANDS.y], ROD.th, ROD.bend).at(-1);
  function resetLine() {
    for (let i = 0; i <= LINE.n; i++) {
      const f = i / LINE.n;
      P[i] = [lerp(tip[0], float.x, f), lerp(tip[1], float.y, f) + Math.sin(f * Math.PI) * 60];
      O[i] = [...P[i]];
    }
  }
  function stepLine(h) {
    const g = 2600; // px/s²
    for (let i = 1; i <= LINE.n; i++) {
      const p = P[i];
      const o = O[i];
      const wet = p[1] > WATER;
      const damp = wet ? 0.86 : 0.99; // the water holds it; in the air, some drag
      const vx = (p[0] - o[0]) * damp;
      const vy = (p[1] - o[1]) * damp;
      O[i] = [p[0], p[1]];
      p[0] += vx;
      p[1] += vy + (wet ? g * 0.12 : g) * h * h; // under the surface it sinks slowly
      if (p[1] > WATER + SINK * 1.4) p[1] = WATER + SINK * 1.4;
      // it never carries past open water: the line drops short of the far bank's grass
      if (p[0] > LAND_MAX) p[0] = LAND_MAX - (p[0] - LAND_MAX) * 0.2;
    }
    P[0] = [tip[0], tip[1]];
    if (float) P[LINE.n] = [float.x, float.y];
    for (let k = 0; k < 14; k++) {
      for (let i = 0; i < LINE.n; i++) {
        const a = P[i];
        const b = P[i + 1];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const d = Math.hypot(dx, dy) || 1e-6;
        const diff = (d - seg) / d;
        const wa = i === 0 ? 0 : 0.5;
        const wb = i + 1 === LINE.n && float ? 0 : 0.5;
        const s = wa + wb || 1;
        a[0] += (dx * diff * wa) / s;
        a[1] += (dy * diff * wa) / s;
        b[0] -= (dx * diff * wb) / s;
        b[1] -= (dy * diff * wb) / s;
      }
    }
  }

  function reel(dt) {
    if (!float) seg = LINE.len / LINE.n; // in flight: all of it out
    else seg += (taut() - seg) * Math.min(1, dt * 1.6);
  }

  // ---- the cast ---------------------------------------------------------------------------
  let castT = -1; // seconds into a cast, or -1
  let active = false;
  let wait = 3;
  function tick(dt) {
    waterTime.value += dt;
    if (castT < 0 && active && (wait -= dt) <= 0) {
      castT = 0;
      wait = 8 + Math.random() * 5;
    }
    let pose = REST;
    if (castT >= 0) {
      castT += dt;
      pose = castPose(castT);
      if (castT > 0.05 && float && castT < 1) float = null; // the line lifts off the water
      if (castT > 3.4) castT = -1;
    }
    body.rotation.z = rad(pose.lean);
    arm.rotation.z = rad(pose.arm);
    const pts = rodPoints(handAt(pose), pose.th, pose.bend);
    tip = pts.at(-1);
    rod.set(pts, (f) => lerp(7, 2.4, f));

    reel(dt);
    const steps = Math.max(1, Math.ceil(dt * 240));
    for (let i = 0; i < steps; i++) stepLine(dt / steps);
    const end = P[LINE.n];
    if (!float && castT > 1.1 && end[1] >= WATER) {
      float = { x: end[0] - 25, y: WATER + SINK }; // it cuts in, and its end settles below
      if (import.meta.env.DEV) window.__cast = { landed: Math.round(end[0]) };
      splash.position.set(...toArt(end[0], WATER), 0.005);
      splash.scale.setScalar(1);
      splashMat.uniforms.uStrength.value = 1;
      splashAge = 0;
    }
    // above the surface the line is drawn in full; where it goes in, it fades into the water
    let cut = P.findIndex((q) => q[1] > WATER);
    if (cut < 0) cut = P.length;
    const above = P.slice(0, cut);
    const below = P.slice(cut);
    if (cut > 0 && cut < P.length) {
      const [a, b] = [P[cut - 1], P[cut]];
      const f = (WATER - a[1]) / (b[1] - a[1]);
      const at = [lerp(a[0], b[0], f), WATER];
      above.push(at);
      below.unshift(at);
    }
    line.set(above, () => 2.6);
    // under the surface it fades out as it goes down, as if into dark water
    under.set(below.length > 1 ? below : [], () => 2.2, (f) => 0.4 * (1 - f) ** 1.6);

    // where it cuts the surface, a small ring spreads now and then while it lies still
    if (float && castT < 0 && below.length > 1) {
      lapT -= dt;
      if (lapT <= 0 && splashAge >= 1) {
        lapT = 2.8 + Math.random() * 1.6;
        splash.position.set(...toArt(below[0][0], WATER), 0.005);
        splash.scale.setScalar(0.45);
        splashMat.uniforms.uStrength.value = 0.45;
        splashAge = 0;
      }
    }

    if (splashAge < 1) splashAge = Math.min(1, splashAge + dt / 2.4);
    splash.visible = splashAge < 1;
    splashMat.uniforms.uAge.value = splashAge;
  }
  seg = taut();
  resetLine();
  for (let i = 0; i < 240; i++) stepLine(1 / 120); // let it settle into its hang
  tick(0);

  // view: the view's width and height per unit depth at the camera's rest
  let waterY = 0;
  function layout(view) {
    if (view.w < view.h) {
      // portrait: the painting across the top 45% of the screen, Finegas and his line in view
      const s = (0.45 * view.h) / ((PH / PW) * 1); // scale so its height is 45% of the view
      const u = 0.42; // the painting's x at the screen's centre
      art.scale.setScalar(s);
      art.position.set((0.5 - u) * D * s, ((view.h - (PH / PW) * s) * D) / 2, -D);
    } else {
      art.scale.setScalar(1);
      art.position.set(0, 0, -D);
    }
    waterY = art.position.y + toArt(0, WATER)[1] * art.scale.y;
  }

  return {
    group,
    layout,
    tick,
    // casts now and then only while he's in view and the reader has arrived
    setActive: (on) => (active = on),
    // the river's surface, camera-relative at the rest (for the wash on the way up)
    waterY: () => waterY,
  };
}
