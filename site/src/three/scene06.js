import * as THREE from 'three';
import meta from './s06-teacher.json';

// Scene 06, the teacher: the next morning, Finegas and Fionn sit on the grass by the hut,
// the rest of the salmon beside them. The camera pulls back to it from scene 05: scene 05
// is shrunk to sit on this one, its salmon over the one on the grass, and as the camera
// draws back the fire and the night fade from around him, the light comes up from the far
// hills to the near grass, and he settles into the small salmon lying there. Here the
// grass stirs in slow waves as a breeze runs across it and its dashes catch the light, the
// light runs along the salmon now and then, Finegas's hair lifts in the gusts, and every
// so often one of them turns to look at the other for a while: Fionn up at him, or he down
// at the boy (never both at once), then back out over the hills. On the hills to the right
// a few sheep graze, wander on a few steps, and graze again.
//
// It's one plate (the pull back is straight back, so layers in depth would only grow at
// slightly different rates), with a mask (scripts/s06_layers.py) for his hair, for what
// stands still, and for the salmon. Their heads are gone from the plate; each is drawn from
// a strip of frames of it turning, over the meadow behind. The sheep are drawn over it from
// a strip of frames too (scripts/s06_sheep.py). Work is done in the painting's pixels (2912 x 1632,
// y down), mapped onto a plate D units wide at depth D in front of the camera's rest
// (cover framing, like scene 05). On portrait screens it's shown across the top, the two
// of them and the salmon in view (Figma: Mobile 06).

const D = 14;
const EXT = 0.35; // how far the plate runs on past its sides, mirrored (share of its size)
const FOOT = 1.4; // and below its foot, where it's the night (the text sits there on phones)
const [PW, PH] = meta.size;
const SALMON = meta.salmon;
const HAIR = meta.hair;
const FIONN = meta.fionn;
const FINEGAS = meta.finegas;
const NIGHT = 'vec3(0.012, 0.035, 0.012)';
// drawn among scene 05's layers on the way back: over its night, its trees and its smoke,
// under its near plate (UNDER + 2), whose salmon settles onto this one
const ORDER = 2 + 1.95;
const GLEAM = 1.4; // seconds for the light to run along the salmon
// one of them looking at the other: seconds to turn, to look (range), and to turn back;
// Finegas, the older, slower. Between looks (either's), seconds (range).
const LOOKS = {
  fionn: { up: 0.8, hold: [1.8, 3], down: 1.1 },
  finegas: { up: 1.3, hold: [2.2, 3.5], down: 1.5 },
};
const WAIT = [3.5, 6];
// the sheep's frames: W x H painting px, feet FEET px down; grazing (0, 1), its head half up
// (2), walking (3, 4). Seconds grazing and walking (ranges), px a second, seconds lifting.
const SHEEP = { w: 48, h: 32, feet: 27, frames: 5, graze: [4, 9], walk: [1.5, 3.5], speed: 5, lift: 0.35 };
// where they wander, along the lines on the hills (painting px, at their feet), how big they
// are there (the farther, smaller), and how far along they start
const FLOCK = [
  { path: [[2260, 455], [2400, 432], [2560, 424]], scale: 1, at: 60 },
  { path: [[2300, 540], [2440, 518], [2560, 514]], scale: 1.05, at: 190 },
  { path: [[2480, 235], [2620, 216], [2760, 214]], scale: 0.75, at: 170 },
  { path: [[2690, 96], [2830, 82]], scale: 0.6, at: 40 },
  { path: [[2750, 568], [2880, 528]], scale: 1.1, at: 90 },
  { path: [[1815, 268], [1935, 306]], scale: 0.8, at: 30 },
];

