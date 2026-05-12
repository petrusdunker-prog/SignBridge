// All geometry-based classifier logic ported from signbridge-v5.html

export function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
}

// ── Coordinate normalisation ──────────────────────────────────────────────────
// Translates so the wrist (lm[0]) is the origin, then scales by the wrist→
// middle-MCP distance (palm length ≈ 1 unit).  This makes every shape feature
// invariant to hand size and camera distance — the single biggest accuracy fix.
// Zone detection and inter-hand distances intentionally keep raw coords.
export function normalizeLandmarks(lm) {
  const wrist = lm[0];
  const scale = dist(lm[0], lm[9]) || 0.001; // palm length; guard against zero
  return lm.map(p => ({
    x: (p.x - wrist.x) / scale,
    y: (p.y - wrist.y) / scale,
    z: ((p.z || 0) - (wrist.z || 0)) / scale,
  }));
}

// curlRatio now expects *normalised* landmarks.
// Thresholds recalibrated: palm length = 1 unit, so finger segments are
// ~0.5–1.0 units long — much larger signal than the old raw 0.03 threshold.
export function curlRatio(lm, finger) {
  const tips  = [0, 8, 12, 16, 20];
  const mids  = [0, 6, 10, 14, 18];
  const bases = [0, 5,  9, 13, 17];
  if (finger === 0) {
    // Thumb: X spread between tip and IP joint in normalised units.
    // Extended thumb ≈ 0.5–0.8 → low curl; folded ≈ 0.1–0.2 → high curl.
    return Math.max(0, 1 - Math.abs(lm[4].x - lm[2].x) * 1.5);
  }
  const tipY  = lm[tips[finger]].y;
  const midY  = lm[mids[finger]].y;
  const baseY = lm[bases[finger]].y;
  const range = Math.abs(baseY - midY);
  // Foreshortening guard: in normalised space a finger pointing toward the
  // camera compresses the Y range to < 0.15 palm-lengths — treat as extended.
  if (range < 0.15) return 0;
  return Math.max(0, Math.min(1, (tipY - midY) / range));
}

export function getCurlRatios(lm) {
  return [0, 1, 2, 3, 4].map(f => curlRatio(lm, f));
}

export function palmOrientation(lm) {
  const wrist     = lm[0];
  const middleMCP = lm[9];
  const dx = middleMCP.x - wrist.x;
  const dy = middleMCP.y - wrist.y;
  if (Math.abs(dy) > Math.abs(dx)) return dy < 0 ? 'up' : 'down';
  return dx > 0 ? 'right' : 'left';
}

// handSpread expects *normalised* landmarks.
// Four adjacent fingertip pairs × ~0.45 palm-lengths each ≈ 1.8 for fully open.
export function handSpread(lm) {
  const tips = [4, 8, 12, 16, 20];
  let total = 0;
  for (let i = 0; i < tips.length - 1; i++) {
    total += dist(lm[tips[i]], lm[tips[i + 1]]);
  }
  return Math.min(1, total / 1.8);
}

export function getZone(wrist, faceLM, poseLM) {
  // ── Precise mode: use face + pose landmarks when available ─────────────────
  if (faceLM && poseLM) {
    const nose      = faceLM[1];
    const forehead  = { x: faceLM[10].x, y: faceLM[10].y - 0.07 };
    const chin      = faceLM[152] || faceLM[10];
    const cheekR    = faceLM[234];
    const rShoulder = poseLM[12];
    const lShoulder = poseLM[11];
    const chestPt   = rShoulder
      ? { x: (rShoulder.x + (lShoulder?.x || rShoulder.x)) / 2, y: rShoulder.y + 0.08 }
      : { x: nose.x, y: nose.y + 0.18 };

    const zones = [
      { name: 'forehead', pt: forehead, thresh: 0.22 },
      { name: 'cheek',    pt: cheekR,   thresh: 0.20 },
      { name: 'chin',     pt: chin,     thresh: 0.22 },
      { name: 'chest',    pt: chestPt,  thresh: 0.30 },
    ];

    let closest = 'neutral', minD = 99;
    for (const z of zones) {
      const d = dist(wrist, z.pt);
      if (d < z.thresh && d < minD) { minD = d; closest = z.name; }
    }
    return closest;
  }

  // ── Fallback: Y-position heuristic (used when face/pose not tracked) ───────
  // Assumes the signer is centred in frame with the camera at roughly face level.
  // Thresholds calibrated for a typical 720p webcam setup.
  const y = wrist.y;
  if (y < 0.30) return 'forehead';
  if (y < 0.46) return 'chin';
  if (y < 0.63) return 'chest';
  return 'neutral';
}

