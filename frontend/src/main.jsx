import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Download,
  Gauge,
  RefreshCw,
  Wind,
} from "lucide-react";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const fmt = (n, digits = 0) =>
  n == null
    ? "—"
    : Number(n).toLocaleString("en-GB", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });
const dateLabel = (value) =>
  new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });

function Metric({ label, value, unit, hint, icon: Icon, tone = "blue" }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${tone}`}>
          <Icon size={17} />
        </span>
      </div>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="metric-hint">{hint}</div>
    </article>
  );
}

function AccuracyPage({ data }) {
  const rows = (data?.rows || []).filter(
    (r) =>
      r.actual_mw != null &&
      r.forecast_mw != null &&
      Number.isFinite(Number(r.actual_mw)) &&
      Number.isFinite(Number(r.forecast_mw)),
  );

  const errors = rows.map((r) => ({
    ...r,
    error: Number(r.forecast_mw) - Number(r.actual_mw),
  }));

  const absError = (items) =>
    items.length
      ? items.reduce((sum, r) => sum + Math.abs(r.error), 0) / items.length
      : null;

  const rmse = (items) =>
    items.length
      ? Math.sqrt(
          items.reduce((sum, r) => sum + r.error ** 2, 0) / items.length,
        )
      : null;

  const bias = (items) =>
    items.length
      ? items.reduce((sum, r) => sum + r.error, 0) / items.length
      : null;

  const over = errors.filter((r) => r.error > 0).length;
  const under = errors.filter((r) => r.error < 0).length;
  const accurate = errors.filter((r) => r.error === 0).length;

  const daily = Object.values(
    errors.reduce((acc, r) => {
      const day = r.start_time.slice(0, 10);

      if (!acc[day]) acc[day] = { day, rows: [] };
      acc[day].rows.push(r);

      return acc;
    }, {}),
  )
    .map(({ day, rows: dayRows }) => ({
      day,
      periods: dayRows.length,
      mae: absError(dayRows),
      rmse: rmse(dayRows),
      bias: bias(dayRows),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const worstPeriods = [...errors]
    .sort((a, b) => Math.abs(b.error) - Math.abs(a.error))
    .slice(0, 10);

  const maxDailyMae = Math.max(1, ...daily.map((d) => d.mae ?? 0));

  const distribution = [
    { label: "Underforecast by 5,000+ MW", min: -Infinity, max: -5000 },
    { label: "Underforecast by 2,000–5,000 MW", min: -5000, max: -2000 },
    { label: "Underforecast by 0–2,000 MW", min: -2000, max: 0 },
    { label: "Overforecast by 0–2,000 MW", min: 0, max: 2000 },
    { label: "Overforecast by 2,000–5,000 MW", min: 2000, max: 5000 },
    { label: "Overforecast by 5,000+ MW", min: 5000, max: Infinity },
  ].map((bin) => ({
    ...bin,
    count: errors.filter((r) =>
      bin.min === -Infinity
        ? r.error <= bin.max
        : bin.max === Infinity
          ? r.error >= bin.min
          : r.error > bin.min && r.error <= bin.max,
    ).length,
  }));

  const maxBin = Math.max(1, ...distribution.map((b) => b.count));

  return (
    <>
      <section className="metrics-grid">
        <Metric
          label="Matched periods"
          value={fmt(errors.length)}
          unit=""
          hint="Actual and forecast values available"
          icon={CheckCircle2}
          tone="blue"
        />
        <Metric
          label="Mean absolute error"
          value={fmt(absError(errors))}
          unit="MW"
          hint="Average absolute forecast miss"
          icon={Activity}
          tone="purple"
        />
        <Metric
          label="Root mean square error"
          value={fmt(rmse(errors))}
          unit="MW"
          hint="Highlights larger misses"
          icon={Gauge}
          tone="amber"
        />
        <Metric
          label="Mean forecast bias"
          value={
            bias(errors) == null
              ? "—"
              : `${bias(errors) > 0 ? "+" : ""}${fmt(bias(errors))}`
          }
          unit="MW"
          hint={
            bias(errors) > 0
              ? "Net overforecast"
              : bias(errors) < 0
                ? "Net underforecast"
                : "No net directional bias"
          }
          icon={bias(errors) >= 0 ? ArrowUpRight : ArrowDownRight}
          tone="green"
        />
      </section>

      <section className="bottom-grid accuracy-panels">
        <article className="table-card">
          <div className="card-heading">
            <div>
              <h2>Forecast error distribution</h2>
              <p>Number of matched half-hour periods by error range</p>
            </div>
            <span className="small-tag">MW</span>
          </div>

          <div className="error-distribution">
            {distribution.map((bin) => (
              <div className="distribution-row" key={bin.label}>
                <div className="distribution-label">{bin.label}</div>
                <div className="distribution-track">
                  <div
                    className={`distribution-fill ${
                      bin.label.startsWith("Under") ? "under" : "over"
                    }`}
                    style={{
                      width: `${(bin.count / maxBin) * 100}%`,
                    }}
                  />
                </div>
                <strong>{fmt(bin.count)}</strong>
              </div>
            ))}
          </div>

          <div className="accuracy-summary">
            <div>
              <span className="summary-dot over-dot" />
              <strong>{fmt(over)}</strong>
              <span>overforecast periods</span>
            </div>
            <div>
              <span className="summary-dot under-dot" />
              <strong>{fmt(under)}</strong>
              <span>underforecast periods</span>
            </div>
            <div>
              <span className="summary-dot exact-dot" />
              <strong>{fmt(accurate)}</strong>
              <span>exact matches</span>
            </div>
          </div>
        </article>

        <article className="insight-card">
          <div className="insight-icon">
            <Activity size={18} />
          </div>
          <h2>Accuracy insights</h2>
          <p>
            These results show how far the eligible wind forecasts differed from
            actual generation during the selected period.
          </p>

          <div className="insight-row">
            <span className="insight-bullet blue" />
            <div>
              <strong>Overforecasting</strong>
              <span>
                Forecasts exceeded actual generation in {fmt(over)} matched
                periods.
              </span>
            </div>
          </div>

          <div className="insight-row">
            <span className="insight-bullet purple" />
            <div>
              <strong>Underforecasting</strong>
              <span>
                Forecasts were below actual generation in {fmt(under)} matched
                periods.
              </span>
            </div>
          </div>

          <div className="insight-row">
            <span className="insight-bullet green" />
            <div>
              <strong>Daily accuracy</strong>
              <span>
                The table shows which delivery days had the largest average
                absolute errors.
              </span>
            </div>
          </div>

          <div className="method-note">
            <strong>Forecast selection</strong>
            <span>
              {data?.forecast_selection?.rule ||
                "Latest eligible forecast before the decision cutoff."}
            </span>
          </div>
        </article>
      </section>

      <section className="table-card accuracy-table-card">
        <div className="card-heading">
          <div>
            <h2>Daily forecast accuracy</h2>
            <p>Compare forecast performance across delivery days</p>
          </div>
          <span className="small-tag">MW</span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Delivery day</th>
                <th>Matched periods</th>
                <th>MAE</th>
                <th>RMSE</th>
                <th>Bias</th>
                <th>Relative MAE</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.day}>
                  <td>
                    {new Date(`${d.day}T12:00:00Z`).toLocaleDateString(
                      "en-GB",
                      { day: "2-digit", month: "short", timeZone: "UTC" },
                    )}
                  </td>
                  <td>{fmt(d.periods)}</td>
                  <td>
                    <div className="daily-mae">
                      <span
                        style={{
                          width: `${((d.mae || 0) / maxDailyMae) * 100}%`,
                        }}
                      />
                      {fmt(d.mae)}
                    </div>
                  </td>
                  <td>{fmt(d.rmse)}</td>
                  <td
                    className={
                      d.bias > 0 ? "positive" : d.bias < 0 ? "negative" : ""
                    }
                  >
                    {d.bias > 0 ? "+" : ""}
                    {fmt(d.bias)}
                  </td>
                  <td>{fmt((d.mae / maxDailyMae) * 100)}% of max daily MAE</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!daily.length && (
            <div className="table-empty">No matched periods available.</div>
          )}
        </div>
      </section>

      <section className="table-card accuracy-table-card">
        <div className="card-heading">
          <div>
            <h2>Largest forecast misses</h2>
            <p>Periods ranked by absolute forecast error</p>
          </div>
          <span className="small-tag">TOP 10</span>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Delivery time</th>
                <th>Actual (MW)</th>
                <th>Forecast (MW)</th>
                <th>Error (MW)</th>
                <th>Direction</th>
              </tr>
            </thead>
            <tbody>
              {worstPeriods.map((r) => (
                <tr key={r.start_time}>
                  <td>{dateLabel(r.start_time)}</td>
                  <td>{fmt(r.actual_mw)}</td>
                  <td>{fmt(r.forecast_mw)}</td>
                  <td
                    className={
                      r.error > 0 ? "positive" : r.error < 0 ? "negative" : ""
                    }
                  >
                    {r.error > 0 ? "+" : ""}
                    {fmt(r.error)}
                  </td>
                  <td>
                    {r.error > 0
                      ? "Overforecast"
                      : r.error < 0
                        ? "Underforecast"
                        : "Exact"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!worstPeriods.length && (
            <div className="table-empty">No matched periods available.</div>
          )}
        </div>
      </section>

      <footer className="page-footer">
        <span>Source: Elexon BMRS · FUELHH and WINDFOR</span>
        <span>
          Daily metrics are calculated from matched half-hourly comparison rows.
        </span>
      </footer>
    </>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [start, setStart] = useState("2026-01-01");
  const [end, setEnd] = useState("2026-01-31");
  const [cutoff, setCutoff] = useState("23");
  const [selectedDay, setSelectedDay] = useState("all");
  const [activePage, setActivePage] = useState("overview");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        start_date: start,
        end_date: end,
        cutoff_hour: cutoff,
      });
      const response = await fetch(`${API}/api/analysis?${params}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `API returned ${response.status}`);
      }
      const json = await response.json();
      setData(json);

      console.log("WindLens API data:", json);
      console.log("Chart rows:", json?.rows?.length);
      console.log("First chart row:", json?.rows?.[0]);
    } catch (e) {
      setError(
        `${e.message}. Make sure the Python API is running, then retry.`,
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const chartRows = useMemo(() => {
    if (!data?.rows) return [];
    return data.rows
      .filter((r) => r.forecast_mw != null)
      .filter(
        (r) =>
          selectedDay === "all" || r.start_time.slice(0, 10) === selectedDay,
      )
      .map((r) => ({ ...r, time: dateLabel(r.start_time) }));
  }, [data, selectedDay]);
  const matchedCount = data?.metrics?.matched_periods ?? 0;
  const coverage = data?.record_counts?.actual_periods
    ? Math.round((matchedCount / data.record_counts.actual_periods) * 100)
    : 0;
  const days = [
    ...new Set((data?.rows || []).map((r) => r.start_time.slice(0, 10))),
  ];

  function exportCsv() {
    if (!data?.rows?.length) return;
    const cols = [
      "start_time",
      "actual_mw",
      "forecast_mw",
      "publish_time",
      "error_mw",
    ];
    const csv = [
      cols.join(","),
      ...data.rows.map((r) =>
        cols
          .map((k) =>
            r[k] == null ? "" : `"${String(r[k]).replaceAll('"', '""')}"`,
          )
          .join(","),
      ),
    ].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    );
    link.download = "windlens-january-2026.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Wind size={22} />
          </div>
          <span>
            wind<span className="brand-accent">lens</span>
          </span>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          <button
            className={`nav-item ${activePage === "overview" ? "active" : ""}`}
            onClick={() => setActivePage("overview")}
          >
            <Gauge size={18} />
            Overview
          </button>

          <button
            className={`nav-item ${activePage === "accuracy" ? "active" : ""}`}
            onClick={() => setActivePage("accuracy")}
          >
            <Activity size={18} />
            Forecast accuracy
          </button>

          <button
            className={`nav-item ${activePage === "history" ? "active" : ""}`}
            onClick={() => setActivePage("history")}
          >
            <CalendarDays size={18} />
            Historical data
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="status-dot" />
          <div>
            <strong>Data connection</strong>
            <span>Elexon BMRS API</span>
          </div>
        </div>
        <div className="sidebar-foot">PILOT ANALYTICS · V1.0</div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            Analytics <span>/</span> <strong>Wind generation</strong>
          </div>
          <div className="topbar-right">
            <span className="live-indicator">
              <i /> Historical analysis
            </span>
            <div className="avatar">UK</div>
          </div>
        </header>
        <section className="page-heading">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-line" /> UK POWER MARKET
            </div>
            <h1>Wind forecast intelligence</h1>
            <p>
              Understand forecast performance before day-ahead procurement
              decisions.
            </p>
          </div>
          <button
            className="secondary-button"
            onClick={exportCsv}
            disabled={!data?.rows?.length}
          >
            <Download size={16} /> Export data
          </button>
        </section>

        <section className="filter-bar">
          <div className="filter-title">
            <CalendarDays size={17} />
            <span>Analysis period</span>
          </div>
          <label>
            From
            <input
              type="date"
              value={start}
              min="2026-01-01"
              max="2026-01-31"
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={end}
              min="2026-01-01"
              max="2026-01-31"
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label>
            Decision cutoff
            <select value={cutoff} onChange={(e) => setCutoff(e.target.value)}>
              {["06", "09", "12", "15", "18", "21", "23"].map((h) => (
                <option key={h} value={h}>
                  {h}:59 UK time
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? "spin" : ""} />
            {loading ? "Loading" : "Run analysis"}
          </button>
        </section>

        {error && (
          <div className="error-banner">
            <strong>Couldn’t load the analysis.</strong>
            <span>{error}</span>
          </div>
        )}
        {loading && !data ? (
          <div className="loading-panel">
            <div className="loader" />
            <strong>Loading January wind data</strong>
            <span>
              Fetching actual generation and forecast publications from Elexon.
            </span>
          </div>
        ) : activePage === "accuracy" ? (
          <AccuracyPage data={data} />
        ) : (
          <>
            <section className="metrics-grid">
              <Metric
                label="Mean absolute error"
                value={fmt(data?.metrics?.mae_mw)}
                unit="MW"
                hint="Average absolute forecast miss"
                icon={Activity}
                tone="blue"
              />
              <Metric
                label="Root mean square error"
                value={fmt(data?.metrics?.rmse_mw)}
                unit="MW"
                hint="Penalises larger misses"
                icon={Gauge}
                tone="purple"
              />
              <Metric
                label="Forecast bias"
                value={
                  data?.metrics?.bias_mw == null
                    ? "—"
                    : `${data.metrics.bias_mw > 0 ? "+" : ""}${fmt(data.metrics.bias_mw)}`
                }
                unit="MW"
                hint={
                  data?.metrics?.bias_mw == null
                    ? "No matched periods"
                    : data.metrics.bias_mw > 0
                      ? "Forecasts tend to overpredict"
                      : data.metrics.bias_mw < 0
                        ? "Forecasts tend to underpredict"
                        : "No average directional bias"
                }
                icon={
                  data?.metrics?.bias_mw > 0 ? ArrowUpRight : ArrowDownRight
                }
                tone="green"
              />
              <Metric
                label="Matched coverage"
                value={fmt(coverage)}
                unit="%"
                hint={`${fmt(matchedCount)} of ${fmt(data?.record_counts?.actual_periods || 0)} actual periods`}
                icon={CheckCircle2}
                tone="amber"
              />
            </section>

            <section className="chart-card">
              <div className="card-heading">
                <div>
                  <h2>Actual vs forecast generation</h2>
                  <p>National wind generation · half-hourly · MW</p>
                </div>
                <div className="chart-legend">
                  <span>
                    <i className="legend-actual" /> Actual
                  </span>
                  <span>
                    <i className="legend-forecast" /> Forecast
                  </span>
                </div>
              </div>
              <div className="chart-controls">
                <label>
                  Delivery day{" "}
                  <div className="select-wrap">
                    <select
                      value={selectedDay}
                      onChange={(e) => setSelectedDay(e.target.value)}
                    >
                      <option value="all">All days</option>
                      {days.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} />
                  </div>
                </label>
                <span className="chart-note">
                  {chartRows.length.toLocaleString()} matched half-hour periods
                </span>
              </div>
              <div className="chart-area">
                {chartRows.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={chartRows}
                      margin={{ top: 10, right: 12, left: 0, bottom: 4 }}
                    >
                      <defs>
                        <linearGradient
                          id="actualFill"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#3187f6"
                            stopOpacity={0.19}
                          />
                          <stop
                            offset="95%"
                            stopColor="#3187f6"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>

                      <CartesianGrid
                        stroke="#e9eef5"
                        strokeDasharray="3 5"
                        vertical={false}
                      />

                      <XAxis
                        dataKey="time"
                        tick={{ fill: "#8b96a8", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={36}
                      />

                      <YAxis
                        tick={{ fill: "#8b96a8", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={58}
                        domain={[0, "auto"]}
                        tickFormatter={(value) =>
                          `${(value / 1000).toFixed(0)}k`
                        }
                      />

                      <Tooltip
                        contentStyle={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          boxShadow: "0 8px 30px #15243b12",
                        }}
                        labelStyle={{ color: "#334155", fontWeight: 700 }}
                        formatter={(value, name) => [
                          `${fmt(value)} MW`,
                          name === "actual_mw"
                            ? "Actual generation"
                            : "Forecast generation",
                        ]}
                      />

                      <Area
                        type="monotone"
                        dataKey="actual_mw"
                        name="actual_mw"
                        stroke="#3187f6"
                        strokeWidth={2}
                        fill="url(#actualFill)"
                        dot={false}
                        isAnimationActive={false}
                      />

                      <Line
                        type="monotone"
                        dataKey="forecast_mw"
                        name="forecast_mw"
                        stroke="#18b78b"
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 5 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-chart">
                    <Cloud size={28} />
                    <strong>No matched forecast data</strong>
                    <span>Try another cutoff or check the API response.</span>
                  </div>
                )}
              </div>
              <div className="chart-footer">
                <span>
                  <i className="tiny-dot blue-dot" /> Actual generation (MW)
                </span>
                <span>
                  <i className="tiny-dot green-dot" /> Latest eligible forecast
                  (MW)
                </span>
                <span className="footer-spacer" />
                <span>Timezone: Europe/London</span>
              </div>
            </section>

            <section className="bottom-grid">
              <article className="table-card">
                <div className="card-heading">
                  <div>
                    <h2>Forecast error by period</h2>
                    <p>Forecast minus actual · positive means overforecast</p>
                  </div>
                  <span className="small-tag">MW</span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Delivery time</th>
                        <th>Actual</th>
                        <th>Forecast</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartRows.slice(0, 8).map((r) => (
                        <tr key={r.start_time}>
                          <td>{dateLabel(r.start_time)}</td>
                          <td>{fmt(r.actual_mw)}</td>
                          <td>{fmt(r.forecast_mw)}</td>
                          <td>
                            <span
                              className={`error-value ${(r.error_mw || 0) > 0 ? "positive" : (r.error_mw || 0) < 0 ? "negative" : ""}`}
                            >
                              {r.error_mw > 0 ? "+" : ""}
                              {fmt(r.error_mw)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {chartRows.length === 0 && (
                    <div className="table-empty">No rows to display.</div>
                  )}
                </div>
              </article>
              <article className="insight-card">
                <div className="insight-icon">
                  <Activity size={18} />
                </div>
                <h2>How to read this analysis</h2>
                <p>
                  Forecast errors help quantify the uncertainty the procurement
                  team faces when estimating wind generation ahead of delivery.
                </p>
                <div className="insight-row">
                  <span className="insight-bullet blue" />
                  <div>
                    <strong>MAE</strong>
                    <span>Typical size of the forecast miss, in MW.</span>
                  </div>
                </div>
                <div className="insight-row">
                  <span className="insight-bullet purple" />
                  <div>
                    <strong>RMSE</strong>
                    <span>Places more weight on large forecast misses.</span>
                  </div>
                </div>
                <div className="insight-row">
                  <span className="insight-bullet green" />
                  <div>
                    <strong>Bias</strong>
                    <span>
                      Positive means forecasts are higher than actuals on
                      average.
                    </span>
                  </div>
                </div>
                <div className="method-note">
                  <strong>Selection method</strong>
                  <span>
                    {data?.forecast_selection?.rule ||
                      "Latest eligible publication before the decision cutoff."}
                  </span>
                </div>
              </article>
            </section>
            <footer className="page-footer">
              <span>Source: Elexon BMRS · FUELHH and WINDFOR</span>
              <span>
                Forecast publication cutoff is configurable; validate against
                the client's exact trading decision time.
              </span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
