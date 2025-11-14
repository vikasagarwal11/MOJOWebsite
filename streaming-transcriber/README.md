Cloud Run Streaming Transcriber

Overview
- WebSocket bridge that accepts audio chunks from the browser and forwards them to Google Cloud Speech-to-Text `streamingRecognize`.
- Sends back partial and final transcripts over the same socket.

Local Dev
1) `npm install`
2) `npm run dev` (starts on :8080)

Deploy (Cloud Run)
1) `gcloud builds submit --tag gcr.io/PROJECT_ID/streaming-transcriber`
2) `gcloud run deploy streaming-transcriber --image gcr.io/PROJECT_ID/streaming-transcriber --region us-central1 --allow-unauthenticated`

Client Protocol
- Connect to `wss://SERVICE_URL/ws?lang=en-US`
- Send binary audio chunks (Opus/PCM) repeatedly.
- Send `{ "event": "end" }` JSON to signal end of stream.
- Server emits JSON messages `{ type: 'partial'|'final', text: '...' }`.

