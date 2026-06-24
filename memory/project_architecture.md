---
name: HoopsAtlas project architecture
description: Stack, AI-proxy setup, en beveiligingsmodel van de HoopsAtlas app
type: project
---

Vite + React + TypeScript SPA met Express server (server.ts) voor zowel dev als productie. Firebase (Firestore, Auth, Storage, Functions). Capacitor voor iOS/Android.

**AI-proxy architectuur (ingesteld april 2026):** OpenAI calls gaan via `/api/ai/chat` op de Express server. De key staat server-side als `OPENAI_API_KEY` (geen VITE_ prefix). Alle frontend components importeren `callAI()` uit `utils/ai.ts` — nooit de OpenAI SDK direct. De proxy verifieert Firebase ID-tokens via de Firebase REST API.

**Why:** OpenAI API key werd gestolen doordat hij via VITE_ prefix in de browser-JS bundle zat.

**How to apply:** Nieuwe AI-features altijd via `callAI()` uit `utils/ai.ts`. Nooit `new OpenAI(...)` in frontend components. Nooit `VITE_OPENAI_API_KEY` in .env.
