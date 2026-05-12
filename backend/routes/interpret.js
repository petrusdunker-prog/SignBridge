const express = require('express');

const router = express.Router();

const OLLAMA_URL = 'http://localhost:11434/api/chat';
const MODEL      = 'llama3.2:1b';

const SYSTEM_PROMPT = `You translate ASL sign gloss into natural English. ASL uses Topic-Comment word order (e.g. "WATER ME WANT" means "I want water"). Always reply with ONLY the English translation — one sentence, nothing else.`;

router.post('/', async (req, res) => {
  const { signs, rephrase, test } = req.body;

  if (test) {
    // Check Ollama is reachable
    try {
      const r = await fetch('http://localhost:11434/api/tags');
      return res.json({ ok: r.ok });
    } catch {
      return res.status(503).json({ ok: false, error: 'Ollama not running' });
    }
  }

  if (!signs?.length) {
    return res.status(400).json({ error: 'No signs provided' });
  }

  const userMsg = rephrase
    ? `Rephrase this naturally: "${rephrase}"\nOutput only the rephrased sentence.`
    : `Input: ${signs.join(' ')}\nOutput:`;

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: 'WATER ME WANT' },
          { role: 'assistant', content: 'I want water' },
          { role: 'user',   content: 'WHERE BATHROOM' },
          { role: 'assistant', content: 'Where is the bathroom?' },
          { role: 'user',   content: 'THANK YOU HELP ME' },
          { role: 'assistant', content: 'Thank you for helping me.' },
          { role: 'user',   content: 'TOMORROW DOCTOR ME GO' },
          { role: 'assistant', content: "I'm going to the doctor tomorrow." },
          { role: 'user',   content: userMsg },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama error ${response.status}: ${err}`);
    }

    const data = await response.json();
    res.json({ interpretation: data.message.content.trim() });
  } catch (err) {
    console.error('[interpret]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
