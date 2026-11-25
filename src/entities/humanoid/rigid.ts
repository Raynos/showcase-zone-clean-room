/**
 * Many rigid parts, each following its own node, drawn as one skinned mesh.
 *
 * A rig built from separate part meshes costs a draw call per part in the main pass and again in
 * every shadow pass. Here each part's vertices are bound whole to the node the part hung from, so
 * the animation code keeps moving the same nodes and the whole rig is one draw call per pass.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface RigidPart {
  /** in the space of `node` */
  geo: THREE.BufferGeometry;
  node: THREE.Object3D;
}

/** `bounds` is in the space of whatever the returned mesh is added to, and must cover every pose. */
export function rigidSkin(parts: RigidPart[], material: THREE.Material, bounds: THREE.Sphere): THREE.SkinnedMesh {
  const nodes: THREE.Object3D[] = [];
  for (const p of parts) {
    let i = nodes.indexOf(p.node);
    if (i < 0) { i = nodes.length; nodes.push(p.node); }
    const n = p.geo.getAttribute('position').count;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let v = 0; v < n; v++) { si[v * 4] = i; sw[v * 4] = 1; }
    p.geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    p.geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  }
  const geo = mergeGeometries(parts.map((p) => p.geo), false);
  if (!geo) throw new Error('rigidSkin: parts do not share one vertex layout');
  for (const p of parts) p.geo.dispose();
  const mesh = new THREE.SkinnedMesh(geo, material);
  // a skeleton only reads each node's world matrix, so the rig's own groups serve as the bones;
  // the vertices are already in their node's space, hence identity bind matrices throughout
  mesh.bind(new THREE.Skeleton(nodes as THREE.Bone[], nodes.map(() => new THREE.Matrix4())), new THREE.Matrix4());
  mesh.boundingSphere = bounds;
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
