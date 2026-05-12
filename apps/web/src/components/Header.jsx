import { useState } from 'react';
import useStore from '../store/useStore.js';
import SettingsModal from './SettingsModal.jsx';
import WelcomeModal from './WelcomeModal.jsx';

export default function Header() {
  const { camActive, aiLoading } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  let badgeClass = 'status-badge';
  let badgeText  = 'Ready';
  if (aiLoading)   { badgeClass = 'status-badge ai';   badgeText = 'AI thinking...'; }
  else if (camActive) { badgeClass = 'status-badge live'; badgeText = 'Holistic Live'; }

  return (
    <>
      <header style={hdr}>
        <div style={wordmark}>Sign<span style={{ color: 'var(--accent)' }}>Bridge</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <div className={badgeClass}>
            <div className="dot" />
            <span>{badgeText}</span>
          </div>
          <button className="icon-btn" onClick={() => setHelpOpen(true)} aria-label="Help">?</button>
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">⚙️</button>
        </div>
      </header>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {helpOpen && <WelcomeModal onClose={() => setHelpOpen(false)} />}

      <style>{`
        .status-badge {
          display:flex;align-items:center;gap:.4rem;font-size:.72rem;font-weight:500;
          color:var(--muted);background:var(--surface2);padding:.28rem .7rem;
          border-radius:100px;border:1px solid var(--border);transition:all .3s;
        }
        .status-badge.live{background:var(--accent-light);border-color:var(--accent-mid);color:var(--accent)}
        .status-badge.ai{background:var(--purple-light);border-color:#c4b5fd;color:var(--purple)}
        .dot{width:6px;height:6px;border-radius:50%;background:currentColor}
        .live .dot,.ai .dot{animation:blink 1.4s infinite}
        .icon-btn{
          width:36px;height:36px;border-radius:50%;border:1px solid var(--border);
          background:var(--surface);cursor:pointer;display:flex;align-items:center;
          justify-content:center;font-size:.95rem;color:var(--muted);transition:all .15s;
        }
        .icon-btn:hover{background:var(--surface2);color:var(--text)}
      `}</style>
    </>
  );
}

const hdr = {
  background: 'var(--surface)', borderBottom: '1px solid var(--border)',
  height: 64, padding: '0 1.25rem', display: 'flex',
  alignItems: 'center', justifyContent: 'space-between',
  position: 'sticky', top: 0, zIndex: 100,
};
const wordmark = {
  fontFamily: "'Fraunces', serif", fontSize: '1.5rem', fontWeight: 700,
  letterSpacing: '-.02em',
};
