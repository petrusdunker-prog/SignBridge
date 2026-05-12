import useStore from '../store/useStore.js';

export default function History() {
  const { history, clearHistory } = useStore();

  return (
    <div style={histCard}>
      <div style={histHdr}>
        <div style={cardLbl}>💬 History</div>
        <button className="pb d" style={{ fontSize:'.68rem', padding:'.2rem .5rem' }} onClick={clearHistory}>
          Clear
        </button>
      </div>

      <div style={histList}>
        {!history.length && (
          <div style={{ padding:'1rem', textAlign:'center', color:'var(--light)', fontSize:'.78rem' }}>
            Saved conversations appear here
          </div>
        )}
        {history.map((item, i) => {
          const t = item.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return (
            <div key={i} style={histItem}>
              {item.ai && <div style={histAi}>"{item.ai}"</div>}
              <div style={histRaw}>{item.raw}</div>
              <div style={histMeta}>
                <span>{t}</span>
                <span>{item.count} signs</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const histCard = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:'var(--r)', boxShadow:'var(--shadow)', flexShrink:0 };
const histHdr  = { padding:'.875rem 1.1rem .625rem', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' };
const cardLbl  = { fontSize:'.68rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'.1em', color:'var(--light)' };
const histList = { padding:'.625rem', display:'flex', flexDirection:'column', gap:'.35rem', maxHeight:180, overflowY:'auto' };
const histItem = { background:'var(--surface2)', borderRadius:'var(--rs)', padding:'.55rem .85rem', animation:'slideIn .2s ease' };
const histAi   = { fontSize:'.88rem', fontWeight:500, marginBottom:'.15rem' };
const histRaw  = { fontSize:'.72rem', color:'var(--muted)' };
const histMeta = { fontSize:'.62rem', color:'var(--light)', display:'flex', gap:'.5rem', marginTop:'.15rem' };
