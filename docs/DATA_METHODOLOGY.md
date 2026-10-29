# Data methodology

## Source datasets and fields

WindLens requests the Elexon BMRS dataset stream endpoints:

- `FUELHH`: actual generation. The code retains rows where `fuelType`, uppercased, equals `WIND`. It reads `startTime` and `generation`.
- `WINDFOR`: forecast generation. It reads target `startTime`, publication timestamp `publishTime`, and `generation`.

The implementation converts `generation` to a floating point value and treats it as MW. Rows with invalid generation or required timestamps are skipped. The code does not validate all possible source fields, versions, quality flags, or revised records.

## Date range and timezone

The API accepts an inclusive `start_date` to `end_date` range only within January 1–31, 2026. The frontend inputs are also bounded to January. `FUELHH` is requested with `settlementDateFrom` and `settlementDateTo`; `WINDFOR` is requested by publication timestamp from midnight UTC on the day before the requested start through the end of the requested end date in UTC.

Timestamp strings are parsed with ISO-8601 handling. A trailing `Z` is normalized to a UTC offset. Naive timestamps are interpreted as UTC. Timestamps are converted to UTC instants for matching. The requested date window is constructed at midnight in `Europe/London`, converted to UTC, and applied as a half-open interval: start inclusive, midnight after end exclusive. The API reports `Europe/London`; browser labels are also formatted in this zone.

## Forecast cutoff and selection

For each forecast target `startTime`, the backend:

1. Converts the target to `Europe/London` to determine its delivery calendar date.
2. Builds a cutoff on the preceding UK calendar day at the selected hour, ending at minute 59, second 59.
3. Excludes a forecast if its `publishTime`, converted to UK time, is later than that cutoff.
4. Among the remaining forecasts for that target, keeps the greatest publication instant (`publishTime`).

The default `cutoff_hour` is 23, so the boundary is 23:59:59 UK local time on the prior calendar day. The API allows any integer from 0 to 23. The UI offers a subset of those hours. This is a calendar-day rule, not a rolling 24-hour lookback. The cutoff is an explicit modeling assumption and should be checked against the intended procurement decision time.

Forecasts are selected independently for each target timestamp. They are not selected as one publication batch covering the whole day. If multiple records have the same target and publication timestamp, the later encountered record replaces the earlier one due to dictionary assignment.

## Timestamp alignment and coverage

Actuals are normalized by their UTC `startTime`; repeated timestamp keys are overwritten by later rows in the source response. The backend walks retained actual timestamps within the requested date range. For each half-hour timestamp, it floors the UTC timestamp to the beginning of that hour and looks up the selected hourly WINDFOR forecast at that timestamp. Thus a given hourly forecast can be assigned to both half-hour actual periods in that hour.

There is no interpolation or half-hour forecast conversion. A forecast match requires the floored actual timestamp and the forecast target timestamp to have the same UTC instant. Actual rows with no match remain in the response with null forecast fields. The matched-period count is the number of actual output rows with a forecast; `coverage` displayed by the UI is:

```text
matched_periods / actual_periods * 100
```

where `actual_periods` counts the actual rows emitted for the requested date window. Missing actual periods are not synthesized and are not part of the denominator. If there are no actual rows, the UI displays 0% coverage.

## Metrics and interpretation

For each matched period, let `e = forecast_mw - actual_mw`, with both values in MW:

- **MAE (MW):** `mean(abs(e))`; average absolute forecast miss.
- **RMSE (MW):** `sqrt(mean(e²))`; gives more weight to larger misses.
- **Bias (MW):** `mean(e)`; positive means overforecasting and negative means underforecasting.
- **MAPE (%):** `mean(abs(e / actual_mw) * 100)` for matched periods where actual generation is nonzero. It is omitted from the current dashboard display but returned in the API.

The backend rounds metric outputs to two decimal places. Missing forecast rows do not contribute. If there are no matched rows, MAE, RMSE, bias, and MAPE are null and the matched count is zero. MAPE can be null when all matched actual values are zero.

## Assumptions and limitations

- The forecast cutoff is parameterized by hour, with all timestamps through `HH:59:59` included. This interpretation of an hour as its full 60-minute window comes directly from the implementation.
- `WINDFOR` forecasts are treated as hourly and mapped to two half-hourly actual periods. The code does not verify a forecast cadence before matching.
- Generation values are assumed comparable across datasets and both interpreted as MW; no unit conversion is performed.
- The matching key is the forecast target's UTC hour and actual timestamp's floored UTC hour. No tolerance window is used.
- The backend filters actuals by `fuelType == WIND`, but does not apply equivalent extra filtering by forecast fuel or other forecast fields.
- The result depends on the rows returned by the source endpoints. There is no local persistence, caching, imputation, retry, pagination, or deduplication policy beyond overwriting repeated normalized timestamp keys.
- No automated tests in the repository verify source schema assumptions, cutoff edge cases, or calculations.