function hit(label, conf, source) { return { label, conf, source }; }

export function classifyTwoHand(rLM, lLM) {
  if (!rLM || !lLM) return null;

  // Normalise each hand independently for shape features.
  // Inter-wrist distance stays in raw frame coords — it's a position check,
  // not a shape check, so it must NOT be normalised.
  const rN = normalizeLandmarks(rLM);
  const lN = normalizeLandmarks(lLM);
  const interDist = dist(rLM[0], lLM[0]); // raw

  const rCurls  = getCurlRatios(rN);
  const lCurls  = getCurlRatios(lN);
  const rSpread = handSpread(rN);
  const lSpread = handSpread(lN);
  // Pinch in normalised space: extended pair ≈ 1.5–2.5, touching ≈ 0.3–0.5
  const rPinch  = dist(rN[8], rN[4]);
  const lPinch  = dist(lN[8], lN[4]);

  // HURT: both hands with only index finger extended, pointing toward each other
  const rIndexOnly = rCurls[1] < 0.3 && rCurls[2] > 0.5 && rCurls[3] > 0.5 && rCurls[4] > 0.5;
  const lIndexOnly = lCurls[1] < 0.3 && lCurls[2] > 0.5 && lCurls[3] > 0.5 && lCurls[4] > 0.5;
  if (rIndexOnly && lIndexOnly && interDist < 0.40) return 'HURT';

  // MORE: both hands O-pinch (normalised threshold ≈ 0.45)
  if (rPinch < 0.45 && lPinch < 0.45 && interDist < 0.25) return 'MORE';

  // ALL DONE / FINISHED: both hands fully open
  if (rSpread > 0.7 && lSpread > 0.7) return 'FINISHED';

  // WANT: both hands in claw shape (fingers moderately bent) pulled toward body
  const rClaw = rCurls[1] > 0.3 && rCurls[1] < 0.8 && rCurls[2] > 0.3 && rCurls[2] < 0.8;
  const lClaw = lCurls[1] > 0.3 && lCurls[1] < 0.8 && lCurls[2] > 0.3 && lCurls[2] < 0.8;
  if (rClaw && lClaw && interDist < 0.50) return 'WANT';

  if (rCurls[1] > 0.5 && lCurls[1] > 0.5 && interDist < 0.2) return 'FRIEND';
  if (rCurls[1] < 0.3 && lCurls[1] < 0.3 && rSpread < 0.5 && lSpread < 0.5) return 'HOW';
  if (dist(rLM[9], lLM[0]) < 0.12) return 'NAME'; // raw — position check
  return null;
}

