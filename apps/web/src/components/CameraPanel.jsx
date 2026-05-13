import { useRef } from 'react';
import useStore from '../store/useStore.js';
import { useMediaPipe } from '../hooks/useMediaPipe.js';

const HOLD_TARGET = 22;

export default function CameraPanel() {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const { start, stop } = useMediaPipe(videoRef, canvasRef);

  const {
    camActive, mpLoading,
    currentSign, currentSource,          // raw — used for hold ring
    displaySign, displayConf, displaySource, // debounced — shown in pill
    handCount, hasFace, fps, holdFrames, settings,
  } = useStore();

  const CIRCUMFERENCE = 94.25;
  const holdProgress = holdFrames / HOLD_TARGET;
  const dashOffset   = CIRCUMFERENCE * (1 - Math.min(holdProgress, 1));

  const pillClass = displaySign
    ? displaySource === 'lstm'     ? 'live-pill lstm-det'
    : displaySource === 'ai'       ? 'live-pill ai-det'
    : displaySource === 'body'     ? 'live-pill body-det'
    : displaySource === 'two-hand' ? 'live-pill two-hand'
    : 'live-pill detected'
    : 'live-pill';

  async function toggle() {
    if (camActive) stop();
    else {
      try { await start(); }
      catch (e) { alert('Camera access denied.\n\n' + e.message); }
    }
  }

  return (
    <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '.75rem', flex: 1 }}>
      {/* Viewport */}
      <div style={viewport}>
        <video ref={videoRef} style={videoStyle} playsInline autoPlay muted />
        <canvas ref={canvasRef} style={canvasStyle} />

        {/* Corner frames */}
        {['tl','tr','bl','br'].map(pos => <div key={pos} className={`fc ${pos}`} />)}

        {/* Body indicators */}
        <div style={{ position:'absolute',top:10,left:10,display:'flex',flexDirection:'column',gap:4,zIndex:20 }}>
          <div className={`bi hand${handCount ? ' active' : ''}`}>✋ {handCount}</div>
          <div className={`bi face${hasFace ? ' active' : ''}`}>👤 {hasFace ? 'face' : '—'}</div>
          <div className={`bi ai${currentSource === 'ai' && currentSign ? ' active' : ''}`}>
            🤖 {currentSource === 'lstm' && currentSign ? 'LSTM'
               : currentSource === 'ai'  && currentSign ? 'ML'
               : currentSign ? 'GEO' : '—'}
          </div>
        </div>

        {/* Camera cover / loading overlay */}
        {(!camActive || mpLoading) && (
          <div style={cover}>
            {mpLoading ? (
              <>
                <div style={{ fontSize: '2rem' }}>🤖</div>
                <p style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.7)', textAlign: 'center', maxWidth: 220, lineHeight: 1.6 }}>
                  Loading gesture recognition model…
                </p>
                <p style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.35)', textAlign: 'center', maxWidth: 200 }}>
                  First load: ~74 MB (gesture + face mesh). Cached after that.
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: '2.5rem' }}>📷</div>
                <p style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.5)', textAlign: 'center', maxWidth: 200, lineHeight: 1.5 }}>
                  Start camera — Holistic tracks hands, face &amp; body
                </p>
              </>
            )}
          </div>
        )}

        {/* Live pill — uses debounced displaySign to prevent flicker */}
        <div className={pillClass}>
          <span style={{ fontFamily:"'Fraunces',serif", fontSize:'1rem', color: displaySign ? '#fff' : 'var(--accent-mid)', flexShrink:0 }}>
            {displaySign ? '✓' : '—'}
          </span>
          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {displaySign || 'Detecting...'}
          </span>
          {displaySign && displayConf > 0 && (
            <span style={confBadge}>{displayConf}%</span>
          )}
        </div>

        {/* Hold ring — uses raw currentSign so it responds every frame */}
        {settings.holdAdd && currentSign && holdFrames > 0 && (
          <div style={{ position:'absolute',top:10,right:10,zIndex:20 }}>
            <svg width="34" height="34" viewBox="0 0 36 36">
              <circle className="hbg" cx="18" cy="18" r="15"/>
              <circle className="harc" cx="18" cy="18" r="15"
                style={{ strokeDashoffset: dashOffset }} />
            </svg>
          </div>
        )}
      </div>

      {/* Start/stop button */}
      <button onClick={toggle} disabled={mpLoading}
        style={{ ...startBtn, ...(camActive && !mpLoading ? stopBtnStyle : {}), ...(mpLoading ? loadingBtnStyle : {}) }}>
        {mpLoading ? '⏳ Loading models…' : camActive ? '⏹ Stop Camera' : '▶ Start Camera'}
      </button>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'.4rem' }}>
        {[
          { v: handCount, l: 'Hands' },
          { v: currentSource === 'ai' && currentSign ? 'ML' : currentSource && currentSign ? 'GEO' : '—', l: 'Model' },
          { v: fps, l: 'FPS' },
        ].map(({ v, l }) => (
          <div key={l} style={statBox}>
            <div style={statVal}>{v}</div>
            <div style={statLbl}>{l}</div>
          </div>
        ))}
      </div>

      <style>{`
        .fc { position:absolute;width:18px;height:18px;pointer-events:none;z-index:10 }
        .fc.tl{top:10px;left:10px;border-top:2px solid rgba(255,255,255,.2);border-left:2px solid rgba(255,255,255,.2);border-radius:4px 0 0 0}
        .fc.tr{top:10px;right:10px;border-top:2px solid rgba(255,255,255,.2);border-right:2px solid rgba(255,255,255,.2);border-radius:0 4px 0 0}
        .fc.bl{bottom:10px;left:10px;border-bottom:2px solid rgba(255,255,255,.2);border-left:2px solid rgba(255,255,255,.2);border-radius:0 0 0 4px}
        .fc.br{bottom:10px;right:10px;border-bottom:2px solid rgba(255,255,255,.2);border-right:2px solid rgba(255,255,255,.2);border-radius:0 0 4px 0}
        .bi{font-size:.58rem;font-weight:600;padding:.18rem .45rem;border-radius:100px;background:rgba(0,0,0,.5);color:rgba(255,255,255,.4);backdrop-filter:blur(4px)}
        .bi.active{color:#fff}
        .bi.hand.active{background:rgba(45,106,79,.7)}
        .bi.face.active{background:rgba(59,130,246,.7)}
        .bi.pose.active{background:rgba(124,58,237,.7)}
        .live-pill{
          position:absolute;bottom:12px;left:50%;transform:translateX(-50%);
          background:rgba(17,17,17,.75);backdrop-filter:blur(8px);border-radius:100px;
          padding:.4rem 1rem;display:flex;align-items:center;gap:.5rem;
          font-size:.82rem;font-weight:600;color:#fff;white-space:nowrap;
          transition:all .2s;z-index:20;max-width:90%
        }
        .live-pill.detected{background:rgba(45,106,79,.85)}
        .live-pill.body-det{background:rgba(59,130,246,.85)}
        .live-pill.two-hand{background:rgba(124,58,237,.85)}
        .live-pill.ai-det{background:rgba(217,119,6,.9)}
        .live-pill.lstm-det{background:rgba(124,58,237,.92)}
        .hbg{fill:none;stroke:rgba(255,255,255,.15);stroke-width:3}
        .harc{fill:none;stroke:var(--accent-mid);stroke-width:3;stroke-linecap:round;
              stroke-dasharray:94.25;stroke-dashoffset:94.25;
              transition:stroke-dashoffset .1s linear;
              transform:rotate(-90deg);transform-origin:50% 50%}
      `}</style>
    </div>
  );
}

