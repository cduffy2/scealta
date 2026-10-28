import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

// The splash title as extruded 3D letters, laid out exactly where the (invisible) DOM
// title sets them, so kerning, line breaks and responsive sizing all come from CSS.
// The intro is drawn in the letters' shaders (uReveal 0 -> 1): each letter forms from
// fine glowing dots, like the illustrations' stippling, that grow and merge into solid.

const PARCHMENT = new THREE.Color('#f1e9d2');
const GLOW = new THREE.Color('#b9d84a');
const BOG = new THREE.Color('#1e3a16'); // the letter walls darken into the forest

export function loadFonts() {
  return new FontLoader().loadAsync('/3d/gaillimh-300.json');
}

const VERT = `
  vLocal = position;
`;
// runs after the material's colour is known; may discard
const FRAG = `
  if (uReveal < 1.0) {
    vec2 g = vLocal.xy / (uSize * 0.012); // ~5 dots across a Light stem
    vec2 cell = floor(g);
    vec2 f = fract(g) - 0.5;
    float h = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    float r = uReveal * 1.25;
    if (h > r) discard;
    float rad = mix(0.14, 0.75, smoothstep(h, h + 0.45, r)); // 0.75 > half-diagonal: cells merge
    if (length(f) > rad) discard;
    diffuseColor.rgb = mix(diffuseColor.rgb, uGlow * 1.25, 1.0 - smoothstep(0.55, 1.0, uReveal));
  }
`;
// sides only: parchment at the front edge easing into bog green over the full depth.
// Mixed in gamma space so the fade looks even (a linear-light mix stays pale, then drops).
const WALL = `
  {
    float t = smoothstep(0.0, 1.0, clamp(-vLocal.z / uBack, 0.0, 1.0));
    vec3 a = pow(diffuseColor.rgb, vec3(1.0 / 2.2));
    vec3 b = pow(uBog, vec3(1.0 / 2.2));
    diffuseColor.rgb = pow(mix(a, b, t), vec3(2.2));
  }
`;

function revealMaterial(material, uniforms, wall = false) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `varying vec3 vLocal;\n${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n${VERT}`,
    );
    shader.fragmentShader =
      `varying vec3 vLocal;\nuniform float uReveal, uSize, uBack;\nuniform vec3 uGlow, uBog;\n${shader.fragmentShader}`.replace(
        '#include <map_fragment>',
        `#include <map_fragment>\n${wall ? WALL : ''}${FRAG}`,
      );
  };
  return material;
}

const advance = (font, ch, size) => (font.data.glyphs[ch]?.ha ?? 0) * (size / font.data.resolution);

/**
 * @param font    result of loadFonts()
 * @param title   { chars, portal } from title.js buildTitle (already laid out at Light)
 * @param toWorld (x, y) in splash px -> THREE.Vector2 on the title plane
 * @param unit    world units per px on the title plane
 * @param z       z of the letters' front faces
 */
export function buildTitle3D({ font, title, frame, toWorld, unit, z }) {
  const group = new THREE.Group();
  const letters = [];
  const fr = frame.getBoundingClientRect();
  let hole = null;

  for (const span of title.chars) {
    const ch = span.firstChild.textContent;
    if (!ch.trim()) continue;
    const size = parseFloat(getComputedStyle(span).fontSize) * unit;
    // Light stems are thin (~0.063em): a shallow extrusion and a fine bevel, so the
    // bevel doesn't fatten the strokes towards Medium
    const depth = size * 0.12;
    const bevel = { bevelEnabled: true, bevelThickness: size * 0.008, bevelSize: size * 0.004, bevelSegments: 2 };
    const back = depth + bevel.bevelThickness;
    const geom = new TextGeometry(ch, { font, size, depth, curveSegments: 24, ...bevel }); // smooth at fly-through zoom
    geom.translate(0, 0, -back); // front face at local z = 0

    const rect = span.getBoundingClientRect();
    const base = span.parentElement.querySelector(':scope > .title__baseline').getBoundingClientRect();
    const p = toWorld(rect.left - fr.left, base.bottom - fr.top);
    const uniforms = {
      uReveal: { value: 1 },
      uSize: { value: size },
      uGlow: { value: GLOW },
      uBog: { value: BOG },
      uBack: { value: back },
    };
    const front = revealMaterial(new THREE.MeshBasicMaterial({ color: PARCHMENT }), uniforms);
    const sides = revealMaterial(new THREE.MeshStandardMaterial({ color: PARCHMENT, roughness: 0.8, metalness: 0 }), uniforms, true);
    const mesh = new THREE.Mesh(geom, [front, sides]);
    mesh.position.set(p.x, p.y, z);
    group.add(mesh);
    letters.push({ mesh, geom, materials: [front, sides], uniforms, base: p.y, size });

    if (span === title.portal) hole = counterOf(font, ch, size, mesh.position);
  }
  return { group, letters, hole };
}

// The counter of the portal letter, straight from the glyph outline (largest hole).
function counterOf(font, ch, size, at) {
  let best = null;
  for (const shape of font.generateShapes(ch, size)) {
    for (const h of shape.holes) {
      const pts = h.getPoints(24);
      const area = Math.abs(THREE.ShapeUtils.area(pts));
      if (!best || area > best.area) best = { pts, area };
    }
  }
  if (!best) return null;
  const box = new THREE.Box2().setFromPoints(best.pts);
  const c = box.getCenter(new THREE.Vector2());
  const s = box.getSize(new THREE.Vector2());
  return {
    x: at.x + c.x,
    y: at.y + c.y,
    rx: s.x / 2,
    ry: s.y / 2,
    // outline in world xy, for the stencil mask
    points: best.pts.map((q) => new THREE.Vector2(at.x + q.x, at.y + q.y)),
  };
}

// Intro: t 0 -> 1 per letter (0 = no dots yet, 1 = solid).
export function setLetterReveal(letter, t) {
  letter.uniforms.uReveal.value = t;
}

export function disposeTitle3D(t) {
  for (const l of t.letters) {
    l.geom.dispose();
    l.materials.forEach((m) => m.dispose());
  }
}
