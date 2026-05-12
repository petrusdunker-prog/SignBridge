import { useRef, useState } from 'react';
import useStore from '../store/useStore.js';
import { loadModel, unloadModel, getLabels } from '../hooks/useLSTM.js';

// ── Python training script (embedded, downloaded on demand) ──────────────────
const TRAIN_SCRIPT = `"""
SignBridge LSTM Training Script
================================
Trains a Keras LSTM on sequences exported from the DatasetRecorder,
then exports the model in TensorFlow.js format for browser inference.

Requirements
------------
  pip install numpy tensorflow tensorflowjs scikit-learn

Usage
-----
  python train_signbridge.py signbridge-dataset-*.json

Output
------
  model/model.json   ← upload this to SignBridge
  model/group1-shard1of1.bin  (weights)
  model/labels.json  ← upload this too

Input format
------------
  Each sample: { "label": "HELLO", "frames": [[63 floats] x 30], "ts": ... }
  Frames are wrist-origin normalised landmarks: [x0,y0,z0, x1,y1,z1, ..., x20,y20,z20]
"""

import sys, json, pathlib
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau

# ── Load dataset files ───────────────────────────────────────────────────────
paths = sys.argv[1:] if len(sys.argv) > 1 else sorted(pathlib.Path('.').glob('signbridge-dataset-*.json'))
if not paths:
    print("Usage: python train_signbridge.py signbridge-dataset-*.json"); sys.exit(1)

samples = []
for p in paths:
    with open(p) as f:
        d = json.load(f)
        samples.extend(d['samples'])
        print(f"  Loaded {len(d['samples'])} samples from {p}")

print(f"\\nTotal: {len(samples)} samples")
if len(samples) < 20:
    print("WARNING: Very few samples. Collect at least 20-50 per sign for good accuracy.")

# ── Prepare data ─────────────────────────────────────────────────────────────
X   = np.array([s['frames'] for s in samples], dtype=np.float32)  # (N, 30, 63)
raw_y = [s['label'] for s in samples]

le   = LabelEncoder()
y_enc = le.fit_transform(raw_y)
y    = tf.keras.utils.to_categorical(y_enc)

print(f"Classes ({len(le.classes_)}): {list(le.classes_)}")
print(f"Input shape: {X.shape}  →  (samples, 30 frames, 63 features)")

# ── Train / test split ────────────────────────────────────────────────────────
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y_enc, random_state=42
)

# ── Model ─────────────────────────────────────────────────────────────────────
model = Sequential([
    LSTM(128, return_sequences=True, input_shape=(30, 63)),
    Dropout(0.3),
    BatchNormalization(),
    LSTM(64),
    Dropout(0.2),
    Dense(64, activation='relu'),
    Dense(len(le.classes_), activation='softmax'),
])

model.compile(
    optimizer=tf.keras.optimizers.Adam(1e-3),
    loss='categorical_crossentropy',
    metrics=['accuracy'],
)
model.summary()

# ── Train ─────────────────────────────────────────────────────────────────────
history = model.fit(
    X_train, y_train,
    validation_data=(X_test, y_test),
    epochs=100,
    batch_size=32,
    callbacks=[
        EarlyStopping(patience=10, restore_best_weights=True, verbose=1),
        ReduceLROnPlateau(factor=0.5, patience=5, verbose=1),
    ],
    verbose=1,
)

loss, acc = model.evaluate(X_test, y_test, verbose=0)
print(f"\\n✓ Test accuracy: {acc:.2%}  (loss: {loss:.4f})")

if acc < 0.70:
    print("Tip: accuracy < 70% — collect more samples (50+ per sign) or more signers.")

# ── Export to TensorFlow.js ───────────────────────────────────────────────────
import tensorflowjs as tfjs

out_dir = pathlib.Path('model')
out_dir.mkdir(exist_ok=True)

tfjs.converters.save_keras_model(model, str(out_dir))

with open(out_dir / 'labels.json', 'w') as f:
    json.dump(list(le.classes_), f)

print(f"\\n✓ Saved to {out_dir}/")
print("  Upload to SignBridge: model.json  +  *.bin  +  labels.json")
`;

