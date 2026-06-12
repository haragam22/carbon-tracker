# Carbon Impact Platform 🌍

> "Awareness as an Experience"

A hybrid 3D visualization engine that translates daily carbon-emitting activities into a visceral, behavioral feedback loop.

## Overview

Traditional carbon dashboards rely on static bar charts. This platform takes a radically different approach: your footprint physically affects a localized environment in real-time. Built using a **Hybrid Visual Engine** with Next.js and React Three Fiber, the environment reacts to your logged activities (transit, food, AC usage).

As your emissions rise, the vibrant, procedurally generated floating island begins to choke inside a mathematically-driven 3D atmospheric smog vortex using Brownian particle motion.

## Technical Architecture

### Frontend (Next.js & React Three Fiber)
- **Single Canvas Architecture**: Eliminates WebGL context exhaustion, guaranteeing zero crashes while swapping between the SaaS layout and the full-screen interactive view.
- **Garbage Collection**: Rigorous `.dispose()` cleanup protocols on all geometries and materials protect VRAM from memory leaks.
- **Immersive 3D**: `useFrame` driven procedural Perlin-noise particle mechanics for the atmosphere vortex, and dynamically loading `.glb` island environments.

### Backend (FastAPI & Python)
- **O(1) Time Complexity Math**: Environmental metrics map directly to a static Hash Map coefficient lookup table, completely bypassing heavy conditional logic or nested database calls.
- **Robust Exception Handling**: Deep `try-except` wrappers on SQLite connections that return clean `HTTP 500` traces over fatal server crashes.

### Privacy-First Security
- **Zero-Persistence Volatile Memory**: Developer API Keys travel via secure TLS-encrypted `Authorization: Bearer` headers and are explicitly retained in transient memory. We write exactly zero bytes of key data to `localStorage`, `cookies`, or the database.

## Automated Testing

The project is fully validated using **Playwright** end-to-end test suites.
To execute the automated evaluation tests:
```bash
cd carbon-tracker/frontend
npx playwright test
```

## Running the Application Locally

### 1. Start the Backend
```bash
cd carbon-tracker/backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 2. Start the Frontend
```bash
cd carbon-tracker/frontend
npm install
npm run dev
```

The SaaS dashboard will be available at `http://localhost:3000`.
