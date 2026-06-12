# 01 — System Architecture
## Carbon Impact Platform — "Awareness as an Experience"

---

## 1. Stack Overview

| Layer | Technology | Justification |
|---|---|---|
| Frontend Framework | Next.js (App Router) + React 18 | SSR for fast first paint, file-based routing |
| 3D Engine | React Three Fiber + drei + Three.js | Declarative Three.js bindings, code-generated geometry |
| State Management | React Context API (`CarbonContext`) | Avoids Redux/Zustand overhead, in-memory O(1) map |
| Backend Framework | FastAPI (Python 3.11+) | Async-native, automatic OpenAPI docs, Pydantic validation |
| Persistence | SQLite (via `aiosqlite`) for daily logs + JSON file fallback for local dev | Lightweight, zero external DB dependency |
| Auth / Key Handling | Ephemeral in-memory runtime store (no DB) | Zero-persistence requirement (see Security Layer doc) |
| Deployment | Vercel (frontend) + Render/Fly.io (backend) | Free-tier compatible, fast cold starts |

---

## 2. Directory Structure

```
carbon-impact-platform/
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                 # Main dashboard + 3D canvas
│   │   └── api/                     # Next.js API proxy routes (optional)
│   ├── components/
│   │   ├── CanvasScene.tsx          # R3F Core + Atmosphere
│   │   ├── LogForm.tsx              # Transit / Food / AC input forms
│   │   ├── DeveloperSettingsDrawer.tsx
│   │   └── WeeklyRollupChart.tsx
│   ├── context/
│   │   └── CarbonContext.tsx        # Global ephemeral state
│   └── lib/
│       └── apiClient.ts             # Fetch wrapper, attaches Bearer header
│
├── backend/
│   ├── main.py                      # FastAPI app entrypoint
│   ├── routers/
│   │   ├── verify.py
│   │   ├── logs.py
│   │   └── history.py
│   ├── core/
│   │   ├── coefficients.py          # O(1) static hash map (see doc 02)
│   │   ├── scheduler.py             # Daily reset clock
│   │   └── security.py              # Bearer key passthrough handling
│   ├── db/
│   │   ├── database.py              # SQLite connection/session
│   │   └── models.py                # ORM-style schema definitions
│   └── storage/
│       └── carbon_data.db           # SQLite file (gitignored)
│
└── docs/
    ├── 01_system_architecture.md
    ├── 02_carbon_coefficients.md
    └── 03_canvas_blueprint.md
```

---

## 3. Local Storage / Database Schemas

### 3.1 Frontend Ephemeral State (`CarbonContext`)

The frontend maintains an **in-memory O(1) Map** as the single source of truth for the current session, bound directly to the Three.js render loop. This map is rehydrated from the backend on mount and never persisted to `localStorage`.

```typescript
// context/CarbonContext.tsx

interface CarbonState {
  // Raw daily inputs (keyed by activity type for O(1) access)
  dailyInputs: Map<ActivityKey, number>;

  // Derived render-loop bindings
  islandScale: number;        // 0.0 - 1.0, drives Core morph
  vortexVelocity: number;     // angular velocity multiplier
  vortexParticleCount: number; // 200 -> 5000
  emissionIndex: number;      // normalized 0.0 - 1.0 global score

  // Weekly rollup cache
  weeklyHistory: WeeklyEntry[];

  // Developer Settings (ephemeral only)
  llmApiKey: string | null;   // never persisted, see Security doc
}

type ActivityKey = "transitKm" | "meatMeals" | "acHours" | "electricityKwh";

interface WeeklyEntry {
  date: string;       // ISO 8601, e.g. "2026-06-12"
  totalCo2Kg: number;
  emissionIndex: number;
}
```

**Access pattern:** All reads/writes to `dailyInputs` use `Map.get(key)` / `Map.set(key, value)` — guaranteeing O(1) lookup with no nested loops, mirroring the backend's coefficient hash map.

---

### 3.2 Backend Database Schema (SQLite via `aiosqlite`)

#### Table: `daily_logs`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique log entry ID |
| `log_date` | TEXT | NOT NULL, format `YYYY-MM-DD` | Date the log applies to |
| `transit_km` | REAL | DEFAULT 0.0 | Kilometers traveled (car/bus/etc.) |
| `meat_meals` | INTEGER | DEFAULT 0 | Number of meat-based meals consumed |
| `ac_hours` | REAL | DEFAULT 0.0 | Hours of air conditioning use |
| `electricity_kwh` | REAL | DEFAULT 0.0 | Electricity consumed in kWh |
| `total_co2_kg` | REAL | NOT NULL | Computed total via O(1) coefficient lookup |
| `emission_index` | REAL | NOT NULL | Normalized 0.0–1.0 value for canvas binding |
| `created_at` | TEXT | DEFAULT CURRENT_TIMESTAMP | ISO 8601 timestamp |

