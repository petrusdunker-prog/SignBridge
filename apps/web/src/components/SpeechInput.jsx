import { useEffect, useRef, useState } from 'react';
import useStore from '../store/useStore.js';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const supported = !!SpeechRecognition;

export default function SpeechInput() {
  const { sttText, sttListening, setSttText, setSttListening, clearStt, addSpeechEntry } = useStore();
  const [interim, setInterim] = useState('');
  const recogRef = useRef(null);

  // ── Build & configure recognition once ───────────────────────────────────
  useEffect(() => {
    if (!supported) return;
    const r = new SpeechRecognition();
    r.continuous      = true;
    r.interimResults  = true;
    r.lang            = 'en-US';

    r.onresult = (e) => {
      let fin = '';
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin  += e.results[i][0].transcript;
        else                       live += e.results[i][0].transcript;
      }
      if (fin) {
        // Append confirmed text with a space; trim extra spaces
        setSttText((useStore.getState().sttText + ' ' + fin).trim());
      }
      setInterim(live);
    };

    r.onend = () => {
      setInterim('');
      // Auto-restart if the store still says we're listening
      // (browser stops recognition after ~60s of silence)
      if (useStore.getState().sttListening) {
        try { r.start(); } catch { /* already started */ }
      } else {
        setSttListening(false);
      }
    };

    r.onerror = (e) => {
      if (e.error === 'no-speech') return; // harmless, will restart
      setSttListening(false);
      setInterim('');
    };

    recogRef.current = r;
    return () => {
      try { r.stop(); } catch { /**/ }
      useStore.getState().setSttListening(false);
    };
  }, []);

  function toggleListen() {
    if (!supported || !recogRef.current) return;
    if (sttListening) {
      recogRef.current.stop();
      setSttListening(false);
      setInterim('');
    } else {
      try {
        recogRef.current.start();
        setSttListening(true);
      } catch { /* already running */ }
    }
  }

  function handleClear() {
    clearStt();
    setInterim('');
  }

  function handleSend() {
    const text = (sttText + (interim ? ' ' + interim : '')).trim();
    if (!text) return;
    addSpeechEntry(text);
    clearStt();
    setInterim('');
  }

  const hasContent = sttText || interim;

  return (
    <div style={card}>
      {/* Header */}
      <div style={header}>
        <span style={{ display:'flex', alignItems:'center', gap:'.4rem' }}>
          🎤 Heard
          {sttListening && (
            <span style={listeningBadge}>
              <span style={listeningDot} />
              Listening…
            </span>
          )}
        </span>
        {hasContent && (
          <button style={clearBtn} onClick={handleClear} title="Clear">✕</button>
        )}
      </div>

      {/* Text display */}
      <div style={textBox}>
        {!hasContent ? (
          <span style={placeholder}>
            {supported
              ? 'Tap mic — speak and your words appear here'
              : 'Speech recognition not supported in this browser'}
          </span>
        ) : (
          <>
            {sttText && <span style={finalText}>{sttText}</span>}
            {interim && (
              <span style={interimText}>
                {sttText ? ' ' : ''}{interim}
              </span>
            )}
          </>
        )}
      </div>

      {/* Action row */}
      <div style={{ display:'flex', gap:'.4rem', alignItems:'center' }}>
        {supported && (
          <button
            style={{ ...micBtn, ...(sttListening ? micActive : {}) }}
            onClick={toggleListen}
            title={sttListening ? 'Stop listening' : 'Start listening'}
          >
            {sttListening ? '⏹ Stop' : '🎤 Listen'}
          </button>
        )}
        {hasContent && (
          <button style={sendBtn} onClick={handleSend} title="Add to conversation">
            ➤ Send
          </button>
        )}
      </div>

      <style>{`
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0   rgba(220,38,38,.35) }
          70%  { box-shadow: 0 0 0 8px rgba(220,38,38,0)   }
          100% { box-shadow: 0 0 0 0   rgba(220,38,38,0)   }
        }
        @keyframes lst-dot {
          0%,80%,100% { transform: scale(0.6); opacity:.4 }
          40%         { transform: scale(1);   opacity:1  }
        }
      `}</style>
    </div>
  );
}

const card = {
  background: 'linear-gradient(135deg,#fff7ed,#ffedd5)',
  border: '1px solid #fed7aa',
  borderRadius: 'var(--r)',
  padding: '1.1rem',
  boxShadow: 'var(--shadow)',
  flexShrink: 0,
};
const header = {
  fontSize: '.68rem', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '.1em', color: '#c2410c',
  marginBottom: '.7rem', display: 'flex',
  alignItems: 'center', justifyContent: 'space-between',
};
const listeningBadge = {
  display: 'flex', alignItems: 'center', gap: '.3rem',
  fontSize: '.65rem', color: '#dc2626',
  background: 'rgba(220,38,38,.1)',
  padding: '.15rem .5rem', borderRadius: 100,
};
const listeningDot = {
  width: 6, height: 6, borderRadius: '50%',
  background: '#dc2626',
  animation: 'lst-dot 1.4s infinite',
};
const textBox = {
  fontSize: '1rem', fontWeight: 500,
  color: 'var(--text)', lineHeight: 1.55,
  minHeight: 40, marginBottom: '.75rem',
};
const placeholder = {
  color: 'var(--light)', fontStyle: 'italic',
  fontFamily: "'Fraunces',serif", fontWeight: 400, fontSize: '.88rem',
};
const finalText  = { color: 'var(--text)' };
const interimText = { color: '#9ca3af', fontStyle: 'italic' };
const clearBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#c2410c', fontSize: '.78rem', padding: '0 .15rem',
  opacity: 0.7,
};
const micBtn = {
  padding: '.32rem .85rem', borderRadius: 100,
  border: '1px solid #fed7aa',
  background: 'rgba(194,65,12,.07)',
  fontSize: '.73rem', fontWeight: 500,
  color: '#c2410c', cursor: 'pointer',
  transition: 'all .15s',
};
const micActive = {
  background: '#dc2626', color: '#fff',
  borderColor: '#dc2626',
  animation: 'pulse-ring 1.5s infinite',
};
const sendBtn = {
  padding: '.32rem .85rem', borderRadius: 100,
  border: '1px solid #fed7aa',
  background: '#c2410c', color: '#fff',
  fontSize: '.73rem', fontWeight: 600,
  cursor: 'pointer', transition: 'all .15s',
};
