import { useRef, useCallback } from 'react';
import useStore from '../store/useStore.js';
import {
  pushMotion, getVelocity, detectMotionPattern, seqPattern,
  classifyTwoHand, classifySingleHand, classifyLetter, classifyNumber,
  getCurlRatios, handSpread, getZone, dist, normalizeLandmarks,
} from './useClassifier.js';

const HOLD_TARGET = 22;

// ─── Tasks Vision gesture name → ASL sign ─────────────────────────────────────
// The built-in model recognises 7 generic gestures. We map them to ASL signs,
// using the hand's Y-position zone to disambiguate same-shape signs.
const GESTURE_MAP = {
  // A-hand (fist + thumb up)
  'Thumb_Up':    zone => zone === 'chest'    ? ['SORRY',     92] : ['HELP',      90],
  // Flat open palm
  'Open_Palm':   zone => zone === 'chin'     ? ['THANK YOU', 93]
                       : zone === 'forehead' ? ['HELLO',     91] : ['PLEASE',    88],
  // Closed fist (S-hand)
  'Closed_Fist': zone => zone === 'chest'    ? ['TIRED',     80] : ['YES',       87],
  // V / peace sign
  'Victory':     ()   => ['NO',           91],
  // ILY hand
  'ILoveYou':    ()   => ['I LOVE YOU',   96],
  // Single index pointing up
  'Pointing_Up': zone => zone === 'chest'    ? ['ME / I',    88] : ['WHERE',     80],
  // Thumb down
  'Thumb_Down':  ()   => ['NOT',          82],
};