export function classifySingleHand(handLM, faceLM, poseLM) {
  // Normalise for all shape measurements (scale/distance invariant).
  // Raw handLM kept only for zone detection (needs absolute screen position).
  const n = normalizeLandmarks(handLM);

  const curls  = getCurlRatios(n);
  const spread = handSpread(n);
  const zone   = getZone(handLM[0], faceLM, poseLM); // raw — absolute Y position
  // Pinch in normalised space: fingertips touching ≈ 0.3–0.5, extended ≈ 1.5+
  const pinch  = dist(n[8], n[4]);

  const thumbExt = curls[0] < 0.35;
  // thumbUp: thumb tip is ABOVE middle-finger MCP in normalised Y.
  // Still valid after normalisation — both points share the same origin/scale.
  const thumbUp  = n[4].y < n[9].y;

  const indexExt  = curls[1] < 0.3;
  const middleExt = curls[2] < 0.3;
  const ringExt   = curls[3] < 0.3;
  const pinkyExt  = curls[4] < 0.3;
  const allCurled     = curls[1] > 0.5 && curls[2] > 0.5 && curls[3] > 0.5 && curls[4] > 0.5;
  const allFingersExt = indexExt && middleExt && ringExt && pinkyExt;

  // ── Unique shapes checked first — can't be shadowed by zone logic ────────────
  if (thumbExt && indexExt && !middleExt && !ringExt && pinkyExt)
    return hit('I LOVE YOU', 94, 'hand');
  if (thumbUp && !indexExt && !middleExt && !ringExt && pinkyExt && allCurled)
    return hit('PLAY', 84, 'hand');
  if (allCurled && thumbUp && zone !== 'chest')
    return hit('HELP', 84, 'hand');
  if (allCurled && !thumbUp && zone !== 'chest')
    return hit('YES', 78, 'hand');

  // ── Forehead zone ────────────────────────────────────────────────────────────
  if (zone === 'forehead') {
    if (allFingersExt && spread > 0.6)                              return hit("I DON'T KNOW", 86, 'body');
    if (allFingersExt && !thumbExt)                                 return hit('HELLO',        90, 'body');
    if (!thumbExt && indexExt && !middleExt)                        return hit('UNDERSTAND',   82, 'body');
    if (thumbExt && !indexExt && !middleExt)                        return hit('DAD',          85, 'body');
    if (!thumbExt && middleExt && !indexExt)                        return hit('WHY',          80, 'body');
  }

  // ── Chin zone ────────────────────────────────────────────────────────────────
  if (zone === 'chin') {
    if (allFingersExt && (thumbExt || thumbUp))                     return hit('THANK YOU',    92, 'body');
    if (allFingersExt && !thumbExt)                                 return hit('GOOD',         84, 'body');
    if (indexExt && middleExt && ringExt && !pinkyExt && !thumbExt) return hit('WATER',        88, 'body');
    // EAT: O-pinch at mouth — normalised threshold ≈ 0.45
    if (pinch < 0.45)                                               return hit('EAT',          80, 'body');
    if (!indexExt && !middleExt && !ringExt && spread > 0.25)       return hit('DRINK',        76, 'body');
    if (allCurled && !thumbUp)                                      return hit('NOT',          80, 'body');
    if (!thumbExt && !indexExt && !middleExt && !ringExt && pinkyExt) return hit('THIRSTY',   78, 'body');
  }

  // ── Cheek zone ───────────────────────────────────────────────────────────────
  if (zone === 'cheek') {
    if (thumbUp && !indexExt && !middleExt && !ringExt && pinkyExt) return hit('CALL (phone)', 88, 'body');
    if (indexExt && !middleExt && !ringExt && !pinkyExt && !thumbExt) return hit('DEAF',       84, 'body');
    if (allCurled && !thumbUp)                                      return hit('SLEEP',        78, 'body');
    if (allCurled && thumbUp)                                       return hit('TOMORROW',     76, 'body');
    if (allFingersExt && !thumbExt && spread > 0.5)                 return hit('MOM',          82, 'body');
  }

  // ── Chest zone ───────────────────────────────────────────────────────────────
  if (zone === 'chest') {
    if (allCurled && thumbUp)                                       return hit('SORRY',        88, 'body');
    if (allFingersExt)                                              return hit('PLEASE',       86, 'body');
    if (allCurled && !thumbUp)                                      return hit('TIRED',        76, 'body');
    if (indexExt && !middleExt && !ringExt && !pinkyExt)           return hit('ME / I',       84, 'body');
    // HUNGRY: O-pinch at chest — normalised threshold ≈ 0.5
    if (pinch < 0.5 && !indexExt)                                  return hit('HUNGRY',       78, 'body');
  }

  // ── Zone-independent shapes ───────────────────────────────────────────────────
  if (indexExt && middleExt && !ringExt && !pinkyExt && !thumbExt) return hit('NO',           80, 'hand');
  if (thumbExt && indexExt && !middleExt && !ringExt && !pinkyExt) return hit('WHO',          74, 'hand');
  if (allFingersExt && (thumbExt || thumbUp) && spread > 0.65)     return hit('FINISHED',     76, 'hand');
  if (indexExt && middleExt && ringExt && !pinkyExt && !thumbExt)  return hit('WATER',        72, 'hand');
  // MORE single-hand: O-pinch, normalised ≈ 0.4
  if (pinch < 0.40 && !indexExt && !middleExt)                     return hit('MORE',         78, 'hand');
  if (indexExt && !middleExt && !ringExt && !pinkyExt && !thumbExt) return hit('WHERE',       72, 'hand');
  // RESTROOM: R-hand — crossed index+middle tips close in normalised space ≈ 0.25
  if (indexExt && middleExt && !ringExt && !pinkyExt
      && dist(n[8], n[12]) < 0.25)                                 return hit('RESTROOM',     70, 'hand');

  return hit(null, 0, 'hand');
}

