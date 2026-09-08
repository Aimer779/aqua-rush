import * as THREE from 'three';
import type { LandmarkDefinition } from '../game/ContentCatalog';
import { landmarkFootprints } from '../game/LandmarkFootprints';

/** Static low-poly silhouettes; luminous accents need no extra lights or shadows. */
export function createMapLandmark(kind: NonNullable<LandmarkDefinition['kind']>): THREE.Group {
  const root = new THREE.Group();
  const dark = new THREE.MeshToonMaterial({ color: kind === 'cargo' ? 0x263452 : 0x303743 });
  const pale = new THREE.MeshToonMaterial({ color: 0xcedcdd });
  const signal = new THREE.MeshBasicMaterial({ color: kind === 'volcano' ? 0xff682e : 0x53ffe5, toneMapped: false });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const foundations = new Map<string, THREE.CylinderGeometry>();
  const addBox = (x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(box, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    root.add(mesh);
    return mesh;
  };
  for (const footprint of landmarkFootprints(kind)) {
    const key = `${footprint.radius}:${footprint.height}`;
    let geometry = foundations.get(key);
    if (!geometry) {
      geometry = new THREE.CylinderGeometry(
        kind === 'volcano' ? 7 : footprint.radius, footprint.radius, footprint.height, 16,
      );
      foundations.set(key, geometry);
    }
    const base = new THREE.Mesh(geometry, dark);
    base.position.set(footprint.x, footprint.height / 2 - 1, footprint.z);
    root.add(base);
  }
  if (kind === 'cargo') {
    addBox(0, 12, 0, 34, 4, 46, dark);
    for (const z of [-16, -5, 6, 17]) {
      addBox(0, 9.8, z, 27, .4, .7, signal);
      for (const x of [-9, 0, 9]) addBox(x, 17, z, 8, 6, 9, pale);
    }
    addBox(0, 25, -18, 20, 8, 7, dark);
    addBox(0, 26, -21.6, 16, 2, .3, signal);
    for (const x of [-20, 20]) addBox(x, 25, 12, 1.5, 22, 1.5, pale);
    addBox(0, 36, 12, 44, 1.5, 1.5, signal);
  } else if (kind === 'volcano') {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(7, 1.3, 6, 20), signal);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 31;
    root.add(rim);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      const seam = addBox(Math.sin(angle) * 12, 18, Math.cos(angle) * 12, .8, 18, .8, signal);
      seam.rotation.z = Math.sin(angle) * .4;
      seam.rotation.x = -Math.cos(angle) * .4;
    }
  } else {
    addBox(0, 24, 0, 1.4, 46, 1.4, pale);
    addBox(0, 47, 0, 4, 3, 6, dark);
    for (let i = 0; i < 3; i++) {
      const blade = addBox(0, 47, -4, 1.6, 20, .65, pale);
      blade.geometry = box.clone();
      blade.geometry.translate(0, .5, 0);
      blade.rotation.z = i * Math.PI * 2 / 3;
    }
    addBox(0, 47, -4.5, 2, 2, 1, signal);
  }
  // Cargo containers, lights and hull pods share a handful of draw calls.
  const batches = new Map<string, THREE.Mesh[]>();
  for (const object of root.children) {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) continue;
    const key = `${object.geometry.id}:${object.material.id}`;
    const batch = batches.get(key) ?? [];
    batch.push(object);
    batches.set(key, batch);
  }
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const batch = new THREE.InstancedMesh(meshes[0].geometry, meshes[0].material, meshes.length);
    meshes.forEach((mesh, index) => {
      mesh.updateMatrix();
      batch.setMatrixAt(index, mesh.matrix);
      root.remove(mesh);
    });
    batch.instanceMatrix.needsUpdate = true;
    root.add(batch);
  }
  // Some themes do not use every shared material/geometry.
  const used = new Set<THREE.Material | THREE.BufferGeometry>();
  root.traverse(object => {
    if (object instanceof THREE.Mesh) { used.add(object.geometry); used.add(object.material as THREE.Material); }
  });
  for (const resource of [box, dark, pale, signal]) if (!used.has(resource)) resource.dispose();
  return root;
}
