from fastapi import APIRouter, HTTPException
from db.database import get_db_connection
from datetime import date, timedelta

router = APIRouter()

@router.get("/weekly")
async def get_weekly_history():
    try:
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch weekly history: {str(e)}")