export function classifyLetter(lm) {
  const n = normalizeLandmarks(lm);
  const c = getCurlRatios(n);
  const th = c[0] < 0.35, i = c[1] < 0.3, m = c[2] < 0.3, r = c[3] < 0.3, p = c[4] < 0.3;
  if (!th && !i && !m && !r && !p) return hit('A', 82, 'hand');
  if (i && m && r && p && !th)     return hit('B', 88, 'hand');
  if (th && i && !m && !r && !p)   return hit('L', 86, 'hand');
  if (th && !i && !m && !r && p)   return hit('Y', 88, 'hand');
  if (i && m && !r && !p && !th)   return hit('V', 86, 'hand');
  if (i && !m && !r && !p && !th)  return hit('D', 84, 'hand');
  if (!i && !m && !r && p && !th)  return hit('I', 84, 'hand');
  if (i && m && r && !p && !th)    return hit('W', 82, 'hand');
  return hit(null, 0, 'hand');
}

export function classifyNumber(lm) {
  const n = normalizeLandmarks(lm);
  const c = getCurlRatios(n);
  const th = c[0] < 0.35, i = c[1] < 0.3, m = c[2] < 0.3, r = c[3] < 0.3, p = c[4] < 0.3;
  if (i && !m && !r && !p && !th) return hit('1',  88, 'hand');
  if (i && m && !r && !p && !th)  return hit('2',  88, 'hand');
  if (th && i && m && !r && !p)   return hit('3',  86, 'hand');
  if (i && m && r && p && !th)    return hit('4',  86, 'hand');
  if (i && m && r && p && th)     return hit('5',  88, 'hand');
  if (th && !i && !m && !r && !p) return hit('10', 82, 'hand');
  return hit(null, 0, 'hand');
}

// Motion tracking — 30 frames gives ~1 s of history at 30 fps.
// The teacher feedback specifically called out the need for 30–60 frame
// sequences; 30 is the sweet spot between latency and temporal accuracy.
const MOTION_FRAMES = 30;
export const motionHistory = { R: [], L: [] };

export function pushMotion(side, wrist) {
  const hist = motionHistory[side];
  hist.push({ x: wrist.x, y: wrist.y, t: Date.now() });
  if (hist.length > MOTION_FRAMES) hist.shift();
}