```sql
CREATE TABLE IF NOT EXISTS daily_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    log_date TEXT NOT NULL UNIQUE,
    transit_km REAL DEFAULT 0.0,
    meat_meals INTEGER DEFAULT 0,
    ac_hours REAL DEFAULT 0.0,
    electricity_kwh REAL DEFAULT 0.0,
    total_co2_kg REAL NOT NULL,
    emission_index REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(log_date);
```

#### Table: `weekly_rollup_cache` (optional materialized view)

| Column | Type | Constraints | Description |
|---|---|---|---|
| `week_start` | TEXT | PRIMARY KEY, format `YYYY-MM-DD` | Monday of the week |
| `avg_emission_index` | REAL | NOT NULL | Mean emission index over 7 days |
| `total_co2_kg` | REAL | NOT NULL | Sum of CO2 across the week |
| `days_logged` | INTEGER | NOT NULL | Count of days with entries (0–7) |

```sql
CREATE TABLE IF NOT EXISTS weekly_rollup_cache (
    week_start TEXT PRIMARY KEY,
    avg_emission_index REAL NOT NULL,
    total_co2_kg REAL NOT NULL,
    days_logged INTEGER NOT NULL
);
```

This table is recomputed (not appended) every time the `/history/weekly` route is called, via a single aggregate query — no nested loops.

```sql
SELECT
    log_date,
    total_co2_kg,
    emission_index
FROM daily_logs
WHERE log_date >= date('now', '-6 days')
ORDER BY log_date ASC;
```

The 7-row result is reduced in Python with a single `sum()` / `statistics.mean()` pass — O(n) where n ≤ 7, effectively constant.

---

## 4. Daily Reset Clock Automation

### 4.1 Mechanism

The platform does **not** use a long-running cron daemon (incompatible with serverless free-tier deploys). Instead, it uses a **lazy reset-on-access pattern** combined with an optional `APScheduler` background task for local/dev environments.

#### Lazy Reset Logic (Production-safe)

On every request to `/logs/daily` (GET or POST), the backend:

1. Computes `today = date.today().isoformat()`.
2. Checks if a row exists in `daily_logs` where `log_date = today`.
3. If **no row exists**:
   - The frontend's `CarbonContext.dailyInputs` Map is reset to zero values for all `ActivityKey` entries.
   - A new row is **not** inserted until the user submits their first log of the day (avoids empty-row pollution).
4. If a row **exists**, it is loaded and hydrates `CarbonContext`.

```python
# core/scheduler.py

from datetime import date

def get_or_init_today_state(db_row: dict | None) -> dict:
    """
    Lazy daily reset: called on every GET /logs/daily.
    O(1) — no loops, no batch jobs.
    """
    today = date.today().isoformat()

    if db_row is None or db_row["log_date"] != today:
        return {
            "log_date": today,
            "transit_km": 0.0,
            "meat_meals": 0,
            "ac_hours": 0.0,
            "electricity_kwh": 0.0,
            "total_co2_kg": 0.0,
            "emission_index": 0.0,
        }

    return db_row
```

#### Optional Background Scheduler (Local Dev Only)

For local development, `APScheduler` runs a midnight job purely for **cache invalidation** of `weekly_rollup_cache` — it does NOT delete `daily_logs` rows (historical data is preserved for the 7-day rolling tracker).

```python
# core/scheduler.py (continued)

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler()

def start_scheduler():
    scheduler.add_job(
        invalidate_weekly_cache,
        trigger=CronTrigger(hour=0, minute=0),  # midnight local server time
        id="daily_reset_job",
        replace_existing=True,
    )
    scheduler.start()

async def invalidate_weekly_cache():
    async with get_db_connection() as db:
        await db.execute("DELETE FROM weekly_rollup_cache")
        await db.commit()
```

This job is registered in `main.py`'s startup event but wrapped in a try/except so its absence in serverless environments does not crash the app.

---

## 5. FastAPI Route Definitions

### 5.1 `main.py` — Application Entrypoint

