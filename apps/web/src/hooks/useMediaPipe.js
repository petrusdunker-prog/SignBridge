import { useRef, useCallback } from 'react';
import useStore from '../store/useStore.js';
import {
  pushMotion, getVelocity, detectMotionPattern, seqPattern,
  classifyTwoHand, classifySingleHand, classifyLetter, classifyNumber,
  getCurlRatios, handSpread, getZone, dist, normalizeLandmarks,
  resetMotionHistory,
} from './useClassifier.js';
import { predict as lstmPredict, isLoaded as lstmLoaded } from './useLSTM.js';

const HOLD_TARGET = 22;

// Minimum consecutive frames a sign must appear before the display pill updates.
// At 30 fps: 8 frames ≈ 267 ms — still feels instant, better noise suppression.
const DISPLAY_DEBOUNCE = 8;

// Sliding-window step for LSTM: run inference every N frames once buffer is full.
// At 30 fps, step=5 → ~6 predictions/sec instead of waiting for 30 new frames.
const LSTM_STEP = 5;

// ─── Tasks Vision gesture name → ASL sign ─────────────────────────────────────
const GESTURE_MAP = {
  'Thumb_Up':    zone => zone === 'chest'    ? ['SORRY',     92] : ['HELP',      90],
  'Open_Palm':   zone => zone === 'chin'     ? ['THANK YOU', 93]
                       : zone === 'forehead' ? ['HELLO',     91] : ['PLEASE',    88],
  'Closed_Fist': zone => zone === 'chest'    ? ['TIRED',     80] : ['YES',       87],
  'Victory':     ()   => ['NO',           91],
  'ILoveYou':    ()   => ['I LOVE YOU',   96],
  'Pointing_Up': zone => zone === 'chest'    ? ['ME',        88] : ['WHERE',     80],
  'Thumb_Down':  ()   => ['NOT',          82],
};

// ─── Hand skeleton drawing ────────────────────────────────────────────────────
const HAND_BONES = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

