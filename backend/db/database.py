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
