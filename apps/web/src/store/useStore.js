import { create } from 'zustand';

const useStore = create((set, get) => ({
  // Camera
  camActive: false,
  setCamActive: (v) => set({ camActive: v }),

  // MediaPipe model loading
  mpLoading: false,
  setMpLoading: (v) => set({ mpLoading: v }),

  // Detection — raw, updated every frame (used for hold-to-add logic)
  currentSign: null,
  currentConf: 0,
  currentSource: 'hand',
  setDetection: (label, conf, source) => set({ currentSign: label, currentConf: conf, currentSource: source }),
  clearDetection: () => set({ currentSign: null, currentConf: 0, currentSource: 'hand' }),

  // Display-stable sign — debounced (6 consecutive frames), shown in the live pill.
  // Eliminates the A→S→A flicker without affecting hold-to-add response time.
  displaySign:   null,
  displayConf:   0,
  displaySource: 'hand',
  setDisplaySign: (sign, conf, source) => set({ displaySign: sign, displayConf: conf, displaySource: source }),

  // Stats
  fps: 0,
  handCount: 0,
  hasFace: false,
  hasPose: false,
  setStats: (fps, handCount, hasFace, hasPose) => set({ fps, handCount, hasFace, hasPose }),

  // Features (for debug panel)
  features: null,
  setFeatures: (f) => set({ features: f }),

  // Motion buffer — 30 frames (~1 s at 30 fps) for sequence confirmation
  frameBuf: [],
  pushBuf: (entry) => set((s) => {
    const next = [...s.frameBuf, entry];
    return { frameBuf: next.length > 30 ? next.slice(-30) : next };
  }),

  // Mode: 'word' | 'letter' | 'number'
  mode: 'word',
  setMode: (mode) => set({ mode }),

  // Sentence stream — each entry is { sign: string, conf: number }
  sentence: [],
  addSign: (entry) => set((s) => ({ sentence: [...s.sentence, entry] })),
  undoSign: () => set((s) => ({ sentence: s.sentence.slice(0, -1) })),
  clearSentence: () => set({ sentence: [], aiText: null }),

  // AI output
  aiText: null,
  aiLoading: false,
  setAiText: (t) => set({ aiText: t }),
  setAiLoading: (v) => set({ aiLoading: v }),

  // Conversation history (legacy log)
  history: [],
  saveToHistory: () => {
    const { sentence, aiText, history, conversation } = get();
    if (!sentence.length) return;
    const raw  = sentence.map(e => e.sign).join(' ');
    const text = aiText || raw;
    set({
      history: [{ raw, ai: aiText, time: new Date(), count: sentence.length }, ...history],
      conversation: [...conversation, { type: 'sign', text, raw, time: new Date() }],
      sentence: [],
      aiText: null,
    });
  },
  clearHistory: () => set({ history: [] }),

  // Conversation view — both sides of the exchange
  conversation: [],
  addSpeechEntry: (text) => {
    if (!text.trim()) return;
    set(s => ({ conversation: [...s.conversation, { type: 'speech', text: text.trim(), time: new Date() }] }));
  },
  clearConversation: () => set({ conversation: [] }),

  // Proxy
  proxyUrl: '/interpret',
  proxyConnected: false,
  setProxyUrl: (url) => set({ proxyUrl: url }),
  setProxyConnected: (v) => set({ proxyConnected: v }),

  // Settings
  settings: {
    skeleton: true,
    debug: true,
    holdAdd: true,
    buffer: true,
    twoHand: true,
    tts: true,           // auto-speak AI output
    autoInterpret: true, // auto-interpret after pause in signing
    faceMesh: true,      // load MediaPipe FaceLandmarker for accurate zone detection (~32 MB)
  },
  toggleSetting: (key) => set((s) => ({
    settings: { ...s.settings, [key]: !s.settings[key] },
  })),

  // TTS speed (separate from boolean settings)
  ttsRate: 1.0,
  setTtsRate: (r) => set({ ttsRate: r }),

  // STT — hearing person speaks → signer reads
  sttText: '',
  sttListening: false,
  setSttText: (t) => set({ sttText: t }),
  setSttListening: (v) => set({ sttListening: v }),
  clearStt: () => set({ sttText: '' }),

  // Mobile tab: 'camera' | 'signs' | 'ai' | 'history'
  activeTab: 'camera',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Normalised landmarks — updated each frame by useMediaPipe.
  // Used by DatasetRecorder; kept in store so recorder needs no hook into the loop.
  rawLandmarks:  null, // primary / right hand (63 floats when normalised)
  rawLandmarksL: null, // left hand (63 floats) — used for Auslan two-hand recording
  setRawLandmarks:  (lm) => set({ rawLandmarks: lm }),
  setRawLandmarksL: (lm) => set({ rawLandmarksL: lm }),

  // Face mesh loading state
  faceMeshLoading: false,
  setFaceMeshLoading: (v) => set({ faceMeshLoading: v }),

  // LSTM model status: 'none' | 'loading' | 'ready' | 'error'
  lstmStatus: 'none',
  lstmClasses: [],
  setLstmStatus: (s, classes = []) => set({ lstmStatus: s, lstmClasses: classes }),

  // Hold-to-add
  holdFrames: 0,
  lastDet: null,
  setHoldFrames: (n) => set({ holdFrames: n }),
  setLastDet: (s) => set({ lastDet: s }),

  // Batched per-frame update — replaces ~8 individual set() calls with one.
  // All fields are required so no subscriber fires twice for the same frame.
  setFrameState: (p) => set((s) => {
    const next = [...s.frameBuf, p.bufEntry];
    return {
      fps:           p.fps,
      handCount:     p.handCount,
      hasFace:       p.hasFace,
      hasPose:       false,
      features:      p.features,
      currentSign:   p.currentSign,
      currentConf:   p.currentConf,
      currentSource: p.currentSource,
      displaySign:   p.displaySign,
      displayConf:   p.displayConf,
      displaySource: p.displaySource,
      rawLandmarks:  p.rawLandmarks,
      rawLandmarksL: p.rawLandmarksL,
      holdFrames:    p.holdFrames,
      lastDet:       p.lastDet,
      frameBuf: next.length > 30 ? next.slice(-30) : next,
      ...(p.addSign ? { sentence: [...s.sentence, p.addSign] } : {}),
    };
  }),
}));

export default useStore;
