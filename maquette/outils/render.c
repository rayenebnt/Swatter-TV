// Rendu de paysages alpins par raymarching d'un champ de hauteur (fbm à dérivées).
// Usage : render preset seed W H camx camy camz tax tay taz fov out.ppm
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct { float x, y, z; } v3;
static inline v3 V(float x, float y, float z) { v3 r = {x, y, z}; return r; }
static inline v3 add(v3 a, v3 b) { return V(a.x + b.x, a.y + b.y, a.z + b.z); }
static inline v3 sub(v3 a, v3 b) { return V(a.x - b.x, a.y - b.y, a.z - b.z); }
static inline v3 mul(v3 a, float s) { return V(a.x * s, a.y * s, a.z * s); }
static inline v3 mulv(v3 a, v3 b) { return V(a.x * b.x, a.y * b.y, a.z * b.z); }
static inline float dot(v3 a, v3 b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
static inline v3 cross(v3 a, v3 b) { return V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
static inline v3 nrm(v3 a) { float l = sqrtf(dot(a, a)); return mul(a, 1.0f / l); }
static inline v3 mixv(v3 a, v3 b, float t) { return add(mul(a, 1 - t), mul(b, t)); }
static inline float clampf(float x, float a, float b) { return x < a ? a : (x > b ? b : x); }
static inline float sstep(float a, float b, float x) { float t = clampf((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
static inline float mixf(float a, float b, float t) { return a + (b - a) * t; }

static unsigned int SEED = 1;
static inline float hash2(int x, int y) {
  unsigned int h = (unsigned)x * 374761393u + (unsigned)y * 668265263u + SEED * 2246822519u;
  h = (h ^ (h >> 13)) * 1274126177u; h ^= h >> 16;
  return (h & 0xffffff) / 16777215.0f;
}
// bruit de valeur + dérivées analytiques
static inline void noised(float x, float y, float *v, float *dx, float *dy) {
  float fx0 = floorf(x), fy0 = floorf(y); int ix = (int)fx0, iy = (int)fy0;
  float fx = x - fx0, fy = y - fy0;
  float ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  float dux = 30 * fx * fx * (fx * (fx - 2) + 1), duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  float a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  *v = -1 + 2 * (a + k1 * ux + k2 * uy + k4 * ux * uy);
  *dx = 2 * dux * (k1 + k4 * uy); *dy = 2 * duy * (k2 + k4 * ux);
}
static inline float noise(float x, float y) { float v, a, b; noised(x, y, &v, &a, &b); return v; }
static float fbm2(float x, float y, int oct) {
  float f = 0, a = .5f;
  for (int i = 0; i < oct; i++) { f += a * noise(x, y); float q = 1.6f * x - 1.2f * y; y = 1.2f * x + 1.6f * y; x = q; a *= .5f; }
  return f;
}

/* ---------- scène ---------- */
typedef struct {
  v3 sunCol, skyZen, skyHor, skyHor2, fogCol, fogCol2, waterCol, ambCol;
  float tmax, sunAz, sunEl, fogDen, fogFall, exposure, snowLine, water, cloudCov, cloudH, starAmt, seaH, grassAmt, moon;
} Scene;
static Scene S;
static v3 SUN;
static float PEAKX, PEAKZ, PEAKA = 1700, PEAKD = 9000, PEAKR = 3500, CAMX, CAMZ, DX = 0, DZ = 1, LAKEW = 2300, LAKEL = 5200, LAKED = 600;
static const float L = 1100.0f, H = 820.0f;

static float terrain(float x, float z, int oct) {
  float px = x / L, py = z / L, a = 0, b = 1, dx = 0, dy = 0;
  for (int i = 0; i < oct; i++) {
    float n, nx, ny; noised(px, py, &n, &nx, &ny);
    dx += nx; dy += ny; a += b * n / (1 + dx * dx + dy * dy);
    b *= .5f; float q = .8f * px - .6f * py; py = .6f * px + .8f * py; px = q; px *= 2; py *= 2;
  }
  float h = H * a;
  if (oct > 8) { /* détail rocheux (ravines) pour l'éclairage seulement */
    float r = 0, amp = 1, fx = x / 95, fz = z / 95;
    for (int i = 0; i < 5; i++) { r += amp * (1 - fabsf(noise(fx, fz))); float q = 1.62f * fx - 1.18f * fz; fz = 1.18f * fx + 1.62f * fz + 3.1f; fx = q + 1.7f; amp *= .5f; }
    h += 15 * (r - .9f) + 9 * fbm2(x / 40, z / 40, 3);
  }
  float ddx = x - PEAKX, ddz = z - PEAKZ;
  h += PEAKA * expf(-(ddx * ddx + ddz * ddz) / (PEAKR * PEAKR));
  /* couloir de vallée (lac) dans l'axe de la caméra */
  float cx = x - (CAMX + DX * 2600), cz = z - (CAMZ + DZ * 2600);
  float al = cx * DX + cz * DZ, ac = -cx * DZ + cz * DX;
  h -= LAKED * expf(-(al * al) / (LAKEL * LAKEL) - (ac * ac) / (LAKEW * LAKEW));
  return h;
}

static float march(v3 ro, v3 rd, float tmax, int oct) {
  float t = 2;
  for (int i = 0; i < 700; i++) {
    v3 p = add(ro, mul(rd, t));
    float h = p.y - terrain(p.x, p.z, oct);
    if (h < .0015f * t) return t;
    t += .45f * h + .002f * t;
    if (t > tmax) break;
  }
  return -1;
}
static float shadow(v3 ro, v3 rd) {
  float res = 1, t = 6;
  for (int i = 0; i < 90; i++) {
    v3 p = add(ro, mul(rd, t));
    float h = p.y - terrain(p.x, p.z, 7);
    res = fminf(res, 18 * h / t);
    if (res < .001f || p.y > 2400) break;
    t += clampf(h, 4, 220);
  }
  return clampf(res, 0, 1);
}
static v3 normal_at(v3 p, float t) {
  float e = .0018f * t + .4f;
  float hx = terrain(p.x + e, p.z, 12) - terrain(p.x - e, p.z, 12);
  float hz = terrain(p.x, p.z + e, 12) - terrain(p.x, p.z - e, 12);
  return nrm(V(-hx, 2 * e, -hz));
}

static v3 sky(v3 ro, v3 rd) {
  float y = fmaxf(rd.y, 0);
  float sd = fmaxf(dot(rd, SUN), 0);
  float az = .5f + .5f * (rd.x * SUN.x + rd.z * SUN.z) / (sqrtf(rd.x * rd.x + rd.z * rd.z) * sqrtf(SUN.x * SUN.x + SUN.z * SUN.z) + 1e-5f);
  v3 hor = mixv(S.skyHor2, S.skyHor, powf(az, 2.2f));
  v3 c = mixv(hor, S.skyZen, powf(y, .4f));
  c = add(c, mul(S.sunCol, .28f * powf(sd, 6) + .55f * powf(sd, 60)));
  if (S.moon > 0) c = add(c, mul(V(1, .97f, .9f), S.moon * sstep(.9994f, .9997f, sd)));
  else c = add(c, mul(S.sunCol, 6 * powf(sd, 1400)));
  if (S.starAmt > 0 && rd.y > 0) {
    float u = atan2f(rd.x, rd.z) * 420, v = asinf(rd.y) * 420;
    int iu = (int)floorf(u), iv = (int)floorf(v);
    float h = hash2(iu + 9137, iv - 311);
    if (h > .9965f) { float fu = u - iu - .5f, fv = v - iv - .5f; float s = expf(-(fu * fu + fv * fv) * 28);
      c = add(c, mul(V(1, .97f, .92f), S.starAmt * s * (h - .9965f) * 260 * sstep(0, .25f, rd.y))); }
  }
  if (S.cloudCov > 0 && rd.y > .01f) {
    float tc = (S.cloudH - ro.y) / rd.y;
    float u = (ro.x + rd.x * tc) / 4200, v = (ro.z + rd.z * tc) / 4200;
    float n = fbm2(u, v, 7) + .5f * fbm2(u * 3.1f + 7, v * 3.1f, 4) * .35f;
    float cov = sstep(.5f - S.cloudCov, .9f - S.cloudCov, n + .5f);
    float lit = .55f + .45f * powf(sd, 3);
    v3 cc = mixv(mul(S.ambCol, 1.4f), mul(S.sunCol, 1.15f), lit);
    float fade = sstep(.01f, .18f, rd.y);
    c = mixv(c, cc, cov * .85f * fade);
  }
  return c;
}

static v3 fog(v3 col, v3 ro, v3 rd, float t) {
  float dens = S.fogDen * expf(-ro.y * S.fogFall) * (1 - expf(-t * rd.y * S.fogFall)) / (rd.y * S.fogFall + 1e-5f);
  if (fabsf(rd.y) < 1e-4f) dens = S.fogDen * expf(-ro.y * S.fogFall) * t;
  float f = 1 - expf(-fmaxf(dens, 0));
  float sd = fmaxf(dot(rd, SUN), 0);
  float az = .5f + .5f * (rd.x * SUN.x + rd.z * SUN.z) / (sqrtf(rd.x * rd.x + rd.z * rd.z) * sqrtf(SUN.x * SUN.x + SUN.z * SUN.z) + 1e-5f);
  v3 fc = add(mixv(S.fogCol2, S.fogCol, powf(az, 2.0f)), mul(S.sunCol, .45f * powf(sd, 8)));
  return mixv(col, fc, clampf(f, 0, 1));
}

static v3 shade_terrain(v3 ro, v3 rd, float t) {
  v3 p = add(ro, mul(rd, t));
  v3 n = normal_at(p, t);
  float nz = fbm2(p.x / 60, p.z / 60, 4);
  v3 rock = mixv(V(.085f, .082f, .08f), V(.2f, .19f, .175f), clampf(.5f + 1.2f * nz, 0, 1));
  rock = mixv(rock, V(.16f, .13f, .1f), sstep(.3f, .8f, fbm2(p.x / 400, p.z / 400, 3) + .5f) * .45f);
  v3 mat = rock;
  float hn = p.y + 140 * fbm2(p.x / 180, p.z / 180, 4);
  // forêts et prairies
  float g = sstep(.42f, .68f, n.y + .15f * nz) * (1 - sstep(S.snowLine - 800, S.snowLine - 420, hn)) * S.grassAmt;
  float tree = sstep(-.1f, .25f, fbm2(p.x / 35, p.z / 35, 3));
  v3 grass = mixv(V(.06f, .085f, .03f), V(.022f, .036f, .02f), tree);
  grass = mixv(grass, V(.1f, .12f, .045f), sstep(S.water + 40, S.water + 5, p.y) * .6f);
  mat = mixv(mat, grass, g);
  // neige
  float sn = sstep(S.snowLine - 120, S.snowLine + 160, hn) * sstep(.48f, .72f, n.y + .12f * nz);
  mat = mixv(mat, V(.80f, .83f, .88f), sn);
  float dif = clampf(dot(n, SUN), 0, 1);
  float sha = dif > 0 ? shadow(add(p, mul(n, 2)), SUN) : 0;
  float amb = clampf(.55f + .45f * n.y, 0, 1);
  float bnc = clampf(.3f - .7f * n.y, 0, 1) * clampf(1 - p.y / 1500, 0, 1);
  v3 lin = add(mul(S.sunCol, 1.9f * dif * sha), mul(S.ambCol, .55f * amb));
  lin = add(lin, mul(mulv(S.sunCol, V(.4f, .32f, .25f)), .25f * bnc));
  v3 col = mulv(mat, lin);
  // reflet spéculaire sur la neige
  v3 hv = nrm(sub(SUN, rd));
  col = add(col, mul(S.sunCol, sn * .25f * powf(clampf(dot(n, hv), 0, 1), 40) * sha));
  return col;
}

static float cloudTop(float x, float z) { return S.seaH + 150 * fbm2(x / 650, z / 650, 5) + 45 * fbm2(x / 140 + 9, z / 140, 3); }
static float marchCloud(v3 ro, v3 rd, float tmax) {
  float t = 2;
  for (int i = 0; i < 400; i++) { v3 p = add(ro, mul(rd, t)); float h = p.y - cloudTop(p.x, p.z); if (h < .002f * t) return t; t += .6f * h + .003f * t; if (t > tmax) break; }
  return -1;
}
static v3 render(v3 ro, v3 rd) {
  float tmax = S.tmax > 0 ? S.tmax : 42000;
  float tw = rd.y < 0 ? (S.water - ro.y) / rd.y : -1;
  float ts = S.seaH > -9000 ? marchCloud(ro, rd, 60000) : -1;
  if (S.seaH > -9000 && ts < 0 && rd.y < 0) ts = (S.seaH + 60 - ro.y) / rd.y;
  float t = march(ro, rd, tmax, 7);
  v3 col;
  if (tw > 0 && (t < 0 || tw < t)) {
    // lac : reflet + fresnel + scintillement
    v3 p = add(ro, mul(rd, tw));
    float e = 1.2f, wx = fbm2(p.x / 5 + 3, p.z / 1.6f, 4), wz = fbm2(p.x / 5, p.z / 1.6f + 5, 4);
    float wa = .035f / (1 + tw * .002f);
    v3 n = nrm(V(wx * wa, 1, wz * wa));
    (void)e;
    v3 rr = V(rd.x - 2 * dot(rd, n) * n.x, rd.y - 2 * dot(rd, n) * n.y, rd.z - 2 * dot(rd, n) * n.z);
    rr.y = fabsf(rr.y);
    float tr = march(add(p, V(0, .5f, 0)), rr, tmax, 6);
    float sv = S.fogDen; S.fogDen *= 1.0f;
    v3 rc = tr > 0 ? fog(shade_terrain(p, rr, tr), p, rr, tr) : sky(p, rr);
    S.fogDen = sv;
    float fr = .04f + .96f * powf(1 - clampf(-dot(rd, n), 0, 1), 5);
    fr = clampf(fr * 1.15f + .14f, 0, 1);
    col = mixv(S.waterCol, rc, fr);
    v3 hv = nrm(sub(SUN, rd));
    col = add(col, mul(S.sunCol, 3.5f * powf(clampf(dot(n, hv), 0, 1), 900)));
    col = fog(col, ro, rd, tw);
  } else if (ts > 0 && (t < 0 || ts < t)) {
    // mer de nuages
    v3 p = add(ro, mul(rd, ts));
    float e = 3 + .002f * ts;
    v3 n = nrm(V(cloudTop(p.x - e, p.z) - cloudTop(p.x + e, p.z), 2 * e, cloudTop(p.x, p.z - e) - cloudTop(p.x, p.z + e)));
    float dif = .5f + .5f * dot(n, SUN);
    float hgt = clampf((p.y - S.seaH + 120) / 300, 0, 1);
    v3 cc = add(mul(S.ambCol, 1.5f * (.55f + .45f * hgt)), mul(S.sunCol, .8f * dif * dif * (.6f + .4f * hgt)));
    cc = add(cc, mul(S.sunCol, .35f * powf(fmaxf(dot(rd, SUN), 0), 6)));
    col = fog(cc, ro, rd, ts * .5f);
  } else if (t > 0) {
    col = fog(shade_terrain(ro, rd, t), ro, rd, t);
  } else {
    col = sky(ro, rd);
  }
  return col;
}

static float aces(float x) { return clampf((x * (2.51f * x + .03f)) / (x * (2.43f * x + .59f) + .14f), 0, 1); }

static void preset(int k) {
  memset(&S, 0, sizeof S);
  S.water = -9999; S.seaH = -9999; S.cloudH = 4200; S.grassAmt = 1;
  switch (k) {
    case 0: // crépuscule doré (héros)
      S.sunAz = 1.8f; S.sunEl = .07f; S.sunCol = V(2.1f, 1.12f, .48f); S.skyZen = V(.02f, .05f, .16f); S.skyHor = V(1.0f, .62f, .3f);
      S.skyHor2 = V(.7f, .5f, .4f); S.fogCol = V(.5f, .36f, .3f); S.fogCol2 = V(.24f, .22f, .3f);
      S.ambCol = V(.12f, .17f, .32f); S.fogDen = .00006f; S.fogFall = .0006f; S.exposure = 1.2f;
      S.snowLine = 1150; S.water = -170; S.waterCol = V(.03f, .05f, .09f); S.cloudCov = .1f; break;
    case 1: // nuit, clair de lune
      S.sunAz = .5f; S.sunEl = .32f; S.sunCol = V(.24f, .3f, .48f); S.skyZen = V(.006f, .012f, .035f); S.skyHor = V(.04f, .07f, .14f);
      S.fogCol = V(.04f, .065f, .12f); S.ambCol = V(.05f, .07f, .14f); S.fogDen = .00007f; S.fogFall = .0006f; S.exposure = 2.1f;
      S.snowLine = 900; S.starAmt = 1.2f; S.moon = 1.6f; S.water = -170; S.waterCol = V(.004f, .008f, .02f); break;
    case 2: // matin clair
      S.sunAz = .9f; S.sunEl = .42f; S.sunCol = V(1.55f, 1.42f, 1.22f); S.skyZen = V(.16f, .33f, .72f); S.skyHor = V(.62f, .74f, .9f);
      S.fogCol = V(.55f, .66f, .82f); S.ambCol = V(.3f, .4f, .62f); S.fogDen = .00006f; S.fogFall = .0005f; S.exposure = 1.0f;
      S.snowLine = 1200; S.cloudCov = .25f; S.water = -170; S.waterCol = V(.02f, .06f, .1f); break;
    case 3: // alpenglow rose
      S.sunAz = 2.6f; S.sunEl = .03f; S.sunCol = V(1.6f, .62f, .5f); S.skyZen = V(.07f, .08f, .2f); S.skyHor = V(.78f, .48f, .52f);
      S.skyHor2 = V(.3f, .3f, .5f); S.fogCol = V(.48f, .34f, .4f); S.fogCol2 = V(.2f, .2f, .32f); S.ambCol = V(.2f, .2f, .36f); S.fogDen = .00008f; S.fogFall = .0005f; S.exposure = 1.35f;
      S.snowLine = 1000; S.cloudCov = .15f; S.water = -170; S.waterCol = V(.02f, .02f, .05f); break;
    case 4: // mer de nuages au lever du soleil
      S.sunAz = 2.0f; S.sunEl = .08f; S.sunCol = V(1.8f, 1.1f, .58f); S.skyZen = V(.05f, .1f, .27f); S.skyHor = V(1.0f, .7f, .42f);
      S.skyHor2 = V(.42f, .5f, .7f); S.fogCol = V(.62f, .48f, .4f); S.fogCol2 = V(.3f, .36f, .5f); S.ambCol = V(.24f, .29f, .44f); S.fogDen = .00009f; S.fogFall = .0005f; S.exposure = 1.15f;
      S.snowLine = 1250; S.seaH = 650; S.tmax = 15000; break;
    case 5: // hiver, plein soleil, très enneigé
      S.sunAz = .4f; S.sunEl = .36f; S.sunCol = V(1.5f, 1.43f, 1.3f); S.skyZen = V(.1f, .25f, .62f); S.skyHor = V(.6f, .72f, .88f);
      S.fogCol = V(.62f, .7f, .84f); S.ambCol = V(.32f, .42f, .64f); S.fogDen = .00005f; S.fogFall = .0005f; S.exposure = 1.0f;
      S.snowLine = 250; S.grassAmt = .35f; S.cloudCov = .1f; S.water = -170; S.waterCol = V(.02f, .05f, .09f); break;
    case 6: // été, vallée verte, après-midi
      S.sunAz = -1.2f; S.sunEl = .55f; S.sunCol = V(1.6f, 1.45f, 1.2f); S.skyZen = V(.14f, .32f, .7f); S.skyHor = V(.65f, .78f, .92f);
      S.fogCol = V(.6f, .7f, .85f); S.ambCol = V(.3f, .4f, .6f); S.fogDen = .00005f; S.fogFall = .0005f; S.exposure = 1.0f;
      S.snowLine = 1650; S.cloudCov = .35f; S.water = -170; S.waterCol = V(.02f, .07f, .09f); break;
    case 7: // heure bleue, orage lointain, ambiance dramatique
      S.sunAz = -2.4f; S.sunEl = .02f; S.sunCol = V(1.3f, .7f, .4f); S.skyZen = V(.03f, .05f, .12f); S.skyHor = V(.38f, .3f, .32f);
      S.fogCol = V(.18f, .18f, .24f); S.ambCol = V(.12f, .15f, .26f); S.fogDen = .00009f; S.fogFall = .0005f; S.exposure = 1.6f;
      S.snowLine = 1000; S.cloudCov = .45f; S.cloudH = 3200; S.water = -170; S.waterCol = V(.01f, .015f, .03f); break;
  }
  if (S.skyHor2.x == 0 && S.skyHor2.y == 0 && S.skyHor2.z == 0) S.skyHor2 = S.skyHor;
  if (S.fogCol2.x == 0 && S.fogCol2.y == 0 && S.fogCol2.z == 0) S.fogCol2 = S.fogCol;
  /* perspective aérienne : le brouillard lointain tend vers la couleur de l'horizon */
  S.fogCol = mixv(S.fogCol, mul(S.skyHor, .82f), .75f);
  S.fogCol2 = mixv(S.fogCol2, mul(S.skyHor2, .82f), .75f);
  float ce = cosf(S.sunEl);
  SUN = nrm(V(sinf(S.sunAz) * ce, sinf(S.sunEl), cosf(S.sunAz) * ce));
}

int main(int argc, char **argv) {
  if (argc < 13) { fprintf(stderr, "usage: render preset seed W H camx camy camz tax tay taz fov out.ppm [peakA]\n"); return 1; }
  int pk = atoi(argv[1]); SEED = (unsigned)atoi(argv[2]);
  int W = atoi(argv[3]), Ht = atoi(argv[4]);
  v3 ro = V(atof(argv[5]), atof(argv[6]), atof(argv[7]));
  v3 ta = V(atof(argv[8]), atof(argv[9]), atof(argv[10]));
  float fov = atof(argv[11]);
  if (argc > 13) PEAKA = atof(argv[13]);
  if (argc > 14) PEAKD = atof(argv[14]);
  if (argc > 15) PEAKR = atof(argv[15]);
  preset(pk);
  CAMX = ro.x; CAMZ = ro.z;
  { v3 d = nrm(V(ta.x - ro.x, 0, ta.z - ro.z)); DX = d.x; DZ = d.z; PEAKX = ro.x + d.x * PEAKD; PEAKZ = ro.z + d.z * PEAKD; }
  if (argc > 16) LAKEW = atof(argv[16]);
  // la caméra ne doit jamais être sous le relief
  float hg = terrain(ro.x, ro.z, 8); if (ro.y < hg + 40) ro.y = hg + 40;
  if (S.water > -9000 && ro.y < S.water + 25) ro.y = S.water + 25;
  v3 fw = nrm(sub(ta, ro)), rt = nrm(cross(fw, V(0, 1, 0))), up = cross(rt, fw);
  float fl = 1.0f / tanf(fov * .5f * 3.14159265f / 180);
  unsigned char *img = malloc((size_t)W * Ht * 3);
  #pragma omp parallel for schedule(dynamic, 2)
  for (int j = 0; j < Ht; j++) {
    for (int i = 0; i < W; i++) {
      float u = (2.0f * (i + .5f) - W) / Ht, v = -(2.0f * (j + .5f) - Ht) / Ht;
      v3 rd = nrm(add(add(mul(fw, fl), mul(rt, u)), mul(up, v)));
      v3 c = render(ro, rd);
      c = mul(c, S.exposure);
      float r = aces(c.x), g = aces(c.y), b = aces(c.z);
      // étalonnage : ombres bleu nuit, hautes lumières dorées
      float lum = .3f * r + .59f * g + .11f * b;
      r = mixf(r, r + .02f, 1 - lum); g = mixf(g, g + .03f, 1 - lum); b = mixf(b, b + .06f, 1 - lum);
      r = powf(clampf(r, 0, 1), 1 / 2.2f); g = powf(clampf(g, 0, 1), 1 / 2.2f); b = powf(clampf(b, 0, 1), 1 / 2.2f);
      float vx = (float)i / W - .5f, vy = (float)j / Ht - .5f, vig = 1 - .35f * (vx * vx + vy * vy) * 2.2f;
      size_t o = ((size_t)j * W + i) * 3;
      img[o] = (unsigned char)(clampf(r * vig, 0, 1) * 255 + .5f);
      img[o + 1] = (unsigned char)(clampf(g * vig, 0, 1) * 255 + .5f);
      img[o + 2] = (unsigned char)(clampf(b * vig, 0, 1) * 255 + .5f);
    }
  }
  FILE *f = fopen(argv[12], "wb"); fprintf(f, "P6\n%d %d\n255\n", W, Ht); fwrite(img, 1, (size_t)W * Ht * 3, f); fclose(f);
  return 0;
}
