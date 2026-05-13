/**
 * useLSTM — TensorFlow.js LSTM inference for sign classification.
 *
 * TF.js is imported DYNAMICALLY so it only downloads (~3.5 MB gzipped)
 * when the user actually uploads a model. Zero impact on initial load.
 *
 * Expected model input:  tensor of shape (1, 30, 63)
 *                        30 frames × 63 floats [x0,y0,z0 … x20,y20,z20]
 *                        wrist-origin normalised (same as DatasetRecorder output)
 * Expected model output: softmax probabilities over N sign classes
 *
 * Usage:
 *   await loadModel(modelJsonFile, weightsFiles, labelsJsonFile)
 *   const result = predict(landmarkBuf30x63)  // → {label, conf, source} or null
 */

let _tf     = null;
let _model  = null;
let _labels = null;

// ── Load ─────────────────────────────────────────────────────────────────────
export async function loadModel(modelJsonFile, weightsFiles, labelsJsonFile) {
  // Lazy-load TF.js — only hits the network the first time
  if (!_tf) {
    _tf = await import('@tensorflow/tfjs');
    await _tf.setBackend('webgl');
    await _tf.ready();
  }

  // Dispose previous model to free GPU memory
  if (_model) { _model.dispose(); _model = null; }

  // Load Keras model from browser File objects (no server upload needed)
  _model = await _tf.loadLayersModel(
    _tf.io.browserFiles([modelJsonFile, ...weightsFiles])
  );

  // Labels JSON: ["HELLO", "NO", "YES", ...]
  const labelsText = await labelsJsonFile.text();
  _labels = JSON.parse(labelsText);

  return _labels.length;
}

// ── Predict ──────────────────────────────────────────────────────────────────
// landmarkBuf: array of up to 30 flat 63-float arrays (newest last).
// Returns { label, conf, source: 'lstm' } or null if confidence < threshold.
export function predict(landmarkBuf) {
  if (!_tf || !_model || !_labels) return null;
  if (landmarkBuf.length < 30) return null;

  const frames = landmarkBuf.slice(-30); // exactly 30 frames

  return _tf.tidy(() => {
    const input = _tf.tensor3d([frames], [1, 30, 63]);
    const output = _model.predict(input);
    const probs  = Array.from(output.dataSync());
    const maxIdx = probs.indexOf(Math.max(...probs));
    const conf   = Math.round(probs[maxIdx] * 100);
    if (conf < 70) return null;
    return { label: _labels[maxIdx], conf, source: 'lstm' };
  });
}

export function isLoaded()   { return !!_model && !!_labels; }
export function getLabels()  { return _labels || []; }
export function unloadModel() {
  if (_model) { _model.dispose(); _model = null; }
  _labels = null;
}
