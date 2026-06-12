from datetime import date
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from db.database import get_db_connection

def get_or_init_today_state(db_row: dict | None) -> dict:
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

scheduler = AsyncIOScheduler()

def start_scheduler():
    scheduler.add_job(
        invalidate_weekly_cache,
        trigger=CronTrigger(hour=0, minute=0),
        id="daily_reset_job",
        replace_existing=True,
    )
    scheduler.start()

async def invalidate_weekly_cache():
    async with get_db_connection() as db:
        await db.execute("DELETE FROM weekly_rollup_cache")
        await db.commit()
