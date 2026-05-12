import { useEffect, useRef, useState } from 'react';
import useStore from '../store/useStore.js';

export default function AiOutput() {
  const {
    aiText, aiLoading, sentence, proxyUrl,
    setAiText, setAiLoading, saveToHistory,
  } = useStore();

  const [speaking, setSpeaking] = useState(false);
  const didMountRef = useRef(false); // prevent speaking stale text on first render

  // ── Auto-speak whenever a new interpretation arrives ─────────────────────
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    if (!aiText) return;
    // Read latest settings fresh to avoid stale closure
    const { settings, ttsRate } = useStore.getState();
    if (settings.tts) speakText(aiText, ttsRate, setSpeaking);
  }, [aiText]);

  // Cancel any speech when component unmounts
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function handleSpeak() {
    if (!aiText) return;
    const { ttsRate } = useStore.getState();
    speakText(aiText, ttsRate, setSpeaking);
  }

  function handleStop() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  async function rephrase() {
    if (!aiText) return;
    const { proxyUrl: url } = useStore.getState();
    setAiLoading(true);
    try {
      const res  = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signs: sentence, rephrase: aiText }),
      });
      const data = await res.json();
      setAiText(data.interpretation || aiText);
    } catch { /* keep existing */ }
    finally { setAiLoading(false); }
  }

  return (
    <div style={aiCard}>
      {/* Header */}
      <div style={aiLbl}>
        <span>✨ AI Output</span>
        {speaking && (
          <span style={speakingBadge}>
            <span style={speakingDot} />
            Speaking…
          </span>
        )}
      </div>

      {/* Text */}
      {aiLoading ? (
        <div style={{ display:'flex', alignItems:'center', gap:'.5rem', fontSize:'.8rem', color:'var(--purple)' }}>
          ✨ Interpreting…
          <span style={{ display:'flex', gap:2 }}>
            {[0, .2, .4].map((d, i) => (
              <span key={i} style={dot(d)} />
            ))}
          </span>
        </div>
      ) : (
        <div style={aiText ? aiOut : { ...aiOut, ...aiEmpty }}>
          {aiText || 'Signs appear here once interpreted…'}
        </div>
      )}

      {/* Actions */}
      <div style={{ display:'flex', gap:'.35rem', marginTop:'.65rem', flexWrap:'wrap' }}>
        {speaking
          ? <button className="ai-btn" onClick={handleStop}>⏹ Stop</button>
          : <button className="ai-btn" onClick={handleSpeak} disabled={!aiText || aiLoading}>🔊 Speak</button>
        }
        <button className="ai-btn" onClick={rephrase} disabled={!aiText || aiLoading}>↺ Rephrase</button>
        <button className="ai-btn p" onClick={saveToHistory} disabled={!sentence.length}>Save ✓</button>
      </div>

      <style>{`
        .ai-btn{padding:.32rem .75rem;border-radius:100px;border:1px solid #c4b5fd;
          background:rgba(124,58,237,.07);font-size:.73rem;font-weight:500;
          color:var(--purple);cursor:pointer;transition:all .15s}
        .ai-btn:hover{background:rgba(124,58,237,.14)}
        .ai-btn.p{background:var(--purple);color:#fff;border-color:var(--purple)}
        .ai-btn.p:hover{background:#6d28d9}
        .ai-btn:disabled{opacity:.4;cursor:not-allowed}
      `}</style>
    </div>
  );
}

// ── Shared TTS helper (also exported for other components) ───────────────────
export function speakText(text, rate = 1, onStateChange = () => {}) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt   = new SpeechSynthesisUtterance(text);
  utt.rate    = rate ?? 1;
  utt.pitch   = 1;
  utt.onstart = () => onStateChange(true);
  utt.onend   = () => onStateChange(false);
  utt.onerror = () => onStateChange(false);
  window.speechSynthesis.speak(utt);
}

const aiCard  = { background:'linear-gradient(135deg,#f5f3ff,#ede9fe)', border:'1px solid #c4b5fd', borderRadius:'var(--r)', padding:'1.1rem', boxShadow:'var(--shadow)', flexShrink:0 };
const aiLbl   = { fontSize:'.68rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.1em', color:'var(--purple)', marginBottom:'.7rem', display:'flex', alignItems:'center', justifyContent:'space-between' };
const aiOut   = { fontSize:'1rem', fontWeight:500, color:'var(--text)', lineHeight:1.5, minHeight:36 };
const aiEmpty = { color:'var(--light)', fontStyle:'italic', fontFamily:"'Fraunces',serif", fontWeight:400, fontSize:'.88rem' };
const speakingBadge = { display:'flex', alignItems:'center', gap:'.3rem', fontSize:'.65rem', color:'var(--purple)', background:'rgba(124,58,237,.1)', padding:'.15rem .5rem', borderRadius:100 };
const speakingDot   = { width:6, height:6, borderRadius:'50%', background:'var(--purple)', animation:'blink 1.4s infinite' };
const dot = (delay) => ({ display:'inline-block', width:4, height:4, background:'var(--purple)', borderRadius:'50%', animation:`dot 1.2s ${delay}s infinite` });
