import * as THREE from 'three';

// Rain with depth: thin glow-green streaks scattered through the whole volume the camera
// flies through. Near ones rush past, far ones barely move.

export function createRain(count) {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#b9d84a'), transparent: true, opacity: 0.38, depthWrite: false });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, count);
  mesh.frustumCulled = false;
  const drops = Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0, len: 0, speed: 0 }));
  const m4 = new THREE.Matrix4();
  let box = null;

  function setBounds(b) {
    box = b;
    for (const d of drops) {
      d.x = THREE.MathUtils.lerp(b.x0, b.x1, Math.random());
      d.y = THREE.MathUtils.lerp(b.y0, b.y1, Math.random());
      d.z = THREE.MathUtils.lerp(b.z0, b.z1, Math.random());
      d.len = THREE.MathUtils.lerp(0.05, 0.16, Math.random());
      d.speed = THREE.MathUtils.lerp(1.2, 2.4, Math.random());
    }
  }

  function update(dt) {
    if (!box) return;
    const h = box.y1 - box.y0;
    for (let i = 0; i < count; i++) {
      const d = drops[i];
      d.y -= d.speed * dt;
      if (d.y < box.y0) d.y += h;
      m4.makeScale(0.0035, d.len, 1).setPosition(d.x, d.y, d.z);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, setBounds, update, dispose: () => (mesh.geometry.dispose(), mat.dispose()) };
}
