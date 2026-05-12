// All geometry-based classifier logic ported from signbridge-v5.html

export function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2);
}

export function curlRatio(lm, finger) {
  const tips  = [0, 8, 12, 16, 20];
  const mids  = [0, 6, 10, 14, 18];
  const bases = [0, 5,  9, 13, 17];
  if (finger === 0) {
    // Thumb: measure X spread between tip and IP joint
    return Math.max(0, 1 - Math.abs(lm[4].x - lm[2].x) * 5);
  }
  const tipY  = lm[tips[finger]].y;
  const midY  = lm[mids[finger]].y;
  const baseY = lm[bases[finger]].y;
  const range = Math.abs(baseY - midY);
  // When range is tiny the finger is pointing toward/away from camera (foreshortened).
  // Y-coords cluster together and are unreliable — treat as extended.
  if (range < 0.03) return 0;
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

export function handSpread(lm) {
  const tips = [4, 8, 12, 16, 20];
  let total = 0;
  for (let i = 0; i < tips.length - 1; i++) {
    total += dist(lm[tips[i]], lm[tips[i + 1]]);
  }
  return Math.min(1, total / 0.8);
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
  const interDist = dist(rLM[0], lLM[0]);
  const rCurls = getCurlRatios(rLM);
  const lCurls = getCurlRatios(lLM);
  const rSpread = handSpread(rLM);
  const lSpread = handSpread(lLM);
  const rPinch  = dist(rLM[8], rLM[4]);
  const lPinch  = dist(lLM[8], lLM[4]);

  // HURT: both hands with only index finger extended, pointing toward each other
  const rIndexOnly = rCurls[1] < 0.3 && rCurls[2] > 0.5 && rCurls[3] > 0.5 && rCurls[4] > 0.5;
  const lIndexOnly = lCurls[1] < 0.3 && lCurls[2] > 0.5 && lCurls[3] > 0.5 && lCurls[4] > 0.5;
  if (rIndexOnly && lIndexOnly && interDist < 0.40) return 'HURT';

  // MORE: both hands fingertip pinch (O-hands touching)
  if (rPinch < 0.08 && lPinch < 0.08 && interDist < 0.25) return 'MORE';

  // ALL DONE / FINISHED: both hands fully open
  if (rSpread > 0.7 && lSpread > 0.7) return 'FINISHED';

  // WANT: both hands in claw shape (fingers moderately bent) pulled toward body
  const rClaw = rCurls[1] > 0.3 && rCurls[1] < 0.8 && rCurls[2] > 0.3 && rCurls[2] < 0.8;
  const lClaw = lCurls[1] > 0.3 && lCurls[1] < 0.8 && lCurls[2] > 0.3 && lCurls[2] < 0.8;
  if (rClaw && lClaw && interDist < 0.50) return 'WANT';

  if (rCurls[1] > 0.5 && lCurls[1] > 0.5 && interDist < 0.2) return 'FRIEND';
  if (rCurls[1] < 0.3 && lCurls[1] < 0.3 && rSpread < 0.5 && lSpread < 0.5) return 'HOW';
  if (dist(rLM[9], lLM[0]) < 0.12) return 'NAME';
  return null;
}

export function classifySingleHand(handLM, faceLM, poseLM) {
  const curls  = getCurlRatios(handLM);
  const spread = handSpread(handLM);
  const zone   = getZone(handLM[0], faceLM, poseLM);
  const pinch  = dist(handLM[8], handLM[4]);

  const thumbExt = curls[0] < 0.35; // X-spread based (best for horizontal/sideways thumb)
  // thumbUp: thumb tip is ABOVE middle-finger MCP knuckle in screen Y.
  // This reliably detects a raised thumb (A-hand, thumbs-up) even when
  // the X-spread is small, which is the correct measurement for HELP / SORRY.
  const thumbUp  = handLM[4].y < handLM[9].y;

  const indexExt  = curls[1] < 0.3;
  const middleExt = curls[2] < 0.3;
  const ringExt   = curls[3] < 0.3;
  const pinkyExt  = curls[4] < 0.3;
  // allCurled: all four non-thumb fingers tightly curled
  const allCurled     = curls[1] > 0.5 && curls[2] > 0.5 && curls[3] > 0.5 && curls[4] > 0.5;
  // allFingersExt: all four non-thumb fingers fully extended
  const allFingersExt = indexExt && middleExt && ringExt && pinkyExt;

  // ── Unique shapes checked first — can't be shadowed by zone logic ────────────
  // I LOVE YOU: thumb + index + pinky (ILY hand)
  if (thumbExt && indexExt && !middleExt && !ringExt && pinkyExt)
    return hit('I LOVE YOU', 94, 'hand');
  // PLAY: Y-hand — thumb UP + pinky, three middle fingers curled
  if (thumbUp && !indexExt && !middleExt && !ringExt && pinkyExt && allCurled)
    return hit('PLAY', 84, 'hand');
  // HELP: A-hand — fist with thumb pointing UP, not at chest zone
  if (allCurled && thumbUp && zone !== 'chest')
    return hit('HELP', 84, 'hand');
  // YES: S-hand — fist, thumb NOT pointing up, not at chest (would be TIRED/SORRY)
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
    // THANK YOU: flat open hand at lips/chin — thumb can be up or horizontal
    if (allFingersExt && (thumbExt || thumbUp))                     return hit('THANK YOU',    92, 'body');
    if (allFingersExt && !thumbExt)                                 return hit('GOOD',         84, 'body');
    if (indexExt && middleExt && ringExt && !pinkyExt && !thumbExt) return hit('WATER',        88, 'body');
    // EAT: bunched O-hand tapping mouth
    if (pinch < 0.09)                                               return hit('EAT',          80, 'body');
    // DRINK: C-hand (fingers bent, not fully curled, near chin)
    if (!indexExt && !middleExt && !ringExt && spread > 0.25)       return hit('DRINK',        76, 'body');
    if (allCurled && !thumbUp)                                      return hit('NOT',          80, 'body');
    if (!thumbExt && !indexExt && !middleExt && !ringExt && pinkyExt) return hit('THIRSTY',   78, 'body');
  }

  // ── Cheek zone ───────────────────────────────────────────────────────────────
  if (zone === 'cheek') {
    // CALL (phone): thumb + pinky extended (Y-hand / phone shape) at cheek
    if (thumbUp && !indexExt && !middleExt && !ringExt && pinkyExt) return hit('CALL (phone)', 88, 'body');
    if (indexExt && !middleExt && !ringExt && !pinkyExt && !thumbExt) return hit('DEAF',       84, 'body');
    // SLEEP: fist at cheek, thumb NOT up (S-hand)
    if (allCurled && !thumbUp)                                      return hit('SLEEP',        78, 'body');
    // TOMORROW: fist at cheek, thumb UP (A-hand)
    if (allCurled && thumbUp)                                       return hit('TOMORROW',     76, 'body');
    if (allFingersExt && !thumbExt && spread > 0.5)                 return hit('MOM',          82, 'body');
  }

  // ── Chest zone ───────────────────────────────────────────────────────────────
  if (zone === 'chest') {
    // SORRY: A-hand (fist + thumb UP) making circles on chest
    if (allCurled && thumbUp)                                       return hit('SORRY',        88, 'body');
    // PLEASE: flat open hand at chest (4+ fingers extended)
    // Was broken before — allExt&&!thumbExt is impossible; now uses allFingersExt
    if (allFingersExt)                                              return hit('PLEASE',       86, 'body');
    // TIRED: S-hand fist (thumb NOT up) at chest
    if (allCurled && !thumbUp)                                      return hit('TIRED',        76, 'body');
    if (indexExt && !middleExt && !ringExt && !pinkyExt)           return hit('ME / I',       84, 'body');
    if (pinch < 0.1 && !indexExt)                                  return hit('HUNGRY',       78, 'body');
  }

  // ── Zone-independent shapes ───────────────────────────────────────────────────
  // NO: index + middle extended (V / peace shape)
  if (indexExt && middleExt && !ringExt && !pinkyExt && !thumbExt) return hit('NO',           80, 'hand');
  // WHO: thumb + index (L-shape approximation)
  if (thumbExt && indexExt && !middleExt && !ringExt && !pinkyExt) return hit('WHO',          74, 'hand');
  // FINISHED / ALL DONE: fully open spread hand
  if (allFingersExt && (thumbExt || thumbUp) && spread > 0.65)     return hit('FINISHED',     76, 'hand');
  // WATER: W-hand (index + middle + ring)
  if (indexExt && middleExt && ringExt && !pinkyExt && !thumbExt)  return hit('WATER',        72, 'hand');
  // MORE (single-hand fallback): fingertip pinch
  if (pinch < 0.07 && !indexExt && !middleExt)                     return hit('MORE',         78, 'hand');
  // WHERE: single index pointing
  if (indexExt && !middleExt && !ringExt && !pinkyExt && !thumbExt) return hit('WHERE',       72, 'hand');
  // RESTROOM: R-hand — index + middle extended but tips close together (crossed)
  if (indexExt && middleExt && !ringExt && !pinkyExt
      && dist(handLM[8], handLM[12]) < 0.06)                       return hit('RESTROOM',     70, 'hand');

  return hit(null, 0, 'hand');
}

