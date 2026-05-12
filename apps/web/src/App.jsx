import { useEffect, useState } from 'react';
import useStore from './store/useStore.js';
import Header        from './components/Header.jsx';
import CameraPanel   from './components/CameraPanel.jsx';
import DetectionCard from './components/DetectionCard.jsx';
import SignStream    from './components/SignStream.jsx';
import AiOutput      from './components/AiOutput.jsx';
import SpeechInput      from './components/SpeechInput.jsx';
import ConversationView from './components/ConversationView.jsx';
import ProxyBanner   from './components/ProxyBanner.jsx';
import SignLibrary   from './components/SignLibrary.jsx';
import History          from './components/History.jsx';
import DatasetRecorder from './components/DatasetRecorder.jsx';
import LSTMPanel       from './components/LSTMPanel.jsx';
import BottomNav     from './components/BottomNav.jsx';
import WelcomeModal  from './components/WelcomeModal.jsx';

const DESKTOP = 960;

export default function App() {
  const { activeTab } = useStore();
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= DESKTOP);
  const [showWelcome, setShowWelcome] = useState(() => !localStorage.getItem('sb-welcomed'));

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= DESKTOP);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const showLeft  = isDesktop || activeTab === 'camera';
  const showRight = isDesktop || activeTab !== 'camera';

  return (
    <div style={appShell(isDesktop)}>
      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}
      {/* Header must span both columns in desktop grid */}
      <div style={isDesktop ? { gridColumn: '1 / -1' } : {}}>
        <Header />
      </div>

      {isDesktop ? (
        <>
          <div style={leftCol}>
            <CameraPanel />
          </div>
          <div style={rightCol}>
            <RightPanel />
          </div>
        </>
      ) : (
        <>
          {showLeft && (
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              <CameraPanel />
            </div>
          )}
          {showRight && (
            <div style={rightCol}>
              <RightPanel />
            </div>
          )}
          <BottomNav />
        </>
      )}
    </div>
  );
}

function RightPanel() {
  return (
    <>
      <ProxyBanner />
      <DetectionCard />
      <SignStream />
      <AiOutput />
      <SpeechInput />
      <ConversationView />
      <SignLibrary />
      <History />
      <DatasetRecorder />
      <LSTMPanel />
    </>
  );
}

function appShell(isDesktop) {
  return isDesktop
    ? {
        display: 'grid',
        gridTemplateColumns: '460px 1fr',
        gridTemplateRows: 'auto 1fr',
        height: '100vh',
      }
    : {
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        height: '100vh',
        maxWidth: 480,
        margin: '0 auto',
      };
}

const leftCol = {
  borderRight: '1px solid var(--border)',
  height: 'calc(100vh - 64px)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const rightCol = {
  height: 'calc(100vh - 64px)',
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  padding: '1rem',
  gap: '.75rem',
  scrollbarWidth: 'thin',
  scrollbarColor: 'var(--border) transparent',
};
