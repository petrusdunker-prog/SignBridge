import { useState } from 'react';
import useStore from '../store/useStore.js';

export default function ProxyBanner() {
  const { proxyUrl, setProxyUrl, proxyConnected, setProxyConnected } = useStore();
  const [input, setInput] = useState(proxyUrl);
  const [error, setError] = useState(null);

  if (proxyConnected) {
    return (
      <div style={{ ...banner, ...bannerOk }}>
        ✅ <strong>Backend proxy connected.</strong> AI interpretation is ready.
      </div>
    );
  }

  async function connect() {
    const url = input.trim();
    if (!url) return;
    setProxyUrl(url);
    setError(null);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signs: ['HELLO'], test: true }),
      });
      if (r.ok) {
        setProxyConnected(true);
      } else {
        setError(`Proxy returned ${r.status}. Check your backend is running.`);
      }
    } catch {
      setError(`Cannot reach proxy at ${url}. Is the backend running?`);
    }
  }

  return (
    <div style={{ ...banner, ...(error ? bannerErr : {}) }}>
      {error
        ? <><strong>❌ {error}</strong></>
        : <><strong>⚠️ Backend proxy required for AI interpretation.</strong> Enter your local proxy URL.</>
      }
      <div style={{ display:'flex', gap:'.5rem', marginTop:'.5rem' }}>
        <input
          style={proxyInput}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="http://localhost:3001/interpret"
          onKeyDown={e => e.key === 'Enter' && connect()}
        />
        <button style={setBtn} onClick={connect}>{error ? 'Retry' : 'Connect'}</button>
      </div>
    </div>
  );
}

const banner    = { background:'var(--warn-light)', border:'1px solid #fca5a5', borderRadius:'var(--rs)', padding:'.75rem 1rem', fontSize:'.75rem', color:'var(--warn)', lineHeight:1.6, flexShrink:0 };
const bannerOk  = { background:'var(--accent-light)', borderColor:'var(--accent-mid)', color:'var(--accent)' };
const bannerErr = { background:'#fee2e2', borderColor:'#fca5a5' };
const proxyInput = { flex:1, padding:'.4rem .7rem', borderRadius:8, border:'1px solid #fca5a5', background:'#fff', fontSize:'.75rem', color:'var(--text)', outline:'none' };
const setBtn    = { padding:'.4rem .8rem', borderRadius:8, border:'none', background:'var(--warn)', color:'#fff', fontSize:'.72rem', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' };
