import type { Geo } from '../gfx/geo';
import { T } from '../gfx/textures';
import { PAL } from './layout';
import { gear, lanternBody, pixelText } from './props';

const IRON = 0x343a44, BRASS = 0xc9973a, OAK = 0x86633f, FELT = 0x1f3a44;

/**
 * Old Bram's cog exchange: a hand cart made into a counter, two trays of brass cogs and a balance on
 * its top, a cog the size of a cartwheel hung over it where the plaza can see it, a lantern beside
 * that. Origin on the ground under the cart, customers on +Z. Returns where the lantern hangs.
 */
export function cogExchange(g: Geo): [number, number, number] {
  // the cart: two wheels at one end, legs and handles at the other
  for (const sz of [-1, 1]) {
    g.cyl(0.4, 0.4, 0.08, 12, { at: [-0.72, 0.4, sz * 0.56], rot: [Math.PI / 2, 0, 0], color: 0x6b4c2e, layer: T.PLANKS, uvScale: 1.2, col: 'none' });
    g.cyl(0.1, 0.1, 0.12, 8, { at: [-0.72, 0.4, sz * 0.56], rot: [Math.PI / 2, 0, 0], color: BRASS, layer: T.BRASS, col: 'none' });
    g.box(0.07, 0.6, 0.07, { at: [0.82, 0.3, sz * 0.36], color: OAK, layer: T.PLANKS, col: 'none' });
    g.box(0.9, 0.05, 0.05, { at: [1.4, 0.66, sz * 0.36], color: OAK, layer: T.PLANKS, col: 'none' });
  }
  g.box(2.0, 0.12, 0.95, { at: [0, 0.64, 0], color: OAK, layer: T.PLANKS, uvScale: 0.8, col: 'none' });
  // the counter on it: a painted cabinet, a slate, two drawers, an oak top
  g.box(1.76, 0.42, 0.82, { at: [0, 0.91, 0], color: PAL.tealDark, layer: T.PLANKS, uvScale: 0.8, col: 'none', grad: 0.8 });
  g.box(1.96, 0.06, 1.0, { at: [0, 1.15, 0], color: 0xa9824f, layer: T.PLANKS, uvScale: 0.9, col: 'none' });
  g.box(0.84, 0.32, 0.03, { at: [-0.36, 0.91, 0.42], color: PAL.slateDeep, col: 'none' });
  g.push().translate(-0.36, 0.91, 0.44); pixelText(g, 'COGS', 0.04, { color: PAL.amber, emit: 1.2 }); g.pop();
  for (const y of [0.81, 1.01]) {
    g.box(0.6, 0.16, 0.03, { at: [0.5, y, 0.42], color: PAL.cream, layer: T.PLANKS, col: 'none' });
    g.box(0.06, 0.04, 0.04, { at: [0.5, y, 0.45], color: BRASS, layer: T.BRASS, col: 'none' });
  }
  // two trays of cogs
  for (const [tx, n] of [[-0.66, 0], [-0.1, 1]]) {
    g.box(0.5, 0.04, 0.42, { at: [tx, 1.2, 0.08], color: 0x5a4028, layer: T.PLANKS, col: 'none' });
    g.box(0.44, 0.02, 0.36, { at: [tx, 1.225, 0.08], color: FELT, col: 'none' });
    for (let i = 0; i < 5; i++) {
      const cx = tx + ((i % 3) - 1) * 0.14 + (i > 2 ? 0.07 : 0), cz = 0.08 + (i > 2 ? 0.09 : -0.08), R = 0.045 + ((i + n) % 3) * 0.012;
      g.cyl(R, R, 0.028, 8, { at: [cx, 1.25, cz], color: (i + n) % 2 ? BRASS : 0xd9ad4e, layer: T.BRASS, col: 'none' });
      g.cyl(R * 0.35, R * 0.35, 0.034, 5, { at: [cx, 1.25, cz], color: 0x5a4320, col: 'none' });
    }
  }
  // the balance, a cog in the low pan
  g.cyl(0.1, 0.12, 0.03, 8, { at: [0.6, 1.195, 0.05], color: BRASS, layer: T.BRASS, col: 'none' });
  g.box(0.028, 0.44, 0.028, { at: [0.6, 1.41, 0.05], color: BRASS, layer: T.BRASS, col: 'none' });
  g.box(0.54, 0.022, 0.022, { at: [0.6, 1.62, 0.05], rot: [0, 0, 0.16], color: BRASS, layer: T.BRASS, col: 'none' });
  for (const sx of [-1, 1]) {
    const py = 1.62 + sx * 0.04;
    g.box(0.012, 0.2, 0.012, { at: [0.6 + sx * 0.255, py - 0.1, 0.05], color: IRON, col: 'none' });
    g.cyl(0.09, 0.07, 0.016, 8, { at: [0.6 + sx * 0.255, py - 0.205, 0.05], color: BRASS, layer: T.BRASS, col: 'none' });
  }
  g.cyl(0.05, 0.05, 0.026, 8, { at: [0.345, 1.4, 0.05], color: 0xd9ad4e, layer: T.BRASS, col: 'none' });
  // a big one leaning on the cart
  g.push().translate(0.3, 0.3, 0.6).rotateX(-0.22); gear(g, 0.27, 9, 0.06); g.pop();
  // the post, its arm over the cart, the hanging cog and the lantern
  g.box(0.1, 3.4, 0.1, { at: [-1.2, 1.7, -0.36], color: IRON, layer: T.METAL, col: 'none' });
  g.box(0.3, 0.12, 0.3, { at: [-1.2, 0.06, -0.36], color: IRON, layer: T.METAL, col: 'none' });
  g.box(1.5, 0.07, 0.07, { at: [-0.5, 3.3, -0.36], color: IRON, layer: T.METAL, col: 'none' });
  g.box(0.05, 0.62, 0.05, { at: [-0.98, 3.06, -0.36], rot: [0, 0, -0.8], color: IRON, layer: T.METAL, col: 'none' });
  for (const sx of [-0.2, 0.2]) g.box(0.02, 0.22, 0.02, { at: [-0.52 + sx, 3.16, -0.36], color: IRON, col: 'none' });
  g.push().translate(-0.52, 2.58, -0.36); gear(g, 0.44, 10, 0.08, 0xd9a83e, { emit: 0.3 }); g.pop();
  lanternBody(g, 0.16, 3.2, -0.36, PAL.amber, 1.1);
  g.colBox(2.0, 1.2, 1.0, { at: [0, 0.6, 0] });
  g.colCyl(0.1, 3.4, { at: [-1.2, 1.7, -0.36] });
  return [0.16, 2.94, -0.36];
}
