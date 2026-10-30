import * as THREE from 'three';

// Small live marks drawn over the paintings: lines (a fishing line, a rod, a bird) and the
// rings that spread where something meets the water. toArt maps the painting's px to the
// scene's units.

// a flat strip through points (painting px), with a width (px) and opacity along it
export function ribbon(max, material, toArt) {
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

// a ring (two, one just behind the other) spreading flat on the water: uAge runs 0 -> 1
export function ringMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uAge: { value: 1 }, uStrength: { value: 1 }, uColor: { value: new THREE.Color(color) } },
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
}
