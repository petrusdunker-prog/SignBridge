import { useEffect, useRef } from 'react';
import useStore from '../store/useStore.js';

function fmt(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ConversationView() {
  const { conversation, clearConversation } = useStore();
  const bottomRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.length]);

  if (!conversation.length) {
    return (
      <div style={card}>
        <div style={header}>
          <span>💬 Conversation</span>
        </div>
        <div style={empty}>
          <span style={emptyIcon}>💬</span>
          <span style={emptyText}>
            Save a sign interpretation or send a spoken reply to start the conversation log.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={card}>
      {/* Header */}
      <div style={header}>
        <span>💬 Conversation</span>
        <button style={clearBtn} onClick={clearConversation} title="Clear conversation">
          Clear
        </button>
      </div>

      {/* Bubble list */}
      <div style={bubbleList}>
        {conversation.map((msg, i) => (
          <div key={i} style={msg.type === 'sign' ? rowRight : rowLeft}>
            {/* Avatar */}
            {msg.type === 'speech' && <div style={avatarLeft}>🎤</div>}

            <div style={{ maxWidth: '78%' }}>
              {/* Bubble */}
              <div style={msg.type === 'sign' ? bubbleSign : bubbleSpeech}>
                {msg.text}
              </div>
              {/* Meta */}
              <div style={msg.type === 'sign' ? metaRight : metaLeft}>
                {msg.type === 'sign' && msg.raw && msg.raw !== msg.text && (
                  <span style={rawLabel}>{msg.raw} →</span>
                )}
                <span>{fmt(msg.time)}</span>
              </div>
            </div>

            {/* Avatar */}
            {msg.type === 'sign' && <div style={avatarRight}>🤟</div>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const card = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  padding: '1.1rem',
  boxShadow: 'var(--shadow)',
  flexShrink: 0,
};
const header = {
  fontSize: '.68rem', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '.1em', color: 'var(--light)',
  marginBottom: '.75rem', display: 'flex',
  alignItems: 'center', justifyContent: 'space-between',
};
const clearBtn = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--warn)', fontSize: '.7rem', fontWeight: 600,
  textTransform: 'none', letterSpacing: 0, padding: 0,
};
const bubbleList = {
  display: 'flex', flexDirection: 'column', gap: '.55rem',
  maxHeight: 320, overflowY: 'auto',
  scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent',
};
const rowRight = { display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end', gap: '.4rem' };
const rowLeft  = { display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', gap: '.4rem' };

const bubbleSign = {
  background: 'var(--accent)',
  color: '#fff',
  padding: '.5rem .85rem',
  borderRadius: '16px 16px 4px 16px',
  fontSize: '.88rem', fontWeight: 500, lineHeight: 1.5,
  wordBreak: 'break-word',
};
const bubbleSpeech = {
  background: '#ffedd5',
  color: '#7c2d12',
  border: '1px solid #fed7aa',
  padding: '.5rem .85rem',
  borderRadius: '16px 16px 16px 4px',
  fontSize: '.88rem', fontWeight: 500, lineHeight: 1.5,
  wordBreak: 'break-word',
};
const metaRight = {
  fontSize: '.6rem', color: 'var(--muted)',
  display: 'flex', gap: '.35rem', justifyContent: 'flex-end',
  marginTop: '.2rem', alignItems: 'center',
};
const metaLeft = {
  fontSize: '.6rem', color: 'var(--muted)',
  display: 'flex', gap: '.35rem', justifyContent: 'flex-start',
  marginTop: '.2rem', alignItems: 'center',
};
const rawLabel = {
  color: 'var(--light)', fontStyle: 'italic',
};
const avatarRight = {
  fontSize: '1.1rem', lineHeight: 1, flexShrink: 0,
  marginBottom: '.15rem',
};
const avatarLeft = {
  fontSize: '1.1rem', lineHeight: 1, flexShrink: 0,
  marginBottom: '.15rem',
};
const empty = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  gap: '.5rem', padding: '1.25rem 0',
};
const emptyIcon = { fontSize: '1.75rem', opacity: .35 };
const emptyText = {
  fontSize: '.78rem', color: 'var(--light)', textAlign: 'center',
  fontStyle: 'italic', fontFamily: "'Fraunces',serif",
  maxWidth: 260, lineHeight: 1.5,
};
