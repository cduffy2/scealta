import * as THREE from 'three';
import { BG } from './scene02.js';
import finegas from './s03-finegas.json';
import { ribbon as markRibbon, ringMaterial } from './marks.js';

// Scene 03, on the riverbank above the water: Finegas fishing. The painting is a plate with
// his rod and line painted out (scripts/s03_plate.py); both are drawn live here, and every
// so often he casts overhead: he lifts the rod, bending his elbow to bring his hand up by
// his ear and sweep the rod back over his shoulder, waits for the line to straighten out
// behind, then drives it forward and stops it short, so the rod springs and the line
// shoots out over the river, cuts into the water with a small ring, and stays there,
// hanging in the water, until he casts again. He's cut into layers for this
// (scripts/s03_finegas.py): his legs stay in the painting, his upper body leans from the
// hips and his arm swings from the shoulder and bends at the elbow, with the rod in his hand.
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
const ELBOW = [946, 1131];
// the rod: leaves his hands at TH degrees, bends BEND along LEN px (fitted to the painted
// one, then made a little shorter)
const ROD = { th: 53.3, bend: 47.7, len: 680 };
const WATER = 1302; // the river's surface, in the painting's px
const LAND_MAX = 1880; // past this the far bank's grass covers the water
const SINK = 70; // how deep the line's end hangs in the water (px)
const WEIGHT = 8; // the sinker on the line's end: how many times heavier it is than a stretch of line
const REST_FLOAT = { x: 1520, y: WATER + SINK }; // out in the middle of the river
const LINE = { n: 36, len: 1200 };
const AIM = [1640, 1780]; // where the weight comes down in the river, a little different each cast (px)
const COLORS = { rod: new THREE.Color('#dcef36'), line: new THREE.Color('#c8e83d') };

const toArt = (px, py) => [((px - PW / 2) * D) / PW, ((PH / 2 - py) * D) / PW];
const rad = THREE.MathUtils.degToRad;
// a flat strip through points (painting px), with a width (px) and opacity along it
const ribbon = (max, material) => markRibbon(max, material, toArt);


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
// much it bends, his arm's swing at the shoulder, the bend of his elbow and his lean at the
// hips (degrees, anticlockwise on screen: + swings the elbow forward, + lifts the forearm,
// + leans him back). The body leads and the rod follows: going forward his shoulder and
// elbow move before the rod tip, which lags behind, loading the rod.
const REST = { th: ROD.th, bend: ROD.bend, arm: 0, elbow: 0, lean: 0 };
const CHANNELS = Object.keys(REST);
const KEYS = [
  // t, th, bend, arm, elbow, lean
  [0.0, ROD.th, ROD.bend, 0, 0, 0],
  [0.7, 66, 52, 6, 18, 1], // a slow lift, drawing the weight up out of the water
  [1.25, 104, 26, 24, 46, 4], // the backswing: hand up past his chin, the weight swinging back
  [1.45, 112, 18, 27, 52, 5], // the top, his hand up by his ear
  [1.75, 114, 22, 28, 54, 5], // a beat while the weight swings out behind
  [1.97, 104, 32, 24, 46, 3], // forward: body and elbow lead, the rod tip lags
  [2.21, 78, 50, 13, 28, -3], // a smooth sweep, lobbing the weight out over the river
  [2.39, 56, 40, 5, 10, -5], // and an easy stop
  [2.75, 42, 50, -2, -4, -5], // follow-through, the tip dropping towards the water
  [3.95, ROD.th, ROD.bend, 0, 0, 0],
].map(([t, ...v]) => ({ t, v }));
const STOP = 2.39;
const THROW = [2.05, STOP]; // when he can let the line go: as the rod sweeps forward past upright
const CAST_END = KEYS.at(-1).t;
// smooth through the keys without overshooting them (monotone cubic, Fritsch-Carlson)
const slopes = CHANNELS.map((_, c) => {
  const n = KEYS.length;
  const d = KEYS.slice(1).map((k, i) => (k.v[c] - KEYS[i].v[c]) / (k.t - KEYS[i].t));
  return KEYS.map((_, i) => (i === 0 || i === n - 1 || d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])));
});
const lerp = THREE.MathUtils.lerp;
const G = 2600; // gravity, px/s²
const sinkEase = (x) => 1 - (1 - x) ** 3;
function castPose(t) {
  if (t >= CAST_END) return REST;
  let i = 0;
  while (KEYS[i + 1].t < t) i++;
  const [a, b] = [KEYS[i], KEYS[i + 1]];
  const h = b.t - a.t;
  const x = (t - a.t) / h;
  const [h00, h10, h01, h11] = [2 * x ** 3 - 3 * x ** 2 + 1, x ** 3 - 2 * x ** 2 + x, -2 * x ** 3 + 3 * x ** 2, x ** 3 - x ** 2];
  const pose = Object.fromEntries(
    CHANNELS.map((k, c) => [k, h00 * a.v[c] + h10 * h * slopes[c][i] + h01 * b.v[c] + h11 * h * slopes[c][i + 1]]),
  );
  if (t > STOP) {
    // after the stop the rod springs back and forth a few times as it settles
    const e = t - STOP;
    const k = Math.exp(-5 * e);
    pose.bend += 16 * k * Math.sin(24 * e);
    pose.th += 3 * k * Math.sin(24 * e + 0.6);
  }
  return pose;
}

