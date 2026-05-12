import { useCallback, useEffect, useRef, useState } from 'react';
import useStore from '../store/useStore.js';

const AUTO_DELAY = 2500; // ms of silence before auto-interpret fires

export default function SignStream() {
  const {
    mode, setMode, sentence, currentSign,
    addSign, undoSign, clearSentence,
    aiLoading, setAiText, setAiLoading,
  } = useStore();

  // Auto-interpret countdown (0–1 progress, null = inactive)
  const [progress, setProgress] = useState(null);
  const timerRef    = useRef(null);
  const rafRef      = useRef(null);
  const startedAt   = useRef(null);

  // ── Core interpret fn (stable ref so useEffect can call it) ──────────────
  const interpret = useCallback(async () => {
    const { sentence: s, proxyUrl, settings } = useStore.getState();
    if (!s.length || useStore.getState().aiLoading) return;
    setAiLoading(true);
    try {
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signs: s }),
      });
      if (!res.ok) throw new Error(`Proxy error: ${res.status}`);
      const data = await res.json();
      setAiText(data.interpretation || '[no interpretation returned]');
    } catch (e) {
      setAiText(`[Error: ${e.message}] — Is your backend proxy running?`);
    } finally {
      setAiLoading(false);
    }
  }, [setAiLoading, setAiText]);

  // ── Button interpret (shows alert if empty) ───────────────────────────────
  function handleInterpretBtn() {
    if (!sentence.length) { alert('Add some signs first!'); return; }
    cancelAuto();
    interpret();
  }

  // ── Auto-interpret: (re)start 2.5s countdown whenever sentence grows ─────
  function cancelAuto() {
    clearTimeout(timerRef.current);
    cancelAnimationFrame(rafRef.current);
    timerRef.current  = null;
    startedAt.current = null;
    setProgress(null);
  }

  function startAuto() {
    cancelAuto();
    startedAt.current = performance.now();
    setProgress(0);

    // rAF-driven progress bar
    function tick(now) {
      const elapsed = now - startedAt.current;
      setProgress(Math.min(elapsed / AUTO_DELAY, 1));
      if (elapsed < AUTO_DELAY) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    timerRef.current = setTimeout(() => {
      setProgress(null);
      interpret();
    }, AUTO_DELAY);
  }

  useEffect(() => {
    const { settings } = useStore.getState();
    // Trigger when a new sign is added (sentence grows)
    if (settings.autoInterpret && sentence.length > 0 && !aiLoading) {
      startAuto();
    } else {
      cancelAuto();
    }
    return () => {}; // cleanup handled inside cancelAuto
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentence.length]); // intentionally only re-run on length change

  // Cancel countdown if loading starts externally (e.g. Rephrase)
  useEffect(() => { if (aiLoading) cancelAuto(); }, [aiLoading]);

  // Cleanup on unmount
  useEffect(() => () => cancelAuto(), []);

  // ── Mode tabs ─────────────────────────────────────────────────────────────
  const modes = [
    { id: 'word',   label: 'Words' },
    { id: 'letter', label: 'A–Z' },
    { id: 'number', label: 'Numbers' },
  ];

  return (
    <div style={card}>
      {/* Mode tabs */}
      <div style={modeTabs}>
        {modes.map(m => (
          <button key={m.id} onClick={() => setMode(m.id)}
            style={{ ...modeTab, ...(mode === m.id ? modeTabActive : {}) }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Header */}
      <div style={cardLbl}>
        ✏️ Sign Stream
        <span style={{ marginLeft:'auto', fontSize:'.66rem', fontWeight:400, color:'var(--muted)', textTransform:'none', letterSpacing:0 }}>
          Hold 1.5s to add
        </span>
        {progress !== null && (
          <span style={autoBadge}>⏳ auto</span>
        )}
      </div>

      {/* Auto-interpret progress bar */}
      {progress !== null && (
        <div style={progressTrack}>
          <div style={{ ...progressFill, width: `${progress * 100}%` }} />
        </div>
      )}

      {/* Sentence display */}
      <div style={sentence.length ? sentDisp : { ...sentDisp, ...sentEmpty }}>
        {sentence.length ? sentence.join(' ') : 'Signs appear here as you hold them...'}
      </div>

      {/* Actions */}
      <div style={{ display:'flex', gap:'.35rem', flexWrap:'wrap' }}>
        <button className="pb" onClick={() => currentSign && addSign(currentSign)}>+ Add</button>
        <button className="pb d" onClick={undoSign}>← Undo</button>
        <button className="pb d" onClick={clearSentence}>Clear</button>
        <button className="pb p" onClick={handleInterpretBtn} disabled={aiLoading}>✨ Interpret</button>
      </div>

      <style>{`
        .pb{padding:.3rem .72rem;border-radius:100px;border:1px solid var(--border);background:var(--surface2);font-size:.73rem;font-weight:500;color:var(--muted);cursor:pointer;transition:all .15s}
        .pb:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-light)}
        .pb.p{background:var(--accent);color:#fff;border-color:var(--accent)}
        .pb.p:hover{background:#235c41}
        .pb.d:hover{border-color:var(--warn);color:var(--warn);background:var(--warn-light)}
        .pb:disabled{opacity:.5;cursor:not-allowed}
      `}</style>
    </div>
  );
}

const card        = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'1.1rem', boxShadow:'var(--shadow)', flexShrink:0 };
const cardLbl     = { fontSize:'.68rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.1em', color:'var(--light)', marginBottom:'.35rem', display:'flex', alignItems:'center', gap:'.35rem' };
const modeTabs    = { display:'flex', background:'var(--surface2)', borderRadius:10, padding:3, gap:3, border:'1px solid var(--border)', marginBottom:'.875rem' };
const modeTab     = { flex:1, padding:'.42rem', border:'none', borderRadius:7, background:'transparent', color:'var(--muted)', fontSize:'.7rem', fontWeight:600, cursor:'pointer', transition:'all .15s' };
const modeTabActive = { background:'var(--surface)', color:'var(--text)', boxShadow:'0 1px 4px rgba(0,0,0,.08)' };
const sentDisp    = { minHeight:40, fontSize:'.95rem', fontWeight:500, color:'var(--text)', lineHeight:1.5, marginBottom:'.65rem', wordBreak:'break-word' };
const sentEmpty   = { color:'var(--light)', fontWeight:400, fontStyle:'italic', fontFamily:"'Fraunces',serif", fontSize:'.88rem' };
const autoBadge   = { fontSize:'.6rem', fontWeight:600, color:'var(--accent)', background:'var(--accent-light)', padding:'.1rem .45rem', borderRadius:100, textTransform:'none', letterSpacing:0 };
const progressTrack = { height:3, background:'var(--border)', borderRadius:2, marginBottom:'.5rem', overflow:'hidden' };
const progressFill  = { height:'100%', background:'var(--accent)', borderRadius:2, transition:'width .1s linear' };
