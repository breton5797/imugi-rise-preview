// Canvas renderer. Reads the sim state and the fx layer, never writes to either.
import { hsl, lerpC } from './color.js';
import { BOSS, FEVER, GROUND, LH, PHYS, POWER, STAGES } from './config.js';
import { ENDING_SWAP, drawCutscene } from './cutscene.js';
import { t } from './i18n.js';
import { droneY, gateCenter, gateGap, multiplier, zoneOf } from './logic.js';
import {
  AWAKEN_COLORS, POWER_COLORS, coinSquash, drawBoss, drawCharm, drawCoinFace, drawFire, drawUnit, drawWisp,
  paintCheonmun, paintClouds, paintHalla, paintLantern, paintMist,
} from './sprites.js';

const R = PHYS.birdR;
const MIN_LW = 400;
const SCENERY_W = 2400;
const DISPLAY = '"Black Han Sans", "Arial Black", "Hiragino Sans", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
const BODY = 'system-ui, -apple-system, "Segoe UI", "Noto Sans KR", "Hiragino Sans", "PingFang SC", sans-serif';
// Dancheong bands: the five cardinal colours (obangsaek) in the order they ring a pillar head.
const DANCHEONG = [[150, 62, 36], [44, 92, 58], [212, 70, 44], [0, 0, 94], [4, 78, 46]];
// Pillar-head bands for the other backdrops: lantern stone, basalt, and gilt.
const HEADS = {
  palace: DANCHEONG,
  underworld: [[190, 18, 30], [176, 46, 42], [190, 10, 56], [176, 56, 30], [200, 20, 20]],
  clouds: [[24, 16, 22], [30, 30, 42], [20, 12, 16], [36, 50, 58], [24, 20, 30]],
  heaven: [[44, 90, 58], [0, 0, 97], [44, 100, 74], [4, 78, 52], [40, 90, 46]],
};
const STAR_ALPHA = { palace: 1, underworld: 0.5, clouds: 0.4, heaven: 0 };
const GOLD = [44, 96, 60];
const TAU = Math.PI * 2;
const MIST_W = 600, CLOUD_W = 520, CLOUD_H = 100, CLOUD_BASE = 56;
const stageById = id => STAGES.find(s => s.id === id) || STAGES[0];
// Desaturate a colour and pull its lightness toward l: haze, mist and cloud tones from the sky.
const toward = (c, k, l) => [c[0], c[1] * (1 - k * 0.6), c[2] + (l - c[2]) * k];

