'use client'

import { useEffect, useState } from 'react';

interface ConditionsCardProps {
  date: string;     // "YYYY-MM-DD"
  gameTime: string; // "HH:MM" 24h
}

interface HiLoPoint {
  t: string; // "YYYY-MM-DD HH:MM"
  v: string; // feet
  type: string; // "H" or "L"
}

interface HourWeather {
  hour: number;
  label: string;
  temp: number;
  cloud: number;
  precip: number;
  wind: number;
  gusts: number;
  windDir: number; // degrees, direction wind is coming FROM
}

// NWS API types
interface NwsTimeValue {
  validTime: string;
  value: number;
}

const NWS_GRIDPOINT = 'https://api.weather.gov/gridpoints/SEW/131,123';
const MM_TO_IN = 0.0393701;
const KMH_TO_MPH = 0.621371;

/** Expand NWS interval time-series to a map of local hour → value for a target date. */
function expandNwsSeries(
  values: NwsTimeValue[],
  targetDate: string,
  utcOffsetH: number,
): Map<number, number> {
  const hourly = new Map<number, number>();
  for (const entry of values) {
    const [timePart, durPart] = entry.validTime.split('/');
    const startUtc = new Date(timePart).getTime();
    const hours = parseInt(durPart.replace('PT', '').replace('H', ''), 10) || 1;
    for (let h = 0; h < hours; h++) {
      const localMs = startUtc + h * 3600000 + utcOffsetH * 3600000;
      const local = new Date(localMs);
      const localDate = local.toISOString().slice(0, 10);
      if (localDate === targetDate) {
        hourly.set(local.getUTCHours(), entry.value);
      }
    }
  }
  return hourly;
}

/** Expand NWS precip to hourly rate (in/hr). Cumulative mm over interval → divide by hours, convert. */
function expandNwsPrecip(
  values: NwsTimeValue[],
  targetDate: string,
  utcOffsetH: number,
): Map<number, number> {
  const hourly = new Map<number, number>();
  for (const entry of values) {
    const [timePart, durPart] = entry.validTime.split('/');
    const startUtc = new Date(timePart).getTime();
    const hours = parseInt(durPart.replace('PT', '').replace('H', ''), 10) || 1;
    const rateInPerHr = (entry.value * MM_TO_IN) / hours;
    for (let h = 0; h < hours; h++) {
      const localMs = startUtc + h * 3600000 + utcOffsetH * 3600000;
      const local = new Date(localMs);
      const localDate = local.toISOString().slice(0, 10);
      if (localDate === targetDate) {
        hourly.set(local.getUTCHours(), rateInPerHr);
      }
    }
  }
  return hourly;
}

// ── Solar calculations for Bellingham, WA ─────────────────────────────────
const LAT = 48.75;
const LNG = -122.48;

function rad(d: number) { return d * Math.PI / 180; }
function deg(r: number) { return r * 180 / Math.PI; }

