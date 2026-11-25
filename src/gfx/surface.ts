import { STORY_GLSL, STORY_U } from '../world/stories';
import { T } from './textures';

/**
 * Surface detail for the static world material: the small and mid levels of LOOK.md's three
 * levels of detail, drawn in the shader from data every packed vertex already carries (texture
 * layer, vertex colour, the baked foot and eave distances) and the world position, so none of it
 * costs geometry, draw calls or download.
 *
 *   ground   tyre ruts, oil, scorch on whatever lies on the ground (world/stories.ts)
 *   plaster  peeling to brick near the foot and under the eaves, rising damp, streaks, cracks
 *   concrete formwork panels with joints and tie holes, weeping stains, rust under fixings
 *   stripes  hazard paint chipped through to the grey beneath
 *   roofs    courses of tiles (scalloped clay, square slate), each tile its own tone, some
 *            mossy, a few slipped
 *   metal    seams with rivet rows on plate and panel, rivet lines on girders, rust weeping down
 *   brass    verdigris in the recesses and on what faces the sky, cast bead mouldings
 *   rock     lit top planes and crisp darker strata
 *
 * Everything small fades out with distance (LOOK.md: small wear only within about 10 to 25 m).
 */
export const SURF_U = STORY_U;

const L = (n: number) => `${n}.0`;