```python
# main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import verify, logs, history
from db.database import init_db
from core.scheduler import start_scheduler

app = FastAPI(
    title="Carbon Impact Platform API",
    version="1.0.0",
    description="O(1) carbon coefficient engine for the Hybrid Core-Atmosphere visualization."
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # restrict to deployed frontend origin in production
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(verify.router, prefix="/api/verify", tags=["Verification"])
app.include_router(logs.router, prefix="/api/logs", tags=["Daily Logs"])
app.include_router(history.router, prefix="/api/history", tags=["History"])

@app.on_event("startup")
async def startup_event():
    await init_db()
    try:
        start_scheduler()
    except Exception:
        pass  # scheduler not available in serverless environments
```

---

### 5.2 Route: `POST /api/verify`

**Purpose:** Validates the presence and basic format of a user-supplied LLM API key (Bearer token) without persisting it. Returns a session-scoped validity flag.

```python
# routers/verify.py

from fastapi import APIRouter, Header, HTTPException

router = APIRouter()

@router.post("/")
async def verify_key(authorization: str | None = Header(default=None)):
    """
    Validates Authorization: Bearer <key> header.
    The key is read into a local variable, used for one-shot validation
    (e.g. a lightweight ping to the LLM provider), and immediately
    discarded at the end of the request scope. Never logged, never stored.
    """
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ").strip()

    if len(token) < 8:
        raise HTTPException(status_code=400, detail="API key appears invalid")

    # token is used here only transiently (e.g. test call to provider)
    # and goes out of scope when the function returns.
    return {"status": "verified", "key_length": len(token)}
```

**Request:**
```
POST /api/verify
Authorization: Bearer sk-xxxxxxxxxxxxxxxx
```

**Response (200):**
```json
{ "status": "verified", "key_length": 39 }
```

**Response (401):**
```json
{ "detail": "Missing or malformed Authorization header" }
```

---

### 5.3 Route: `GET /api/logs/daily`

**Purpose:** Returns today's log entry (or zeroed defaults via the lazy reset mechanism).

```python
# routers/logs.py (part 1)

from fastapi import APIRouter
from db.database import get_db_connection
from core.scheduler import get_or_init_today_state
from datetime import date

router = APIRouter()

@router.get("/daily")
async def get_daily_log():
    today = date.today().isoformat()
    async with get_db_connection() as db:
        cursor = await db.execute(
            "SELECT * FROM daily_logs WHERE log_date = ?", (today,)
        )
        row = await cursor.fetchone()
        row_dict = dict(row) if row else None

    state = get_or_init_today_state(row_dict)
    return state
```

**Response (200):**
```json
{
  "log_date": "2026-06-12",
  "transit_km": 0.0,
  "meat_meals": 0,
  "ac_hours": 0.0,
  "electricity_kwh": 0.0,
  "total_co2_kg": 0.0,
  "emission_index": 0.0
}
```

---

### 5.4 Route: `POST /api/logs/daily`

**Purpose:** Ingests a daily activity log, computes `total_co2_kg` and `emission_index` via the O(1) coefficient hash map (doc 02), and upserts the row.

```python
# routers/logs.py (part 2)

from pydantic import BaseModel, Field
from core.coefficients import calculate_emissions  # O(1) lookup, see doc 02

class DailyLogInput(BaseModel):
    transit_km: float = Field(ge=0, default=0.0)
    meat_meals: int = Field(ge=0, default=0)
    ac_hours: float = Field(ge=0, default=0.0)
    electricity_kwh: float = Field(ge=0, default=0.0)

@router.post("/daily")
async def post_daily_log(payload: DailyLogInput):
    today = date.today().isoformat()

    total_co2_kg, emission_index = calculate_emissions(
        transit_km=payload.transit_km,
        meat_meals=payload.meat_meals,
        ac_hours=payload.ac_hours,
        electricity_kwh=payload.electricity_kwh,
    )

    async with get_db_connection() as db:
        await db.execute(
            """
            INSERT INTO daily_logs
                (log_date, transit_km, meat_meals, ac_hours, electricity_kwh, total_co2_kg, emission_index)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(log_date) DO UPDATE SET
                transit_km = excluded.transit_km,
                meat_meals = excluded.meat_meals,
                ac_hours = excluded.ac_hours,
                electricity_kwh = excluded.electricity_kwh,
                total_co2_kg = excluded.total_co2_kg,
                emission_index = excluded.emission_index
            """,
            (
                today,
                payload.transit_km,
                payload.meat_meals,
                payload.ac_hours,
                payload.electricity_kwh,
                total_co2_kg,
                emission_index,
            ),
        )
        await db.commit()

    return {
        "log_date": today,
        "total_co2_kg": total_co2_kg,
        "emission_index": emission_index,
        "islandScale": emission_index,
        "vortexParticleCount": int(200 + emission_index * (5000 - 200)),
        "vortexVelocity": round(0.1 + emission_index * 1.9, 4),
    }
```

