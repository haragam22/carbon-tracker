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
    allow_origins=["*"],
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
        pass