function drawHand(ctx, lm, w, h, color = 'rgba(45,106,79,.55)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const [a, b] of HAND_BONES) {
    ctx.beginPath();
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
    ctx.stroke();
  }
  ctx.fillStyle = color.replace(/[\d.]+\)$/, '1)').replace('rgba', 'rgb');
  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useMediaPipe(videoRef, canvasRef) {
  const gestureRef = useRef(null);
  const faceRef    = useRef(null); // FaceLandmarker — loaded only when faceMesh setting is on
  const animRef    = useRef(null);
  const fpsFrames  = useRef(0);
  const lastFps    = useRef(Date.now());
  const lastVideoTime = useRef(-1);

  // Ring buffer for LSTM landmarks — pre-allocated, zero allocation per frame.
  // 30 slots × 63 floats = 1890 elements total.
  const ringBufRef   = useRef(new Float32Array(30 * 63)); // circular storage
  const ringOutRef   = useRef(new Float32Array(30 * 63)); // reusable read buffer
  const ringHeadRef  = useRef(0);  // next-write slot (0–29)
  const ringCountRef = useRef(0);  // frames written so far, capped at 30

  // Sliding-window counter: run LSTM every LSTM_STEP frames once the buffer is full.
  // At 30 fps with step=5: prediction fires ~6× per second instead of once per second.
  const lstmFrameRef = useRef(0);

  // Display debounce — tracks how many consecutive frames show the same sign.
  // Only pushes to store.displaySign after DISPLAY_DEBOUNCE consistent frames.
  const signStreakRef = useRef({ label: null, count: 0 });

  const onFrame = useCallback(() => {
    const store = useStore.getState();
    if (!store.camActive) return;

    animRef.current = requestAnimationFrame(onFrame);

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !gestureRef.current || video.readyState < 2) return;

    if (video.currentTime === lastVideoTime.current) return;
    lastVideoTime.current = video.currentTime;

    // ── FPS ──────────────────────────────────────────────────────────────────
    fpsFrames.current++;
    const now = Date.now();
    let fps = store.fps;
    if (now - lastFps.current >= 1000) {
      fps = fpsFrames.current;
      fpsFrames.current = 0;
      lastFps.current = now;
    }

    // ── Gesture recognition ───────────────────────────────────────────────────
    let gr;
    try { gr = gestureRef.current.recognizeForVideo(video, now); }
    catch { return; }

    // ── Face mesh (optional, only when FaceLandmarker is loaded) ─────────────
    let faceLM = null;
    if (faceRef.current) {
      try {
        const fr = faceRef.current.detectForVideo(video, now);
        faceLM = fr?.faceLandmarks?.[0] || null;
      } catch { /* silent — face may not be in frame */ }
    }

    // ── Draw skeleton ─────────────────────────────────────────────────────────
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allLM    = gr.landmarks    || [];
    const allGest  = gr.gestures     || [];
    const allSides = gr.handednesses || [];
    const handCount = allLM.length;

    if (store.settings.skeleton) {
      allLM.forEach((lm, i) => {
        const side = allSides[i]?.[0]?.categoryName;
        drawHand(ctx, lm, canvas.width, canvas.height,
          side === 'Left' ? 'rgba(45,106,79,.55)' : 'rgba(59,130,246,.55)');
      });
    }

    // ── Hand assignment ───────────────────────────────────────────────────────
    let rLM = null, lLM = null;
    for (let i = 0; i < allLM.length; i++) {
      if (allSides[i]?.[0]?.categoryName === 'Left') rLM = allLM[i];
      else lLM = allLM[i];
    }
    const primaryHand    = rLM || lLM;
    const primaryGesture = allGest[0]?.[0];

    // ── Motion tracking ───────────────────────────────────────────────────────
    if (rLM) pushMotion('R', rLM[0]);
    if (lLM) pushMotion('L', lLM[0]);
    const rVel = getVelocity('R');
    const lVel = getVelocity('L');

    // ── Landmark ring buffer for LSTM — zero allocation per frame ────────────
    {
      const head = ringHeadRef.current;
      const base = head * 63;
      if (primaryHand) {
        const norm = normalizeLandmarks(primaryHand);
        let fi = base;
        for (const p of norm) {
          ringBufRef.current[fi++] = Math.round(p.x       * 1e4) / 1e4;
          ringBufRef.current[fi++] = Math.round(p.y       * 1e4) / 1e4;
          ringBufRef.current[fi++] = Math.round((p.z || 0) * 1e4) / 1e4;
        }
      } else {
        ringBufRef.current.fill(0, base, base + 63);
      }
      ringHeadRef.current  = (head + 1) % 30;
      ringCountRef.current = Math.min(ringCountRef.current + 1, 30);
    }

    // ── Debug features (local — flushed via setFrameState below) ────────────
    let features = null;
    if (primaryHand && store.settings.debug) {
      const normHand = normalizeLandmarks(primaryHand);
      const curls  = getCurlRatios(normHand);
      const spread = handSpread(normHand);
      features = {
        rVel:   `${rVel.speed} ${rVel.dir}`,
        lVel:   `${lVel.speed} ${lVel.dir}`,
        accel:  `R:${rVel.accel > 0 ? '+' : ''}${rVel.accel}`,
        zone:   getZone(primaryHand[0], faceLM, null),
        spread: spread.toFixed(2),
        ihd:    rLM && lLM ? dist(rLM[0], lLM[0]).toFixed(3) : '—',
        palm:   primaryGesture?.categoryName || '—',
        curl:   curls.map(c => c.toFixed(1)).join(' '),
        face:   faceLM ? 'yes' : 'no',
      };
    }

    // ── Classification pipeline ───────────────────────────────────────────────
    let result = null;

    if (handCount > 0) {
      // 0. LSTM — sliding window: predict every LSTM_STEP frames once buffer is full.
      // This cuts perceived latency from ~1 s (wait 30 new frames) to ~167 ms (step=5).
      lstmFrameRef.current = (lstmFrameRef.current + 1) % LSTM_STEP;
      if (lstmLoaded() && ringCountRef.current >= 30 && lstmFrameRef.current === 0) {
        result = lstmPredict(readRing());
      }

      // 1. Motion patterns — STOP, HELP, MORE, FINISHED
      if (!result) {
        const motLabel = detectMotionPattern(rVel, lVel);
        if (motLabel) result = { label: motLabel, conf: 85, source: 'seq' };
      }

      // 2. Tasks Vision ML gesture recognizer
      if (!result && primaryGesture?.categoryName !== 'None' && (primaryGesture?.score ?? 0) > 0.75) {
        const mapper = GESTURE_MAP[primaryGesture.categoryName];
        if (mapper) {
          // Use real face landmarks for zone if available, else Y-heuristic
          const zone = primaryHand ? getZone(primaryHand[0], faceLM, null) : 'neutral';
          const [label, base] = mapper(zone);
          result = {
            label,
            conf: Math.min(99, Math.round(primaryGesture.score * base)),
            source: 'ai',
          };
        }
      }

      // 3. Two-hand geometry
      if (!result && store.settings.twoHand && rLM && lLM) {
        const twoLabel = classifyTwoHand(rLM, lLM);
        if (twoLabel) result = { label: twoLabel, conf: 82, source: 'two-hand' };
      }

      // 4. Single-hand geometry — now passes real faceLM when available
      if (!result && primaryHand) {
        result = store.mode === 'word'
          ? classifySingleHand(primaryHand, faceLM, null)
          : store.mode === 'letter'
          ? classifyLetter(primaryHand)
          : classifyNumber(primaryHand);
      }

      // ── Sequence confirmation ───────────────────────────────────────────────
      const buf = { label: result?.label || '—', dir: rVel.dir, speed: parseFloat(rVel.speed) };
      const seq = seqPattern([...store.frameBuf, buf], result?.conf ?? 80);
      if (seq?.label) result = seq;

      // ── Display debounce ────────────────────────────────────────────────────
      const det = result?.label || null;
      if (det === signStreakRef.current.label) {
        signStreakRef.current.count = Math.min(signStreakRef.current.count + 1, DISPLAY_DEBOUNCE + 1);
      } else {
        signStreakRef.current = { label: det, count: 1 };
      }
      const streakReady = signStreakRef.current.count >= DISPLAY_DEBOUNCE;

      // ── Hold computation (pure — returns new hold state without store calls) ─
      const hold = computeHold(det, result?.conf || 0, store);

      // ── Single batched store update for this frame ──────────────────────────
      store.setFrameState({
        fps, handCount, hasFace: !!faceLM, features,
        currentSign:   det,
        currentConf:   result?.conf   || 0,
        currentSource: result?.source || 'hand',
        displaySign:   streakReady ? det : (!det ? null : store.displaySign),
        displayConf:   streakReady ? (result?.conf   || 0)      : (!det ? 0      : store.displayConf),
        displaySource: streakReady ? (result?.source || 'hand') : (!det ? 'hand' : store.displaySource),
        rawLandmarks:  primaryHand ? normalizeLandmarks(primaryHand) : null,
        rawLandmarksL: lLM ? normalizeLandmarks(lLM) : null,
        bufEntry: buf,
        holdFrames: hold.holdFrames,
        lastDet:    hold.lastDet,
        addSign:    hold.addSign,
      });
    } else {
      // No hands in frame — single batched reset
      signStreakRef.current = { label: null, count: 0 };
      store.setFrameState({
        fps, handCount: 0, hasFace: !!faceLM, features: null,
        currentSign: null, currentConf: 0, currentSource: 'hand',
        displaySign: null, displayConf: 0, displaySource: 'hand',
        rawLandmarks: null, rawLandmarksL: null,
        bufEntry: { label: '—', dir: '•', speed: 0 },
        holdFrames: 0, lastDet: null, addSign: null,
      });
    }
  }, [videoRef, canvasRef]);

  // ─── Ring buffer reader ────────────────────────────────────────────────────
  // Copies the ring into ringOutRef in oldest-first order and returns it.
  // Called only on LSTM_STEP frames — the allocation cost is amortized.
  function readRing() {
    const out  = ringOutRef.current;
    const head = ringHeadRef.current;
    for (let i = 0; i < 30; i++) {
      const slot = (head + i) % 30;
      out.set(ringBufRef.current.subarray(slot * 63, slot * 63 + 63), i * 63);
    }
    return out;
  }

  // ─── Hold-to-add (pure — returns new state, no store calls) ──────────────
  // addSign is { sign, conf } when hold threshold is reached, otherwise null.
  function computeHold(label, conf, store) {
    if (!label || !store.settings.holdAdd) return { holdFrames: 0, lastDet: null, addSign: null };
    if (label !== store.lastDet)           return { holdFrames: 1, lastDet: label, addSign: null };
    const next = store.holdFrames + 1;
    if (next >= HOLD_TARGET) return { holdFrames: 0, lastDet: null, addSign: { sign: label, conf } };
    return { holdFrames: next, lastDet: store.lastDet, addSign: null };
  }

  // ─── Start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const store = useStore.getState();

    if (!gestureRef.current) {
      store.setMpLoading(true);
      try {
        const { GestureRecognizer, FaceLandmarker, FilesetResolver } = await import(
          /* @vite-ignore */
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs'
        );

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );

        gestureRef.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence:  0.5,
          minTrackingConfidence:      0.5,
        });

        // Load FaceLandmarker only if the user has enabled it in settings (~32 MB).
        // Non-fatal: if it fails, zone detection falls back to the Y-position heuristic.
        if (store.settings.faceMesh && !faceRef.current) {
          store.setFaceMeshLoading(true);
          try {
            faceRef.current = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numFaces: 1,
              outputFaceBlendshapes: false,
              outputFacialTransformationMatrixes: false,
            });
          } catch {
            faceRef.current = null; // graceful degradation to Y-heuristic
          } finally {
            store.setFaceMeshLoading(false);
          }
        }
      } finally {
        store.setMpLoading(false);
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    });
    video.srcObject = stream;
    await video.play();

    const canvas = canvasRef.current;
    if (canvas) {
      if (!video.videoWidth) {
        await new Promise(res => video.addEventListener('loadedmetadata', res, { once: true }));
      }
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ringBufRef.current.fill(0);
    ringHeadRef.current  = 0;
    ringCountRef.current = 0;
    signStreakRef.current   = { label: null, count: 0 };
    lstmFrameRef.current    = 0;
    lastVideoTime.current   = -1;
    store.setCamActive(true);
    animRef.current = requestAnimationFrame(onFrame);
  }, [videoRef, onFrame]);

  // ─── Stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    animRef.current = null;

    const video = videoRef.current;
    if (video?.srcObject) { video.srcObject.getTracks().forEach(t => t.stop()); video.srcObject = null; }

    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);

    const store = useStore.getState();
    store.setCamActive(false);
    store.clearDetection();
    store.setStats(0, 0, false, false);
    resetMotionHistory(); // clear stale velocity so next start has a clean buffer
  }, [videoRef, canvasRef]);

  return { start, stop };
}