const zonePal = z => ({ sky0: z.sky[0], sky1: z.sky[1], a: z.a, b: z.b, gate: z.gate });
// Cached layers take palette colours rounded to whole units, so a zone fade repaints them a few
// dozen times rather than every frame. Zone colours are whole numbers, so at rest nothing changes.
const q = c => c.map(Math.round);

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  // LW x VH is the logical viewport: at least MIN_LW wide so the next gate is always in view,
  // at least LH tall. Extra height on tall phones becomes more courtyard, under the thumbs.
  let scale = 1, LW = MIN_LW, VH = LH;
  let stage = STAGES[0], pal = zonePal(stage.zones[0]);
  let overcast = false; // the ending's rain: no moon, no stars

  // Scenery is generated once, so a resize (or a phone's collapsing URL bar) never reshuffles it.
  const stars = Array.from({ length: 70 }, () => ({
    u: Math.random(), y: Math.random() * GROUND * 0.6, r: Math.random() * 1.4 + 0.3, tw: Math.random() * 6,
  }));
  const ridge = Array.from({ length: 25 }, (_, i) => ({ x: i * 100, h: 120 + Math.random() * 130 }));
  const halls = [];
  for (let x = 0; x < SCENERY_W;) {
    const w = 130 + Math.random() * 150;
    halls.push({ x, w, h: 46 + Math.random() * 60, lamp: Math.random() < 0.7 });
    x += w + 30 + Math.random() * 70;
  }
  const rand = (a, b) => a + Math.random() * (b - a);
  // Underworld: jangseung posts far off, stone lanterns floating along the road nearer in.
  const posts = [];
  for (let x = 40; x < SCENERY_W; x += rand(170, 320)) posts.push({ x, h: rand(56, 100) });
  const lanterns = Array.from({ length: 10 }, (_, i) => ({ x: i * 240 + rand(0, 80), dy: rand(0, 1), ph: rand(0, 6) }));
  // Cloud billows for one seamless tile, mist blobs for another, and loose wisps for the sky.
  const puffs = Array.from({ length: 10 }, (_, i) => ({ x: i * 52 + rand(0, 20), r: rand(28, 46), dy: rand(0, 14) }));
  const blobs = Array.from({ length: 8 }, (_, i) => ({ x: i * 75 + rand(0, 30), rx: rand(60, 110), ry: rand(12, 22), dy: rand(-8, 8) }));
  const wisps = Array.from({ length: 7 }, () => ({ u: Math.random(), y: rand(70, 330), s: rand(0.6, 1.2) }));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    scale = Math.min(canvas.height / LH, canvas.width / MIN_LW);
    LW = canvas.width / scale;
    VH = canvas.height / scale;
    layers.clear();
  }

  // Offscreen layers. Gradients and shadowBlur are what a low-end phone rasterises slowest, so
  // anything that holds still between palette changes is painted once, at device resolution, into
  // its own canvas and blitted each frame. A layer repaints only when its key changes.
  // shadowBlur ignores the transform, so a glow painted here matches one painted on screen.
  // During a zone fade most layers go stale every frame; repainting them all at once costs more than
  // the frame they save, so one stale layer repaints per frame, and none more often than every
  // REPAINT_GAP frames. A colour then trails the fade by a few frames, which the eye can't tell.
  const REPAINT_GAP = 6;
  const layers = new Map();
  let frameNo = 0, repaints = 0;
  function layer(name, key, w, h, paint, urgent = false) {
    let l = layers.get(name);
    if (!l) { l = { key: null, at: 0, c: document.createElement('canvas') }; layers.set(name, l); }
    if (l.key === key) return l.c;
    const stale = l.key !== null;
    if (stale && !urgent && (repaints > 0 || frameNo - l.at < REPAINT_GAP)) return l.c;
    const cw = Math.max(1, Math.ceil(w * scale)), ch = Math.max(1, Math.ceil(h * scale));
    if (l.c.width !== cw || l.c.height !== ch) { l.c.width = cw; l.c.height = ch; }
    const lc = l.c.getContext('2d');
    lc.save();
    lc.clearRect(0, 0, cw, ch);
    lc.setTransform(scale, 0, 0, scale, 0, 0);
    paint(lc);
    lc.restore();
    l.key = key; l.at = frameNo;
    if (stale) repaints++;
    return l.c;
  }
  // Draw a layer (or a top-left crop of it) at logical (x, y), snapped to whole device pixels: an
  // unfiltered 1:1 copy is several times cheaper than a resampled one, and half a pixel can't be seen.
  function blit(c, x, y, w = c.width, h = c.height) {
    if (w < 1 || h < 1) return;
    const m = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(c, 0, 0, w, h, Math.round(m.a * x + m.e), Math.round(m.d * y + m.f), w, h);
    ctx.setTransform(m);
  }
  // Logical padding that holds a glow of the given shadowBlur (about three sigma, in device pixels).
  const glowPad = blur => Math.ceil((blur * 1.5 + 2) / scale);

  const roundRect = (x, y, w, h, r) => {
    const ww = Math.max(w, 0), rr = Math.min(r, ww / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + ww, y, x + ww, y + h, rr); ctx.arcTo(x + ww, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + ww, y, rr);
    ctx.closePath();
  };

  function drawMoon(v) {
    const span = LW + 300;
    const px = ((((LW * 0.74 - v.scroll * 0.015) % span) + span) % span) - 150;
    const a = q(pal.a);
    blit(layer('moon', hsl(a), 300, 300, lc => paintMoon(lc, a)), px - 150, -18);
  }

  // The moon and its halo, centred at (150, 150).
  function paintMoon(lc, a) {
    const halo = lc.createRadialGradient(150, 150, 30, 150, 150, 150);
    halo.addColorStop(0, hsl(a, 0.28, 20));
    halo.addColorStop(1, hsl(a, 0));
    lc.fillStyle = halo; lc.fillRect(0, 0, 300, 300);
    lc.fillStyle = 'hsl(48,70%,90%)';
    lc.beginPath(); lc.arc(150, 150, 46, 0, 6.29); lc.fill();
    lc.fillStyle = 'hsla(40,40%,70%,.35)';
    for (const [dx, dy, r] of [[-14, -10, 9], [10, 6, 12], [-6, 18, 6], [18, -16, 5]]) { lc.beginPath(); lc.arc(150 + dx, 150 + dy, r, 0, 6.29); lc.fill(); }
  }

  function drawRidge(scroll) {
    const len = ridge.length * 100, off = ((scroll % len) + len) % len;
    ctx.fillStyle = hsl(pal.sky0, 0.9, 5);
    ctx.beginPath(); ctx.moveTo(-20, GROUND);
    for (let rep = 0; rep < 2; rep++) {
      for (const p of ridge) {
        const x = p.x - off + rep * len;
        if (x < -220 || x > LW + 220) continue;
        ctx.quadraticCurveTo(x - 50, GROUND - p.h - 26, x, GROUND - p.h * 0.72);
      }
    }
    ctx.lineTo(LW + 20, GROUND); ctx.fill();
  }

  // A palace hall in silhouette: a hipped tiled roof whose eaves lift at the corners.
  function drawHall(x, w, h) {
    const base = GROUND, top = base - h, eave = 26;
    ctx.fillRect(x + 14, top, w - 28, h);
    ctx.beginPath();
    ctx.moveTo(x - 12, top - 6);
    ctx.quadraticCurveTo(x + 6, top - 4, x + w * 0.2, top - eave);
    ctx.lineTo(x + w * 0.8, top - eave);
    ctx.quadraticCurveTo(x + w - 6, top - 4, x + w + 12, top - 6);
    ctx.quadraticCurveTo(x + w - 2, top + 5, x + w - 12, top + 7);
    ctx.lineTo(x + 12, top + 7);
    ctx.quadraticCurveTo(x + 2, top + 5, x - 12, top - 6);
    ctx.fill();
    ctx.fillRect(x + w * 0.2 - 3, top - eave - 4, w * 0.6 + 6, 5);
  }

  function drawHalls(scroll) {
    const len = SCENERY_W + 80, off = ((scroll % len) + len) % len;
    for (let rep = 0; rep < 2; rep++) {
      for (const hl of halls) {
        const x = hl.x - off + rep * len;
        if (x > LW + 20 || x + hl.w < -20) continue;
        ctx.fillStyle = hsl(pal.sky0, 1, 1.5);
        drawHall(x, hl.w, hl.h);
        if (!hl.lamp) continue;
        ctx.fillStyle = hsl(pal.b, 0.75); ctx.shadowColor = hsl(pal.b); ctx.shadowBlur = 10;
        ctx.fillRect(x + hl.w * 0.3, GROUND - hl.h + 16, 4, 7);
        ctx.fillRect(x + hl.w * 0.66, GROUND - hl.h + 16, 4, 7);
        ctx.shadowBlur = 0;
      }
    }
  }

  // Underworld: jangseung (village guardian posts) in silhouette, with faintly glowing eyes.
  function drawPosts(scroll) {
    const len = SCENERY_W + 80, off = ((scroll % len) + len) % len, seen = [];
    for (let rep = 0; rep < 2; rep++) {
      for (const p of posts) { const x = p.x - off + rep * len; if (x > -30 && x < LW + 30) seen.push([x, GROUND - p.h]); }
    }
    ctx.fillStyle = hsl(pal.sky0, 1, 4);
    for (const [x, top] of seen) {
      ctx.fillRect(x - 7, top + 8, 14, GROUND - top - 8);
      ctx.beginPath(); ctx.ellipse(x, top + 9, 11, 4.5, 0, 0, TAU); ctx.fill();
      ctx.fillRect(x - 5, top, 10, 9);
    }
    ctx.fillStyle = hsl(pal.a, 0.45);
    for (const [x, top] of seen) { ctx.fillRect(x - 5, top + 19, 3, 2); ctx.fillRect(x + 2, top + 19, 3, 2); ctx.fillRect(x - 3, top + 29, 6, 1.5); }
  }

  function drawLanterns(v) {
    const b = q(pal.b), pad = glowPad(14), lw = 40 + pad * 2, lh = 64 + pad * 2;
    const c = layer('lantern', hsl(b), lw, lh, lc => paintLantern(lc, lw / 2, pad, b));
    const len = SCENERY_W, off = (((v.scroll * 0.45) % len) + len) % len;
    for (let rep = 0; rep < 2; rep++) {
      for (const l of lanterns) {
        const x = l.x - off + rep * len;
        if (x < -lw || x > LW + lw) continue;
        blit(c, x - lw / 2, GROUND - 150 - l.dy * 50 + Math.sin(v.clock * 1.3 + l.ph) * 5 - pad);
      }
    }
  }

  // A soft band of mist, one seamless MIST_W tile wide, drifting with the scroll and the clock.
  function drawMist(v, y, speed, alpha) {
    const col = q(toward(pal.a, 0.7, 72));
    const c = layer('mist', hsl(col), MIST_W, 80, lc => paintMist(lc, blobs, col, MIST_W));
    const off = (((v.scroll * speed + v.clock * 9) % MIST_W) + MIST_W) % MIST_W;
    ctx.globalAlpha = alpha;
    for (let x = -off; x < LW + 20; x += MIST_W) blit(c, x - 20, y - 40);
    ctx.globalAlpha = 1;
  }

  // A band of cloud billows whose heaped line sits at y, solid cloud from there down.
  function drawCloudBand(v, name, y, speed, k, dl = 0) {
    const col = q(toward(pal.sky1, k, 92));
    const c = layer(name, hsl(col) + dl, CLOUD_W, CLOUD_H, lc => paintClouds(lc, puffs, col, dl, CLOUD_W, CLOUD_H, CLOUD_BASE));
    const off = (((v.scroll * speed) % CLOUD_W) + CLOUD_W) % CLOUD_W;
    for (let x = -off; x < LW + 20; x += CLOUD_W) blit(c, x - 20, y - CLOUD_BASE);
    ctx.fillStyle = hsl(col, 1, dl - 6);
    ctx.fillRect(-20, y + CLOUD_H - CLOUD_BASE - 1, LW + 40, VH);
  }

  function drawWisps(v, k) {
    const col = q(toward(pal.sky1, k, 94));
    const c = layer('wisp', hsl(col), 150, 40, lc => {
      lc.fillStyle = hsl(col, 0.55);
      for (const [x, y, r] of [[30, 26, 12], [52, 20, 16], [78, 22, 14], [100, 27, 10], [64, 30, 20]]) {
        lc.beginPath(); lc.ellipse(x + 4, y, r * 1.5, r * 0.55, 0, 0, TAU); lc.fill();
      }
    });
    const span = LW + 200;
    for (const w of wisps) {
      const x = ((((w.u * span - v.scroll * 0.05 * w.s - v.clock * 4 * w.s) % span) + span) % span) - 150;
      blit(c, x, w.y);
    }
  }

  // Hallasan, hazy with distance, rising out of the cloud sea.
  function drawHalla(v) {
    const col = q(toward(pal.sky1, 0.25, pal.sky1[2] * 0.62)), rim = q(pal.a), W = 760, H = 230;
    const c = layer('halla', hsl(col) + hsl(rim), W, H, lc => paintHalla(lc, col, rim, W, H));
    const span = LW + W, x = ((((LW * 0.55 - v.scroll * 0.02) % span) + span) % span) - W * 0.6;
    blit(c, x, GROUND - 20 - H);
  }

  // Cheonmun stands far off on the clouds, small and hazy, with light pouring through it.
  function drawHeavenGate(v) {
    const sil = hsl(q(toward(pal.sky0, 0.3, 40)), 0.5), k = 0.6, w = 420 * k, h = 300 * k;
    const c = layer('cheonmun', sil, w, h, lc => { lc.scale(k, k); paintCheonmun(lc, sil); });
    const span = LW + w, x = ((((LW * 0.66 - v.scroll * 0.012) % span) + span) % span) - w;
    blit(c, x, GROUND - 22 - h);
  }

  // Shafts of light slanting down from above, painted once and breathing in brightness.
  function drawShafts(v) {
    const c = layer('shafts', '', LW, GROUND, lc => {
      for (const [u, w] of [[0.12, 30], [0.3, 46], [0.52, 64], [0.7, 40], [0.88, 54]]) {
        const g = lc.createLinearGradient(0, 0, 0, GROUND);
        g.addColorStop(0, 'hsla(48,100%,96%,.3)'); g.addColorStop(1, 'hsla(48,100%,96%,0)');
        lc.fillStyle = g;
        const x = u * LW;
        lc.beginPath(); lc.moveTo(x, 0); lc.lineTo(x + w * 0.4, 0); lc.lineTo(x + w * 2.4 + 90, GROUND); lc.lineTo(x + 90, GROUND); lc.fill();
      }
    });
    ctx.globalAlpha = v.reducedMotion ? 0.8 : 0.65 + 0.35 * Math.sin(v.clock * 0.7);
    blit(c, 0, 0);
    ctx.globalAlpha = 1;
  }

  function drawSky(v, kind) {
    const s0 = hsl(q(pal.sky0)), s1 = hsl(q(pal.sky1));
    blit(layer('sky', s0 + s1, LW + 40, GROUND + 20, lc => {
      const sky = lc.createLinearGradient(0, 20, 0, GROUND + 20);
      sky.addColorStop(0, s0);
      sky.addColorStop(1, s1);
      lc.fillStyle = sky;
      lc.fillRect(0, 0, LW + 40, GROUND + 20);
    }), -20, -20);
    const starA = overcast ? 0 : STAR_ALPHA[kind];
    if (!starA) return;
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      ctx.globalAlpha = (0.4 + 0.6 * Math.abs(Math.sin(v.clock * 1.5 + s.tw))) * starA;
      ctx.fillRect((((s.u * LW - v.scroll * 0.03) % LW) + LW) % LW, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
  }

  // Backdrop kinds (STAGES[].backdrop): everything behind the pillars.
  const BACKDROPS = {
    palace(v) { if (!overcast) drawMoon(v); drawRidge(v.scroll * 0.08); drawHalls(v.scroll * 0.3); },
    underworld(v) {
      drawMoon(v); drawRidge(v.scroll * 0.08); drawMist(v, GROUND - 170, 0.2, 0.5);
      drawPosts(v.scroll * 0.2); drawLanterns(v); drawMist(v, GROUND - 40, 0.55, 0.75);
    },
    clouds(v) { drawMoon(v); drawWisps(v, 0.4); drawHalla(v); drawCloudBand(v, 'cloudFar', GROUND - 30, 0.1, 0.3, -6); },
    heaven(v) { drawShafts(v); drawHeavenGate(v); drawWisps(v, 0.6); drawCloudBand(v, 'cloudFar', GROUND - 30, 0.1, 0.4, -4); },
  };

  function drawBackdrop(v, kind) {
    drawSky(v, kind);
    (BACKDROPS[kind] || BACKDROPS.palace)(v);
  }

  // The cloud sea under the halla and heaven stages: two nearer bands of billows over the far one.
  function drawCloudSea(v, kind) {
    const k = kind === 'heaven' ? 0.6 : 0.5;
    drawCloudBand(v, 'cloudMid', GROUND + 6, 0.35, k, 0);
    drawCloudBand(v, 'cloudNear', GROUND + 22 + (VH - GROUND) * 0.4, 0.8, k + 0.15, 4);
  }

  // A courtyard paved with stone slabs (the palaces, and the road through the underworld).
  function drawFloor(v, kind) {
    if (kind === 'clouds' || kind === 'heaven') { drawCloudSea(v, kind); return; }
    drawPaving(v);
    if (kind === 'underworld') drawMist(v, GROUND + 14, 0.9, 0.7);
  }

  function drawPaving(v) {
    ctx.fillStyle = hsl(pal.sky0, 1, -1);
    ctx.fillRect(-20, GROUND, LW + 40, VH - GROUND + 20);
    const a = q(pal.a), pad = glowPad(10);
    blit(layer('horizon', hsl(a), LW + 40, pad * 2, lc => {
      lc.strokeStyle = hsl(a, 0.85); lc.lineWidth = 2;
      lc.shadowColor = hsl(a); lc.shadowBlur = 10;
      lc.beginPath(); lc.moveTo(0, pad); lc.lineTo(LW + 40, pad); lc.stroke();
    }), -20, GROUND - pad);
    ctx.strokeStyle = hsl(pal.a, 0.16); ctx.lineWidth = 1;
    const vp = LW / 2, depth = (VH - GROUND) / (LH - GROUND);
    for (let i = -14; i <= 22; i++) {
      const xo = i * 60 - (v.scroll % 60);
      ctx.beginPath(); ctx.moveTo(vp + (xo - vp) * 0.15, GROUND); ctx.lineTo(vp + (xo - vp) * (0.15 + 1.65 * depth), VH + 10); ctx.stroke();
    }
    for (let j = 1; j < 6; j++) {
      const yy = GROUND + Math.pow(j / 6, 1.6) * (VH - GROUND + 10);
      ctx.beginPath(); ctx.moveTo(-20, yy); ctx.lineTo(LW + 20, yy); ctx.stroke();
    }
  }

  // The head of a pillar where it meets the gap: stacked dancheong bands under a wider cap.
  function paintPillarHead(lc, x, w, y, dir, glow, bands) {
    bands.forEach((col, i) => {
      lc.fillStyle = hsl(col);
      lc.fillRect(x, y + dir * (10 + i * 7) - (dir < 0 ? 7 : 0), w, 7);
    });
    lc.fillStyle = hsl([44, 92, 58], 0.9);
    for (let px = x + 7; px < x + w - 4; px += 11) { lc.beginPath(); lc.arc(px, y + dir * 20.5, 2.1, 0, 6.29); lc.fill(); }
    lc.shadowColor = hsl(glow); lc.shadowBlur = 16; lc.fillStyle = hsl(glow);
    lc.fillRect(x - 7, dir < 0 ? y - 10 : y, w + 14, 10);
  }

  function pillarHead(x, w, y, dir, type, glow) {
    const g = q(glow), pad = glowPad(16), ox = 7 + pad, oy = 45 + pad, bands = HEADS[stage.backdrop] || DANCHEONG;
    blit(layer(`head${w}/${dir}/${type}`, hsl(g) + stage.backdrop, w + ox * 2, oy * 2, lc => paintPillarHead(lc, ox, w, oy, dir, g, bands)), x - ox, y - oy);
  }

  // A pillar shaft in the stage's colour: lit from the left, with a shadowed strip down its right edge.
  function paintPillar(lc, w, col) {
    const body = lc.createLinearGradient(0, 0, w, 0);
    body.addColorStop(0, hsl(col, 1, -12));
    body.addColorStop(0.45, hsl(col, 1, 8));
    body.addColorStop(1, hsl(col, 1, -16));
    lc.fillStyle = body;
    lc.fillRect(0, 0, w, GROUND + 10);
    lc.fillStyle = 'hsla(0,0%,0%,.28)';
    lc.fillRect(w - 9, 0, 9, GROUND + 10);
  }

  function drawGate(gate, x, time) {
    const half = gateGap(gate, time) / 2, cy = gateCenter(gate, time), top = cy - half, bot = cy + half;
    const glow = gate.type === 'move' ? pal.b : gate.type === 'pulse' ? pal.a : pal.gate;
    // The shaft is the same at any height, so both halves crop the one texture.
    const shaft = layer(`pillar${gate.w}`, stage.id, gate.w, GROUND + 10, lc => paintPillar(lc, gate.w, stage.pillar));
    const sw = Math.round(gate.w * scale);
    blit(shaft, x, -10, sw, Math.round((top + 10) * scale));
    blit(shaft, x, bot, sw, Math.round((GROUND - bot) * scale));
    pillarHead(x, gate.w, top, -1, gate.type, glow);
    pillarHead(x, gate.w, bot, 1, gate.type, glow);
    if (gate.type !== 'static') {
      ctx.fillStyle = hsl(glow, 0.95); ctx.font = `13px ${BODY}`; ctx.textAlign = 'center';
      const mark = gate.type === 'move' ? '⇅' : '◇';
      ctx.fillText(mark, x + gate.w / 2, top - 52);
      ctx.fillText(mark, x + gate.w / 2, bot + 62);
    }
    // near-miss bands: skim these for a PERFECT
    ctx.fillStyle = hsl(pal.a, 0.1);
    ctx.fillRect(x, top, gate.w, 14);
    ctx.fillRect(x, bot - 14, gate.w, 14);
  }

  function drawOrb(o, x, clock) {
    const y = o.y + Math.sin(o.t * 5) * 3;
    if (o.k === 'orb') { drawCoin(x, y, o.t * 3); return; }
    ctx.save();
    ctx.translate(x, y);
    drawCharm(ctx, o.k, clock);
    ctx.restore();
  }

  // Coins come in 38 widths (a 0.02 step is under half a device pixel), each painted once with its glow.
  function drawCoin(x, y, spin) {
    const n = Math.round(coinSquash(spin) * 50), r = 8.5 + glowPad(12);
    blit(layer(`coin${n}`, '', r * 2, r * 2, lc => { lc.translate(r, r); drawCoinFace(lc, n / 50); }), x - r, y - r);
  }

  function drawDrone(dr, x, time) {
    ctx.save();
    ctx.strokeStyle = 'hsla(200,100%,70%,.14)'; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(x, dr.base - dr.amp); ctx.lineTo(x, dr.base + dr.amp); ctx.stroke();
    ctx.setLineDash([]);
    ctx.translate(x, droneY(dr, time));
    drawWisp(ctx, time, dr.ph);
    ctx.restore();
  }

  function drawBossLayer(v, sx) {
    const g = v.g, bs = g.boss;
    for (const shot of g.shots) {
      ctx.save(); ctx.translate(sx(shot.wx), shot.y); drawFire(ctx, v.clock); ctx.restore();
    }
    if (!bs) return;
    const charge = Math.max(0, 1 - bs.fireT / BOSS.telegraph);
    // A knocked-back boss stays half on screen, so the player never loses sight of it.
    const x = Math.min(LW - 40, v.birdX + Math.max(bs.lead, 60));
    if (charge > 0 && bs.hurtT <= 0) {
      // the lane about to burn
      ctx.fillStyle = `hsla(14,100%,56%,${0.08 + charge * 0.16})`;
      ctx.fillRect(-20, bs.y - 11, x + 20, 22);
    }
    ctx.save();
    ctx.translate(x, bs.y);
    if (bs.hurtT > 0 && !v.reducedMotion) ctx.translate(Math.sin(v.clock * 80) * 4, 0);
    drawBoss(ctx, { clock: v.clock, charge: bs.hurtT > 0 ? 0 : charge, hurt: bs.hurtT > 0.75, hpFrac: bs.hp / (bs.maxHp || BOSS.hp) });
    ctx.restore();
    drawStrikeCue(v, bs, x);
  }

  // With a full gauge, a guide shows the height to hold; when the player is lined up and in
  // reach, a pulsing jade ring says "break now".
  function drawStrikeCue(v, bs, x) {
    const g = v.g;
    if (g.dashMeter < 1 || bs.hurtT > 0 || g.dashT > 0) return;
    const ready = Math.abs(g.bird.y - bs.y) < R + BOSS.r - 12 && bs.lead < BOSS.lead + 15;
    const pulse = 0.5 + 0.5 * Math.sin(v.clock * 14);
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = `hsla(160,90%,70%,${ready ? 0.7 : 0.35})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(v.birdX + 24, bs.y); ctx.lineTo(x - BOSS.r - 8, bs.y); ctx.stroke();
    ctx.setLineDash([]);
    if (ready) {
      ctx.strokeStyle = `hsla(160,100%,72%,${0.55 + pulse * 0.45})`; ctx.lineWidth = 3;
      ctx.shadowColor = 'hsl(160,100%,60%)'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(x, bs.y, BOSS.r + 14 + pulse * 6, 0, 6.29); ctx.stroke();
    }
    ctx.restore();
  }

  // The imugi's drawn form: its base form, one ahead while awakened in this run (STORY.md §3).
  const formOf = v => (v.unit.id === 'imugi' ? Math.min(5, (v.form || 0) + (v.g.ascended ? 1 : 0)) : undefined);

  function unitColors(v, form) {
    const g = v.g, u = v.unit;
    const body = form === undefined ? (g.ascended ? AWAKEN_COLORS[u.id] || GOLD : u.body) : form >= 5 ? GOLD : u.body;
    return { body, wing: u.wing, trail: g.dashT > 0 ? u.wing : body };
  }

  function drawTrail(v, colors) {
    const tr = v.fx.trail, g = v.g;
    if (tr.length < 3 || g.phase !== 'play') return;
    const wide = g.dashT > 0 ? 14 : g.feverT > 0 ? 11 : 8;
    ctx.lineCap = 'round';
    for (let i = 1; i < tr.length; i++) {
      const a = i / tr.length;
      const hot = g.feverT > 0 ? [(v.clock * 300 + i * 18) % 360, 100, 66] : colors.trail;
      ctx.strokeStyle = hsl(hot, a * 0.6); ctx.lineWidth = a * wide;
      ctx.beginPath();
      ctx.moveTo(tr[i - 1].wx - g.dist + v.birdX, tr[i - 1].y);
      ctx.lineTo(tr[i].wx - g.dist + v.birdX, tr[i].y);
      ctx.stroke();
    }
  }

  function drawPlayer(v, colors, form) {
    const g = v.g, b = g.bird;
    if (g.phase !== 'play' && g.deadT > 0.05) return;
    if (g.invuln > 0 && g.dashT <= 0 && Math.floor(v.clock * 20) % 2 === 0) return;
    ctx.save();
    ctx.translate(v.birdX, b.y);
    ctx.rotate(b.rot);
    if (g.shield) {
      ctx.strokeStyle = `hsla(48,100%,70%,${0.55 + 0.25 * Math.sin(v.clock * 8)})`; ctx.lineWidth = 2.5;
      ctx.shadowColor = 'hsl(48,100%,60%)'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(0, 0, R + 11, 0, 6.29); ctx.stroke();
    }
    // A dragon that awakens again keeps its look; only its light grows.
    const blaze = form === 5 && g.ascended && v.form >= 5;
    ctx.shadowColor = hsl(g.dashT > 0 ? colors.wing : colors.body); ctx.shadowBlur = g.feverT > 0 || blaze ? 30 : 16;
    drawUnit(ctx, v.unit, { flap: b.wing, clock: v.clock, ascended: g.ascended, form });
    ctx.restore();
    if (v.fx.aura > 0) drawAura(v, b.y);
  }

  // Awakening (STORY.md §5.2): a column of light, eight short turning beams and a white flash
  // ring, then three rings spread from the new form and fade out, all in the spirit's own colour
  // (gold for the imugi).
  function drawAura(v, y) {
    const life = v.fx.aura / 1.6, age = 1.6 - v.fx.aura, x = v.birdX;
    const c = AWAKEN_COLORS[v.unit.id] || GOLD, s = Math.min(100, c[1] + 4);
    const hue = dh => (((c[0] + dh) % 360) + 360) % 360;
    ctx.save();
    ctx.fillStyle = `hsla(${hue(2)},${s}%,80%,${0.16 * life})`;
    ctx.fillRect(x - 15, -20, 30, GROUND + 20);
    ctx.shadowColor = `hsl(${hue(0)},${s}%,60%)`; ctx.shadowBlur = 18;
    const spin = v.reducedMotion ? 0 : age * 2.4, reach = 34 + Math.min(1, age * 2.5) * 46;
    ctx.fillStyle = `hsla(${hue(4)},${s}%,82%,${0.6 * Math.min(1, life * 1.8)})`;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = spin + (i * TAU) / 8;
      ctx.moveTo(x + Math.cos(a - 0.1) * 18, y + Math.sin(a - 0.1) * 18);
      ctx.lineTo(x + Math.cos(a) * reach, y + Math.sin(a) * reach);
      ctx.lineTo(x + Math.cos(a + 0.1) * 18, y + Math.sin(a + 0.1) * 18);
      ctx.closePath();
    }
    ctx.fill();
    if (age < 0.3 && !v.reducedMotion) {
      const k = age / 0.3;
      ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 10 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(x, y, 16 + k * 44, 0, TAU); ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const k = Math.min(1, (1 - life) * 1.4 + i * 0.18);
      ctx.strokeStyle = `hsla(${hue(-i * 14)},${s}%,${68 - i * 6}%,${life * (1 - i * 0.25)})`;
      ctx.lineWidth = 4 - i;
      ctx.beginPath(); ctx.arc(v.birdX, y, 22 + k * (120 + i * 30), 0, 6.29); ctx.stroke();
    }
    ctx.restore();
  }

  function drawFxLayer(v) {
    for (const p of v.fx.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = hsl(p.col);
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const p of v.fx.pops) {
      const s = p.big ? 1 + Math.max(0, 0.25 - p.t) * 2 : 1;
      ctx.save();
      ctx.globalAlpha = 1 - Math.max(0, (p.t - 0.6) / 0.5);
      ctx.translate(Math.max(90, Math.min(LW - 90, p.x)), p.y);
      ctx.scale(s, s);
      ctx.font = `${p.big ? 18 : 14}px ${DISPLAY}`; ctx.textAlign = 'center';
      ctx.fillStyle = hsl(p.col); ctx.shadowColor = hsl(p.col); ctx.shadowBlur = 10;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }

  function drawScreenFx(v) {
    const g = v.g;
    const tint = g.dashT > 0 ? hsl(q(pal.b), 0.35) : g.slowT > 0 ? 'hsla(52,100%,70%,.22)'
      : g.feverT > 0 ? `hsla(${(v.clock * 200) % 360},100%,60%,.22)` : g.boss ? 'hsla(8,100%,45%,.2)' : null;
    if (tint) {
      const paint = c => {
        const vg = c.createRadialGradient(LW / 2, VH / 2, VH * 0.3, LW / 2, VH / 2, VH * 0.75);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, tint);
        c.fillStyle = vg;
        c.fillRect(0, 0, LW, VH);
      };
      // Fever's hue cycles every frame, so its vignette is painted live; the steady tints are cached,
      // and repaint the moment the tint changes so a dash or a boss never shows the old colour.
      if (g.feverT > 0 && g.dashT <= 0 && g.slowT <= 0) paint(ctx);
      else blit(layer('vignette', tint, LW, VH, paint, true), 0, 0);
    }
    if (g.dashT > 0 && !v.reducedMotion) {
      ctx.strokeStyle = hsl(pal.b, 0.35); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const y = (i * 71 + v.clock * 900) % GROUND, x = (i * 137 + v.clock * 1500) % (LW + 120) - 60;
        ctx.moveTo(LW - x, y); ctx.lineTo(LW - x + 70, y);
      }
      ctx.stroke();
    }
    if (v.fx.flash > 0 && !v.reducedMotion) {
      ctx.fillStyle = `rgba(255,255,255,${v.fx.flash * 0.35})`;
      ctx.fillRect(0, 0, LW, VH);
    }
  }

  function drawChips(g) {
    let x = 16;
    const chip = (kind, frac) => {
      const col = POWER_COLORS[kind];
      ctx.font = `700 11px ${BODY}`;
      const label = t(`power.${kind}`), w = Math.max(70, ctx.measureText(label).width + 22);
      ctx.fillStyle = hsl(col, 0.25); roundRect(x, 16, w, 22, 11); ctx.fill();
      ctx.globalAlpha = 0.4; ctx.fillStyle = hsl(col); roundRect(x, 16, w * frac, 22, 11); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(label, x + w / 2, 31);
      x += w + 6;
    };
    if (g.shield) chip('shield', 1);
    if (g.magnetT > 0) chip('magnet', g.magnetT / POWER.magnet);
    if (g.slowT > 0) chip('slow', g.slowT / POWER.slow);
    if (g.doubleT > 0) chip('double', g.doubleT / POWER.double);
  }

  function drawMeter(v) {
    const g = v.g;
    const mx = 16, my = VH - 34, mw = Math.min(150, LW * 0.4), full = g.dashMeter >= 1;
    ctx.fillStyle = 'rgba(255,255,255,.12)'; roundRect(mx, my, mw, 10, 5); ctx.fill();
    ctx.fillStyle = hsl(pal.b, full ? 1 : 0.7);
    if (full) { ctx.shadowColor = hsl(pal.b); ctx.shadowBlur = 14; }
    roundRect(mx, my, mw * g.dashMeter, 10, 5); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left'; ctx.font = `600 11px ${BODY}`; ctx.fillStyle = 'rgba(243,238,252,.8)';
    ctx.fillText(full ? t('hud.dashReady') : t('hud.dash', { pct: Math.floor(g.dashMeter * 100) }), mx, my - 6);
    if (g.trait.glideVy) ctx.fillText(t('hud.glide'), mx, my - 22);
  }

  function drawBossBar(g) {
    if (!g.boss) return;
    const w = Math.min(220, LW - 120), x = LW / 2 - w / 2, y = 150;
    ctx.textAlign = 'center'; ctx.font = `13px ${DISPLAY}`; ctx.fillStyle = 'hsl(14,100%,66%)';
    ctx.fillText(t('hud.boss'), LW / 2, y - 6);
    const max = g.boss.maxHp || BOSS.hp;
    for (let i = 0; i < max; i++) {
      const seg = (w - (max - 1) * 6) / max;
      ctx.fillStyle = i < g.boss.hp ? 'hsl(8,90%,54%)' : 'rgba(255,255,255,.14)';
      roundRect(x + i * (seg + 6), y, seg, 8, 4); ctx.fill();
    }
  }

  function drawBanner(v) {
    const bn = v.fx.banner;
    if (!bn) return;
    ctx.globalAlpha = Math.max(0, Math.min(1, bn.dur - bn.t) * Math.min(1, bn.t * 3));
    ctx.textAlign = 'center'; ctx.font = `600 12px ${BODY}`; ctx.fillStyle = 'rgba(243,238,252,.8)';
    ctx.fillText(bn.kicker, LW / 2, LH * 0.38);
    const col = bn.col || pal.b;
    let size = 28;
    ctx.font = `${size}px ${DISPLAY}`;
    const wide = ctx.measureText(bn.title).width;
    if (wide > LW - 40) { size = Math.floor(size * (LW - 40) / wide); ctx.font = `${size}px ${DISPLAY}`; }
    ctx.fillStyle = hsl(col); ctx.shadowColor = hsl(col); ctx.shadowBlur = 18;
    ctx.fillText(bn.title, LW / 2, LH * 0.38 + 34);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  function drawHUD(v) {
    const g = v.g, mult = multiplier({ fever: g.feverT > 0, double: g.doubleT > 0 });
    ctx.textAlign = 'center'; ctx.font = `54px ${DISPLAY}`; ctx.fillStyle = '#fff';
    ctx.shadowColor = hsl(pal.a); ctx.shadowBlur = 16;
    ctx.fillText(String(g.score), LW / 2, 104);
    ctx.shadowBlur = 0;
    let y = 130;
    if (g.boss) {
      drawBossBar(g);
    } else if (g.feverT > 0) {
      ctx.font = `17px ${DISPLAY}`; ctx.fillStyle = `hsl(${(v.clock * 300) % 360},100%,68%)`;
      ctx.fillText(t('hud.fever', { mult }), LW / 2, y);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; roundRect(LW / 2 - 50, y + 7, 100, 4, 2); ctx.fill();
      ctx.fillStyle = '#fff'; roundRect(LW / 2 - 50, y + 7, 100 * (g.feverT / FEVER.time), 4, 2); ctx.fill();
      y += 30;
    } else if (mult > 1) {
      ctx.font = `15px ${DISPLAY}`; ctx.fillStyle = hsl(POWER_COLORS.double, 1, 10);
      ctx.fillText(t('hud.mult', { mult }), LW / 2, y);
      y += 22;
    }
    if (g.combo > 1 && !g.boss) {
      ctx.font = `16px ${DISPLAY}`; ctx.fillStyle = hsl(pal.a);
      ctx.fillText(t('hud.combo', { n: g.combo }), LW / 2, y);
    }
    drawChips(g);
    drawMeter(v);
    if (v.mode === 'daily') {
      ctx.textAlign = 'right'; ctx.font = `600 11px ${BODY}`; ctx.fillStyle = 'rgba(243,238,252,.7)';
      ctx.fillText(t('hud.daily', { date: v.dateLabel }), LW - 16, VH - 12);
    }
    drawBanner(v);
  }

  /**
   * @param {object} v view: { g, fx, unit, birdX, scroll, clock, hud, mode, dateLabel, reducedMotion,
   *   stage, form, cutscene } — stage is a STAGES id, form the imugi's base form 0…5, cutscene null
   *   or { kind: 'transform', t, from, to } | { kind: 'ending', t } (gameplay frozen underneath).
   */
  function draw(v, rdt) {
    const cut = v.cutscene || null, ending = cut !== null && cut.kind === 'ending';
    // The ending lands in the palace courtyard, swapped in under its brightest moment.
    overcast = ending && cut.t >= ENDING_SWAP;
    const next = stageById(overcast ? 'palace' : v.stage);
    const target = zonePal(next.zones[zoneOf(v.g.passed)]);
    frameNo++; repaints = 0;
    if (next !== stage) {
      // A new stage is a new place: no fade from the old palette, and every layer repaints now.
      stage = next; pal = target; layers.clear();
    } else {
      const k = Math.min(1, rdt * 1.6);
      pal = Object.fromEntries(Object.keys(pal).map(key => [key, lerpC(pal[key], target[key], k)]));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sk = v.reducedMotion ? 0 : v.fx.shake;
    ctx.setTransform(scale, 0, 0, scale, (Math.random() - 0.5) * sk * scale, (Math.random() - 0.5) * sk * scale);
    const g = v.g, sx = wx => wx - g.dist + v.birdX;
    drawBackdrop(v, stage.backdrop);
    // The ending clears the sky of the run: no pillars, pickups or boss under the rising dragon.
    if (!ending) {
      for (const gate of g.gates) { const x = sx(gate.wx); if (x < LW + 20 && x + gate.w > -20) drawGate(gate, x, g.t); }
      for (const o of g.orbs) { const x = sx(o.wx); if (!o.got && x < LW + 30 && x > -30) drawOrb(o, x, v.clock); }
      for (const dr of g.drones) { const x = sx(dr.wx); if (!dr.dead && x < LW + 30 && x > -30) drawDrone(dr, x, g.t); }
    }
    drawFloor(v, stage.backdrop);
    if (!ending) drawBossLayer(v, sx);
    const form = formOf(v), colors = unitColors(v, form);
    // In a cutscene the player is drawn by the cutscene itself, large and centred.
    if (!cut) drawTrail(v, colors);
    drawFxLayer(v);
    if (!cut) drawPlayer(v, colors, form);
    drawScreenFx(v);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (cut) drawCutscene(ctx, v, LW, VH, { start: { x: v.birdX, y: g.bird.y } });
    else if (v.hud) drawHUD(v);
  }

  return { resize, draw, palette: () => pal, width: () => LW };
}
