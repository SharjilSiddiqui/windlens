# WindLens — Wind Forecast Intelligence

A React + Python pilot dashboard for evaluating national UK wind generation forecasts against actual generation for January 2026, using Elexon BMRS `WINDFOR` and `FUELHH` datasets.

> **Important analytical assumption:** the challenge asks for the latest forecast available when day-ahead procurement decisions are made, but does not specify an exact decision timestamp. This starter makes the rule explicit and configurable: select the newest forecast publication (`publishTime`) no later than the chosen UK-local cutoff hour on the calendar day before delivery. The default is 23:59 UK time on the prior day. Confirm the intended cutoff with the hiring team if possible. This is a research/pilot tool, not trading advice.

## Stack

- Frontend: React, Vite, Recharts, Lucide
- Backend: Python, FastAPI, HTTPX
- Data source: Elexon BMRS API
- Containers: Docker Compose

## Run locally with Docker

Requirements: Docker Desktop.

```bash
docker compose up --build
```

Open:
- Frontend: http://localhost:5173
- API health: http://localhost:8000/api/health
- API docs: http://localhost:8000/docs

The dashboard initially requests January 1–31, 2026. The date selector is constrained to January 2026 as required by the challenge.

## Run without Docker

Backend (Python 3.11+ recommended):

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend (Node 20+): in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

## API

`GET /api/analysis?start_date=2026-01-01&end_date=2026-01-31&cutoff_hour=23`

Returns matched half-hour periods, actual generation, the latest eligible forecast publication, forecast errors, and summary metrics:
- **MAE:** mean absolute error in MW
- **RMSE:** root mean square error in MW
- **Bias:** mean of forecast minus actual; positive indicates overforecasting
- **MAPE:** mean absolute percentage error, excluding zero actuals

The backend fetches Elexon `FUELHH` and `WINDFOR` stream datasets concurrently. Missing forecast matches are retained as nulls rather than silently filled.

## Project structure

```text
windlens-starter/
├── backend/
│   ├── app/main.py       # Elexon data access, selection rule, metrics, REST API
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/main.jsx      # Dashboard, charts, filters, export
│   ├── src/styles.css    # Responsive dashboard styles
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml
└── README.md
```

## AI tooling disclosure

AI tools were used to assist with initial scaffolding and implementation. All API assumptions, forecast-selection logic, metrics, and outputs should be verified against Elexon documentation and the challenge requirements before submission.

## Before submission

- Verify the Elexon API response fields and date filtering against live API responses.
- Validate the procurement decision cutoff with the client/hiring team; document the chosen rule.
- Add backend unit tests for forecast selection, timezone boundaries, metric calculations, and missing data.
- Deploy frontend and backend; set `VITE_API_URL` to the deployed backend URL and configure `CORS_ORIGINS` on the backend.
- Create a public GitHub repository with an anonymous repository name as requested.
- Record and verify the required demo video (maximum 10 minutes total) and test all submitted links in an incognito window.
