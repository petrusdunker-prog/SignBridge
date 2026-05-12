import useStore from '../store/useStore.js';
import { DB } from '../data/signDatabase.js';

const SRC_CLASS = { hand:'tag-hand', body:'tag-body', seq:'tag-seq', 'two-hand':'tag-2h' };
const SRC_LABEL = { hand:'🟢 hand', body:'🔵 body', seq:'🟣 motion', 'two-hand':'🤝 two-hand' };

export default function DetectionCard() {
  const { currentSign, currentConf, currentSource, features, frameBuf, settings } = useStore();
  const entry = currentSign ? DB[currentSign] : null;

  return (
    <div style={card}>
      <div style={cardLbl}>👁 Current Detection</div>

      <div style={{ display:'flex', alignItems:'center', gap:'.875rem', minHeight:56 }}>
        <div style={detSign}>{currentSign ? '✓' : '?'}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={detWord}>{currentSign || 'Waiting for hands'}</div>
          <div style={detHint}>
            {currentSign
              ? (entry?.hint || '')
              : 'Show your hand to the camera'}
          </div>
          {currentSign && (
            <div style={{ display:'flex', gap:'.3rem', flexWrap:'wrap', marginTop:'.35rem' }}>
              <span className={`det-tag ${SRC_CLASS[currentSource] || 'tag-hand'}`}>
                {SRC_LABEL[currentSource] || currentSource}
              </span>
              {entry && <span className="det-tag tag-cat">{entry.cat}</span>}
            </div>
          )}
        </div>
      </div>

      <div style={confTrack}>
        <div style={{ ...confFill, width: `${currentConf}%` }} />
      </div>

      {/* Feature debug */}
      {settings.debug && features && (
        <>
          <div style={{ ...cardLbl, marginTop:'.8rem', marginBottom:'.35rem' }}>📐 Feature Extraction (live)</div>
          <div style={featGrid}>
            {[
              ['R wrist velocity', features.rVel],
              ['L wrist velocity', features.lVel],
              ['Body zone',        features.zone],
              ['Hand spread',      features.spread],
              ['Inter-hand dist',  features.ihd],
              ['Palm orient',      features.palm],
              ['Curl ratios',      features.curl],
              ['Motion dir',       features.motDir],
            ].map(([label, val]) => (
              <div key={label} style={featItem}>
                <div style={featLabel}>{label}</div>
                <div style={featVal}>{val}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Motion buffer */}
      {settings.buffer && (
        <>
          <div style={{ ...cardLbl, marginTop:'.8rem', marginBottom:'.3rem' }}>🎞 Motion buffer + direction</div>
          <div style={{ display:'flex', gap:'.25rem', flexWrap:'wrap', minHeight:20 }}>
            {frameBuf.map((f, i) => {
              const isNow    = i === frameBuf.length - 1;
              const isMotion = f.speed > 0.05;
              let cls = 'seq-chip';
              if (isNow) cls += ' now';
              else if (isMotion) cls += ' motion';
              return (
                <span key={i} className={cls}>{f.label}{isMotion ? f.dir : ''}</span>
              );
            })}
          </div>
        </>
      )}

      <style>{`
        .det-tag{font-size:.6rem;font-weight:600;padding:.1rem .4rem;border-radius:100px}
        .tag-hand{background:var(--accent-light);color:var(--accent)}
        .tag-body{background:var(--info-light);color:var(--info)}
        .tag-seq{background:var(--purple-light);color:var(--purple)}
        .tag-2h{background:#fce7f3;color:#be185d}
        .tag-cat{background:var(--surface2);color:var(--muted);border:1px solid var(--border)}
        .seq-chip{font-size:.62rem;font-weight:600;padding:.12rem .4rem;border-radius:100px;background:var(--surface2);border:1px solid var(--border);color:var(--muted)}
        .seq-chip.now{background:var(--accent-light);border-color:var(--accent-mid);color:var(--accent)}
        .seq-chip.motion{background:var(--purple-light);border-color:#c4b5fd;color:var(--purple)}
      `}</style>
    </div>
  );
}

const card     = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'1.1rem', boxShadow:'var(--shadow)', flexShrink:0 };
const cardLbl  = { fontSize:'.68rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.1em', color:'var(--light)', marginBottom:'.7rem', display:'flex', alignItems:'center', gap:'.35rem' };
const detSign  = { fontFamily:"'Fraunces',serif", fontSize:'2.2rem', fontWeight:700, color:'var(--accent)', lineHeight:1, minWidth:44, textAlign:'center', flexShrink:0 };
const detWord  = { fontSize:'1rem', fontWeight:600, marginBottom:'.1rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' };
const detHint  = { fontSize:'.73rem', color:'var(--muted)', lineHeight:1.4 };
const confTrack = { height:3, background:'var(--border)', borderRadius:100, marginTop:'.65rem', overflow:'hidden' };
const confFill  = { height:'100%', background:'linear-gradient(90deg,var(--accent-mid),var(--accent))', borderRadius:100, transition:'width .4s ease' };
const featGrid  = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'.3rem', marginTop:'.5rem' };
const featItem  = { background:'var(--surface2)', borderRadius:8, padding:'.4rem .6rem', fontSize:'.65rem' };
const featLabel = { color:'var(--light)', marginBottom:'.1rem' };
const featVal   = { color:'var(--accent)', fontWeight:600 };
