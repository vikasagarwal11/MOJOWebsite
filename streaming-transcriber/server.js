import express from 'express';
import { WebSocketServer } from 'ws';
import { SpeechClient } from '@google-cloud/speech';
import admin from 'firebase-admin';

const app = express();
const port = process.env.PORT || 8080;

const server = app.listen(port, () => {
  console.log(`Streaming transcriber listening on ${port}`);
});

const wss = new WebSocketServer({ server, path: '/ws' });
const speechClient = new SpeechClient();

// Initialize Firebase Admin using default credentials (Cloud Run SA)
try {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
} catch {}

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const languageCode = url.searchParams.get('lang') || 'en-US';
  const token = url.searchParams.get('token');

  // Optional auth: if token is present, verify it; otherwise allow anonymous.
  if (token) {
    try {
      await admin.auth().verifyIdToken(token);
    } catch (e) {
      try { ws.send(JSON.stringify({ type: 'error', message: 'unauthorized' })); } catch {}
      ws.close(4401, 'unauthorized');
      return;
    }
  }

  const request = {
    config: {
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000,
      languageCode,
      enableAutomaticPunctuation: true,
      interimResults: true,
    },
    interimResults: true,
  };

  const recognizeStream = speechClient
    .streamingRecognize(request)
    .on('error', (e) => {
      try { ws.send(JSON.stringify({ type: 'error', message: e.message })); } catch {}
      ws.close();
    })
    .on('data', (data) => {
      const results = data.results || [];
      const result = results[0];
      if (!result || !result.alternatives || !result.alternatives[0]) return;
      const text = result.alternatives[0].transcript || '';
      const isFinal = !!result.isFinal;
      ws.send(JSON.stringify({ type: isFinal ? 'final' : 'partial', text }));
    });

  ws.on('message', (message) => {
    try {
      if (typeof message === 'string') {
        const json = JSON.parse(message);
        if (json && json.event === 'end') {
          recognizeStream.end();
          return;
        }
      } else {
        recognizeStream.write({ audioContent: message });
      }
    } catch (e) {
      // ignore parse errors
    }
  });

  ws.on('close', () => {
    try { recognizeStream.end(); } catch {}
  });
});
