import * as THREE from 'three';

/** One-call beacon pointing at the next legal checkpoint or recovery target. */
export class NavigationBeacon {
  readonly root = new THREE.Group();
  private readonly material = new THREE.MeshBasicMaterial({ color: '#fff06a', transparent: true, opacity: 0.94, toneMapped: false });
  private readonly geometry = new THREE.ConeGeometry(1.05, 4.2, 4, 1, true);
  private readonly mesh = new THREE.Mesh(this.geometry, this.material);

  constructor() {
    this.root.name = 'nextCheckpointNavigationBeacon';
    this.mesh.name = 'nextCheckpointArrow';
    this.mesh.rotation.z = Math.PI;
    this.root.add(this.mesh);
    this.root.visible = false;
  }

  update(elapsed: number, target: THREE.Vector3, visible: boolean): void {
    this.root.visible = visible;
    if (!visible) return;
    this.root.position.copy(target);
    this.root.position.y = 8.1 + Math.sin(elapsed * 3.2) * 0.6;
    this.root.rotation.y = elapsed * 0.8;
    this.material.opacity = 0.82 + Math.sin(elapsed * 5.4) * 0.12;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
