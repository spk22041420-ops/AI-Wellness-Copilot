"""
AI Wellness Copilot — FastAPI Backend
Hackathon Prototype: lightweight REST API with JSON file storage
"""

import json
import os
import httpx
from datetime import datetime, date, timedelta
from typing import Optional, List
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ============================================================
# APP SETUP
# ============================================================
app = FastAPI(
    title="AI Wellness Copilot API",
    description="Lightweight backend for the AI Wellness Copilot hackathon prototype",
    version="2.0.0",
)

# CORS — allow the frontend on any localhost port
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# CONSTANTS
# ============================================================
DATA_DIR = Path(__file__).parent
LOGS_FILE = DATA_DIR / "wellness_logs.json"
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_API_KEY = "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"
DEFAULT_MODEL = "google/gemini-2.0-flash-001"

ACTIVITY_SCORES = {"low": 30, "medium": 65, "high": 100}
MOOD_SCORES = {
    "happy": 100, "excited": 90, "neutral": 60,
    "tired": 40, "anxious": 35, "stressed": 25, "sad": 20,
}
NEGATIVE_MOODS = {"stressed", "anxious", "sad", "tired"}

# ============================================================
# PYDANTIC MODELS
# ============================================================

class CheckinRequest(BaseModel):
    userId: str = "demo_user"
    water: float = Field(..., ge=0, le=10, description="Water intake in litres")
    sleep: float = Field(..., ge=0, le=24, description="Sleep hours")
    activity: str = Field(..., description="low | medium | high")
    mood: str = Field(..., description="e.g. happy, neutral, stressed")
    notes: str = ""
    moods: Optional[List[str]] = None
    moodContext: Optional[str] = ""
    activityDescription: Optional[str] = ""


class ChatRequest(BaseModel):
    message: str
    context: Optional[dict] = None


class CheckinResponse(BaseModel):
    status: str
    wellness_score: float
    burnout_risk: str
    message: str


class WeeklyInsightsResponse(BaseModel):
    wellness_score: float
    burnout_risk: str
    insights: str
    recommendations: List[str]
    avg_sleep: float
    avg_water: float
    total_logs: int


class ChatResponse(BaseModel):
    sentiment: str
    reply: str


# ============================================================
# JSON FILE STORAGE HELPERS
# ============================================================

def _read_logs() -> list:
    """Read all wellness logs from JSON file."""
    if not LOGS_FILE.exists():
        return []
    try:
        with open(LOGS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return []


def _write_logs(logs: list):
    """Write logs list to JSON file."""
    with open(LOGS_FILE, "w", encoding="utf-8") as f:
        json.dump(logs, f, indent=2, ensure_ascii=False)


def _get_recent_logs(days: int = 7) -> list:
    """Return logs from the last N days."""
    logs = _read_logs()
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    return [l for l in logs if l.get("date", "") >= cutoff]


# ============================================================
# WELLNESS SCORE CALCULATION
# ============================================================

def compute_wellness_score(sleep: float, water: float, activity: str, mood: str) -> float:
    """Combine metrics into a 0-100 wellness score."""
    sleep_score = min(sleep / 8.0 * 100, 100)
    water_score = min(water / 3.0 * 100, 100)
    activity_score = ACTIVITY_SCORES.get(activity.lower(), 50)
    mood_score = MOOD_SCORES.get(mood.lower(), 50)

    score = (0.30 * sleep_score
             + 0.25 * water_score
             + 0.25 * activity_score
             + 0.20 * mood_score)
    return round(min(max(score, 0), 100), 1)


def compute_burnout_risk(avg_sleep: float, avg_water: float,
                         sedentary_days: int, negative_mood_days: int) -> tuple:
    """Return (risk_score 0-100, risk_label)."""
    risk = 0
    if avg_sleep < 6:
        risk += 30
    if avg_water < 2:
        risk += 20
    if sedentary_days > 4:
        risk += 20
    if negative_mood_days > 3:
        risk += 30
    risk = min(risk, 100)

    if risk <= 40:
        label = "Low"
    elif risk <= 70:
        label = "Medium"
    else:
        label = "High"
    return risk, label


# ============================================================
# SIMPLE SENTIMENT DETECTION
# ============================================================

SENTIMENT_KEYWORDS = {
    "stress": ["stress", "overwhelm", "pressure", "tension", "overwork"],
    "anxiety": ["anxious", "anxiety", "worried", "nervous", "panic", "fear"],
    "burnout": ["burnout", "burned out", "exhausted", "drained", "can't anymore"],
    "sadness": ["sad", "depressed", "down", "lonely", "hopeless", "cry"],
    "positive": ["happy", "great", "good", "wonderful", "excited", "joy", "grateful"],
}


def detect_sentiment(text: str) -> str:
    """Rule-based sentiment detection."""
    lower = text.lower()
    for sentiment, keywords in SENTIMENT_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            return sentiment
    return "neutral"


# ============================================================
# LLM HELPER (OpenRouter)
# ============================================================

async def call_llm(messages: list, api_key: str = DEFAULT_API_KEY,
                   model: str = DEFAULT_MODEL, max_tokens: int = 700) -> str:
    """Call OpenRouter chat completions API."""
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "http://localhost:8080",
        "X-Title": "AI Wellness Copilot Backend",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(OPENROUTER_URL, headers=headers, json=payload)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"LLM API error: {resp.text}")
        data = resp.json()
        return data["choices"][0]["message"]["content"]


