import { useState, useEffect } from 'react';

const STEPS = [
  {
    icon: '📷',
    title: 'Start the camera',
    body: 'Click "Start Camera" to turn on MediaPipe Holistic. It tracks your hands, face, and body in real time — no data leaves your device.',
    tip: 'Use good lighting and keep your hands clearly visible.',
  },
  {
    icon: '✋',
    title: 'Sign and hold',
    body: 'Make an ASL sign and hold it steady for 1.5 seconds. The green ring in the corner fills up — when it completes, the sign is added to your stream.',
    tip: 'You can also tap "+ Add" manually if you prefer.',
  },
  {
    icon: '✨',
    title: 'Interpret',
    body: 'Once you\'ve built up a sign stream (e.g. WATER ME WANT), tap "Interpret". The local AI converts it to natural English — "I want water".',
    tip: 'If the result sounds off, tap "Rephrase" for an alternative.',
  },
  {
    icon: '💬',
    title: 'Save and continue',
    body: 'Happy with the translation? Tap "Save ✓" to log it to your conversation history. Clear the stream and start the next sentence.',
    tip: 'Switch between Words, A–Z, and Numbers mode using the tabs.',
  },
];

export default function WelcomeModal({ onClose }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const s = STEPS[step];

  function finish() {
    localStorage.setItem('sb-welcomed', '1');
    onClose();
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        {/* Header */}
        <div style={modalHeader}>
          <div style={wordmark}>Sign<span style={{ color: 'var(--accent)' }}>Bridge</span></div>
          <button style={closeBtn} onClick={finish} aria-label="Skip tutorial">✕</button>
        </div>

        <p style={subtitle}>Welcome! Here's how to get started.</p>

        {/* Step indicator */}
        <div style={dots}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ ...dot, ...(i === step ? dotActive : i < step ? dotDone : {}) }}
              onClick={() => setStep(i)} />
          ))}
        </div>

        {/* Step content */}
        <div style={stepCard}>
          <div style={stepIcon}>{s.icon}</div>
          <div style={stepNum}>Step {step + 1} of {STEPS.length}</div>
          <div style={stepTitle}>{s.title}</div>
          <p style={stepBody}>{s.body}</p>
          <div style={tipBox}>
            <span style={tipLabel}>💡 Tip</span> {s.tip}
          </div>
        </div>

        {/* Navigation */}
        <div style={navRow}>
          {step > 0
            ? <button style={btnSecondary} onClick={() => setStep(s => s - 1)}>← Back</button>
            : <button style={btnSecondary} onClick={finish}>Skip</button>
          }
          {isLast
            ? <button style={btnPrimary} onClick={finish}>Let's go →</button>
            : <button style={btnPrimary} onClick={() => setStep(s => s + 1)}>Next →</button>
          }
        </div>

        {/* Quick reference */}
        {isLast && (
          <div style={refGrid}>
            <div style={refTitle}>Quick reference</div>
            {[
              ['📷', 'Start Camera', 'Turns on hand + body tracking'],
              ['⏳', 'Hold 1.5s', 'Adds sign to stream automatically'],
              ['✨', 'Interpret', 'AI converts stream to English'],
              ['🔄', 'Rephrase', 'Ask AI for alternative wording'],
              ['💾', 'Save ✓', 'Logs to conversation history'],
              ['⚙️', 'Settings', 'Toggle skeleton, debug panel & more'],
            ].map(([icon, label, desc]) => (
              <div key={label} style={refItem}>
                <span style={{ fontSize: '1rem' }}>{icon}</span>
                <div>
                  <div style={{ fontSize: '.78rem', fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const overlay    = { position:'fixed', inset:0, background:'rgba(28,25,23,.55)', backdropFilter:'blur(6px)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' };
const modal      = { background:'var(--surface)', borderRadius:'var(--r)', padding:'1.5rem', width:'100%', maxWidth:440, boxShadow:'var(--shadow-lg)', maxHeight:'90vh', overflowY:'auto' };
const modalHeader = { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'.25rem' };
const wordmark   = { fontFamily:"'Fraunces',serif", fontSize:'1.4rem', fontWeight:700, letterSpacing:'-.02em' };
const closeBtn   = { background:'none', border:'none', fontSize:'1rem', color:'var(--muted)', cursor:'pointer', padding:'.25rem' };
const subtitle   = { fontSize:'.82rem', color:'var(--muted)', marginBottom:'1rem' };
const dots       = { display:'flex', gap:'.4rem', marginBottom:'1rem' };
const dot        = { width:8, height:8, borderRadius:'50%', background:'var(--border)', cursor:'pointer', transition:'all .2s' };
const dotActive  = { background:'var(--accent)', transform:'scale(1.25)' };
const dotDone    = { background:'var(--accent-mid)' };
const stepCard   = { background:'var(--surface2)', borderRadius:'var(--r)', padding:'1.25rem', marginBottom:'1rem' };
const stepIcon   = { fontSize:'2rem', marginBottom:'.5rem' };
const stepNum    = { fontSize:'.65rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.1em', color:'var(--light)', marginBottom:'.25rem' };
const stepTitle  = { fontFamily:"'Fraunces',serif", fontSize:'1.15rem', fontWeight:700, marginBottom:'.5rem', color:'var(--text)' };
const stepBody   = { fontSize:'.85rem', color:'var(--text)', lineHeight:1.6, marginBottom:'.75rem' };
const tipBox     = { fontSize:'.75rem', color:'var(--accent)', background:'var(--accent-light)', borderRadius:'var(--rs)', padding:'.5rem .75rem', lineHeight:1.5 };
const tipLabel   = { fontWeight:700 };
const navRow     = { display:'flex', justifyContent:'space-between', gap:'.5rem', marginBottom:'1rem' };
const btnPrimary = { flex:1, padding:'.65rem', borderRadius:'var(--rs)', border:'none', background:'var(--accent)', color:'#fff', fontWeight:600, fontSize:'.88rem', cursor:'pointer' };
const btnSecondary = { padding:'.65rem 1rem', borderRadius:'var(--rs)', border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--muted)', fontWeight:500, fontSize:'.88rem', cursor:'pointer' };
const refGrid    = { borderTop:'1px solid var(--border)', paddingTop:'1rem' };
const refTitle   = { fontSize:'.68rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.1em', color:'var(--light)', marginBottom:'.65rem' };
const refItem    = { display:'flex', alignItems:'flex-start', gap:'.6rem', marginBottom:'.5rem' };
