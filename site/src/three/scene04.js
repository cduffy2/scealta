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

const D = 14;
const EXT = 0.35; // how far the plate runs on past each edge, mirrored (share of its size)
const [PW, PH] = meta.size;
const WATER = meta.water;
const MOUTH = meta.mouth;
const FISH = meta.salmon; // his box
const toArt = (px, py) => [((px - PW / 2) * D) / PW, ((PH / 2 - py) * D) / PW];
const ribbon = (max, material) => markRibbon(max, material, toArt);
const lerp = THREE.MathUtils.lerp;
const rand = (a, b) => a + Math.random() * (b - a);
const G = 900; // px/s²: the drops fall a little slowly, so the eye can follow them
// the left edge of his body, roughly, where the drops come off (y -> x)
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

  // The plate. Below the water's edge the stripes sway and shimmer, and the gold under him
  // swells and fades as he strains.
  const glowU = { value: 0 };
  const plateMat = new THREE.MeshBasicMaterial({ map: plateTex });
  plateMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uTime: timeU, uGlow: glowU });
    shader.fragmentShader = `uniform float uTime;\nuniform float uGlow;\n${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `
      vec2 wuv = vMapUv;
      float below = ${(1 - WATER / PH).toFixed(4)} - wuv.y; // > 0 in the water (and in its mirror below)
      float wet = step(0.0, below);
      float py = wuv.y * ${PH}.0;
      vec2 off = vec2(
        sin(py * 0.8 + uTime * 1.2) * 0.0016 + sin(py * 0.3 - uTime * 0.7 + wuv.x * 4.0) * 0.0012,
        0.0
      ) * wet * smoothstep(0.0, 0.01, below);
      diffuseColor *= texture2D(map, wuv + off);
      diffuseColor.rgb *= 1.0 + wet * 0.08 * sin(wuv.x * 40.0 + py * 0.25 + uTime * 0.8);
      // the gold where he breaks the water
      float fx = (wuv.x - ${(2275 / PW).toFixed(4)}) / 0.11;
      diffuseColor.rgb *= 1.0 + wet * uGlow * exp(-fx * fx) * exp(-below / 0.03);
      // past the painting's foot it fades to the night (on phones the text sits there)
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.035, 0.012), smoothstep(0.0, 0.08, -wuv.y));
      `,
    );
  };
  // It runs on past its edges, mirrored (the night and the water carry on), so its frame
  // never shows while the camera is still on its way in.
  plateTex.wrapS = plateTex.wrapT = THREE.MirroredRepeatWrapping;
  const plateGeo = new THREE.PlaneGeometry(D * (1 + 2 * EXT), ((D * PH) / PW) * (1 + 2 * EXT));
  const uv = plateGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (1 + 2 * EXT) - EXT, uv.getY(i) * (1 + 2 * EXT) - EXT);
  const plate = new THREE.Mesh(plateGeo, plateMat);
  art.add(plate);

  // the moon, glowing faintly
  const [mx, my, mr] = meta.moon;
  const moonMat = new THREE.ShaderMaterial({
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
        float a = pow(max(0.0, 1.0 - r), 2.2) * uK;
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.75), a);
      }`,
  });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry((mr * 9 * D) / PW, (mr * 9 * D) / PW), moonMat);
  moon.position.set(...toArt(mx, my), 0.002);
  art.add(moon);

  // The salmon: a fine mesh that bends, fixed where he leaves the water and swinging more
  // towards his head, which lifts a little as the line pulls.
  const fish = new THREE.Mesh(
    new THREE.PlaneGeometry((FISH.w * D) / PW, (FISH.h * D) / PW, 12, 40),
    new THREE.MeshBasicMaterial({ map: fishTex, transparent: true, depthWrite: false }),
  );
  fish.position.set(...toArt(FISH.x + FISH.w / 2, FISH.y + FISH.h / 2), 0.006);
  fish.renderOrder = 3;
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
  line.mesh.renderOrder = 2; // under his jaw
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
    m.visible = false;
    art.add(m);
    return { m, age: 1, life: 1 };
  });
  function ring(x, scale, strength, life) {
    const r = rings.find((q) => q.age >= 1) ?? rings[0];
    r.m.position.set(...toArt(x, WATER + 2), 0.003);
    r.m.scale.setScalar(scale);
    r.m.material.uniforms.uStrength.value = strength;
    Object.assign(r, { age: 0, life });
  }
  let swellT = 0.5; // seconds to the next wide ripple from where he is

  // the drops: they start where they're painted and fall; then more keep coming off him
  const drops = meta.drops.map((d, i) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry((d.w * D) / PW, (d.h * D) / PW),
      new THREE.MeshBasicMaterial({ map: dropTex[i], transparent: true, depthWrite: false }),
    );
    m.renderOrder = 4;
    art.add(m);
    return { m, w: d.w, on: true, x: d.x + d.w / 2, y: d.y + d.h / 2, vx: 0, vy: 0, spin: rand(-1, 1), age: 1 };
  });
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
      spin: rand(-1.5, 1.5),
      age: 0,
    });
  }
  function fall(dt) {
    if ((dropT -= dt) <= 0) {
      shed();
      dropT = rand(0.3, 0.75);
    }
    for (const d of drops) {
      d.m.visible = d.on;
      if (!d.on) continue;
      d.age += dt;
      d.vy += G * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.y > WATER - 4) {
        d.on = false;
        ring(d.x, 0.25 + d.w / 160, 0.5, 1.2);
        continue;
      }
      d.m.position.set(...toArt(d.x, d.y), 0.008);
      d.m.rotation.z += d.spin * dt;
      d.m.material.opacity = Math.min(1, d.age / 0.12);
    }
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
    }
    moonMat.uniforms.uK.value = 0.32 + 0.08 * Math.sin(time * 0.5);
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
  return { group, layout, tick };
}
