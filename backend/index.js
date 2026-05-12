require('dotenv').config();
const express = require('express');
const cors = require('cors');

const interpretRoute = require('./routes/interpret');
const healthRoute = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://signbridge.app',
  ],
}));
app.use(express.json());

app.use('/interpret', interpretRoute);
app.use('/health', healthRoute);

app.listen(PORT, () => {
  console.log(`SignBridge proxy running on :${PORT}`);
  console.log('Using Ollama (llama3.2:1b) — no API key required');
});
