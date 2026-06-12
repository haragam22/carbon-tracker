from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from datetime import date
from db.database import get_db_connection
from core.scheduler import get_or_init_today_state
from core.coefficients import calculate_emissions

router = APIRouter()

class DailyLogInput(BaseModel):
    transit_km: float = Field(ge=0, default=0.0)
    meat_meals: int = Field(ge=0, default=0)
    ac_hours: float = Field(ge=0, default=0.0)
    electricity_kwh: float = Field(ge=0, default=0.0)

@router.get("/daily")
async def get_daily_log():
    try:
        today = date.today().isoformat()
        async with get_db_connection() as db:
            cursor = await db.execute(
                "SELECT * FROM daily_logs WHERE log_date = ?", (today,)
            )
            row = await cursor.fetchone()
            row_dict = dict(row) if row else None

        state = get_or_init_today_state(row_dict)
        return state
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch daily logs: {str(e)}")

@router.post("/daily")
async def post_daily_log(payload: DailyLogInput):
    try:
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to post daily log: {str(e)}")
