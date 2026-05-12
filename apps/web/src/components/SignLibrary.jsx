import { useState } from 'react';
import useStore from '../store/useStore.js';
import { DB, CATEGORIES } from '../data/signDatabase.js';

export default function SignLibrary() {
  const [open, setOpen]   = useState(false);
  const [cat, setCat]     = useState('all');
  const [search, setSearch] = useState('');
  const { currentSign }   = useStore();

  const filtered = Object.entries(DB).filter(([name, v]) => {
    const matchCat    = cat === 'all' || v.cat === cat;
    const matchSearch = !search || name.toLowerCase().includes(search) || v.hint.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  return (
    <div style={{ flexShrink: 0 }}>
      <button style={toggleBtn} onClick={() => setOpen(o => !o)}>
        🤟 Sign Library — {Object.keys(DB).length}+ signs
        <span style={{ fontSize:'.65rem', transition:'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </button>

      {open && (
        <div style={body}>
          <input
            style={searchInput}
            placeholder="Search signs..."
            value={search}
            onChange={e => setSearch(e.target.value.toLowerCase())}
          />

          <div style={{ display:'flex', gap:'.3rem', marginBottom:'.65rem', flexWrap:'wrap' }}>
            {Object.entries(CATEGORIES).map(([key, label]) => (
              <button key={key}
                style={{ ...catBtn, ...(cat === key ? catBtnActive : {}) }}
                onClick={() => setCat(key)}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ fontSize:'.68rem', color:'var(--muted)', marginBottom:'.5rem' }}>
            {filtered.length} signs
          </div>

          <div style={grid}>
            {filtered.map(([name, v]) => {
              const srcLabel = v.source === 'body' ? '🔵' : v.source === 'seq' ? '🟣' : '🟢';
              const isHi = name === currentSign;
              return (
                <div key={name} style={{ ...chip, ...(isHi ? chipHi : {}) }}>
                  <div style={chipName}>{name}</div>
                  <div style={chipHint}>{v.hint}</div>
                  <div style={{ fontSize:'.5rem', marginTop:'.1rem', color:'var(--muted)' }}>{srcLabel} {v.source}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const toggleBtn = { width:'100%', padding:'.65rem 1.1rem', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--rs)', cursor:'pointer', fontSize:'.8rem', fontWeight:600, color:'var(--text)', transition:'all .15s' };
const body = { background:'var(--surface)', border:'1px solid var(--border)', borderTop:'none', borderRadius:'0 0 var(--rs) var(--rs)', padding:'.875rem' };
const searchInput = { width:'100%', padding:'.55rem .85rem', borderRadius:'var(--rs)', border:'1px solid var(--border)', background:'var(--surface2)', fontSize:'.82rem', color:'var(--text)', marginBottom:'.75rem', outline:'none' };
const catBtn = { padding:'.2rem .6rem', borderRadius:100, fontSize:'.68rem', fontWeight:600, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--muted)', cursor:'pointer', transition:'all .15s', whiteSpace:'nowrap' };
const catBtnActive = { background:'var(--accent)', color:'#fff', borderColor:'var(--accent)' };
const grid = { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(88px,1fr))', gap:'.3rem', maxHeight:240, overflowY:'auto' };
const chip = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'.4rem .3rem', textAlign:'center', cursor:'pointer', transition:'all .15s' };
const chipHi = { borderColor:'var(--accent)', background:'var(--accent-light)' };
const chipName = { fontSize:'.66rem', fontWeight:700, color:'var(--accent)', lineHeight:1.2 };
const chipHint = { fontSize:'.52rem', color:'var(--muted)', lineHeight:1.3, marginTop:'.1rem' };