// ─── Hand skeleton drawing (no external CDN dependency) ───────────────────────
const HAND_BONES = [
  [0,1],[1,2],[2,3],[3,4],          // thumb
  [0,5],[5,6],[6,7],[7,8],          // index
  [0,9],[9,10],[10,11],[11,12],     // middle
  [0,13],[13,14],[14,15],[15,16],   // ring
  [0,17],[17,18],[18,19],[19,20],   // pinky
  [5,9],[9,13],[13,17],             // palm arch
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
  const animRef    = useRef(null);
  const fpsFrames  = useRef(0);
  const lastFps    = useRef(Date.now());

  const lastVideoTime = useRef(-1);

  const onFrame = useCallback(() => {
    const store = useStore.getState();
    if (!store.camActive) return;

    // Always re-schedule first so errors never kill the loop
    animRef.current = requestAnimationFrame(onFrame);

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !gestureRef.current || video.readyState < 2) return;

    // ── Skip if no new video frame has been decoded yet ───────────────────────
    // This prevents recognizeForVideo being called 60×/s when the webcam only
    // delivers 30fps, and avoids redundant GPU work on duplicate frames.
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

    // ── Run Tasks Vision gesture recognition ─────────────────────────────────
    let gr;
    try { gr = gestureRef.current.recognizeForVideo(video, now); }
    catch { return; }

    // ── Draw skeleton overlay only ────────────────────────────────────────────
    // The <video> element underneath already renders the camera feed via CSS.
    // Drawing it again onto the canvas every frame (ctx.drawImage) was the main
    // source of slowness — removed. Canvas is transparent; skeleton draws on top.
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allLM    = gr.landmarks    || [];
    const allGest  = gr.gestures     || [];
    const allSides = gr.handednesses || [];
    const handCount = allLM.length;

    store.setStats(fps, handCount, false, false);

    if (store.settings.skeleton) {
      // Right hand = green, left hand = blue
      allLM.forEach((lm, i) => {
        const side = allSides[i]?.[0]?.categoryName;
        drawHand(ctx, lm, canvas.width, canvas.height,
          side === 'Left' ? 'rgba(45,106,79,.55)' : 'rgba(59,130,246,.55)');
      });
    }

    // ── Assign hands by handedness ────────────────────────────────────────────
    // Tasks Vision: "Left" in the result = user's dominant/right hand (due to mirror flip).
    // We just call them rLM / lLM for the two-hand classifier.
    let rLM = null, lLM = null;
    for (let i = 0; i < allLM.length; i++) {
      if (allSides[i]?.[0]?.categoryName === 'Left') rLM = allLM[i];
      else lLM = allLM[i];
    }
    const primaryHand    = rLM || lLM;
    const primaryGesture = allGest[0]?.[0]; // top gesture for the first detected hand

    // ── Motion tracking ───────────────────────────────────────────────────────
    if (rLM) pushMotion('R', rLM[0]);
    if (lLM) pushMotion('L', lLM[0]);
    const rVel = getVelocity('R');
    const lVel = getVelocity('L');

    // ── Debug features ────────────────────────────────────────────────────────
    if (primaryHand && store.settings.debug) {
      const normHand = normalizeLandmarks(primaryHand);
      const curls  = getCurlRatios(normHand);
      const spread = handSpread(normHand);
      store.setFeatures({
        rVel:   `${rVel.speed} ${rVel.dir}`,
        lVel:   `${lVel.speed} ${lVel.dir}`,
        accel:  `R:${rVel.accel > 0 ? '+' : ''}${rVel.accel}`,
        zone:   getZone(primaryHand[0], null, null),
        spread: spread.toFixed(2),
        ihd:    rLM && lLM ? dist(rLM[0], lLM[0]).toFixed(3) : '—',
        palm:   primaryGesture?.categoryName || '—',
        curl:   curls.map(c => c.toFixed(1)).join(' '),
        motDir: `R:${rVel.dir} L:${lVel.dir}`,
      });
    } else {
      store.setFeatures(null);
    }

    // ── Classification pipeline ───────────────────────────────────────────────
    let result = null;

    if (handCount > 0) {
      // 1. Motion patterns — STOP (chop), HELP (lift), MORE/FINISHED (two-hand sweep)
      const motLabel = detectMotionPattern(rVel, lVel);
      if (motLabel) result = { label: motLabel, conf: 85, source: 'seq' };

      // 2. Tasks Vision ML gesture recognizer — highest quality, covers the core signs
      if (!result && primaryGesture?.categoryName !== 'None' && (primaryGesture?.score ?? 0) > 0.70) {
        const mapper = GESTURE_MAP[primaryGesture.categoryName];
        if (mapper) {
          const zone = primaryHand ? getZone(primaryHand[0], null, null) : 'neutral';
          const [label, base] = mapper(zone);
          result = {
            label,
            conf: Math.min(99, Math.round(primaryGesture.score * base)),
            source: 'ai',
          };
        }
      }

      // 3. Two-hand geometry — MORE (static pinch), WANT, HURT, FINISHED (static spread)
      if (!result && store.settings.twoHand && rLM && lLM) {
        const twoLabel = classifyTwoHand(rLM, lLM);
        if (twoLabel) result = { label: twoLabel, conf: 82, source: 'two-hand' };
      }

      // 4. Single-hand geometry fallback — EAT, DRINK, SLEEP, RESTROOM, WATER, PLAY, etc.
      if (!result && primaryHand) {
        result = store.mode === 'word'
          ? classifySingleHand(primaryHand, null, null)
          : store.mode === 'letter'
          ? classifyLetter(primaryHand)
          : classifyNumber(primaryHand);
      }

      // Frame buffer + sequence confirmation
      const buf = { label: result?.label || '—', dir: rVel.dir, speed: parseFloat(rVel.speed) };
      store.pushBuf(buf);
      const seq = seqPattern([...store.frameBuf, buf]);
      if (seq?.label) result = seq;

      if (result?.label) {
        store.setDetection(result.label, result.conf, result.source);
        handleHold(result.label, store);
      } else {
        store.clearDetection();
        resetHold(store);
      }
    } else {
      store.pushBuf({ label: '—', dir: '•', speed: 0 });
      store.clearDetection();
      resetHold(store);
    }
  }, [videoRef, canvasRef]);

  // ─── Hold-to-add helpers ───────────────────────────────────────────────────
  function handleHold(label, store) {
    if (!store.settings.holdAdd) { resetHold(store); return; }
    if (label !== store.lastDet) { store.setHoldFrames(0); store.setLastDet(label); }
    const next = store.holdFrames + 1;
    store.setHoldFrames(next);
    if (next >= HOLD_TARGET) { store.addSign(label); store.setHoldFrames(0); store.setLastDet(null); }
  }
  function resetHold(store) { store.setHoldFrames(0); store.setLastDet(null); }

  // ─── Start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const store = useStore.getState();

    if (!gestureRef.current) {
      store.setMpLoading(true);
      try {
        // Dynamic import keeps the bundle clean — loaded once, cached by the browser
        const { GestureRecognizer, FilesetResolver } = await import(
          /* @vite-ignore */
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/vision_bundle.mjs'
        );

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );

        gestureRef.current = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            // Pre-trained ASL gesture model from Google MediaPipe model hub
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence:  0.5,
          minTrackingConfidence:      0.5,
        });
      } finally {
        store.setMpLoading(false);
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      // 640×480 is plenty for gesture recognition and cuts GPU work by 4× vs 1280×720
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    });
    video.srcObject = stream;
    await video.play();

    // Set canvas dimensions once here — setting them every frame resets the
    // canvas context (a full GPU flush) and was the main source of dropped frames.
    const canvas = canvasRef.current;
    if (canvas) {
      // Wait for actual dimensions if metadata hasn't fired yet
      if (!video.videoWidth) {
        await new Promise(res => video.addEventListener('loadedmetadata', res, { once: true }));
      }
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    lastVideoTime.current = -1;
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
  }, [videoRef, canvasRef]);

  return { start, stop };
}
