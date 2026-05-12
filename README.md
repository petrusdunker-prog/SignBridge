# SignBridge

Real-time ASL interpreter — MediaPipe Holistic + Claude AI.

## Quick Start

### 1. Install Node.js (required)
Download from https://nodejs.org (LTS version, 18+)

### 2. Backend proxy (holds your Anthropic API key)

```bash
cd signbridge/backend
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
npm install
npm start          # runs on http://localhost:3001
```

### 3. React web app

```bash
cd signbridge/apps/web
npm install
npm run dev        # runs on http://localhost:3000
```

Open http://localhost:3000 in Chrome (camera access required).

## Project structure

```
signbridge/
├── backend/
│   ├── index.js           # Express proxy server
│   ├── routes/
│   │   ├── interpret.js   # POST /interpret → Claude AI
│   │   └── health.js      # GET /health
│   └── .env               # ANTHROPIC_API_KEY (never commit)
└── apps/
    └── web/
        ├── index.html
        └── src/
            ├── App.jsx
            ├── main.jsx
            ├── components/
            │   ├── Header.jsx
            │   ├── CameraPanel.jsx    # MediaPipe Holistic + camera
            │   ├── DetectionCard.jsx  # Live sign + feature debug panel
            │   ├── SignStream.jsx     # Mode tabs + sentence builder
            │   ├── AiOutput.jsx       # Claude interpretation output
            │   ├── ProxyBanner.jsx    # Proxy connection status
            │   ├── SignLibrary.jsx    # Searchable 80+ sign reference
            │   ├── History.jsx        # Saved conversations
            │   ├── SettingsModal.jsx  # Settings bottom sheet
            │   └── BottomNav.jsx      # Mobile tab nav
            ├── hooks/
            │   ├── useMediaPipe.js    # Holistic camera integration
            │   └── useClassifier.js  # Feature extraction + all classifiers
            ├── store/
            │   └── useStore.js        # Zustand global state
            └── data/
                └── signDatabase.js   # 80+ ASL sign definitions
```

## How it works

1. **MediaPipe Holistic** runs in the browser — tracks hands, face, and body pose at 15–30 FPS
2. **Feature extraction** computes curl ratios, palm orientation, body zone, hand spread, velocity
3. **Classifier** runs per-frame: motion patterns → two-hand → single-hand → sequence confirmation
4. **Hold-to-add**: hold a sign for 1.5 s (22 frames) to add it to the sign stream
5. **Interpret**: sends the full sign stream to Claude via the backend proxy
6. **Claude** converts ASL gloss (Topic-Comment order) to natural English

## What's built (v1 production)

- [x] Backend proxy — Anthropic API key secured server-side
- [x] MediaPipe Holistic — hands + face + body tracking
- [x] Feature extraction — curl ratios, velocity, zone, spread, orientation
- [x] Motion tracking — per-frame wrist history, velocity + direction
- [x] Two-hand classifier — inter-hand distance, coordinated gestures
- [x] Single-hand classifier — 11 categories, 80+ signs, zone-aware
- [x] Letter classifier — A–Z fingerspelling
- [x] Number classifier — 1–10
- [x] Hold-to-add — 1.5s hold adds sign to stream
- [x] AI interpretation — Claude Sonnet via backend proxy
- [x] Rephrase — ask Claude for an alternative phrasing
- [x] Conversation history — save + review sessions
- [x] Sign library — searchable, category-filtered, live highlighting
- [x] Settings — skeleton, debug panel, hold-add, buffer, two-hand
- [x] Desktop layout — 460px camera col + right panel sidebar
- [x] Mobile layout — bottom tab nav, single-panel view

## Next priorities (from handoff doc)

- [ ] TF.js model trained on WLASL (replace geometry rules)
- [ ] Proper circular/arc motion detection (PLEASE, SORRY, THANK YOU)
- [ ] React Native app (Expo)
- [ ] Sign database expansion to 300–500 signs