function getPacificOffset(date: Date): number {
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T12:00:00Z`;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(iso));
  const tz = parts.find(p => p.type === 'timeZoneName');
  const m = tz?.value?.match(/GMT([+-]\d{2}):(\d{2})/);
  if (m) return parseInt(m[1]);
  return -8;
}

function sunTimes(date: Date, lat: number, lng: number, altitude: number): { rise: number; set: number } | null {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const n1 = Math.floor(275 * month / 9);
  const n2 = Math.floor((month + 9) / 12);
  const n3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);
  const N = n1 - n2 * n3 + day - 30;
  const lngHour = lng / 15;

  function fullCalc(approxT: number, isRise: boolean): number | null {
    const M = 0.9856 * approxT - 3.289;
    let L = M + 1.916 * Math.sin(rad(M)) + 0.020 * Math.sin(rad(2 * M)) + 282.634;
    L = ((L % 360) + 360) % 360;

    let RA = deg(Math.atan(0.91764 * Math.tan(rad(L))));
    RA = ((RA % 360) + 360) % 360;
    RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;

    const sinDec = 0.39782 * Math.sin(rad(L));
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(rad(90 - altitude)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
    if (cosH > 1 || cosH < -1) return null;

    let H = deg(Math.acos(cosH));
    if (isRise) H = 360 - H;
    H = H / 15;

    const T = H + RA - 0.06571 * approxT - 6.622;
    let UT = T - lngHour;
    return ((UT % 24) + 24) % 24;
  }

  const riseUT = fullCalc(N + (6 - lngHour) / 24, true);
  const setUT = fullCalc(N + (18 - lngHour) / 24, false);
  if (riseUT === null || setUT === null) return null;

  const offset = getPacificOffset(date);
  return {
    rise: ((riseUT + offset) % 24 + 24) % 24,
    set: ((setUT + offset) % 24 + 24) % 24,
  };
}

// ── Cosine interpolation between hi/lo points ────────────────────────────

function parseToHours(timeStr: string, targetDate: string): number {
  const [datePart, timePart] = timeStr.split(' ');
  const [h, m] = (timePart ?? '0:00').split(':').map(Number);
  if (datePart < targetDate) return h + m / 60 - 24;
  if (datePart > targetDate) return h + m / 60 + 24;
  return h + m / 60;
}

function interpolateTides(hiloPoints: { hour: number; ft: number }[], step: number = 0.1): { hour: number; ft: number }[] {
  if (hiloPoints.length < 2) return [];
  const result: { hour: number; ft: number }[] = [];
  for (let i = 0; i < hiloPoints.length - 1; i++) {
    const p0 = hiloPoints[i];
    const p1 = hiloPoints[i + 1];
    const duration = p1.hour - p0.hour;
    if (duration <= 0) continue;
    for (let t = p0.hour; t < p1.hour; t += step) {
      const frac = (t - p0.hour) / duration;
      const ft = p0.ft + (p1.ft - p0.ft) * (1 - Math.cos(Math.PI * frac)) / 2;
      if (t >= 0 && t <= 24) result.push({ hour: t, ft });
    }
  }
  const last = hiloPoints[hiloPoints.length - 1];
  if (last.hour >= 0 && last.hour <= 24) result.push({ hour: last.hour, ft: last.ft });
  return result;
}

// ── Wind arrow (points in the direction wind blows TO) ────────────────────

function WindArrow({ dir, size = 18 }: { dir: number; size?: number }) {
  // dir = meteorological degrees (direction wind comes FROM)
  // Add 180° so arrow points the direction wind is going (conventional display)
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <g transform={`rotate(${dir + 180}, 10, 10)`}>
        {/* Staff */}
        <line x1="10" y1="3" x2="10" y2="17" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
        {/* Arrowhead */}
        <polygon points="10,3 7,8 13,8" fill="#6b7280" />
      </g>
    </svg>
  );
}

// ── Chart constants ──────────────────────────────────────────────────────

const CHART_W = 600;
const CHART_H = 160;
const MARGIN = { top: 10, right: 15, bottom: 22, left: 32 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;

function timeToX(hours: number): number {
  return MARGIN.left + (hours / 24) * PLOT_W;
}

function valToY(val: number, minV: number, maxV: number): number {
  return MARGIN.top + PLOT_H - ((val - minV) / (maxV - minV)) * PLOT_H;
}

export default function ConditionsCard({ date, gameTime }: ConditionsCardProps) {
  const [tidePoints, setTidePoints] = useState<{ hour: number; ft: number }[] | null>(null);
  const [tideError, setTideError] = useState(false);
  const [weather, setWeather] = useState<HourWeather[] | null>(null);

  // Game window
  const [gh, gm] = gameTime.split(':').map(Number);
  const gameStartH = gh + gm / 60;
  const gameEndH = gameStartH + 2;

  // Fetch tides
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tides?date=${date}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (cancelled) return;
        const predictions: HiLoPoint[] = data.predictions ?? [];
        const requestedDate = data.requestedDate ?? date;
        const hiloPoints = predictions
          .map(p => ({ hour: parseToHours(p.t, requestedDate), ft: parseFloat(p.v) }))
          .sort((a, b) => a.hour - b.hour);
        setTidePoints(interpolateTides(hiloPoints, 0.1));
      })
      .catch(() => { if (!cancelled) setTideError(true); });
    return () => { cancelled = true; };
  }, [date]);

  // Fetch weather from NWS (only for near-future games)
  useEffect(() => {
    const gameDate = new Date(`${date}T12:00:00`);
    const now = new Date();
    const diffDays = (gameDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < -1 || diffDays > 7) return;

    let cancelled = false;
    const utcOffset = getPacificOffset(gameDate);

    fetch(NWS_GRIDPOINT, { headers: { 'User-Agent': 'kayakpolobellingham' } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (cancelled) return;
        const p = data.properties;

        const temps = expandNwsSeries(p.temperature.values, date, utcOffset);
        const sky = expandNwsSeries(p.skyCover.values, date, utcOffset);
        const precip = expandNwsPrecip(p.quantitativePrecipitation.values, date, utcOffset);
        const winds = expandNwsSeries(p.windSpeed.values, date, utcOffset);
        const gustData = expandNwsSeries(p.windGust.values, date, utcOffset);
        const windDirs = expandNwsSeries(p.windDirection.values, date, utcOffset);

        const startH = Math.max(0, Math.floor(gameStartH) - 1);
        const endH = Math.min(23, Math.ceil(gameStartH + 2));

        const result: HourWeather[] = [];
        for (let i = startH; i <= endH; i++) {
          if (!temps.has(i)) continue;
          const ampm = i < 12 ? 'a' : 'p';
          const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i;
          result.push({
            hour: i,
            label: `${h12}${ampm}`,
            temp: Math.round((temps.get(i)! * 9 / 5) + 32),
            cloud: Math.round(sky.get(i) ?? 0),
            precip: precip.get(i) ?? 0,
            wind: Math.round((winds.get(i) ?? 0) * KMH_TO_MPH),
            gusts: Math.round((gustData.get(i) ?? 0) * KMH_TO_MPH),
            windDir: Math.round(windDirs.get(i) ?? 0),
          });
        }
        setWeather(result);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [date, gameTime, gameStartH]);

  // Nothing to show
  if (tideError && !weather) return null;

  // Solar
  const d = new Date(`${date}T12:00:00`);
  const twilight = sunTimes(d, LAT, LNG, -12);
  const sun = sunTimes(d, LAT, LNG, 0);

  // Tide delta during game
  let tideDelta: number | null = null;
  if (tidePoints && tidePoints.length > 1) {
    function tideAtHour(h: number): number | null {
      for (let i = 0; i < tidePoints!.length - 1; i++) {
        const a = tidePoints![i], b = tidePoints![i + 1];
        if (a.hour <= h && b.hour >= h) {
          const t = (h - a.hour) / (b.hour - a.hour);
          return a.ft + t * (b.ft - a.ft);
        }
      }
      return null;
    }
    const s = tideAtHour(gameStartH);
    const e = tideAtHour(gameEndH);
    if (s != null && e != null) tideDelta = e - s;
  }

  // Tide chart SVG data
  const hasTides = tidePoints && tidePoints.length > 0;
  let pathD = '';
  let minV = 0, maxV = 1, yTicks: number[] = [];
  if (hasTides) {
    const ftValues = tidePoints.map(p => p.ft);
    minV = Math.floor(Math.min(...ftValues));
    maxV = Math.ceil(Math.max(...ftValues));
    pathD = tidePoints.map((p, i) => {
      const x = timeToX(p.hour);
      const y = valToY(p.ft, minV, maxV);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    for (let v = minV; v <= maxV; v++) yTicks.push(v);
  }

  const xLabels = [0, 3, 6, 9, 12, 15, 18, 21, 24];

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="font-semibold text-gray-900 mb-3">
        Conditions <span className="text-xs font-normal text-gray-400">Bellingham Bay</span>
      </h3>

      {/* ── Tide chart ── */}
      {hasTides && (
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" role="img" aria-label="Tide chart">
          {/* Night shading (nautical twilight) */}
          {twilight && (
            <>
              <rect x={MARGIN.left} y={MARGIN.top}
                width={Math.max(0, timeToX(twilight.rise) - MARGIN.left)} height={PLOT_H}
                fill="#1e293b" opacity="0.10" />
              <rect x={timeToX(twilight.set)} y={MARGIN.top}
                width={Math.max(0, MARGIN.left + PLOT_W - timeToX(twilight.set))} height={PLOT_H}
                fill="#1e293b" opacity="0.10" />
            </>
          )}
          {/* Twilight zones */}
          {twilight && sun && (
            <>
              <rect x={timeToX(twilight.rise)} y={MARGIN.top}
                width={Math.max(0, timeToX(sun.rise) - timeToX(twilight.rise))} height={PLOT_H}
                fill="#475569" opacity="0.06" />
              <rect x={timeToX(sun.set)} y={MARGIN.top}
                width={Math.max(0, timeToX(twilight.set) - timeToX(sun.set))} height={PLOT_H}
                fill="#475569" opacity="0.06" />
            </>
          )}
          {/* Y grid lines */}
          {yTicks.map(v => (
            <g key={v}>
              <line x1={MARGIN.left} y1={valToY(v, minV, maxV)}
                x2={MARGIN.left + PLOT_W} y2={valToY(v, minV, maxV)}
                stroke="#e5e7eb" strokeWidth="0.5" />
              <text x={MARGIN.left - 4} y={valToY(v, minV, maxV) + 3}
                textAnchor="end" fontSize="9" fill="#9ca3af">{v}</text>
            </g>
          ))}
          {/* X axis labels */}
          {xLabels.map(h => (
            <text key={h} x={timeToX(h)} y={CHART_H - 4}
              textAnchor="middle" fontSize="9" fill="#9ca3af">
              {h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}
            </text>
          ))}
          {/* Game window */}
          <rect x={timeToX(gameStartH)} y={MARGIN.top}
            width={timeToX(Math.min(gameEndH, 24)) - timeToX(gameStartH)} height={PLOT_H}
            fill="#3b82f6" opacity="0.12" rx="2" />
          <line x1={timeToX(gameStartH)} y1={MARGIN.top}
            x2={timeToX(gameStartH)} y2={MARGIN.top + PLOT_H}
            stroke="#3b82f6" strokeWidth="1.2" strokeDasharray="3,2" />
          <text x={timeToX(gameStartH) + 3} y={MARGIN.top + 10}
            fontSize="8" fill="#3b82f6" fontWeight="600">Game</text>
          {/* Sunrise/sunset */}
          {sun && (
            <>
              <line x1={timeToX(sun.rise)} y1={MARGIN.top}
                x2={timeToX(sun.rise)} y2={MARGIN.top + PLOT_H}
                stroke="#f59e0b" strokeWidth="0.7" strokeDasharray="2,3" />
              <line x1={timeToX(sun.set)} y1={MARGIN.top}
                x2={timeToX(sun.set)} y2={MARGIN.top + PLOT_H}
                stroke="#f59e0b" strokeWidth="0.7" strokeDasharray="2,3" />
            </>
          )}
          {/* Tide fill */}
          <path
            d={`${pathD} L${timeToX(tidePoints[tidePoints.length - 1].hour).toFixed(1)},${valToY(minV, minV, maxV).toFixed(1)} L${timeToX(tidePoints[0].hour).toFixed(1)},${valToY(minV, minV, maxV).toFixed(1)} Z`}
            fill="#0ea5e9" opacity="0.06" />
          {/* Tide curve */}
          <path d={pathD} fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinejoin="round" />
          {/* Plot border */}
          <rect x={MARGIN.left} y={MARGIN.top} width={PLOT_W} height={PLOT_H}
            fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
        </svg>
      )}

      {/* ── Legend + links ── */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ background: '#1e293b', opacity: 0.15 }} />
            Nautical twilight
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5" style={{ background: '#f59e0b' }} />
            Sunrise / sunset
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ background: '#3b82f6', opacity: 0.18 }} />
            Game
          </span>
        </div>
        <a
          href={`https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=9449211&legacy=1&type=hi-lo&datum=MLLW&units=english&beginDate=${date.replace(/-/g, '')}`}
          target="_blank" rel="noopener noreferrer"
          className="text-xs text-blue-500 hover:underline"
        >NOAA tides</a>
      </div>

      {/* ── Tide summary ── */}
      {tideDelta != null && tidePoints && tidePoints.length > 1 && (() => {
        function tideAtHourSummary(h: number): number | null {
          for (let i = 0; i < tidePoints!.length - 1; i++) {
            const a = tidePoints![i], b = tidePoints![i + 1];
            if (a.hour <= h && b.hour >= h) {
              const t = (h - a.hour) / (b.hour - a.hour);
              return a.ft + t * (b.ft - a.ft);
            }
          }
          return null;
        }
        const startFt = tideAtHourSummary(gameStartH);
        const endFt = tideAtHourSummary(gameEndH);
        if (startFt == null || endFt == null) return null;
        const absDelta = Math.abs(tideDelta);
        if (absDelta < 0.75) {
          const avg = (startFt + endFt) / 2;
          return (
            <p className="text-sm text-gray-500 mt-1">
              Tide steady ~{avg.toFixed(1)}ft during game
            </p>
          );
        }
        const verb = tideDelta > 0 ? 'flooding' : 'ebbing';
        return (
          <p className="text-sm text-gray-500 mt-1">
            Tide {verb} {startFt.toFixed(1)}ft → {endFt.toFixed(1)}ft during game
          </p>
        );
      })()}

      {/* ── Weather table ── */}
      {weather && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm text-center">
            <thead>
              <tr className="text-xs text-gray-400">
                <th className="text-left font-normal pr-2"></th>
                {weather.map(h => (
                  <th key={h.hour} className="font-normal px-1.5">{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr>
                <td className="text-left text-xs text-gray-400 pr-2">Temp</td>
                {weather.map(h => (
                  <td key={h.hour} className="px-1.5">{h.temp}°</td>
                ))}
              </tr>
              <tr>
                <td className="text-left text-xs text-gray-400 pr-2">Cloud</td>
                {weather.map(h => (
                  <td key={h.hour} className="px-1.5">{h.cloud}%</td>
                ))}
              </tr>
              <tr>
                <td className="text-left text-xs text-gray-400 pr-2">Rain</td>
                {weather.map(h => (
                  <td key={h.hour} className="px-1.5">
                    {h.precip > 0 ? `${h.precip.toFixed(2)}"` : '–'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="text-left text-xs text-gray-400 pr-2">Wind</td>
                {weather.map(h => (
                  <td key={h.hour} className="px-1.5">
                    <div className="flex flex-col items-center gap-0.5">
                      <WindArrow dir={h.windDir} size={16} />
                      <span>
                        {h.wind}
                        {h.gusts > h.wind + 5 && (
                          <span className="text-xs text-gray-400">g{h.gusts}</span>
                        )}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-1">Wind in mph · Rain in inches/hr · Arrows show direction wind blows</p>
        </div>
      )}
    </div>
  );
}
