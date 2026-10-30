import * as THREE from 'three';
import meta from './s04-catch.json';
import { ribbon as markRibbon, ringMaterial } from './marks.js';

// Scene 04, the catch: the salmon hooked on Finegas's line, straining up out of the water at
// night. The painting is a plate with the salmon, the line and the drops of water around him
// lifted out (scripts/s04_layers.py); here he twists and strains on the line, which stays
// taut to his jaw and tugs with him, now and then he thrashes, drops of water keep falling
// from him and ring the water where they land, gold ripples spread from where he breaks the
// surface, the water shimmers and the moon glows faintly.
//
// Work is done in the painting's pixels (2912 x 1632, y down), mapped onto a plate D units
// wide at depth D in front of the camera's rest (cover framing, like scene 03). On portrait
// screens it's shown across the top half, the salmon in view (Figma: Mobile 04).
//
// It opens out of scene 03, from where Finegas's line goes into the river (setReveal): a
// widening circle around where the salmon breaks the water (FOCUS), the rest following.

const D = 14;
const EXT = 0.35; // how far the plate runs on past each edge, mirrored (share of its size)
const FOOT = 1; // and below its foot, where it's the night (on phones the text sits there)
const [PW, PH] = meta.size;
const WATER = meta.water;
const MOUTH = meta.mouth;
const FISH = meta.salmon; // his box
const FOCUS = [2275, WATER]; // where he breaks the water: the catch opens out from here
const toArt = (px, py) => [((px - PW / 2) * D) / PW, ((PH / 2 - py) * D) / PW];
const ribbon = (max, material) => markRibbon(max, material, toArt);
const lerp = THREE.MathUtils.lerp;
const rand = (a, b) => a + Math.random() * (b - a);
const OVER = 10; // drawn after scene 03 (render order), which it opens out over
const G = 900; // px/s²: the drops fall a little slowly, so the eye can follow them
// the left edge of his body, roughly, where the drops come off (y -> x)
// a soft round light (the moon's glow, the glint on a drop), uK its strength
const glow = (falloff = 2.2) =>
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
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.75), pow(max(0.0, 1.0 - r), ${falloff.toFixed(1)}) * uK);
      }`,
  });
const leftEdge = (y) => lerp(2120, 2214, THREE.MathUtils.clamp((y - 820) / 420, 0, 1));

export async function loadScene04() {
  const loader = new THREE.TextureLoader();
  const load = async (url) => {
    const t = await loader.loadAsync(url);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const [plateTex, fishTex, ...dropTex] = await Promise.all([
    load(`/images/s04-plate-${window.innerWidth < 1000 ? 1600 : 2912}.webp`),
    load('/images/s04/salmon.webp'),
    ...meta.drops.map((d) => load(`/images/s04/${d.name.slice(4)}.webp`)),
  ]);

  const group = new THREE.Group();
  const art = new THREE.Group(); // the painting's frame: D wide, centred; moved for portrait
  group.add(art);
  let time = 0;
  const timeU = { value: 0 };

  // The plate. Below the water's edge the stripes sway and shimmer, with faint glints
  // drifting along, and the gold under him swells and fades as he strains. Above it the
  // night stirs, as if in a light breeze, and now and then a few of its dashes catch the
  // light.
  const [mx, my, mr] = meta.moon;
  const glowU = { value: 0 };
  const revealU = { value: 1 };
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTex, transparent: true, depthWrite: false });
  plateMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uTime: timeU, uGlow: glowU, uReveal: revealU });
    shader.fragmentShader = `uniform float uTime;\nuniform float uGlow;\nuniform float uReveal;\n${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `
      vec2 wuv = vMapUv;
      float below = ${(1 - WATER / PH).toFixed(4)} - wuv.y; // > 0 in the water (and in its mirror below)
      float wet = step(0.0, below);
      float py = wuv.y * ${PH}.0;
      // clear of the moon's disc and the place under him (his glowing edge stays true)
      vec2 px = vec2(wuv.x * ${PW}.0, py);
      float still = max(
        1.0 - smoothstep(${mr * 1.5}.0, ${mr * 3}.0, length(px - vec2(${mx}.0, ${PH - my}.0))),
        (1.0 - smoothstep(0.0, 60.0, abs(px.x - 2280.0) - 220.0)) * (1.0 - smoothstep(0.0, 60.0, px.y - ${PH - FISH.y}.0))
      );
      vec2 off = vec2(
        sin(py * 0.9 + uTime * 1.3) * 0.0018 + sin(py * 0.37 - uTime * 0.8) * 0.0013 +
          sin(py * 0.11 + wuv.x * 6.0 - uTime * 0.45) * 0.0012, // a slow, longer swell
        sin(wuv.x * 55.0 + uTime * 0.9 + py * 0.05) * 0.0012
      ) * wet * smoothstep(0.0, 0.01, below);
      // the night, in slow broad waves, still at the water's edge
      off.x += (sin(py * 0.02 + wuv.x * 3.0 - uTime * 0.5) * 0.0007 + sin(py * 0.007 - wuv.x * 1.7 - uTime * 0.23) * 0.0005)
        * (1.0 - wet) * smoothstep(0.0, 0.03, -below) * (1.0 - still);
      vec4 texel = texture2D(map, wuv + off);
      diffuseColor *= texel;
      // shimmer, and faint glints drifting slowly along
      diffuseColor.rgb *= 1.0 + wet * (0.08 * sin(wuv.x * 40.0 + py * 0.25 + uTime * 0.8) +
        0.07 * pow(0.5 + 0.5 * sin(wuv.x * 90.0 - uTime * 0.6 + sin(py * 0.2 + uTime * 0.3) * 2.0), 6.0));
      // a few of the night's dashes catching the light, here and there, drifting
      float lum = dot(texel.rgb, vec3(0.3, 0.59, 0.11));
      float tw = pow(max(0.0, sin(wuv.x * 61.0 + uTime * 0.35 + sin(wuv.y * 9.0) * 2.0) * sin(wuv.y * 47.0 - uTime * 0.27 + wuv.x * 5.0)), 10.0);
      diffuseColor.rgb *= 1.0 + 0.3 * tw * smoothstep(0.03, 0.12, lum) * (1.0 - wet) * (1.0 - still);
      // the gold where he breaks the water
      float fx = (wuv.x - ${(2275 / PW).toFixed(4)}) / 0.11;
      diffuseColor.rgb *= 1.0 + wet * uGlow * exp(-fx * fx) * exp(-below / 0.03);
      // past the painting's foot it fades to the night (on phones the text sits there)
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.035, 0.012), smoothstep(0.0, 0.08, -wuv.y));
      // opening out from where he is (painting px from FOCUS), softly
      float far = length((wuv - vec2(${(FOCUS[0] / PW).toFixed(4)}, ${(1 - FOCUS[1] / PH).toFixed(4)})) * vec2(${PW}.0, ${PH}.0));
      float reach = uReveal * 4500.0;
      diffuseColor.a *= uReveal >= 1.0 ? 1.0 : 1.0 - smoothstep(reach * 0.45, reach, far);
      // and towards the painting's sides and top, and past its foot, it stays clear until
      // it has (no frame over the river, no mirrored moon)
      float clear = max(
        smoothstep(-0.15, 0.12, max(max(-wuv.x, wuv.x - 1.0), wuv.y - 1.0)),
        smoothstep(0.02, 0.25, -wuv.y)
      );
      diffuseColor.a *= 1.0 - clear * (1.0 - smoothstep(0.8, 1.0, uReveal));
      `,
    );
  };
  // It runs on past its edges, mirrored (the night and the water carry on), so its frame
  // never shows while the camera is still on its way in.
  plateTex.wrapS = plateTex.wrapT = THREE.MirroredRepeatWrapping;
  const plateGeo = new THREE.PlaneGeometry(D * (1 + 2 * EXT), ((D * PH) / PW) * (1 + EXT + FOOT));
  plateGeo.translate(0, (((D * PH) / PW) * (EXT - FOOT)) / 2, 0);
  const uv = plateGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (1 + 2 * EXT) - EXT, uv.getY(i) * (1 + EXT + FOOT) - FOOT);
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.renderOrder = OVER;
  art.add(plate);

  // the moon, glowing faintly
  const moonMat = glow();
  const moon = new THREE.Mesh(new THREE.PlaneGeometry((mr * 9 * D) / PW, (mr * 9 * D) / PW), moonMat);
  moon.position.set(...toArt(mx, my), 0.002);
  moon.renderOrder = OVER + 1;
  art.add(moon);

  // The salmon: a fine mesh that bends, fixed where he leaves the water and swinging more
  // towards his head, which lifts a little as the line pulls.
  const fishMat = new THREE.MeshBasicMaterial({ map: fishTex, transparent: true, depthWrite: false });
  const fish = new THREE.Mesh(new THREE.PlaneGeometry((FISH.w * D) / PW, (FISH.h * D) / PW, 12, 40), fishMat);
  fish.position.set(...toArt(FISH.x + FISH.w / 2, FISH.y + FISH.h / 2), 0.006);
  fish.renderOrder = OVER + 3;
  art.add(fish);
  const fishPos = fish.geometry.attributes.position;
  const fishRest = Float32Array.from(fishPos.array);
  const pxOf = (i) => [FISH.x + FISH.w / 2 + (fishRest[i * 3] * PW) / D, FISH.y + FISH.h / 2 - (fishRest[i * 3 + 1] * PW) / D];
  // how far up his body a point is: 0 at the water, 1 at his snout
  const up = (py) => THREE.MathUtils.clamp((WATER - py) / (WATER - FISH.y), 0, 1);
  let pose = { sway: 0, lift: 0 };
  const bend = (py) => {
    const s = up(py);
    return [pose.sway * s * s, -pose.lift * s];
  };

  // now and then he thrashes, hard, for a second or so
  let thrashT = 3; // seconds to the next
  let thrash = 0; // 0 -> 1 through one
  function strain(dt) {
    if (thrash > 0) thrash = Math.min(1, thrash + dt / 1.3);
    if (thrash >= 1) thrash = 0;
    if (thrash === 0 && (thrashT -= dt) <= 0) {
      thrash = 0.001;
      thrashT = rand(5, 9);
    }
    const hard = Math.sin(Math.PI * thrash); // its envelope
    pose = {
      sway: 13 * Math.sin(time * 2.4) + 6 * Math.sin(time * 3.9 + 1.3) + 18 * hard * Math.sin(time * 11),
      lift: 5 + 3 * Math.sin(time * 1.3) + 6 * hard,
    };
    glowU.value = 0.35 + 0.15 * Math.sin(time * 1.7) + 0.35 * hard;
    for (let i = 0; i < fishPos.count; i++) {
      const [, py] = pxOf(i);
      const [dx, dy] = bend(py);
      fishPos.setXY(i, fishRest[i * 3] + (dx * D) / PW, fishRest[i * 3 + 1] - (dy * D) / PW);
    }
    fishPos.needsUpdate = true;
    return hard;
  }

  // The line, from far above down to his jaw: it follows its painted path, drawn taut as his
  // head moves, and quivers while he thrashes.
  const linePath = meta.line; // [x, y] every 40 px from the top edge, then his jaw
  const pathX = (y) => {
    const i = Math.min(linePath.length - 2, Math.max(0, Math.floor(y / 40)));
    const [a, b] = [linePath[i], linePath[i + 1]];
    return lerp(a[0], b[0], THREE.MathUtils.clamp((y - a[1]) / (b[1] - a[1] || 1), 0, 1));
  };
  const line = ribbon(34, new THREE.MeshBasicMaterial({ color: '#d6d04a', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
  line.mesh.position.z = 0.004;
  line.mesh.renderOrder = OVER + 2; // under his jaw
  art.add(line.mesh);
  function drawLine(hard) {
    const [dx, dy] = bend(MOUTH[1]);
    const pts = [[linePath[0][0], -400]];
    for (let k = 0; k <= 32; k++) {
      const y = (MOUTH[1] * k) / 32;
      const f = y / MOUTH[1];
      const quiver = hard * 2.2 * Math.sin(Math.PI * f) * Math.sin(k * 0.9 + time * 38);
      pts.push([pathX(y) + dx * f ** 1.5 + quiver, y + dy * f]);
    }
    line.set(pts, () => 3);
  }

  // rings on the water: small where a drop lands, wide where he breaks the surface
  const rings = Array.from({ length: 8 }, () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry((150 * D) / PW, (34 * D) / PW), ringMaterial('#ffcf5a'));
    m.position.z = 0.003;
    m.renderOrder = OVER + 1;
    m.visible = false;
    art.add(m);
    return { m, age: 1, life: 1, strength: 0 };
  });
  function ring(x, scale, strength, life) {
    const r = rings.find((q) => q.age >= 1) ?? rings[0];
    r.m.position.set(...toArt(x, WATER + 2), 0.003);
    r.m.scale.setScalar(scale);
    Object.assign(r, { age: 0, life, strength });
  }
  let swellT = 0.5; // seconds to the next wide ripple from where he is

  // a small soft light, for the glint on a drop and the spray where one lands
  const spark = (size) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry((size * D) / PW, (size * D) / PW), glow(1.6));
    m.renderOrder = OVER + 5;
    m.visible = false;
    art.add(m);
    return m;
  };

  // The drops: they start where they're painted and fall, drawn out along their fall and
  // catching the light; then more keep coming off him. Where one lands it rings the water,
  // flashes and throws up a little spray.
  const drops = meta.drops.map((d, i) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry((d.w * D) / PW, (d.h * D) / PW),
      new THREE.MeshBasicMaterial({ map: dropTex[i], transparent: true, depthWrite: false }),
    );
    m.renderOrder = OVER + 4;
    art.add(m);
    return { m, glint: spark(d.w * 2.4), w: d.w, on: true, x: d.x + d.w / 2, y: d.y + d.h / 2, vx: 0, vy: 0, age: 1 };
  });
  const flashes = Array.from({ length: 4 }, () => ({ m: spark(70), age: 1 }));
  const spray = Array.from({ length: 12 }, () => ({ m: spark(16), on: false, x: 0, y: 0, vx: 0, vy: 0 }));
  function splash(x, w) {
    const f = flashes.find((q) => q.age >= 1) ?? flashes[0];
    f.m.position.set(...toArt(x, WATER - 4), 0.009);
    Object.assign(f, { age: 0, size: 0.6 + w / 60 });
    for (let k = 0, n = 2 + (Math.random() < 0.5); k < n; k++) {
      const q = spray.find((o) => !o.on);
      if (!q) break;
      Object.assign(q, { on: true, x: x + rand(-6, 6), y: WATER - 6, vx: rand(-70, 70), vy: -rand(130, 230) });
    }
  }
  let dropT = 0.6;
  function shed() {
    const d = drops.find((q) => !q.on);
    if (!d) return;
    const right = Math.random() < 0.2; // most come off his front, some off his back fin
    const y = right ? rand(1200, 1320) : rand(860, 1250);
    const [dx] = bend(y);
    Object.assign(d, {
      on: true,
      x: (right ? rand(2405, 2450) : leftEdge(y) - rand(0, 18)) + dx,
      y,
      vx: right ? rand(30, 90) : -rand(30, 110),
      vy: rand(-90, 20),
      age: 0,
    });
  }
  function fall(dt) {
    if ((dropT -= dt) <= 0) {
      shed();
      dropT = rand(0.6, 1.2);
    }
    for (const d of drops) {
      d.m.visible = d.glint.visible = d.on;
      if (!d.on) continue;
      d.age += dt;
      d.vy += G * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y > WATER - 4) {
        d.on = false;
        ring(d.x, 0.25 + d.w / 160, 0.5, 1.2);
        splash(d.x, d.w);
        d.m.visible = d.glint.visible = false;
        continue;
      }
      // drawn out along its fall, the faster the longer
      const speed = Math.hypot(d.vx, d.vy);
      const stretch = 1 + Math.min(0.8, speed / 1400);
      d.m.position.set(...toArt(d.x, d.y), 0.008);
      d.m.rotation.z = Math.atan2(-d.vy, d.vx) - Math.PI / 2;
      d.m.scale.set(1 / Math.sqrt(stretch), stretch, 1);
      const a = Math.min(1, d.age / 0.12) * shown;
      d.m.material.opacity = a;
      d.glint.position.set(...toArt(d.x, d.y), 0.0075);
      d.glint.material.uniforms.uK.value = 0.55 * a * (0.8 + 0.2 * Math.sin(time * 9 + d.w));
    }
    for (const f of flashes) {
      if (f.age < 1) f.age = Math.min(1, f.age + dt / 0.3);
      f.m.visible = f.age < 1;
      f.m.scale.setScalar(f.size * (0.6 + 0.6 * f.age));
      f.m.material.uniforms.uK.value = 0.7 * (1 - f.age) ** 2 * shown;
    }
    for (const q of spray) {
      q.m.visible = q.on;
      if (!q.on) continue;
      q.vy += G * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.y > WATER - 2) {
        q.on = q.m.visible = false;
        continue;
      }
      q.m.position.set(...toArt(q.x, q.y), 0.009);
      q.m.material.uniforms.uK.value = 0.8 * shown;
    }
  }

  // how far the catch has opened out of scene 03 (0 -> 1); what moves on it comes in with
  // the circle, the moon (far to his left) last
  let shown = 1;
  let moonShown = 1;
  function setReveal(r) {
    revealU.value = r;
    shown = THREE.MathUtils.smoothstep(r, 0.08, 0.3);
    moonShown = THREE.MathUtils.smoothstep(r, 0.8, 1);
    fishMat.opacity = shown;
    line.mesh.material.opacity = 0.95 * shown;
  }

  function tick(dt) {
    time += dt;
    timeU.value = time;
    const hard = strain(dt);
    drawLine(hard);
    fall(dt);
    if ((swellT -= dt) <= 0) {
      ring(2275 + pose.sway * 0.15 + rand(-30, 30), 2.4 + hard * 0.8, 0.7 + hard * 0.4, 2.6);
      swellT = rand(1.2, 2.0) * (1 - hard * 0.5);
    }
    for (const r of rings) {
      if (r.age < 1) r.age = Math.min(1, r.age + dt / r.life);
      r.m.visible = r.age < 1;
      r.m.material.uniforms.uAge.value = r.age;
      r.m.material.uniforms.uStrength.value = r.strength * shown;
    }
    moonMat.uniforms.uK.value = (0.32 + 0.08 * Math.sin(time * 0.5)) * moonShown;
  }

  // view: the view's width and height per unit depth at the camera's rest
  function layout(view) {
    if (view.w < view.h) {
      // portrait: the painting across the top of the screen, the salmon and his line in view
      const s = (0.45 * view.h) / (PH / PW); // scale so its height is 45% of the view
      const u = 0.74; // the painting's x at the screen's centre
      art.scale.setScalar(s);
      art.position.set((0.5 - u) * D * s, ((view.h - (PH / PW) * s) * D) / 2, -D);
    } else {
      art.scale.setScalar(1);
      art.position.set(0, 0, -D);
    }
  }

  tick(0);
  return {
    group,
    layout,
    tick,
    setReveal,
    // where he breaks the water, in the group's space (it opens out from here)
    focus() {
      const [x, y] = toArt(...FOCUS);
      return new THREE.Vector3(art.position.x + x * art.scale.x, art.position.y + y * art.scale.y, art.position.z);
    },
  };
}