const viewport = {
  position:'relative', background:'#111', borderRadius:'var(--r)',
  overflow:'hidden', aspectRatio:'4/3', boxShadow:'var(--shadow-lg)',
};
const videoStyle = {
  position:'absolute', inset:0, width:'100%', height:'100%',
  objectFit:'cover', transform:'scaleX(-1)',
};
const canvasStyle = {
  position:'absolute', inset:0, width:'100%', height:'100%', transform:'scaleX(-1)',
};
const cover = {
  position:'absolute', inset:0, background:'rgba(17,17,17,.92)',
  display:'flex', flexDirection:'column', alignItems:'center',
  justifyContent:'center', gap:'.75rem',
};
const startBtn = {
  width:'100%', padding:'.875rem', borderRadius:'var(--rs)', border:'none',
  background:'var(--accent)', color:'#fff', fontSize:'.95rem', fontWeight:600,
  display:'flex', alignItems:'center', justifyContent:'center', gap:'.5rem',
  boxShadow:'0 4px 16px rgba(45,106,79,.3)', transition:'all .2s',
};
const stopBtnStyle   = { background: 'var(--warn)' };
const loadingBtnStyle = { background: 'var(--muted)', opacity: 0.7, cursor: 'wait' };
const statBox = {
  background:'var(--surface)', border:'1px solid var(--border)',
  borderRadius:'var(--rs)', padding:'.45rem', textAlign:'center',
};
const statVal = {
  fontFamily:"'Fraunces',serif", fontSize:'1.1rem', fontWeight:500,
  color:'var(--accent)', lineHeight:1,
};
const statLbl = {
  fontSize:'.56rem', color:'var(--light)', textTransform:'uppercase',
  letterSpacing:'.07em', marginTop:'.1rem',
};
const confBadge = {
  fontSize:'.65rem', fontWeight:700,
  background:'rgba(255,255,255,.25)',
  padding:'.1rem .35rem', borderRadius:100,
  letterSpacing:'.02em',
};