export async function loadScene06() {
  const loader = new THREE.TextureLoader();
  const load = async (url, color = true) => {
    const t = await loader.loadAsync(url);
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const size = window.innerWidth < 1000 ? 1600 : 2912;
  const [tex, maskTex, fionnTex, finegasTex, sheepTex] = await Promise.all([
    load(`/images/s06-plate-${size}.webp`),
    load('/images/s06/mask.webp', false),
    load('/images/s06/fionn.webp'),
    load('/images/s06/finegas.webp'),
    load('/images/s06/sheep.webp'),
  ]);
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  for (const t of [maskTex, fionnTex, finegasTex, sheepTex]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  // the frame strips are sampled only inside their boxes, where a mipmap would be picked by
  // the jump at the box's edge and show there as a line; they're drawn near their size anyway
  for (const t of [fionnTex, finegasTex, sheepTex]) (t.generateMipmaps = false), (t.minFilter = THREE.LinearFilter);

  const group = new THREE.Group();
  const near = new THREE.Group(); // the painting's frame (D wide, centred) at depth D
  group.add(near);
  let time = 0;
  const uniforms = {
    uTime: { value: 0 },
    uMask: { value: maskTex },
    uDawn: { value: 1 }, // 0 still the night, 1 the morning
    uGleam: { value: -1 }, // where the light is along the salmon, snout (0) to tail (1)
    uFionn: { value: fionnTex },
    uLook: { value: 0 }, // how far Fionn has turned to look up at Finegas, 0 -> 1
    uFinegas: { value: finegasTex },
    uBow: { value: 0 }, // how far Finegas has turned to look down at him, 0 -> 1
    uSheepTex: { value: sheepTex },
    uSheep: { value: FLOCK.map(() => new THREE.Vector4()) }, // each: x, y (its feet), frame, facing (1 right, -1 left)
    uSheepB: { value: FLOCK.map((f) => new THREE.Vector2(0, f.scale)) }, // each: its tilt (radians), its size
  };

  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = `uniform float uTime;\nuniform sampler2D uMask;\nuniform float uDawn;\nuniform float uGleam;\nuniform sampler2D uFionn;\nuniform float uLook;\nuniform sampler2D uFinegas;\nuniform float uBow;\nuniform sampler2D uSheepTex;\nuniform vec4 uSheep[${FLOCK.length}];\nuniform vec2 uSheepB[${FLOCK.length}];\n${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `
      vec2 wuv = vMapUv;
      vec2 px = vec2(wuv.x * ${PW}.0, (1.0 - wuv.y) * ${PH}.0); // painting px, y down
      float inside = step(0.0, wuv.x) * step(wuv.x, 1.0) * step(0.0, wuv.y);
      vec4 m = texture2D(uMask, clamp(wuv, 0.0, 1.0)) * inside; // r his hair, g still, b the salmon
      float still = m.g;
      // The grass stirs in slow, broad waves, more near us, as if a breeze ran across it.
      float nearer = smoothstep(500.0, 1500.0, px.y);
      vec2 off = vec2(
        sin(px.y * 0.035 + wuv.x * 4.0 - uTime * 0.9) * 0.0006 + sin(px.y * 0.011 + wuv.x * 2.0 - uTime * 0.4) * 0.0005,
        sin(wuv.x * 11.0 - uTime * 0.5) * 0.0004
      ) * (0.3 + 0.7 * nearer) * (1.0 - still);
      vec4 texel = texture2D(map, wuv + off);
      // Finegas's head, from its strip of frames (between two, as he turns), over the plate;
      // his hair lifts in the gusts, its ends more than at his crown.
      vec2 gl0 = vec2(${FINEGAS.x0}.0, ${FINEGAS.y0}.0);
      vec2 gsz = vec2(${FINEGAS.x1 - FINEGAS.x0}.0, ${FINEGAS.y1 - FINEGAS.y0}.0);
      vec2 gf = (px - gl0) / gsz;
      if (gf.x > 0.0 && gf.x < 1.0 && gf.y > 0.0 && gf.y < 1.0) {
        float ends = clamp((px.y - ${HAIR.y0}.0) / ${HAIR.y1 - HAIR.y0}.0, 0.0, 1.0);
        float gust = 0.55 + 0.45 * sin(uTime * 0.6) * sin(uTime * 0.23 + 1.0);
        gf.x -= ends * gust * (sin(uTime * 1.9 + px.y * 0.06) * 0.0009 + sin(uTime * 3.1 - px.y * 0.11) * 0.0004) * ${PW}.0 / gsz.x;
        float f = uBow * ${FINEGAS.frames - 1}.0;
        float f0 = floor(f);
        float f1 = min(f0 + 1.0, ${FINEGAS.frames - 1}.0);
        vec2 at = vec2(clamp(gf.x, 0.0, 1.0) / ${FINEGAS.frames}.0, 1.0 - gf.y);
        vec4 head = mix(texture2D(uFinegas, at + vec2(f0 / ${FINEGAS.frames}.0, 0.0)), texture2D(uFinegas, at + vec2(f1 / ${FINEGAS.frames}.0, 0.0)), f - f0);
        texel.rgb = mix(texel.rgb, head.rgb, head.a);
      }
      // the sheep, tilted with the hill, turned the way they're going
      float flock = 0.0;
      for (int i = 0; i < ${FLOCK.length}; i++) {
        vec4 sh = uSheep[i];
        vec2 d = (px - sh.xy) / uSheepB[i].y;
        float c = cos(uSheepB[i].x), s = sin(uSheepB[i].x);
        d = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
        vec2 q = vec2(d.x * sh.w / ${SHEEP.w}.0 + 0.5, (d.y + ${SHEEP.feet}.0) / ${SHEEP.h}.0);
        if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) {
          vec4 one = texture2D(uSheepTex, vec2((q.x + sh.z) / ${SHEEP.frames}.0, 1.0 - q.y));
          texel.rgb = mix(texel.rgb, one.rgb, one.a);
          flock = max(flock, one.a);
        }
      }
      still = max(still, flock);
      // Fionn's head, from its strip of frames (between two, as he turns), faded in from the
      // edges of its box, where it's only the meadow
      vec2 fl = (px - vec2(${FIONN.x0}.0, ${FIONN.y0}.0)) / vec2(${FIONN.x1 - FIONN.x0}.0, ${FIONN.y1 - FIONN.y0}.0);
      if (fl.x > 0.0 && fl.x < 1.0 && fl.y > 0.0 && fl.y < 1.0) {
        float f = uLook * ${FIONN.frames - 1}.0;
        float f0 = floor(f);
        float f1 = min(f0 + 1.0, ${FIONN.frames - 1}.0);
        vec2 at = vec2(fl.x / ${FIONN.frames}.0, 1.0 - fl.y);
        vec3 head = mix(texture2D(uFionn, at + vec2(f0 / ${FIONN.frames}.0, 0.0)).rgb, texture2D(uFionn, at + vec2(f1 / ${FIONN.frames}.0, 0.0)).rgb, f - f0);
        vec2 edge = min(fl, 1.0 - fl) * vec2(${FIONN.x1 - FIONN.x0}.0, ${FIONN.y1 - FIONN.y0}.0);
        texel.rgb = mix(texel.rgb, head, smoothstep(2.0, 10.0, min(edge.x, edge.y)));
      }
      diffuseColor *= texel;
      // A band of light runs across the grass with the breeze, and its dashes catch the sun.
      float lum = dot(texel.rgb, vec3(0.3, 0.59, 0.11));
      float band = pow(max(0.0, sin(wuv.x * 5.0 - uTime * 0.35 + px.y * 0.003)), 8.0);
      float tw = pow(max(0.0, sin(px.x * 0.05 + uTime * 0.7 + sin(px.y * 0.3) * 3.0) * sin(px.y * 0.21 - uTime * 0.45 + px.x * 0.002)), 10.0);
      diffuseColor.rgb *= 1.0 + (1.0 - still) * smoothstep(0.15, 0.5, lum) * (0.08 * band + 0.3 * tw);
      // Now and then the light runs along the salmon, snout to tail.
      float along = (px.x - ${SALMON.x0}.0) / ${SALMON.x1 - SALMON.x0}.0;
      float gl = exp(-pow((along - uGleam) * 7.0, 2.0)) * m.b;
      diffuseColor.rgb += gl * 0.45 * vec3(1.0, 0.75, 0.45) * texel.rgb;
      // The morning comes: from the night, through a first warm light, to the day, the far
      // hills first and the grass by them last.
      float d = clamp(uDawn * 1.5 - (px.y / ${PH}.0) * 0.5, 0.0, 1.0);
      float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
      vec3 night = l * vec3(0.05, 0.12, 0.07);
      vec3 first = diffuseColor.rgb * vec3(1.12, 0.92, 0.62);
      vec3 c = mix(night, first, smoothstep(0.0, 0.6, d));
      diffuseColor.rgb = mix(c, diffuseColor.rgb, smoothstep(0.55, 1.0, d));
      // past its foot it fades to the night (on phones the text sits there)
      float foot = smoothstep(0.0, 0.025, -wuv.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, ${NIGHT}, foot);
      diffuseColor.a = max(diffuseColor.a, foot * opacity);
      `,
    );
  };
  const h = (D * PH) / PW;
  const geo = new THREE.PlaneGeometry(D * (1 + 2 * EXT), h * (1 + 2 * EXT + FOOT));
  geo.translate(0, (h * -FOOT) / 2, 0);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (1 + 2 * EXT) - EXT, uv.getY(i) * (1 + 2 * EXT + FOOT) - EXT - FOOT);
  const plate = new THREE.Mesh(geo, mat);
  plate.renderOrder = ORDER;
  near.add(plate);

  let gleamT = 3; // seconds to the next
  let lookT = 4; // seconds to the next look
  let look = -1; // seconds into one, -1 between
  let who = 'finegas'; // whose look it is (Fionn's first)
  let hold = 2;
  const ease = (x) => x * x * (3 - 2 * x);
  const pose = { fionn: uniforms.uLook, finegas: uniforms.uBow };
  const rand = ([a, b]) => a + Math.random() * (b - a);
  // each sheep grazes a while, lifts its head, walks on a few steps (or turns back, at the end
  // of its way), and lowers its head to graze again
  const flock = FLOCK.map((f) => {
    const legs = f.path.slice(1).map((p, i) => Math.hypot(p[0] - f.path[i][0], p[1] - f.path[i][1]));
    return { ...f, legs, len: legs.reduce((a, b) => a + b), s: f.at, dir: Math.random() < 0.5 ? 1 : -1, mode: 'graze', t: rand([0.5, 4]), crop: 0, frame: 0 };
  });
  function herd(dt) {
    flock.forEach((sh, i) => {
      sh.t -= dt;
      if (sh.mode === 'graze') {
        if ((sh.crop -= dt) <= 0) (sh.frame = sh.frame === 0 ? 1 : 0), (sh.crop = rand([0.3, 0.8]));
        if (sh.t <= 0) {
          sh.mode = 'lift';
          sh.t = SHEEP.lift;
          const room = sh.dir > 0 ? sh.len - sh.s : sh.s;
          if (room < 25 || Math.random() < 0.2) sh.dir = -sh.dir;
        }
      } else if (sh.mode === 'lift') {
        sh.frame = 2;
        if (sh.t <= 0) (sh.mode = 'walk'), (sh.t = rand(SHEEP.walk));
      } else if (sh.mode === 'walk') {
        sh.s = Math.min(sh.len, Math.max(0, sh.s + sh.dir * SHEEP.speed * sh.scale * dt));
        sh.frame = 3 + (Math.floor(sh.s / (2.5 * sh.scale)) % 2); // its legs go with its steps
        if (sh.t <= 0) (sh.mode = 'lower'), (sh.t = SHEEP.lift);
      } else {
        sh.frame = 2;
        if (sh.t <= 0) (sh.mode = 'graze'), (sh.t = rand(SHEEP.graze));
      }
      // where it is along its way, and the way's slope there
      let s = sh.s;
      let k = 0;
      while (k < sh.legs.length - 1 && s > sh.legs[k]) s -= sh.legs[k++];
      const [a, b] = [sh.path[k], sh.path[k + 1]];
      const u = s / sh.legs[k];
      uniforms.uSheep.value[i].set(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, sh.frame, sh.dir);
      uniforms.uSheepB.value[i].x = Math.atan2(b[1] - a[1], b[0] - a[0]);
    });
  }
  function tick(dt) {
    time += dt;
    uniforms.uTime.value = time;
    if (uniforms.uGleam.value < 0 && (gleamT -= dt) <= 0) uniforms.uGleam.value = 0;
    if (uniforms.uGleam.value >= 0) {
      uniforms.uGleam.value += dt / GLEAM;
      if (uniforms.uGleam.value > 1.3) {
        uniforms.uGleam.value = -1;
        gleamT = 5 + Math.random() * 4;
      }
    }
    herd(dt);
    // One of them turns to look at the other, looks a while, and turns back; mostly they
    // take turns, now and then the same one looks again.
    if (look < 0 && (lookT -= dt) <= 0) {
      if (Math.random() < 0.8) who = who === 'fionn' ? 'finegas' : 'fionn';
      look = 0;
      const L = LOOKS[who];
      hold = L.hold[0] + Math.random() * (L.hold[1] - L.hold[0]);
    }
    if (look >= 0) {
      const L = LOOKS[who];
      look += dt;
      const back = look - L.up - hold;
      pose[who].value = back < 0 ? ease(Math.min(1, look / L.up)) : 1 - ease(Math.min(1, back / L.down));
      if (back >= L.down) {
        look = -1;
        pose[who].value = 0;
        lookT = WAIT[0] + Math.random() * (WAIT[1] - WAIT[0]);
      }
    }
  }

  // view: the view's width and height per unit depth at the camera's rest
  let frame = { x: 0, y: 0, s: 1 };
  function layout(view) {
    if (view.w < view.h) {
      // portrait: the painting across the top of the screen, the two of them and the salmon in view
      const s = (0.4 * view.h) / (PH / PW); // scale so its height is 40% of the view
      const u = 0.6; // the painting's x at the screen's centre
      frame = { x: (0.5 - u) * D * s, y: ((view.h - (PH / PW) * s) * D) / 2, s };
    } else frame = { x: 0, y: 0, s: 1 };
    near.position.set(frame.x, frame.y, -D);
    near.scale.setScalar(frame.s);
  }

  tick(0);
  if (import.meta.env.DEV) window.__scene06 = { uniforms, hold: (v, w = 0) => ((look = -1), (lookT = Infinity), (uniforms.uLook.value = v), (uniforms.uBow.value = w)) };
  return {
    group,
    layout,
    tick,
    setDawn: (d) => (uniforms.uDawn.value = d),
    setShow: (k) => (mat.opacity = k), // on the way back it comes up out of the dark
    // the salmon on the grass, in the group's space: his middle along his belly, and his
    // length, snout to tail
    fish() {
      const [x, y] = [(SALMON.x0 + SALMON.x1) / 2, SALMON.y1];
      return {
        x: frame.x + (frame.s * (x - PW / 2) * D) / PW,
        y: frame.y + (frame.s * (PH / 2 - y) * D) / PW,
        z: -D,
        len: (frame.s * (SALMON.x1 - SALMON.x0) * D) / PW,
      };
    },
  };
}
