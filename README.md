# TravelPlatform — Generic AI-Driven Travel PWA

## Quick Start

```bash
cp .env.example .env      # fill in your Firebase + VAPID keys
npm install
npm run dev
```

## Setup: New Firebase Project

Since you've chosen to create a new Firebase project:

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create project → name it `travel-platform` (or similar)
3. Enable **Google Authentication** (Authentication → Sign-in method)
4. Create **Firestore Database** (start in production mode)
5. Copy your config into `.env`:
   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...
   ```
6. Deploy Firestore Security Rules:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase init firestore   # select your new project
   # paste rules from firestore.rules
   firebase deploy --only firestore:rules
   ```

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Vite 5 + React 18 + TypeScript |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| i18n | i18next (Hebrew default, English supported) |
| AI | Gemini / OpenAI / Anthropic / Ollama unified |
| Database | Firebase Firestore (multi-tenant, offline-first) |
| PWA | vite-plugin-pwa + Workbox |
| Testing | Vitest + React Testing Library |
| CI/CD | GitHub Actions → static PWA |

## Architecture

```
src/
  engine/         # Graphify-inspired semantic extraction
  services/       # Firebase, AI (multi-provider), auth, notifications
  store/          # Zustand: auth, trip, AI context
  pages/          # Lazy-loaded tab views
  components/     # UI primitives + layout
  i18n/           # he.json (default) + en.json
  tests/          # Vitest test suites
```

## AI Configuration

All AI settings are managed in **Settings → AI Provider**:
- Switch between Gemini, OpenAI, Anthropic, or local Ollama
- Per-task model selection (fast for chat, reasoning for itinerary)
- API keys stored in `localStorage` only — never in Firestore

## Semantic Engine

The `src/engine/semanticEngine.ts` implements a Graphify-inspired
knowledge graph extractor. It:
- Takes free text (bookings, preferences, receipts)
- Returns `{ nodes[], edges[], hyperedges[] }` — same schema as graphify
- Locks pre-booked items as `fixed: true` constraints
- Powers itinerary generation, conflict detection, and AI context

## Commands

```bash
npm run dev          # development server
npm run build        # production build
npm run test         # run Vitest
npm run test:ui      # Vitest UI
npm run preview      # preview production build
```