export function classifyLetter(lm) {
  const c = getCurlRatios(lm);
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
  const c = getCurlRatios(lm);
  const th = c[0] < 0.35, i = c[1] < 0.3, m = c[2] < 0.3, r = c[3] < 0.3, p = c[4] < 0.3;
  if (i && !m && !r && !p && !th) return hit('1',  88, 'hand');
  if (i && m && !r && !p && !th)  return hit('2',  88, 'hand');
  if (th && i && m && !r && !p)   return hit('3',  86, 'hand');
  if (i && m && r && p && !th)    return hit('4',  86, 'hand');
  if (i && m && r && p && th)     return hit('5',  88, 'hand');
  if (th && !i && !m && !r && !p) return hit('10', 82, 'hand');
  return hit(null, 0, 'hand');
}

// Motion tracking
const MOTION_FRAMES = 12;
export const motionHistory = { R: [], L: [] };

export function pushMotion(side, wrist) {
  const hist = motionHistory[side];
  hist.push({ x: wrist.x, y: wrist.y, t: Date.now() });
  if (hist.length > MOTION_FRAMES) hist.shift();
}

export function getVelocity(side) {
  const hist = motionHistory[side];
  if (hist.length < 3) return { vx: 0, vy: 0, speed: '0.000', dir: '—' };
  const old = hist[0];
  const now = hist[hist.length - 1];
  const dt  = (now.t - old.t) / 1000 || 0.01;
  const vx  = (now.x - old.x) / dt;
  const vy  = (now.y - old.y) / dt;
  const speed = Math.sqrt(vx * vx + vy * vy);
  let dir = '•';
  if (speed > 0.05) {
    const angle = Math.atan2(vy, vx) * 180 / Math.PI;
    const dirs  = ['→','↘','↓','↙','←','↖','↑','↗'];
    dir = dirs[Math.round((angle + 180) / 45) % 8];
  }
  return { vx, vy, speed: speed.toFixed(3), dir };
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
  if (rSpeed > FAST && ['↑','↖','↗'].includes(rVel.dir)) return 'STOP';
  if (rSpeed > SLOW && rVel.dir === '↓') return 'HELP';
  return null;
}

export function seqPattern(frameBuf) {
  if (frameBuf.length < 5) return null;
  const last = frameBuf.slice(-6);
  const allSame  = last.every(f => f.label === last[0].label && f.label !== '—');
  const allStill = last.every(f => f.speed < 0.08);
  if (allSame && allStill && last[0].label) {
    return { label: last[0].label, conf: 96, source: 'seq' };
  }
  return null;
}