export function getVelocity(side) {
  const hist = motionHistory[side];
  if (hist.length < 3) return { vx: 0, vy: 0, speed: '0.000', dir: '—', accel: 0 };

  // ── Smoothed velocity: weighted average of recent per-frame deltas ──────────
  // Earlier frames use half the weight of recent frames — this preserves
  // responsiveness while suppressing single-frame noise spikes.
  let wxSum = 0, wySum = 0, wSum = 0;
  for (let i = 1; i < hist.length; i++) {
    const dt = (hist[i].t - hist[i - 1].t) / 1000 || 0.001;
    const fx = (hist[i].x - hist[i - 1].x) / dt;
    const fy = (hist[i].y - hist[i - 1].y) / dt;
    const w  = i / hist.length; // newer frames get higher weight
    wxSum += fx * w;
    wySum += fy * w;
    wSum  += w;
  }
  const vx = wxSum / wSum;
  const vy = wySum / wSum;
  const speed = Math.sqrt(vx * vx + vy * vy);

  // ── Acceleration: compare recent half vs older half of buffer ────────────────
  // Positive = speeding up (e.g. start of a chop); negative = slowing down.
  const mid      = Math.floor(hist.length / 2);
  const oldHalf  = hist.slice(0, mid);
  const newHalf  = hist.slice(mid);
  function halfSpeed(frames) {
    if (frames.length < 2) return 0;
    const dt = (frames[frames.length - 1].t - frames[0].t) / 1000 || 0.001;
    const dx = frames[frames.length - 1].x - frames[0].x;
    const dy = frames[frames.length - 1].y - frames[0].y;
    return Math.sqrt((dx / dt) ** 2 + (dy / dt) ** 2);
  }
  const accel = halfSpeed(newHalf) - halfSpeed(oldHalf);

  let dir = '•';
  if (speed > 0.05) {
    const angle = Math.atan2(vy, vx) * 180 / Math.PI;
    const dirs  = ['→','↘','↓','↙','←','↖','↑','↗'];
    dir = dirs[Math.round((angle + 180) / 45) % 8];
  }
  return { vx, vy, speed: speed.toFixed(3), dir, accel: parseFloat(accel.toFixed(3)) };
}

export function detectMotionPattern(rVel, lVel) {
  const rSpeed = parseFloat(rVel.speed);
  const lSpeed = parseFloat(lVel.speed);
  const FAST = 0.20, SLOW = 0.05;

  if (rSpeed > SLOW && lSpeed > SLOW) {
    if (rVel.dir === '→' && lVel.dir === '←') return 'MORE';
    if (rVel.dir === '←' && lVel.dir === '→') return 'FINISHED';
  }
  // NOTE: velocity arrows are 180° rotated from screen direction because
  // atan2 uses math Y-up but screen Y increases downward.
  // Screen-DOWN motion  → vy > 0 → dir '↑'  (STOP chop)
  // Screen-UP motion    → vy < 0 → dir '↓'  (HELP lift)
  //
  // Acceleration guard on STOP: require accel > 0 so we only fire on a
  // deliberate downward chop (speed is *increasing*), not slow downward drift.
  if (rSpeed > FAST && ['↑','↖','↗'].includes(rVel.dir) && rVel.accel > 0) return 'STOP';
  if (rSpeed > SLOW && rVel.dir === '↓') return 'HELP';
  return null;
}

export function seqPattern(frameBuf) {
  if (frameBuf.length < 8) return null;
  // Require the same label to be stable across the last 10 frames (~330 ms at 30 fps).
  // More frames = fewer false positives; was 6 frames with the old 12-frame buffer.
  const last = frameBuf.slice(-10);
  const allSame  = last.every(f => f.label === last[0].label && f.label !== '—');
  const allStill = last.every(f => f.speed < 0.08);
  if (allSame && allStill && last[0].label) {
    return { label: last[0].label, conf: 96, source: 'seq' };
  }
  return null;
}
