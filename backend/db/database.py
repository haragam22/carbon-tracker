import os
import aiosqlite
from contextlib import asynccontextmanager

DB_PATH = "storage/carbon_data.db"

def ensure_db_directory():
    """Defensive check to ensure the folder exists before SQLite tries to read/write."""
    db_dir = os.path.dirname(DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
        print(f"🌟 Created database directory path at: {db_dir}")

async def init_db():
    # 🌟 Added Fix: Ensure folder structure exists on Render before connecting
    ensure_db_directory()
    
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
    # 🌟 Added Fix: Safeguard connection loops against empty cloud paths on cold boots
    ensure_db_directory()
    
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()