export const SURFACE_GLSL = /* glsl */ `
${STORY_GLSL}
vec3 gSurfTilt = vec3(0.0);
float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 sLin(vec3 c) { return c * c; }
/**
 * lay: texture layer; wp: world position; nW: world normal; ao: baked foot / eave distances (m);
 * ta, tn: the layer's albedo+roughness and normal+metal (tangent space); vcol: vertex colour
 * (the final albedo is vcol * ta); uvm: the face's tiling uv.
 */
void surfDetail(float lay, vec3 wp, vec3 nW, vec2 ao, inout vec4 ta, inout vec4 tn, vec3 vcol, vec2 uvm, float camD) {
  gSurfTilt = vec3(0.0);
  vec3 vc = max(vcol, vec3(0.02));
  bool vert = abs(nW.y) < 0.5;
  // wall-plane coordinates in metres: along the wall and up
  vec2 hz = normalize(vec2(-nW.z, nW.x) + vec2(1e-5, 0.0));
  vec2 wq = vec2(dot(wp.xz, hz), wp.y);
  float near = 1.0 - smoothstep(18.0, 32.0, camD);

  // ---- ground stories on whatever lies on the ground
  if (nW.y > 0.8 && ao.x < 0.3) {
    float ruts = (lay == ${L(T.DIRT)} || lay == ${L(T.GRAVEL)} || lay == ${L(T.COBBLE)}) ? 1.0 : 0.0;
    vec4 st = storyAt(wp);
    if (st.g + st.b > 0.01 || ruts > 0.0) {
      vec3 a = vcol * ta.rgb; float rr = ta.a; vec2 tl;
      storyGround(st, wp, a, rr, tl, ruts, camD);
      ta.rgb = a / vc; ta.a = rr; gSurfTilt.xz += tl;
    }
  }

  if (lay == ${L(T.PLASTER)} && vert) {
    vec2 n = vec2(texture2D(uNoise, wq * 0.13).r, texture2D(uNoise, wq * 0.41 + 0.3).g);
    float foot = 1.0 - smoothstep(0.15, 1.5, ao.x), eave = 1.0 - smoothstep(0.1, 1.1, ao.y);
    // plaster has fallen away near the foot and under the eaves, showing the brick behind
    float pm = n.x * 0.62 + n.y * 0.38 + max(foot, eave * 0.85) * 0.3 - 0.6;
    float peel = smoothstep(0.0, 0.012, pm), lip = smoothstep(-0.03, -0.004, pm) * (1.0 - peel);
    if (peel > 0.0) {
      vec4 bk = texture(uTexA, vec3(uvm * 1.05, ${L(T.REDBRICK)}));
      vec4 bn = texture(uTexN, vec3(uvm * 1.05, ${L(T.REDBRICK)}));
      // the broken edge throws a shadow onto the brick below it
      float sh = 1.0 - 0.45 * smoothstep(0.05, 0.0, pm) * step(0.0, pm);
      ta = mix(ta, vec4(bk.rgb * sLin(vec3(0.75, 0.42, 0.3)) / vc * sh, bk.a), peel);
      tn.xy = mix(tn.xy, bn.xy, peel);
    }
    ta.rgb *= 1.0 + lip * 0.16;
    // rising damp: a darker, cooler band with a tide-marked wavy top
    float dh = ao.x + (n.y - 0.5) * 0.55;
    float damp = (1.0 - smoothstep(0.45, 0.85, dh)) * (1.0 - peel);
    ta.rgb *= mix(vec3(1.0), vec3(0.8, 0.77, 0.72), damp);
    ta.rgb *= 1.0 - 0.1 * smoothstep(0.1, 0.0, abs(dh - 0.83)) * (1.0 - peel);
    // rain streaks running down from the eaves and sills
    float sk = texture2D(uNoise, vec2(wq.x * 1.1, wq.y * 0.05)).g;
    float streak = (1.0 - smoothstep(0.3, 2.4, ao.y)) * smoothstep(0.5, 0.72, sk);
    ta.rgb *= mix(vec3(1.0), vec3(0.82, 0.78, 0.72), streak * (1.0 - peel));
    // hairline cracks, a few per wall
    float cn = texture2D(uNoise, wq * 0.23 + 0.71).r;
    float crack = (1.0 - smoothstep(0.0, 0.006, abs(cn - 0.5))) * smoothstep(0.6, 0.7, texture2D(uNoise, wq * 0.05 + 0.2).g) * near;
    ta.rgb *= 1.0 - crack * 0.45 * (1.0 - peel);
  }

  if (lay == ${L(T.CONCRETE)} && vert) {
    // formwork panels 2.4 x 1.2 m: joints, tie holes, the faint marks of the boards
    vec2 pc = wq / vec2(2.4, 1.2);
    vec2 pf = fract(pc), pid = floor(pc);
    vec2 jm = min(pf, 1.0 - pf) * vec2(2.4, 1.2);
    float jw = 0.018 + fwidth(wq.x) * 0.5;
    float joint = (1.0 - smoothstep(jw, jw * 2.0, min(jm.x, jm.y))) * smoothstep(40.0, 25.0, camD);
    float tone = 0.9 + 0.2 * sHash(pid + 3.1);
    ta.rgb *= tone * (1.0 - joint * 0.4);
    vec2 lp = (pf - 0.5) * vec2(2.4, 1.2);
    vec2 hq = abs(lp) - vec2(0.75, 0.3);
    float hd = length(hq);
    float hole = 1.0 - smoothstep(0.035, 0.05, hd), ring = smoothstep(0.035, 0.045, hd) * (1.0 - smoothstep(0.045, 0.075, hd));
    ta.rgb *= (1.0 - hole * 0.6 * near) * (1.0 + ring * 0.12 * near);
    // what weeps from each tie hole: a thin darker run, rust in some
    float run = (1.0 - smoothstep(0.018, 0.04, abs(hq.x))) * step(lp.y, 0.0) * step(-0.5, hq.y) * smoothstep(-0.55, -0.05, hq.y + (texture2D(uNoise, wq * vec2(2.0, 0.2)).r - 0.5) * 0.3);
    float rusty = step(0.55, sHash(pid + floor(lp * 2.0)));
    ta.rgb *= mix(vec3(1.0), mix(vec3(0.74, 0.73, 0.72), vec3(0.84, 0.6, 0.44), rusty), run * near);
    float board = smoothstep(0.42, 0.5, abs(fract(wq.y / 0.2) - 0.5)) * 0.05 * near;
    ta.rgb *= 1.0 - board;
    // weathering: dark water staining hanging from the top and splashed up from the ground
    float wn = texture2D(uNoise, vec2(wq.x * 0.35, wq.y * 0.08)).r;
    float wet = smoothstep(0.45, 0.75, wn) * (1.0 - smoothstep(0.4, 4.5, ao.y)) + (1.0 - smoothstep(0.1, 0.7, ao.x + (wn - 0.5) * 0.4)) * 0.8;
    ta.rgb *= mix(vec3(1.0), vec3(0.74, 0.74, 0.76), clamp(wet, 0.0, 1.0));
    // rust streaks under whatever is fixed above: they weep down from the overhang
    float rs = texture2D(uNoise, vec2(wq.x * 2.2, wq.y * 0.12) + 0.5).g;
    float rust = (1.0 - smoothstep(0.05, 1.6, ao.y)) * smoothstep(0.58, 0.75, rs);
    ta.rgb *= mix(vec3(1.0), vec3(0.95, 0.68, 0.48), rust);
  }

  if (lay == ${L(T.STRIPE)}) {
    // hazard paint chipped through: more at the foot and on worn edges
    vec2 q = vert ? wq : wp.xz;
    float c1 = texture2D(uNoise, q * 0.9 + 0.13).a, c2 = texture2D(uNoise, q * 0.21).r;
    float cm = c1 * 0.55 + c2 * 0.45 + (1.0 - smoothstep(0.0, 1.0, ao.x)) * 0.18 - 0.66;
    float chip = smoothstep(0.0, 0.01, cm) * near, edge = smoothstep(-0.02, 0.0, cm) * (1.0 - chip) * near;
    ta.rgb = mix(ta.rgb, sLin(vec3(0.5, 0.5, 0.52)) * (0.8 + 0.3 * c1) / vc, chip);
    ta.rgb *= 1.0 - edge * 0.35;
    ta.a = mix(ta.a, 0.85, chip);
  }

  if (lay == ${L(T.ROOF)}) {
    // tiles in courses: uv runs along the eave (x) and up the slope (y); its density per metre
    // is read from the face itself, so any roof's uv scale gives tiles of the same size
    vec2 ux = dFdx(uvm), uy = dFdy(uvm);
    float uvPerM = sqrt(abs(ux.x * uy.y - ux.y * uy.x) / max(length(cross(dFdx(wp), dFdy(wp))), 1e-9));
    vec2 rm = uvm / max(uvPerM, 1e-3);
    bool slate = vcol.b > vcol.r;
    float rowH = slate ? 0.3 : 0.34, colW = slate ? 0.44 : 0.52;
    float rowF = rm.y / rowH, row = floor(rowF), fy = rowF - row;
    float cx = rm.x / colW + row * 0.5 + (sHash(vec2(row, 3.7)) - 0.5) * 0.4;
    float col = floor(cx), fx = cx - col;
    float h = sHash(vec2(row, col)), h2 = sHash(vec2(col, row) + 7.7);
    // each tile hangs a little differently; a few have slipped down over the course below
    float b = (h2 - 0.5) * 0.14 + 0.07 + step(0.94, h) * 0.22;
    float aa = clamp(fwidth(rowF) * 1.5, 0.0, 1.0);
    float under = 1.0 - smoothstep(b - 0.03 - aa * 0.2, b + aa * 0.2, fy);
    float du = 1.0 - fy;
    float shade = 1.0 - (1.0 - smoothstep(0.0, 0.3 + aa, du)) * 0.68;
    float hl = (1.0 - smoothstep(0.0, 0.12 + aa, fy - b)) * (1.0 - under);
    float gap = 1.0 - smoothstep(0.02, 0.06 + aa * 0.3, min(fx, 1.0 - fx));
    float tone = 0.62 + 0.6 * h;
    vec3 tint = slate ? mix(vec3(0.9, 0.98, 1.08), vec3(1.06, 1.0, 0.94), h2) : mix(vec3(1.1, 0.94, 0.86), vec3(0.92, 1.02, 1.06), h2);
    float k = tone * shade * (1.0 + hl * 0.45) * (1.0 - gap * 0.7);
    k = mix(k, 0.32, under);
    k = mix(k, 0.86, aa);
    ta.rgb = mix(vec3(1.0), ta.rgb, 0.3) * k * mix(tint, vec3(1.0), aa);
    // moss tucked into the lower edge of the odd tile
    float mn = texture2D(uNoise, rm * 0.35).r;
    float moss = step(0.8, h2) * smoothstep(0.5, 0.7, mn) * (1.0 - smoothstep(0.1, 0.45, fy - b)) * (1.0 - under) * (1.0 - aa);
    ta.rgb = mix(ta.rgb, sLin(vec3(0.52, 0.56, 0.3)) * (0.8 + 0.3 * h) / vc, moss * 0.8);
    tn.xy = mix(vec2(0.5), tn.xy, 0.35) + vec2(0.0, -0.25 * hl + 0.2 * (1.0 - smoothstep(0.0, 0.14, du))) * (1.0 - aa);
    ta.a = mix(ta.a, 0.95, moss);
  }

  if ((lay == ${L(T.PLATE)} || lay == ${L(T.PANEL)}) && near > 0.0) {
    // plates 1.6 x 1.0 m, seams with a row of rivets either side
    vec2 q = vert ? wq : wp.xz;
    vec2 pc = q / vec2(1.6, 1.0), pf = fract(pc);
    vec2 jm = min(pf, 1.0 - pf) * vec2(1.6, 1.0);
    float sw = 0.012 + fwidth(q.x) * 0.5;
    float seam = 1.0 - smoothstep(sw, sw * 2.0, min(jm.x, jm.y));
    float rv = 0.0;
    vec2 rq = jm - 0.06;
    float along = jm.x < jm.y ? q.y : q.x;
    float rd = length(vec2(min(abs(rq.x), abs(rq.y)), (fract(along / 0.13) - 0.5) * 0.13));
    rv = (1.0 - smoothstep(0.016, 0.024, rd)) * step(min(rq.x, rq.y), 0.02);
    ta.rgb *= mix(1.0, 1.0 - seam * 0.5, near) * (1.0 + rv * 0.35 * near);
    tn.xy += vec2(0.0, 0.25) * rv * near;
    // rust weeps down from the rivets on a wall
    if (vert) {
      float drip = texture2D(uNoise, vec2(q.x * 3.0, q.y * 0.2)).g;
      float rw = smoothstep(0.62, 0.8, drip) * (1.0 - smoothstep(0.0, 0.5, jm.y - 0.06)) * step(0.5, pf.y);
      ta.rgb *= mix(vec3(1.0), vec3(0.95, 0.62, 0.42), rw * near);
    }
  }

  if (lay == ${L(T.METAL)} && vert && near > 0.0) {
    // girders: rows of rivets every 0.6 m, rust weeping under some of them
    float ry = (fract(wq.y / 0.6) - 0.5) * 0.6;
    float rx = (fract(wq.x / 0.14) - 0.5) * 0.14;
    float rd = length(vec2(rx, ry));
    float rv = 1.0 - smoothstep(0.014, 0.022, rd);
    float under = step(ry, 0.0) * (1.0 - smoothstep(0.0, 0.3, -ry)) * (1.0 - smoothstep(0.004, 0.014, abs(rx))) * step(0.7, sHash(floor(wq / vec2(0.14, 0.6))));
    ta.rgb *= (1.0 + rv * 0.3 * near) * mix(vec3(1.0), vec3(0.9, 0.6, 0.4), under * near);
    tn.xy += vec2(0.0, 0.3) * rv * near;
  }

  if (lay == ${L(T.BRASS)}) {
    // cast bead mouldings round anything upright, verdigris in the recesses and where rain sits
    float l = dot(ta.rgb, vec3(0.3, 0.55, 0.15));
    float bead = vert ? smoothstep(0.35, 0.5, abs(fract(wp.y / 0.22) - 0.5)) : 0.0;
    float pn = texture2D(uNoise, (vert ? wq : wp.xz) * 0.6).r;
    float pat = clamp(smoothstep(0.7, 0.4, l) * 0.7 + max(nW.y, 0.0) * 0.2 + (pn - 0.5) * 0.7 - 0.45, 0.0, 1.0);
    pat = smoothstep(0.15, 0.5, pat) * 0.6;
    ta.rgb *= 1.0 - bead * 0.3;
    tn.xy += vec2(0.0, 0.35) * bead * (1.0 - smoothstep(0.42, 0.5, abs(fract(wp.y / 0.22) - 0.5)));
    ta.rgb = mix(ta.rgb, sLin(vec3(0.42, 0.66, 0.56)) * (0.8 + 0.4 * pn) / vc, pat * 0.85);
    ta.a = mix(ta.a, 0.8, pat); tn.b *= 1.0 - pat * 0.9;
  }

  if (lay == ${L(T.ROCK)}) {
    // a lit top plane on every ledge, and crisp darker strata across the faces
    float top = smoothstep(0.55, 0.75, nW.y);
    float sv = (wp.y + (texture2D(uNoise, wp.xz * 0.03).r - 0.5) * 2.5) / 1.6;
    float strata = smoothstep(0.38, 0.42, abs(fract(sv) - 0.5)) * (1.0 - top);
    float band = step(0.5, sHash(vec2(floor(sv), 1.3)));
    ta.rgb *= mix(1.0, 0.82, band * (1.0 - top)) * (1.0 - strata * 0.35);
    ta.rgb = mix(ta.rgb, ta.rgb * vec3(1.32, 1.24, 1.1) + 0.03, top);
  }
}`;
