# API reference

The API is served by FastAPI. Locally, run Uvicorn from `backend/` with `uvicorn app.main:app --reload --port 8000`. Interactive OpenAPI docs are at `/docs`.

## `GET /api/health`

Returns a simple process health response; it does not check Elexon connectivity.

```json
{"status":"ok","service":"windlens-api"}
```

## `GET /api/analysis`

Fetches the selected range from Elexon and returns actual rows joined to eligible forecasts.

### Query parameters

| Name | Type | Default | Constraints / meaning |
| --- | --- | --- | --- |
| `start_date` | Date (`YYYY-MM-DD`) | `2026-01-01` | Must be in January 2026 and no later than `end_date`. |
| `end_date` | Date (`YYYY-MM-DD`) | `2026-01-31` | Must be in January 2026 and no earlier than `start_date`. |
| `cutoff_hour` | Integer | `23` | Integer from 0 through 23. UK-local hour on the day before the delivery target date. Eligibility includes through `HH:59:59`. |

The UI offers cutoff choices 06, 09, 12, 15, 18, 21, and 23; the API accepts any integer 0–23.

### Example request

```bash
curl 'http://localhost:8000/api/analysis?start_date=2026-01-01&end_date=2026-01-02&cutoff_hour=23'
```

### Response shape

The following is a representative structural example; values are illustrative, not measured output:

```json
{
  "period": {
    "start_date": "2026-01-01",
    "end_date": "2026-01-02",
    "timezone": "Europe/London"
  },
  "forecast_selection": {
    "rule": "latest publishTime no later than the selected cutoff on the previous UK calendar day",
    "cutoff_hour_uk": 23
  },
  "source": "Elexon BMRS FUELHH and WINDFOR datasets",
  "record_counts": {
    "actual_rows": 96,
    "forecast_rows": 100,
    "actual_periods": 96,
    "matched_periods": 90
  },
  "metrics": {
    "matched_periods": 90,
    "mae_mw": 125.4,
    "rmse_mw": 180.2,
    "bias_mw": -12.3,
    "mape_percent": 4.8
  },
  "rows": [
    {
      "start_time": "2026-01-01T00:00:00+00:00",
      "actual_mw": 12000.0,
      "forecast_mw": 12100.0,
      "publish_time": "2025-12-31T12:00:00+00:00",
      "error_mw": 100.0
    },
    {
      "start_time": "2026-01-01T00:30:00+00:00",
      "actual_mw": 11800.0,
      "forecast_mw": null,
      "publish_time": null,
      "error_mw": null
    }
  ]
}
```

Actual response row and record counts depend on the live source. The numbers and sample metric values above only demonstrate types and structure.

### Response fields

- `period`: requested date range and the analysis timezone label.
- `forecast_selection`: policy description and selected cutoff hour.
- `source`: dataset names used.
- `record_counts.actual_rows` and `forecast_rows`: raw dictionary rows returned by each source request.
- `record_counts.actual_periods`: actual timestamps retained within the requested local date window.
- `record_counts.matched_periods`: rows with a non-null forecast.
- `metrics`: computed over rows with both actual and forecast values.
- `rows`: sorted actual timestamps. `forecast_mw`, `publish_time`, and `error_mw` are null when no forecast was matched. `error_mw` is forecast minus actual, in MW.

### Metrics

For matched periods, error is `forecast_mw - actual_mw`.

- `mae_mw`: mean of absolute errors.
- `rmse_mw`: square root of mean squared errors.
- `bias_mw`: mean signed error; positive means overforecasting.
- `mape_percent`: mean absolute percentage error, computed only for matched rows with nonzero actual generation. It is null when no eligible nonzero actuals exist.
- `matched_periods`: number of rows used for these metrics.

Metrics are rounded to two decimal places. If there are no matched rows, all four metric values are null and `matched_periods` is 0.

### Errors

| Status | Behavior |
| --- | --- |
| `400` | Reversed date range (`start_date` after `end_date`) or dates outside January 2026. The `detail` is a plain string explaining the constraint. |
| `422` | FastAPI query parsing/validation failure, such as malformed dates or `cutoff_hour` outside 0–23 / not an integer. FastAPI returns its validation detail structure. |
| `502` | Elexon HTTP error, timeout, or unexpected response shape caught by the handler. `detail` begins `Could not retrieve Elexon data:` and includes the exception text. |
| `500` | Other unhandled server exceptions use FastAPI's normal internal error response. |

