import useStore from '../store/useStore.js';

const SETTINGS = [
  { key: 'skeleton', label: 'Skeleton overlay',   desc: 'Draw hand landmarks on camera feed' },
  { key: 'debug',    label: 'Feature debug panel', desc: 'Show live extracted features' },
  { key: 'holdAdd',  label: 'Hold-to-add (1.5s)',  desc: 'Auto-add held signs to stream' },
  { key: 'buffer',   label: 'Motion buffer',       desc: 'Show frame detection strip' },
  { key: 'twoHand',  label: 'Two-hand mode',       desc: 'Detect two-handed signs' },
  { key: 'tts',            label: 'Auto-speak output',    desc: 'Read AI translations aloud (TTS)' },
  { key: 'autoInterpret', label: 'Auto-interpret',       desc: 'Send to AI after 2.5s pause in signing' },
];

const TTS_RATES = [
  { label: '0.75×', value: 0.75 },
  { label: '1×',    value: 1.0  },
  { label: '1.25×', value: 1.25 },
  { label: '1.5×',  value: 1.5  },
];

export default function SettingsModal({ onClose }) {
  const { settings, toggleSetting, ttsRate, setTtsRate } = useStore();

  return (
    <div style={bg} onClick={onClose}>
      <div style={sheet} onClick={e => e.stopPropagation()}>
        <div style={handle} />
        <div style={title}>Settings</div>

        {SETTINGS.map(({ key, label, desc }) => (
          <div key={key} style={row}>
            <div>
              <p style={{ fontSize:'.85rem', fontWeight:500 }}>{label}</p>
              <small style={{ fontSize:'.7rem', color:'var(--muted)' }}>{desc}</small>
            </div>
            <button
              style={{ ...tog, ...(settings[key] ? togOn : {}) }}
              onClick={() => toggleSetting(key)}
              aria-label={`Toggle ${label}`}
            />
          </div>
        ))}

        {/* Speech speed — only shown when TTS is enabled */}
        {settings.tts && (
          <div style={{ ...row, flexDirection:'column', alignItems:'flex-start', gap:'.55rem', borderBottom:'none' }}>
            <div>
              <p style={{ fontSize:'.85rem', fontWeight:500 }}>Speech speed</p>
              <small style={{ fontSize:'.7rem', color:'var(--muted)' }}>Playback rate for spoken output</small>
            </div>
            <div style={{ display:'flex', gap:'.4rem' }}>
              {TTS_RATES.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setTtsRate(value)}
                  style={{
                    padding:'.28rem .7rem', borderRadius:100,
                    border:`1px solid ${ttsRate === value ? 'var(--accent)' : 'var(--border)'}`,
                    background: ttsRate === value ? 'var(--accent)' : 'transparent',
                    color: ttsRate === value ? '#fff' : 'var(--text)',
                    fontSize:'.75rem', fontWeight:600, cursor:'pointer', transition:'all .15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .tog::after{content:'';position:absolute;width:17px;height:17px;background:#fff;border-radius:50%;top:3px;left:3px;transition:transform .2s;box-shadow:0 1px 4px rgba(0,0,0,.15)}
      `}</style>
    </div>
  );
}

const bg    = { position:'fixed', inset:0, background:'rgba(28,25,23,.4)', backdropFilter:'blur(4px)', zIndex:200, display:'flex', alignItems:'flex-end' };
const sheet = { width:'100%', maxWidth:480, margin:'0 auto', background:'var(--surface)', borderRadius:'var(--r) var(--r) 0 0', padding:'1.25rem', maxHeight:'85vh', overflowY:'auto' };
const handle = { width:36, height:4, background:'var(--border)', borderRadius:2, margin:'0 auto 1.25rem' };
const title  = { fontFamily:"'Fraunces',serif", fontSize:'1.2rem', fontWeight:700, marginBottom:'1rem' };
const row    = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'.65rem 0', borderBottom:'1px solid var(--border)' };
const tog    = { width:42, height:23, background:'var(--border)', borderRadius:12, position:'relative', cursor:'pointer', transition:'background .2s', border:'none', flexShrink:0 };
const togOn  = { background: 'var(--accent)' };