# ============================================================
# ROUTES
# ============================================================

@app.get("/")
async def root():
    return {"message": "AI Wellness Copilot Backend Running 🧠"}


# ---------- CHECK-IN ----------

@app.post("/checkin", response_model=CheckinResponse)
async def create_checkin(req: CheckinRequest):
    """Save a daily wellness check-in and return computed score."""
    today = date.today().isoformat()

    log_entry = {
        "userId": req.userId,
        "date": today,
        "water": req.water,
        "sleep": req.sleep,
        "activity": req.activity,
        "mood": req.mood,
        "notes": req.notes,
        "moods": req.moods or [req.mood],
        "moodContext": req.moodContext or "",
        "activityDescription": req.activityDescription or "",
        "timestamp": datetime.now().isoformat(),
    }

    logs = _read_logs()
    logs.append(log_entry)
    _write_logs(logs)

    score = compute_wellness_score(req.sleep, req.water, req.activity, req.mood)

    # Quick burnout check for this single entry
    _, risk_label = compute_burnout_risk(
        avg_sleep=req.sleep,
        avg_water=req.water,
        sedentary_days=1 if req.activity == "low" else 0,
        negative_mood_days=1 if req.mood in NEGATIVE_MOODS else 0,
    )

    return CheckinResponse(
        status="success",
        wellness_score=score,
        burnout_risk=risk_label,
        message=f"Check-in saved for {today}. Wellness Score: {score}/100",
    )


# ---------- LOGS ----------

@app.get("/logs")
async def get_logs(userId: str = "demo_user"):
    """Return all stored wellness logs, optionally filtered by userId."""
    logs = _read_logs()
    if userId:
        logs = [l for l in logs if l.get("userId") == userId]
    return {"logs": logs, "count": len(logs)}


# ---------- WEEKLY INSIGHTS ----------