export default function LSTMPanel() {
  const { lstmStatus, lstmClasses, setLstmStatus } = useStore();

  const [open,     setOpen]     = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // ── File upload handler ───────────────────────────────────────────────────
  async function handleFiles(files) {
    const arr    = Array.from(files);
    const modelJson  = arr.find(f => f.name === 'model.json');
    const weightsArr = arr.filter(f => f.name.endsWith('.bin'));
    const labelsJson = arr.find(f => f.name === 'labels.json');

    if (!modelJson)  return alert('Missing model.json');
    if (!labelsJson) return alert('Missing labels.json');
    if (!weightsArr.length) return alert('Missing weights .bin file(s)');

    setLstmStatus('loading');
    try {
      const n = await loadModel(modelJson, weightsArr, labelsJson);
      setLstmStatus('ready', getLabels());
    } catch (e) {
      setLstmStatus('error');
      alert('Failed to load model:\n' + e.message);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleUnload() {
    unloadModel();
    setLstmStatus('none', []);
  }

  function downloadScript() {
    const blob = new Blob([TRAIN_SCRIPT], { type: 'text/x-python' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'train_signbridge.py';
    a.click();
    URL.revokeObjectURL(url);
  }

  const statusColor = {
    none:    'var(--muted)',
    loading: '#7c3aed',
    ready:   'var(--accent)',
    error:   'var(--warn)',
  }[lstmStatus];

  const statusText = {
    none:    '— No model loaded',
    loading: '⏳ Loading model…',
    ready:   `✓ ${lstmClasses.length} classes loaded`,
    error:   '✕ Load failed',
  }[lstmStatus];

  return (
    <div style={card}>
      {/* Header */}
      <div style={header} onClick={() => setOpen(o => !o)}>
        <span>🧠 LSTM Model</span>
        <span style={{ display:'flex', alignItems:'center', gap:'.5rem' }}>
          <span style={{ ...statusPill, color: statusColor }}>{statusText}</span>
          <span style={{ fontSize:'.7rem', color:'var(--muted)' }}>{open ? '▲' : '▼'}</span>
        </span>
      </div>

      {open && (
        <>
          <p style={desc}>
            Upload a TensorFlow.js model trained on your DatasetRecorder exports.
            When loaded, LSTM predictions override the rule-based classifier.
          </p>

          {/* Drop zone */}
          {lstmStatus !== 'ready' && (
            <div
              style={{ ...dropZone, ...(dragOver ? dropZoneActive : {}) }}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <span style={{ fontSize:'1.5rem' }}>📂</span>
              <span style={{ fontSize:'.78rem', color:'var(--muted)', textAlign:'center' }}>
                Drop <strong>model.json + *.bin + labels.json</strong> here<br/>
                or click to browse
              </span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".json,.bin"
                style={{ display:'none' }}
                onChange={e => handleFiles(e.target.files)}
              />
            </div>
          )}

          {/* Loaded state */}
          {lstmStatus === 'ready' && (
            <div style={loadedBox}>
              <div style={{ fontSize:'.78rem', fontWeight:600, color:'var(--accent)', marginBottom:'.4rem' }}>
                ✓ Model active — {lstmClasses.length} signs
              </div>
              <div style={classGrid}>
                {lstmClasses.map(c => (
                  <span key={c} style={classChip}>{c}</span>
                ))}
              </div>
              <button style={unloadBtn} onClick={handleUnload}>Unload model</button>
            </div>
          )}

          {/* Python training script */}
          <div style={scriptBox}>
            <div style={{ fontSize:'.7rem', fontWeight:600, color:'var(--text)', marginBottom:'.3rem' }}>
              Don't have a model yet?
            </div>
            <p style={{ fontSize:'.68rem', color:'var(--muted)', margin:'0 0 .5rem', lineHeight:1.5 }}>
              Record samples with the Dataset Recorder, then run the Python script to
              train an LSTM and export it for SignBridge.
            </p>
            <button style={scriptBtn} onClick={downloadScript}>
              ⬇ Download train_signbridge.py
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const card = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r)',
  padding: '1rem',
  boxShadow: 'var(--shadow)',
  flexShrink: 0,
};
const header = {
  fontSize: '.68rem', fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '.1em', color: 'var(--light)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  cursor: 'pointer', userSelect: 'none',
};
const statusPill = {
  fontSize: '.65rem', fontWeight: 600,
  textTransform: 'none', letterSpacing: 0,
};
const desc = {
  fontSize: '.72rem', color: 'var(--muted)', lineHeight: 1.55,
  margin: '.6rem 0 .75rem',
};
const dropZone = {
  border: '2px dashed var(--border)', borderRadius: 10,
  padding: '1.25rem .75rem',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.5rem',
  cursor: 'pointer', transition: 'all .15s', marginBottom: '.75rem',
};
const dropZoneActive = { borderColor: 'var(--accent)', background: 'rgba(45,106,79,.05)' };
const loadedBox = {
  background: 'rgba(45,106,79,.06)', border: '1px solid rgba(45,106,79,.2)',
  borderRadius: 10, padding: '.75rem', marginBottom: '.75rem',
};
const classGrid = { display: 'flex', flexWrap: 'wrap', gap: '.3rem', marginBottom: '.6rem' };
const classChip = {
  fontSize: '.65rem', fontWeight: 600, padding: '.18rem .5rem',
  borderRadius: 100, background: 'var(--accent)', color: '#fff',
};
const unloadBtn = {
  fontSize: '.7rem', fontWeight: 600, cursor: 'pointer',
  padding: '.28rem .75rem', borderRadius: 100,
  border: '1px solid var(--warn)', background: 'transparent', color: 'var(--warn)',
};
const scriptBox = {
  background: 'var(--surface2)', border: '1px solid var(--border)',
  borderRadius: 10, padding: '.75rem', marginTop: '.1rem',
};
const scriptBtn = {
  fontSize: '.72rem', fontWeight: 600, cursor: 'pointer',
  padding: '.32rem .75rem', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--surface)',
  color: 'var(--text)', transition: 'all .15s',
};
