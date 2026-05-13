import { useEffect, useRef, useState } from 'react';
import useStore from '../store/useStore.js';

const TARGET_FRAMES = 30; // ~1 s at 30 fps — matches the motion buffer
const COUNTDOWN_SEC = 3;  // "3 … 2 … 1 …" before capture starts

// Common signs as quick-select chips
const QUICK_SIGNS = [
  'HELLO','THANK YOU','PLEASE','SORRY','YES','NO',
  'HELP','MORE','FINISHED','STOP','EAT','DRINK',
  'SLEEP','ME / I','WHERE','I LOVE YOU',
];

export default function DatasetRecorder() {
  const { camActive, handCount } = useStore();

  const [open,       setOpen]       = useState(false);
  const [label,      setLabel]      = useState('HELLO');
  const [phase,      setPhase]      = useState('idle'); // idle | countdown | recording | saved
  const [countdown,  setCountdown]  = useState(COUNTDOWN_SEC);
  const [progress,   setProgress]   = useState(0);
  const [samples,    setSamples]    = useState([]); // [{label, frames, ts, mode}]
  const [flash,      setFlash]      = useState(''); // brief status message
  // 'asl' = 63-float single-hand | 'auslan' = 126-float two-hand (R 63 + L 63, zero-padded)
  const [captureMode, setCaptureMode] = useState('asl');

  const frameBuffer  = useRef([]);
  const rafRef       = useRef(null);
  const countdownRef = useRef(null);
  const phaseRef     = useRef('idle');

  // Keep phaseRef in sync so rAF closure can read it
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Cancel everything on unmount ─────────────────────────────────────────
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    clearInterval(countdownRef.current);
  }, []);

  // captureModeRef lets the rAF closure read the latest captureMode without a stale closure
  const captureModeRef = useRef('asl');
  useEffect(() => { captureModeRef.current = captureMode; }, [captureMode]);

  // ── Flat-array helpers ────────────────────────────────────────────────────
  function toFlat(lm) {
    if (!lm) return new Array(63).fill(0);
    return lm.flatMap(p => [
      parseFloat(p.x.toFixed(4)),
      parseFloat(p.y.toFixed(4)),
      parseFloat((p.z || 0).toFixed(4)),
    ]);
  }

  // ── Capture loop (runs via rAF, reads store directly to avoid rerenders) ─
  function startCapture() {
    frameBuffer.current = [];
    setProgress(0);
    setPhase('recording');

    function capture() {
      if (phaseRef.current !== 'recording') return;

      const state = useStore.getState();
      const lmR   = state.rawLandmarks;   // primary / right (normalized)
      const lmL   = state.rawLandmarksL;  // left (normalized)

      // For ASL: need right hand. For Auslan: accept either hand present.
      const hasData = captureModeRef.current === 'auslan'
        ? (lmR || lmL)
        : lmR;

      if (hasData) {
        let flat;
        if (captureModeRef.current === 'auslan') {
          // 126 floats: right-hand 63 + left-hand 63 (zero-padded if absent)
          flat = [...toFlat(lmR), ...toFlat(lmL)];
        } else {
          // 63 floats: right / primary hand only
          flat = toFlat(lmR);
        }

        frameBuffer.current.push(flat);
        setProgress(frameBuffer.current.length);

        if (frameBuffer.current.length >= TARGET_FRAMES) {
          commitSample();
          return;
        }
      }
      rafRef.current = requestAnimationFrame(capture);
    }
    rafRef.current = requestAnimationFrame(capture);
  }

  function commitSample() {
    const mode   = captureModeRef.current;
    const sample = {
      label:  label.trim().toUpperCase(),
      frames: [...frameBuffer.current], // 30 × 63 (ASL) or 30 × 126 (Auslan)
      mode,   // 'asl' | 'auslan'
      ts: Date.now(),
    };
    setSamples(prev => [...prev, sample]);
    setPhase('saved');
    setFlash(`✓ Saved "${sample.label}" (${TARGET_FRAMES} frames, ${mode.toUpperCase()})`);
    setTimeout(() => { setPhase('idle'); setProgress(0); setFlash(''); }, 1400);
  }

  // ── Main record button ────────────────────────────────────────────────────
  function handleRecord() {
    if (phase !== 'idle') return;
    if (!camActive || !handCount) return;

    setPhase('countdown');
    setCountdown(COUNTDOWN_SEC);

    let n = COUNTDOWN_SEC;
    countdownRef.current = setInterval(() => {
      n--;
      if (n <= 0) {
        clearInterval(countdownRef.current);
        startCapture();
      } else {
        setCountdown(n);
      }
    }, 1000);
  }

  function handleCancel() {
    clearInterval(countdownRef.current);
    cancelAnimationFrame(rafRef.current);
    setPhase('idle');
    setProgress(0);
    setCountdown(COUNTDOWN_SEC);
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function handleExport() {
    // Determine dominant mode (most common in current batch)
    const modeCounts = samples.reduce((a, s) => { a[s.mode] = (a[s.mode] || 0) + 1; return a; }, {});
    const dominantMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'asl';
    const featureCount = dominantMode === 'auslan' ? 126 : 63;

    const json = JSON.stringify({
      meta: {
        format:      'signbridge-dataset-v2',
        frames:      TARGET_FRAMES,
        features:    featureCount,
        modes:       modeCounts,
        description: dominantMode === 'auslan'
          ? 'Each frame is a flat array of 126 floats: right-hand [x0,y0,z0…] followed by left-hand [x0,y0,z0…]. Zero-padded when a hand is absent.'
          : 'Each frame is a flat array of 63 floats: [x0,y0,z0, x1,y1,z1, ...]. Coordinates are normalised: wrist at origin, scale = wrist-to-middle-MCP distance.',
        exported:    new Date().toISOString(),
        count:       samples.length,
      },
      samples,
    }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `signbridge-dataset-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Per-label counts ──────────────────────────────────────────────────────
  const counts = samples.reduce((acc, s) => {
    acc[s.label] = (acc[s.label] || 0) + 1; return acc;
  }, {});
  const labelList = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  // Auslan requires at least one hand; ASL requires the right/primary hand
  const canRecord = camActive && handCount > 0 && phase === 'idle';

  return (
    <div style={card}>
      {/* Header — click to toggle open/close */}
      <div style={header} onClick={() => setOpen(o => !o)}>
        <span>📹 Dataset Recorder</span>
        <span style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
          {samples.length > 0 && (
            <span style={badge}>{samples.length} sample{samples.length !== 1 ? 's' : ''}</span>
          )}
          <span style={{ fontSize:'.7rem', color:'var(--muted)' }}>{open ? '▲' : '▼'}</span>
        </span>
      </div>

      {open && (
        <>
          {/* Status / instructions */}
          <div style={statusBar(phase)}>
            {phase === 'idle' && !camActive  && '⚠ Start camera first'}
            {phase === 'idle' && camActive && !handCount && '🖐 Show your hand to the camera'}
            {phase === 'idle' && canRecord  && '● Ready — choose a label and record'}
            {phase === 'countdown'           && `Get ready… ${countdown}`}
            {phase === 'recording'           && `Recording… ${progress}/${TARGET_FRAMES}`}
            {phase === 'saved'               && flash}
          </div>

          {/* ASL / Auslan mode toggle */}
          <div style={modeRow}>
            <span style={inputLabel}>Capture mode</span>
            <div style={modeToggleWrap}>
              {[
                { id: 'asl',    label: 'ASL (63 floats)',    desc: 'One hand' },
                { id: 'auslan', label: 'Auslan (126 floats)', desc: 'Both hands' },
              ].map(({ id, label: ml, desc }) => (
                <button
                  key={id}
                  disabled={phase !== 'idle'}
                  onClick={() => setCaptureMode(id)}
                  style={{ ...modeBtn, ...(captureMode === id ? modeBtnActive : {}) }}
                  title={desc}
                >
                  {ml}
                </button>
              ))}
            </div>
          </div>

          {/* Label input */}
          <div style={{ marginBottom: '.6rem' }}>
            <label style={inputLabel}>Sign label</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value.toUpperCase())}
              placeholder="e.g. HELLO"
              disabled={phase !== 'idle'}
              style={inputStyle}
            />
          </div>

          {/* Quick-select chips */}
          <div style={chipRow}>
            {QUICK_SIGNS.map(s => (
              <button
                key={s}
                style={{ ...chip, ...(label === s ? chipActive : {}) }}
                onClick={() => setLabel(s)}
                disabled={phase !== 'idle'}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Progress bar */}
          {(phase === 'recording' || phase === 'countdown') && (
            <div style={progressTrack}>
              <div style={{
                ...progressFill,
                width: phase === 'countdown'
                  ? '0%'
                  : `${(progress / TARGET_FRAMES) * 100}%`,
                background: phase === 'countdown' ? 'var(--warn)' : 'var(--accent)',
              }} />
            </div>
          )}

          {/* Record / Cancel button */}
          <div style={{ display:'flex', gap:'.4rem', marginBottom:'.75rem' }}>
            {phase === 'idle' || phase === 'saved' ? (
              <button style={{ ...recBtn, ...(canRecord ? {} : recBtnDisabled) }}
                onClick={handleRecord} disabled={!canRecord}>
                ● Record {TARGET_FRAMES} frames
              </button>
            ) : (
              <button style={{ ...recBtn, ...cancelStyle }} onClick={handleCancel}>
                ✕ Cancel
              </button>
            )}
          </div>

          {/* Sample counts */}
          {labelList.length > 0 && (
            <div style={sampleSection}>
              <div style={sampleHeader}>Collected samples</div>
              <div style={sampleGrid}>
                {labelList.map(([lbl, cnt]) => (
                  <div key={lbl} style={sampleRow}>
                    <span style={sampleLbl}>{lbl}</span>
                    <div style={miniBarTrack}>
                      <div style={{ ...miniBarFill, width:`${Math.min(100, (cnt / 50) * 100)}%` }} />
                    </div>
                    <span style={sampleCnt}>{cnt}</span>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:'.4rem', marginTop:'.65rem' }}>
                <button style={exportBtn} onClick={handleExport}>
                  ⬇ Export JSON ({samples.length})
                </button>
                <button style={clearBtn} onClick={() => { setSamples([]); setFlash(''); }}>
                  🗑 Clear
                </button>
              </div>
            </div>
          )}

          {/* Export format note */}
          <p style={note}>
            <strong>ASL:</strong> 30 × 63 floats (one hand, wrist-normalised).{' '}
            <strong>Auslan:</strong> 30 × 126 floats (R + L, zero-padded).{' '}
            Load with <code>json.load()</code> → <code>np.array(s["frames"])</code>.
          </p>
        </>
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const card = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  padding: '1rem',
  boxShadow: 'var(--shadow)',
  flexShrink: 0,
};
const header = {
  fontSize: '.68rem', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '.1em', color: 'var(--light)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  cursor: 'pointer', userSelect: 'none',
};
const badge = {
  fontSize: '.62rem', fontWeight: 700,
  background: 'var(--accent)', color: '#fff',
  padding: '.1rem .45rem', borderRadius: 100,
  textTransform: 'none', letterSpacing: 0,
};
const statusBar = (phase) => ({
  fontSize: '.75rem', fontWeight: 500,
  color: phase === 'saved' ? 'var(--accent)'
       : phase === 'recording' ? '#b45309'
       : phase === 'countdown' ? '#7c3aed'
       : 'var(--muted)',
  background: phase === 'saved' ? 'rgba(45,106,79,.08)'
            : phase === 'recording' ? 'rgba(180,83,9,.08)'
            : phase === 'countdown' ? 'rgba(124,58,237,.08)'
            : 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 8, padding: '.45rem .75rem',
  marginBottom: '.75rem', marginTop: '.6rem',
  textAlign: 'center', minHeight: 34,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});
const inputLabel = { fontSize: '.66rem', color: 'var(--muted)', fontWeight: 600, display:'block', marginBottom:'.25rem' };
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '.4rem .65rem', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface2)',
  fontSize: '.82rem', fontWeight: 600, color: 'var(--text)',
  outline: 'none', fontFamily: 'inherit',
};
const chipRow = { display:'flex', flexWrap:'wrap', gap:'.3rem', marginBottom:'.75rem' };
const chip = {
  padding: '.22rem .55rem', borderRadius: 100,
  border: '1px solid var(--border)', background: 'transparent',
  fontSize: '.65rem', fontWeight: 500, color: 'var(--muted)',
  cursor: 'pointer', transition: 'all .12s',
};
const chipActive = { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' };
const progressTrack = { height: 5, background: 'var(--border)', borderRadius: 3, marginBottom: '.6rem', overflow: 'hidden' };
const progressFill  = { height: '100%', borderRadius: 3, transition: 'width .08s linear' };
const recBtn = {
  flex: 1, padding: '.42rem 0', borderRadius: 8,
  border: 'none', background: '#dc2626', color: '#fff',
  fontSize: '.78rem', fontWeight: 700, cursor: 'pointer',
  transition: 'all .15s', letterSpacing: '.03em',
};
const recBtnDisabled = { background: 'var(--border)', color: 'var(--muted)', cursor: 'not-allowed' };
const cancelStyle    = { background: 'var(--warn)' };
const sampleSection  = { borderTop: '1px solid var(--border)', paddingTop: '.65rem' };
const sampleHeader   = { fontSize: '.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--light)', marginBottom: '.45rem' };
const sampleGrid     = { display: 'flex', flexDirection: 'column', gap: '.3rem' };
const sampleRow      = { display: 'flex', alignItems: 'center', gap: '.5rem' };
const sampleLbl      = { fontSize: '.7rem', fontWeight: 600, color: 'var(--text)', minWidth: 80, flexShrink: 0 };
const miniBarTrack   = { flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' };
const miniBarFill    = { height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width .3s' };
const sampleCnt      = { fontSize: '.7rem', fontWeight: 700, color: 'var(--accent)', minWidth: 20, textAlign: 'right' };
const exportBtn = {
  flex: 1, padding: '.32rem 0', borderRadius: 8,
  border: '1px solid var(--accent)', background: 'transparent',
  color: 'var(--accent)', fontSize: '.72rem', fontWeight: 600,
  cursor: 'pointer', transition: 'all .15s',
};
const clearBtn = {
  padding: '.32rem .7rem', borderRadius: 8,
  border: '1px solid var(--warn)', background: 'transparent',
  color: 'var(--warn)', fontSize: '.72rem', fontWeight: 600,
  cursor: 'pointer', transition: 'all .15s',
};
const note = {
  fontSize: '.62rem', color: 'var(--light)', lineHeight: 1.55,
  marginTop: '.6rem', marginBottom: 0,
};
const modeRow = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginBottom: '.65rem', gap: '.5rem',
};
const modeToggleWrap = { display: 'flex', gap: '.3rem' };
const modeBtn = {
  padding: '.22rem .6rem', borderRadius: 100,
  border: '1px solid var(--border)', background: 'transparent',
  fontSize: '.65rem', fontWeight: 600, color: 'var(--muted)',
  cursor: 'pointer', transition: 'all .12s',
};
const modeBtnActive = { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' };
