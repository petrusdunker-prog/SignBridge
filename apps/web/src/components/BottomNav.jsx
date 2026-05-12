import useStore from '../store/useStore.js';

const TABS = [
  { id: 'camera',  icon: '📷', label: 'Camera' },
  { id: 'signs',   icon: '👁',  label: 'Signs' },
  { id: 'ai',      icon: '✨',  label: 'AI' },
  { id: 'history', icon: '🕐',  label: 'History' },
];

export default function BottomNav() {
  const { activeTab, setActiveTab } = useStore();

  return (
    <nav style={bar}>
      {TABS.map(({ id, icon, label }) => (
        <button
          key={id}
          style={{ ...navBtn, ...(activeTab === id ? navBtnActive : {}) }}
          onClick={() => setActiveTab(id)}
        >
          <span style={{ fontSize: '1.1rem' }}>{icon}</span>
          {label}
        </button>
      ))}
    </nav>
  );
}

const bar = {
  background: 'var(--surface)', borderTop: '1px solid var(--border)',
  display: 'flex', padding: '.5rem 1rem',
  paddingBottom: 'calc(.5rem + env(safe-area-inset-bottom))',
};
const navBtn = {
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.1rem',
  padding: '.4rem', borderRadius: 'var(--rs)', border: 'none', background: 'transparent',
  cursor: 'pointer', fontSize: '.58rem', fontWeight: 500, color: 'var(--light)',
  transition: 'all .15s',
};
const navBtnActive = { color: 'var(--accent)', background: 'var(--accent-light)' };