@app.get("/weekly-insights", response_model=WeeklyInsightsResponse)
async def weekly_insights(userId: str = "demo_user"):
    """Generate predictive wellness insights from the last 7 days."""
    recent = _get_recent_logs(7)
    if userId:
        recent = [l for l in recent if l.get("userId") == userId]

    if not recent:
        return WeeklyInsightsResponse(
            wellness_score=0,
            burnout_risk="Unknown",
            insights="No check-in data found for the past 7 days. Start tracking to get insights!",
            recommendations=["Complete your first daily check-in", "Stay hydrated", "Aim for 7-8 hours of sleep"],
            avg_sleep=0,
            avg_water=0,
            total_logs=0,
        )

    n = len(recent)
    avg_sleep = sum(l.get("sleep", 0) for l in recent) / n
    avg_water = sum(l.get("water", 0) for l in recent) / n
    sedentary_days = sum(1 for l in recent if l.get("activity", "").lower() == "low")

    negative_mood_days = 0
    for l in recent:
        moods = l.get("moods", [l.get("mood", "neutral")])
        if any(m.lower() in NEGATIVE_MOODS for m in moods):
            negative_mood_days += 1

    risk_score, risk_label = compute_burnout_risk(avg_sleep, avg_water, sedentary_days, negative_mood_days)

    # Build insights text
    issues = []
    recs = []
    if avg_sleep < 6:
        issues.append("Sleep deprivation detected across multiple days")
        recs.append("Sleep before 11 PM and aim for 7-8 hours")
    if avg_water < 2:
        issues.append("Hydration levels are below recommended intake")
        recs.append("Drink at least 2.5L of water daily")
    if sedentary_days > 4:
        issues.append("High number of sedentary days this week")
        recs.append("Take a 10-minute walk daily")
    if negative_mood_days > 3:
        issues.append("Negative mood trend detected")
        recs.append("Try journaling or a 2-minute breathing exercise")

    if not issues:
        issues.append("Your wellness metrics look healthy this week!")
    if not recs:
        recs = ["Keep up the great work!", "Stay consistent with your habits", "Consider adding a new healthy habit"]

    wellness_score = round(sum(
        compute_wellness_score(l["sleep"], l["water"], l["activity"], l["mood"])
        for l in recent
    ) / n, 1)

    return WeeklyInsightsResponse(
        wellness_score=wellness_score,
        burnout_risk=risk_label,
        insights=". ".join(issues),
        recommendations=recs[:5],
        avg_sleep=round(avg_sleep, 1),
        avg_water=round(avg_water, 1),
        total_logs=n,
    )


# ---------- AI INSIGHTS (LLM-powered) ----------

@app.get("/ai-insights")
async def ai_insights(userId: str = "demo_user"):
    """Generate LLM-powered wellness insights from the latest check-in."""
    logs = _read_logs()
    user_logs = [l for l in logs if l.get("userId") == userId]

    if not user_logs:
        raise HTTPException(status_code=404, detail="No check-in data found. Submit a check-in first.")

    latest = user_logs[-1]

    prompt = f"""Analyze this wellness data for a user named {userId}:

Sleep: {latest.get('sleep', 'N/A')} hours
Water: {latest.get('water', 'N/A')}L
Activity: {latest.get('activity', 'N/A')}
Mood: {', '.join(latest.get('moods', [latest.get('mood', 'neutral')]))}
Activity description: {latest.get('activityDescription', 'None')}
Mood context: {latest.get('moodContext', 'None')}

Generate:
1. A personalized wellness assessment (2-3 sentences)
2. Burnout risk explanation (1-2 sentences)
3. 3 specific, actionable recommendations

Keep the tone warm, empathetic, and encouraging. Format with HTML <p> and <ul>/<li> tags."""

    messages = [
        {"role": "system", "content": "You are a supportive AI wellness advisor. Provide warm, personalized health insights. Do not give medical diagnoses."},
        {"role": "user", "content": prompt},
    ]

    reply = await call_llm(messages)
    return {"insights": reply, "source": "llm"}


# ---------- CHAT (Mental Health Companion) ----------

@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """AI mental health companion chatbot endpoint."""
    sentiment = detect_sentiment(req.message)

    ctx = req.context or {}
    sleep = ctx.get("sleep", "unknown")
    water = ctx.get("water", "unknown")
    activity = ctx.get("activity", "unknown")
    mood = ctx.get("mood", "unknown")

    system_prompt = (
        "You are a supportive AI wellness companion helping users manage stress "
        "and improve wellbeing. Provide empathetic responses and suggest small "
        "actions such as breathing exercises, hydration, short walks, or journaling. "
        "Do NOT provide medical diagnoses. Keep responses concise (3-5 sentences)."
    )

    user_prompt = f"""User context:
Sleep: {sleep} hours
Hydration: {water}L
Activity: {activity}
Mood: {mood}

User message:
\"{req.message}\"

The detected sentiment is: {sentiment}.
Generate a supportive response and suggest 1-3 small actions."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    reply = await call_llm(messages, max_tokens=400)
    return ChatResponse(sentiment=sentiment, reply=reply)


# ---------- WELLNESS SCORE (standalone) ----------

@app.get("/wellness-score")
async def get_wellness_score(sleep: float = 7, water: float = 2.5,
                             activity: str = "medium", mood: str = "neutral"):
    """Compute and return the wellness score for given metrics."""
    score = compute_wellness_score(sleep, water, activity, mood)
    return {"wellness_score": score, "sleep": sleep, "water": water,
            "activity": activity, "mood": mood}