// a point turned about a pivot (painting px, y down) by deg anticlockwise on screen
function turn([x, y], [px, py], deg) {
  const a = rad(deg);
  const dx = x - px;
  const dy = py - y;
  return [px + dx * Math.cos(a) - dy * Math.sin(a), py - (dx * Math.sin(a) + dy * Math.cos(a))];
}
const handAt = (pose) => turn(turn(turn([HANDS.x, HANDS.y], ELBOW, pose.elbow), SHOULDER, pose.arm), HIP, pose.lean);

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
          sin(py * 0.9 + uTime * 1.3) * 0.0018 + sin(py * 0.37 - uTime * 0.8) * 0.0013 +
            sin(py * 0.11 + wuv.x * 6.0 - uTime * 0.45) * 0.0012, // a slow, longer swell
          sin(wuv.x * 55.0 + uTime * 0.9 + py * 0.05) * 0.0016
        ) * (0.3 + 0.7 * near) * wet;
        float wet2 = wuv.y + off.y < 0.0 ? 1.0 : texture2D(uWater, wuv + off).r;
        off *= step(0.5, wet2);
        diffuseColor *= texture2D(map, wuv + off);
        // shimmer, and faint glints drifting slowly downstream
        diffuseColor.rgb *= 1.0 + wet * (0.09 * sin(wuv.x * 38.0 + py * 0.3 + uTime * 0.7) +
          0.07 * pow(0.5 + 0.5 * sin(wuv.x * 90.0 - uTime * 0.6 + sin(py * 0.2 + uTime * 0.3) * 2.0), 6.0));
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
  const sleeve = sprite(armTex, finegas.layers.arm, SHOULDER, 5);
  arm.add(sleeve);
  body.add(arm);
  // His elbow bends: the sleeve is a fine mesh whose forearm turns about the elbow, blending
  // into the upper arm over the first stretch of the forearm (each point weighted by how far
  // along the forearm it lies), so the crease stays soft and the sleeve bunched under the
  // elbow stays with it.
  const ab = finegas.layers.arm;
  sleeve.geometry.dispose();
  sleeve.geometry = new THREE.PlaneGeometry((ab.w * D) / PW, (ab.h * D) / PW, 24, 24);
  const toSleeve = ([px, py]) => [((px - ab.x - ab.w / 2) * D) / PW, ((ab.y + ab.h / 2 - py) * D) / PW];
  const sleevePos = sleeve.geometry.attributes.position;
  const sleeveRest = Float32Array.from(sleevePos.array);
  const fl = Math.hypot(HANDS.x - ELBOW[0], HANDS.y - ELBOW[1]);
  const fore = [(HANDS.x - ELBOW[0]) / fl, (HANDS.y - ELBOW[1]) / fl];
  const sleeveW = Array.from({ length: sleevePos.count }, (_, i) => {
    const px = ab.x + ab.w / 2 + (sleeveRest[i * 3] * PW) / D - ELBOW[0];
    const py = ab.y + ab.h / 2 - (sleeveRest[i * 3 + 1] * PW) / D - ELBOW[1];
    return THREE.MathUtils.smoothstep(px * fore[0] + py * fore[1], 4, 24); // px along the forearm
  });
  const [elx, ely] = toSleeve(ELBOW);
  function bendElbow(deg) {
    const [c, sn] = [Math.cos(rad(deg)), Math.sin(rad(deg))];
    for (let i = 0; i < sleevePos.count; i++) {
      const x = sleeveRest[i * 3] - elx;
      const y = sleeveRest[i * 3 + 1] - ely;
      const w = sleeveW[i];
      sleevePos.setXY(i, elx + x + w * (x * c - y * sn - x), ely + y + w * (x * sn + y * c - y));
    }
    sleevePos.needsUpdate = true;
  }
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
  const splashMat = ringMaterial('#d8f080');
  const splash = new THREE.Mesh(new THREE.PlaneGeometry((150 * D) / PW, (34 * D) / PW), splashMat);
  splash.position.z = 0.005;
  splash.visible = false;
  art.add(splash);
  let splashAge = 1;
  let lapT = 2; // seconds to the next small ring where the line goes in

  // ---- swallows ----------------------------------------------------------------------------
  // Every so often two or three swallows dart low across the river, flicking their wings in
  // bursts between glides, and now and then one dips to the water and leaves a small ring.
  const ringMat = splashMat.clone(); // a ring of their own, so it can't cut the line's short
  const ring = new THREE.Mesh(splash.geometry, ringMat);
  ring.scale.setScalar(0.4);
  ring.visible = false;
  art.add(ring);
  let ringAge = 1;
  const birds = [0, 1, 2].map(() => {
    const r = ribbon(5, strip(new THREE.Color('#e8e2c4'), 0.95));
    r.mesh.position.z = 0.012;
    r.mesh.renderOrder = 6;
    art.add(r.mesh);
    return { ...r, on: false };
  });
  let flockT = 5; // seconds to the next pass
  function launch() {
    const dir = Math.random() < 0.5 ? 1 : -1;
    const n = Math.random() < 0.5 ? 2 : 3;
    const dipper = Math.floor(Math.random() * n * 1.5); // sometimes none of them
    birds.forEach((b, i) =>
      Object.assign(b, {
        on: i < n,
        dir,
        t: -i * 0.3 - Math.random() * 0.25, // they follow one another
        y: 1195 + Math.random() * 65, // skimming low over the water
        speed: 900 + Math.random() * 250, // px/s: across the river in about 3 s
        phase: Math.random() * 6,
        dip: i === dipper ? lerp(1250, 1700, Math.random()) : null, // where it touches the water
        dipped: false,
      }),
    );
  }
  function flyBirds(dt) {
    if (active && (flockT -= dt) <= 0 && !birds.some((b) => b.on)) {
      launch();
      flockT = 15 + Math.random() * 10;
    }
    for (const b of birds) {
      if (b.on) b.t += dt;
      if (!b.on || b.t < 0) {
        b.set([], () => 0);
        continue;
      }
      const x = (b.dir > 0 ? -60 : PW + 60) + b.dir * b.speed * b.t;
      if (x < -80 || x > PW + 80) b.on = false;
      let y = b.y + Math.sin(b.t * 2.3 + b.phase) * 22;
      if (b.dip) {
        const k = Math.exp(-(((x - b.dip) / 170) ** 2)); // down to the surface and up again
        y = lerp(y, WATER - 5, k);
        if (k > 0.97 && !b.dipped) {
          b.dipped = true;
          ring.position.set(...toArt(x, WATER), 0.005);
          ringAge = 0;
        }
      }
      // wings beat in quick bursts between glides (held a little raised)
      const beating = Math.sin(b.t * 1.9 + b.phase) > -0.3;
      const f = beating ? Math.sin(b.t * 24 + b.phase) : 0.3;
      const pts = [
        [x - 22, y - 14 * f],
        [x - 10, y - 3 - 3 * f],
        [x, y],
        [x + 10, y - 3 - 3 * f],
        [x + 22, y - 14 * f],
      ];
      b.set(pts, (k) => lerp(1.8, 5.2, 1 - Math.abs(k * 2 - 1)));
    }
    if (ringAge < 1) ringAge = Math.min(1, ringAge + dt / 1.8);
    ring.visible = ringAge < 1;
    ringMat.uniforms.uAge.value = ringAge;
    ringMat.uniforms.uStrength.value = 0.4;
  }

  // ---- the line: a rope of points under gravity, held at the rod's tip ----------------
  // There's a small weight on its end (not drawn), and he casts it the way you cast a
  // weight: raising the rod draws it through the water and lifts it out, the line keeping
  // its length; he swings it back over his shoulder, then sweeps it forward and lets the
  // line run, so the weight flies out over the river in an arc, drawing the line off the
  // reel behind it. The weight carries its
  // momentum where the light line is slowed by the air, and the line is a little stiff, so
  // it curves rather than folds. The weight goes in with a firm splash and sinks where it
  // went in, holding the line, and he reels in the slack until it runs from the rod's tip
  // down into the water, held fairly straight.
  let seg = LINE.len / LINE.n;
  let thrown = false; // he has let the line go this cast: the weight flies free
  let aim = null; // where in the river he means it to come down
  let wet = true; // the weight is under the water
  const taut = () => (Math.hypot(tip[0] - float.x, tip[1] - float.y) * 1.02) / LINE.n;
  const P = Array.from({ length: LINE.n + 1 }, () => [0, 0]);
  const O = Array.from({ length: LINE.n + 1 }, () => [0, 0]);
  let float = { ...REST_FLOAT }; // where the weight is held in the water, or null while it flies
  let sinking = null; // while it sinks after going in: { t: seconds since, x, y: where it went in }
  let tip = rodPoints([HANDS.x, HANDS.y], ROD.th, ROD.bend).at(-1);
  function resetLine() {
    for (let i = 0; i <= LINE.n; i++) {
      const f = i / LINE.n;
      P[i] = [lerp(tip[0], float.x, f), lerp(tip[1], float.y, f) + Math.sin(f * Math.PI) * 60];
      O[i] = [...P[i]];
    }
  }
  // how far each point gives: the rod's tip and a settled weight not at all, the weight on
  // the swing a little (it's heavy), the line freely; once thrown, the weight flies free and
  // the line only follows it
  const give = (i) => (i === 0 ? 0 : i === LINE.n ? (float || thrown ? 0 : 1 / WEIGHT) : 1);
  const dist = (i, j) => Math.hypot(P[j][0] - P[i][0], P[j][1] - P[i][1]);
  // keep points i and j `len` apart; only pull together (side 1), only push apart (side -1)
  function link(i, j, len, side = 0, k = 1) {
    const [a, b] = [P[i], P[j]];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1e-6;
    if ((side > 0 && d < len) || (side < 0 && d > len)) return;
    const [wa, wb] = [give(i), give(j)];
    const f = (k * (d - len)) / d / (wa + wb || 1);
    a[0] += dx * f * wa;
    a[1] += dy * f * wa;
    b[0] -= dx * f * wb;
    b[1] -= dy * f * wb;
  }
  function stepLine(h) {
    const g = G;
    for (let i = 1; i <= LINE.n; i++) {
      const p = P[i];
      const o = O[i];
      const wet = p[1] > WATER;
      const weight = i === LINE.n;
      // the water holds it; in the air the line feels some drag, the weight hardly any
      const damp = wet ? (weight ? 0.93 : 0.86) : weight ? 0.9998 : 0.993;
      const vx = (p[0] - o[0]) * damp;
      const vy = (p[1] - o[1]) * damp;
      O[i] = [p[0], p[1]];
      p[0] += vx;
      p[1] += vy + (wet ? g * (weight ? 0.4 : 0.12) : g) * h * h; // under the surface the line sinks slowly, the weight faster
      const floor = WATER + (weight ? SINK : SINK * 1.4);
      if (p[1] > floor) p[1] = floor;
      // it never carries past open water: the line drops short of the far bank's grass
      if (p[0] > LAND_MAX) [p[0], O[i][0]] = [LAND_MAX, LAND_MAX];
    }
    P[0] = [tip[0], tip[1]];
    if (float) P[LINE.n] = [float.x, float.y];
    for (let k = 0; k < 14; k++) {
      for (let i = 0; i < LINE.n; i++) {
        link(i, i + 1, seg, thrown && !float ? 1 : 0); // running off the reel it can't be pushed out
        // stiffness: it can't bend too sharply at any point (two links on can't come in
        // closer than this, for the links' lengths as they are, so slack line isn't pushed out)
        if (i < LINE.n - 1) link(i, i + 2, 0.92 * (dist(i, i + 1) + dist(i + 1, i + 2)), -1, 0.5);
      }
    }
  }

  // He lets the line go the moment the weight, swinging forward, is going fast enough to
  // carry to x, and it flies on over the river under gravity (the air hardly slows it), the
  // line running out behind it. The speed it needs for its heading is a plain throw's; it's
  // let go at just that speed, so it carries on without a jolt. Past the window he lets go
  // anyway, lobbing it at 35°. In flight (steer) its speed is kept to what it needs to
  // come down at x, so it lands there whatever the frame rate. h: the step.
  function tryThrow(x, h, late, steer) {
    const w = P[LINE.n];
    let [ux, uy] = [(w[0] - O[LINE.n][0]) / h, (O[LINE.n][1] - w[1]) / h]; // velocity, y up
    const speed = Math.hypot(ux, uy);
    [ux, uy] = late || speed < 1 ? [Math.cos(rad(35)), Math.sin(rad(35))] : [ux / speed, uy / speed];
    const dx = steer ? x - w[0] : Math.min(LAND_MAX - 30, Math.max(x, w[0] + 60)) - w[0];
    const drop = WATER - w[1] + (dx * uy) / ux; // how far below its line of flight it has to fall
    if (steer && (dx < 20 || ux < 0.3 || drop <= 0)) return;
    if (ux < 0.3 || drop <= 0) return late && tryThrow(x, h, false); // not heading out yet
    const v = Math.sqrt((G * dx * dx) / (2 * ux * ux * drop));
    if (speed < v && !late && !steer) return;
    O[LINE.n] = [w[0] - ux * v * h, w[1] + uy * v * h];
    thrown = true;
  }
  function reel(dt) {
    if (float) seg += (taut() - seg) * Math.min(1, dt * 1.6); // taking up the slack
    else if (thrown) {
      // the weight draws the line off the reel as it flies: just as much as it needs, with a
      // little to spare for a gentle sag, so no slack gathers at the rod's tip
      seg = Math.min(LINE.len / LINE.n, (Math.hypot(P[LINE.n][0] - tip[0], P[LINE.n][1] - tip[1]) * 1.04) / LINE.n);
    } // otherwise the line keeps its length: only the rod moves the weight
  }

  // ---- the cast ---------------------------------------------------------------------------
  let castT = -1; // seconds into a cast, or -1
  let active = false;
  let wait = 3;
  function tick(dt) {
    waterTime.value += dt;
    flyBirds(dt);
    if (castT < 0 && active && (wait -= dt) <= 0) {
      castT = 0;
      [thrown, aim] = [false, null];
      wait = 8 + Math.random() * 5;
    }
    let pose = REST;
    if (castT >= 0) {
      castT += dt;
      pose = castPose(castT);
      if (castT > 0.05 && castT < 1.4 && float) [float, sinking] = [null, null]; // he lifts the weight out of the water
      if (castT > CAST_END) castT = -1;
    }
    body.rotation.z = rad(pose.lean);
    arm.rotation.z = rad(pose.arm);
    bendElbow(pose.elbow);
    const pts = rodPoints(handAt(pose), pose.th, pose.bend);
    tip = pts.at(-1);
    rod.set(pts, (f) => lerp(7, 2.4, f));

    const steps = Math.max(1, Math.ceil(dt * 240));
    if (castT >= THROW[0] && !thrown && !float) {
      aim ??= lerp(AIM[0], AIM[1], Math.random());
      tryThrow(aim, dt / steps, castT >= THROW[1]);
    } else if (thrown && !float && aim) tryThrow(aim, dt / steps, false, true);
    reel(dt);
    for (let i = 0; i < steps; i++) stepLine(dt / steps);
    const end = P[LINE.n];
    // a small ring where the rod lifts the weight out of the water
    if (wet && end[1] < WATER && !float && splashAge >= 0.5) {
      splash.position.set(...toArt(end[0], WATER), 0.005);
      splash.scale.setScalar(0.6);
      splashMat.uniforms.uStrength.value = 0.5;
      splashAge = 0;
    }
    wet = end[1] >= WATER;
    if (!float && thrown && end[1] >= WATER) {
      // the weight goes in with a plop and sinks where it went in, holding the line there
      sinking = { t: 0, x: end[0], y: WATER };
      float = { x: end[0], y: WATER };
      if (import.meta.env.DEV) window.__cast = { landed: Math.round(end[0]) };
      splash.position.set(...toArt(end[0], WATER), 0.005);
      splash.scale.setScalar(1.2);
      splashMat.uniforms.uStrength.value = 1.3;
      splashAge = 0;
    }
    // it slows as it sinks, swinging in a little on the line as he takes up the slack
    if (sinking) {
      const k = sinkEase(Math.min(1, (sinking.t += dt) / 1.1));
      float = { x: sinking.x - 30 * k, y: sinking.y + SINK * k };
      if (k >= 1) sinking = null;
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
  }

  return {
    group,
    layout,
    tick,
    // casts now and then only while he's in view and the reader has arrived
    setActive: (on) => (active = on),
    // where his line goes into the river (group-relative), for the camera to follow it in
    lineEntry() {
      const [x, y] = toArt((float ?? REST_FLOAT).x, WATER);
      return new THREE.Vector3(art.position.x + x * art.scale.x, art.position.y + y * art.scale.y, art.position.z);
    },
  };
}
