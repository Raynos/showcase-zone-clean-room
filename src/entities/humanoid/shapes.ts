/**
 * Small geometry helpers local to the humanoid package.
 * (Geo's own `bevel` box has inconsistent triangle winding, so we build our own chamfered box
 * and fix the winding with a convexity test.)
 */
import * as THREE from 'three';
import type { Geo, PrimOpts } from '../../gfx/geo';

const cache = new Map<string, THREE.BufferGeometry>();

export function chamferBoxGeo(w: number, h: number, d: number, b: number): THREE.BufferGeometry {
  b = Math.max(0.0005, Math.min(b, w / 2.02, h / 2.02, d / 2.02));
  const key = `${w.toFixed(4)}|${h.toFixed(4)}|${d.toFixed(4)}|${b.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const hx = w / 2, hy = h / 2, hz = d / 2;
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const vid = (cx: number, cy: number, cz: number, axis: number) => ((cx > 0 ? 1 : 0) | (cy > 0 ? 2 : 0) | (cz > 0 ? 4 : 0)) * 3 + axis;
  for (let c = 0; c < 8; c++) {
    const sx = c & 1 ? 1 : -1, sy = c & 2 ? 1 : -1, sz = c & 4 ? 1 : -1;
    pos.push(sx * hx, sy * (hy - b), sz * (hz - b)); nor.push(sx, 0, 0);
    pos.push(sx * (hx - b), sy * hy, sz * (hz - b)); nor.push(0, sy, 0);
    pos.push(sx * (hx - b), sy * (hy - b), sz * hz); nor.push(0, 0, sz);
  }
  const P = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3(), cen = new THREE.Vector3();
  const tri = (a: number, b2: number, c: number) => {
    const pa = P(a), pb = P(b2), pc = P(c);
    n.crossVectors(ab.subVectors(pb, pa), ac.subVectors(pc, pa));
    cen.copy(pa).add(pb).add(pc);
    if (n.dot(cen) >= 0) idx.push(a, b2, c); else idx.push(a, c, b2);
  };
  const quad = (a: number, b2: number, c: number, d2: number) => { tri(a, b2, c); tri(a, c, d2); };
  for (const s of [-1, 1]) {
    quad(vid(s, -1, -1, 0), vid(s, 1, -1, 0), vid(s, 1, 1, 0), vid(s, -1, 1, 0));
    quad(vid(-1, s, -1, 1), vid(-1, s, 1, 1), vid(1, s, 1, 1), vid(1, s, -1, 1));
    quad(vid(-1, -1, s, 2), vid(1, -1, s, 2), vid(1, 1, s, 2), vid(-1, 1, s, 2));
  }
  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
    quad(vid(-1, s1, s2, 1), vid(-1, s1, s2, 2), vid(1, s1, s2, 2), vid(1, s1, s2, 1));
    quad(vid(s1, -1, s2, 0), vid(s1, -1, s2, 2), vid(s1, 1, s2, 2), vid(s1, 1, s2, 0));
    quad(vid(s1, s2, -1, 0), vid(s1, s2, -1, 1), vid(s1, s2, 1, 1), vid(s1, s2, 1, 0));
  }
  for (let c = 0; c < 8; c++) tri(c * 3, c * 3 + 1, c * 3 + 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  cache.set(key, g);
  return g;
}

/** Chamfered box centred on `o.at` with soft interpolated normals (44 tris). */
export function cbox(g: Geo, w: number, h: number, d: number, bevel: number, o?: PrimOpts) {
  g.add(chamferBoxGeo(w, h, d, bevel), o);
}
