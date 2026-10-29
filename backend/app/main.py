from __future__ import annotations

import asyncio
import math
import os
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

API_BASE = os.getenv("ELEXON_API_BASE", "https://data.elexon.co.uk/bmrs/api/v1")
UK = ZoneInfo("Europe/London")

app = FastAPI(title="WindLens API", version="0.1.0", description="Wind forecast accuracy analysis for January 2026.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


def parse_dt(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None




async def fetch_dataset(
    client: httpx.AsyncClient,
    dataset: str,
    start: date,
    end: date,
) -> list[dict[str, Any]]:
    url = f"{API_BASE}/datasets/{dataset}/stream"

    if dataset == "FUELHH":
        # Actual generation: filter by settlement date.
        params = {
            "settlementDateFrom": start.isoformat(),
            "settlementDateTo": end.isoformat(),
        }
    else:
        # Forecast data: request the publication-time window.
        params = {
            "publishDateTimeFrom": (
                datetime.combine(
                    start - timedelta(days=1),
                    time.min,
                    tzinfo=timezone.utc,
                ).isoformat().replace("+00:00", "Z")
            ),
            "publishDateTimeTo": (
                datetime.combine(
                    end,
                    time.max,
                    tzinfo=timezone.utc,
                ).isoformat().replace("+00:00", "Z")
            ),
        }

    response = await client.get(url, params=params, timeout=45.0)
    print(f"{dataset} REQUEST URL:", response.request.url)
    response.raise_for_status()

    payload = response.json()

    if isinstance(payload, dict):
        payload = payload.get("data", payload.get("results", []))

    if not isinstance(payload, list):
        raise ValueError(f"Unexpected {dataset} response shape")

    rows = [row for row in payload if isinstance(row, dict)]

    print(f"{dataset} ROW COUNT:", len(rows))
    print(
        f"{dataset} TIMESTAMP SAMPLE:",
        [
            {
                "startTime": row.get("startTime"),
                "publishTime": row.get("publishTime"),
            }
            for row in rows[:5]
        ],
    )

    return rows




def calculate_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    valid = [r for r in rows if r.get("actual_mw") is not None and r.get("forecast_mw") is not None]
    if not valid:
        return {"matched_periods": 0, "mae_mw": None, "rmse_mw": None, "bias_mw": None, "mape_percent": None}
    errors = [float(r["forecast_mw"]) - float(r["actual_mw"]) for r in valid]
    absolute = [abs(e) for e in errors]
    nonzero = [(abs(float(r["forecast_mw"]) - float(r["actual_mw"])) / abs(float(r["actual_mw"]))) * 100 for r in valid if float(r["actual_mw"]) != 0]
    return {
        "matched_periods": len(valid),
        "mae_mw": round(sum(absolute) / len(absolute), 2),
        "rmse_mw": round(math.sqrt(sum(e * e for e in errors) / len(errors)), 2),
        "bias_mw": round(sum(errors) / len(errors), 2),
        "mape_percent": round(sum(nonzero) / len(nonzero), 2) if nonzero else None,
    }



def normalize_actuals(rows: list[dict[str, Any]]) -> dict[str, float]:
    actuals: dict[str, float] = {}

    print("ACTUAL ROW COUNT:", len(rows))
    if rows:
        print("ACTUAL ROW KEYS:", list(rows[0].keys()))
        print("ACTUAL FIRST ROW:", rows[0])

    for row in rows:
        if str(row.get("fuelType", "")).upper() != "WIND":
            continue

        stamp = parse_dt(row.get("startTime"))
        try:
            generation = float(row.get("generation"))
        except (TypeError, ValueError):
            continue

        if stamp:
            actuals[stamp.isoformat()] = generation

    print("NORMALIZED ACTUAL COUNT:", len(actuals))
    print("NORMALIZED ACTUAL SAMPLE:", list(actuals.items())[:5])

    return actuals




def normalize_forecasts(
    rows: list[dict[str, Any]],
    decision_cutoff_hour: int,
) -> dict[str, dict[str, Any]]:
    chosen: dict[str, dict[str, Any]] = {}

    for row in rows:
        target = parse_dt(row.get("startTime"))
        published = parse_dt(row.get("publishTime"))

        try:
            generation = float(row.get("generation"))
        except (TypeError, ValueError):
            continue

        if target is None or published is None:
            continue

        target_local = target.astimezone(UK)

        cutoff = datetime.combine(
            target_local.date() - timedelta(days=1),
            time(decision_cutoff_hour, 59, 59),
            tzinfo=UK,
        )

        if published.astimezone(UK) > cutoff:
            continue

        key = target.isoformat()
        current = chosen.get(key)

        if current is None or published > current["published_at"]:
            chosen[key] = {
                "generation": generation,
                "published_at": published,
                "target": target,
            }

    return chosen


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "windlens-api"}


@app.get("/api/analysis")
async def analysis(
    start_date: date = Query(default=date(2026, 1, 1)),
    end_date: date = Query(default=date(2026, 1, 31)),
    cutoff_hour: int = Query(default=23, ge=0, le=23, description="UK local hour on the day before delivery; latest eligible forecast is selected."),
) -> dict[str, Any]:
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be on or before end_date")
    if start_date < date(2026, 1, 1) or end_date > date(2026, 1, 31):
        raise HTTPException(status_code=400, detail="This challenge is scoped to January 2026")

    try:
        
        async with httpx.AsyncClient(
            headers={
                "Accept": "application/json",
                "User-Agent": "WindLens/0.1",
            }
        ) as client:
            actual_rows, forecast_rows = await asyncio.gather(
                fetch_dataset(client, "FUELHH", start_date, end_date),
                fetch_dataset(client, "WINDFOR", start_date, end_date),
            )


            print("Requested period:", start_date, end_date)

            print(
                "Actual date range:",
                min((r.get("startTime", "") for r in actual_rows), default=None),
                max((r.get("startTime", "") for r in actual_rows), default=None),
            )

            print(
                "Forecast date range:",
                min((r.get("startTime", "") for r in forecast_rows), default=None),
                max((r.get("startTime", "") for r in forecast_rows), default=None),
            )


            print("FORECAST ROW COUNT:", len(forecast_rows))
            print("FORECAST ROW KEYS:", list(forecast_rows[0].keys()) if forecast_rows else [])
            print("FORECAST FIRST ROW:", forecast_rows[0] if forecast_rows else None)

            # Debug logs must run after the datasets have been fetched.
            print("FUELHH RAW SAMPLE:", actual_rows[:3])
            print("WINDFOR RAW SAMPLE:", forecast_rows[:3])

    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Could not retrieve Elexon data: {exc}") from exc

    actuals = normalize_actuals(actual_rows)
    forecasts = normalize_forecasts(forecast_rows, cutoff_hour)

    print("Actual count:", len(actuals))
    print("Forecast count:", len(forecasts))

    print("Raw actual sample:", actual_rows[:2])
    print("Raw forecast sample:", forecast_rows[:2])

    print("Actual timestamps:", list(actuals.keys())[:5])
    print("Forecast timestamps:", list(forecasts.keys())[:5])


    print("FUELHH total rows:", len(actual_rows))
    print("FUELHH sample:", actual_rows[:3])
    print("Normalized actuals:", len(actuals))
    print("Normalized forecasts:", len(forecasts))
    print("Actual timestamp samples:", list(actuals.keys())[:5])
    print("Forecast timestamp samples:", list(forecasts.keys())[:5])

    start_utc = datetime.combine(start_date, time.min, tzinfo=UK).astimezone(timezone.utc)
    end_utc = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=UK).astimezone(timezone.utc)
    rows: list[dict[str, Any]] = []

    for key, actual in actuals.items():
        target = datetime.fromisoformat(key)

        if not (start_utc <= target < end_utc):
            continue

        # WINDFOR is hourly; use the forecast for the hour
        # containing this half-hour settlement period.
        forecast_hour = target.replace(
            minute=0,
            second=0,
            microsecond=0,
        )
        forecast = forecasts.get(forecast_hour.isoformat())

        rows.append({
            "start_time": target.isoformat(),
            "actual_mw": actual,
            "forecast_mw": forecast["generation"] if forecast else None,
            "publish_time": (
                forecast["published_at"].isoformat()
                if forecast else None
            ),
            "error_mw": (
                round(forecast["generation"] - actual, 2)
                if forecast else None
            ),
        })
    rows.sort(key=lambda r: r["start_time"])
    matched = [row for row in rows if row["forecast_mw"] is not None]
    return {
        "period": {"start_date": start_date.isoformat(), "end_date": end_date.isoformat(), "timezone": "Europe/London"},
        "forecast_selection": {
            "rule": "latest publishTime no later than the selected cutoff on the previous UK calendar day",
            "cutoff_hour_uk": cutoff_hour,
        },
        "source": "Elexon BMRS FUELHH and WINDFOR datasets",
        "record_counts": {"actual_rows": len(actual_rows), "forecast_rows": len(forecast_rows), "actual_periods": len(rows), "matched_periods": len(matched)},
        "metrics": calculate_metrics(rows),
        "rows": rows,
    }