**Request:**
```json
{
  "transit_km": 12.5,
  "meat_meals": 2,
  "ac_hours": 4.0,
  "electricity_kwh": 6.2
}
```

**Response (200):**
```json
{
  "log_date": "2026-06-12",
  "total_co2_kg": 18.42,
  "emission_index": 0.61,
  "islandScale": 0.61,
  "vortexParticleCount": 3127,
  "vortexVelocity": 1.259
}
```

---

### 5.5 Route: `GET /api/history/weekly`

**Purpose:** Returns the rolling 7-day history for the weekly roll-up chart and historical canvas comparison.

```python
# routers/history.py

from fastapi import APIRouter
from db.database import get_db_connection

router = APIRouter()

@router.get("/weekly")
async def get_weekly_history():
    async with get_db_connection() as db:
        cursor = await db.execute(
            """
            SELECT log_date, total_co2_kg, emission_index
            FROM daily_logs
            WHERE log_date >= date('now', '-6 days')
            ORDER BY log_date ASC
            """
        )
        rows = await cursor.fetchall()

    history = [dict(row) for row in rows]

    if history:
        avg_index = sum(r["emission_index"] for r in history) / len(history)
        total_co2 = sum(r["total_co2_kg"] for r in history)
    else:
        avg_index = 0.0
        total_co2 = 0.0

    return {
        "days": history,
        "avg_emission_index": round(avg_index, 4),
        "total_co2_kg": round(total_co2, 2),
        "days_logged": len(history),
    }
```

**Response (200):**
```json
{
  "days": [
    { "log_date": "2026-06-06", "total_co2_kg": 14.2, "emission_index": 0.47 },
    { "log_date": "2026-06-07", "total_co2_kg": 19.8, "emission_index": 0.66 },
    { "log_date": "2026-06-12", "total_co2_kg": 18.42, "emission_index": 0.61 }
  ],
  "avg_emission_index": 0.58,
  "total_co2_kg": 52.42,
  "days_logged": 3
}
```

---

## 6. Database Connection Helper

```python
# db/database.py

import aiosqlite
from contextlib import asynccontextmanager

DB_PATH = "storage/carbon_data.db"

async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS daily_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                log_date TEXT NOT NULL UNIQUE,
                transit_km REAL DEFAULT 0.0,
                meat_meals INTEGER DEFAULT 0,
                ac_hours REAL DEFAULT 0.0,
                electricity_kwh REAL DEFAULT 0.0,
                total_co2_kg REAL NOT NULL,
                emission_index REAL NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(log_date);")
        await db.execute("""
            CREATE TABLE IF NOT EXISTS weekly_rollup_cache (
                week_start TEXT PRIMARY KEY,
                avg_emission_index REAL NOT NULL,
                total_co2_kg REAL NOT NULL,
                days_logged INTEGER NOT NULL
            );
        """)
        await db.commit()

@asynccontextmanager
async def get_db_connection():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
```

---

## 7. Frontend → Backend Binding Summary

| Frontend Trigger | Backend Route | Updates in `CarbonContext` |
|---|---|---|
| App mount | `GET /api/logs/daily` | `dailyInputs`, `emissionIndex`, `islandScale` |
| Form submission (Transit/Food/AC) | `POST /api/logs/daily` | `emissionIndex`, `islandScale`, `vortexVelocity`, `vortexParticleCount` |
| Weekly chart view | `GET /api/history/weekly` | `weeklyHistory` |
| Developer Settings save | `POST /api/verify` | `llmApiKey` (ephemeral, in-memory only) |

All numeric outputs from `POST /api/logs/daily` (`islandScale`, `vortexVelocity`, `vortexParticleCount`) are designed to bind **directly** to the `useFrame()` render loop in `CanvasScene.tsx` — no intermediate transformation needed on the frontend, keeping the render path O(1) per frame.

---

*End of `01_system_architecture.md`. Proceed to `02_carbon_coefficients.md` for the O(1) coefficient hash map and emission math, which `core/coefficients.py` depends on.*
