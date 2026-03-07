'use client'

import { useEffect, useState } from 'react';

interface TideChartProps {
  date: string;     // "YYYY-MM-DD"
  gameTime: string;  // "HH:MM" 24h
}

interface HiLoPoint {
  t: string; // "YYYY-MM-DD HH:MM"
  v: string; // feet
  type: string; // "H" or "L"
}

// ── Solar calculations for Bellingham, WA ─────────────────────────────────
const LAT = 48.75;
const LNG = -122.48;

function rad(d: number) { return d * Math.PI / 180; }
function deg(r: number) { return r * 180 / Math.PI; }

/** Get Pacific timezone UTC offset (hours) for a given date, e.g. -8 for PST, -7 for PDT */
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

/**
 * Calculate sunrise/sunset or twilight times.
 * altitude: 0 = horizon, -12 = nautical twilight
 * Returns { rise, set } as fractional hours in Pacific local time, or null.
 */
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

/** Parse "YYYY-MM-DD HH:MM" to fractional hours since midnight of target date */
function parseToHours(timeStr: string, targetDate: string): number {
  const [datePart, timePart] = timeStr.split(' ');
  const [h, m] = (timePart ?? '0:00').split(':').map(Number);
  // Handle points from adjacent days
  if (datePart < targetDate) {
    return h + m / 60 - 24;
  } else if (datePart > targetDate) {
    return h + m / 60 + 24;
  }
  return h + m / 60;
}

/** Generate smooth tide curve from hi/lo points using cosine interpolation */
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
      // Cosine interpolation: smooth transition between hi and lo
      const ft = p0.ft + (p1.ft - p0.ft) * (1 - Math.cos(Math.PI * frac)) / 2;
      if (t >= 0 && t <= 24) {
        result.push({ hour: t, ft });
      }
    }
  }
  // Add final point
  const last = hiloPoints[hiloPoints.length - 1];
  if (last.hour >= 0 && last.hour <= 24) {
    result.push({ hour: last.hour, ft: last.ft });
  }
  return result;
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

export default function TideChart({ date, gameTime }: TideChartProps) {
  const [points, setPoints] = useState<{ hour: number; ft: number }[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tides?date=${date}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (cancelled) return;
        const predictions: HiLoPoint[] = data.predictions ?? [];
        const requestedDate = data.requestedDate ?? date;

        // Convert all points to hours relative to target date
        const hiloPoints = predictions
          .map(p => ({
            hour: parseToHours(p.t, requestedDate),
            ft: parseFloat(p.v),
          }))
          .sort((a, b) => a.hour - b.hour);

        // Cosine-interpolate between hi/lo points
        const interpolated = interpolateTides(hiloPoints, 0.1);
        setPoints(interpolated);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [date]);

  if (error) return null;
  if (!points || points.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-3">Tides</h3>
        <p className="text-sm text-gray-400">Loading tides...</p>
      </div>
    );
  }

  const ftValues = points.map(p => p.ft);
  const minV = Math.floor(Math.min(...ftValues));
  const maxV = Math.ceil(Math.max(...ftValues));

  // Game window
  const [gh, gm] = gameTime.split(':').map(Number);
  const gameStartH = gh + gm / 60;
  const gameEndH = gameStartH + 2;

  // Twilight + sun
  const d = new Date(`${date}T12:00:00`);
  const twilight = sunTimes(d, LAT, LNG, -12);
  const sun = sunTimes(d, LAT, LNG, 0);

  // Build tide curve path
  const pathD = points.map((p, i) => {
    const x = timeToX(p.hour);
    const y = valToY(p.ft, minV, maxV);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Y-axis ticks at each foot
  const yTicks: number[] = [];
  for (let v = minV; v <= maxV; v++) yTicks.push(v);

  // X-axis labels
  const xLabels = [0, 3, 6, 9, 12, 15, 18, 21, 24];

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="font-semibold text-gray-900 mb-3">
        Tides <span className="text-xs font-normal text-gray-400">Bellingham Bay · ft MLLW</span>
      </h3>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" role="img" aria-label="Tide chart">
        {/* Night shading (nautical twilight) */}
        {twilight && (
          <>
            <rect
              x={MARGIN.left} y={MARGIN.top}
              width={Math.max(0, timeToX(twilight.rise) - MARGIN.left)} height={PLOT_H}
              fill="#1e293b" opacity="0.10"
            />
            <rect
              x={timeToX(twilight.set)} y={MARGIN.top}
              width={Math.max(0, MARGIN.left + PLOT_W - timeToX(twilight.set))} height={PLOT_H}
              fill="#1e293b" opacity="0.10"
            />
          </>
        )}

        {/* Twilight zones (between nautical twilight and sunrise/sunset) */}
        {twilight && sun && (
          <>
            <rect
              x={timeToX(twilight.rise)} y={MARGIN.top}
              width={Math.max(0, timeToX(sun.rise) - timeToX(twilight.rise))} height={PLOT_H}
              fill="#475569" opacity="0.06"
            />
            <rect
              x={timeToX(sun.set)} y={MARGIN.top}
              width={Math.max(0, timeToX(twilight.set) - timeToX(sun.set))} height={PLOT_H}
              fill="#475569" opacity="0.06"
            />
          </>
        )}

        {/* Y grid lines */}
        {yTicks.map(v => (
          <g key={v}>
            <line
              x1={MARGIN.left} y1={valToY(v, minV, maxV)}
              x2={MARGIN.left + PLOT_W} y2={valToY(v, minV, maxV)}
              stroke="#e5e7eb" strokeWidth="0.5"
            />
            <text
              x={MARGIN.left - 4} y={valToY(v, minV, maxV) + 3}
              textAnchor="end" fontSize="9" fill="#9ca3af"
            >{v}</text>
          </g>
        ))}

        {/* X axis labels */}
        {xLabels.map(h => (
          <text
            key={h}
            x={timeToX(h)} y={CHART_H - 4}
            textAnchor="middle" fontSize="9" fill="#9ca3af"
          >
            {h === 0 || h === 24 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}
          </text>
        ))}

        {/* Game window highlight */}
        <rect
          x={timeToX(gameStartH)} y={MARGIN.top}
          width={timeToX(Math.min(gameEndH, 24)) - timeToX(gameStartH)} height={PLOT_H}
          fill="#3b82f6" opacity="0.12" rx="2"
        />

        {/* Game start line */}
        <line
          x1={timeToX(gameStartH)} y1={MARGIN.top}
          x2={timeToX(gameStartH)} y2={MARGIN.top + PLOT_H}
          stroke="#3b82f6" strokeWidth="1.2" strokeDasharray="3,2"
        />
        <text
          x={timeToX(gameStartH) + 3} y={MARGIN.top + 10}
          fontSize="8" fill="#3b82f6" fontWeight="600"
        >Game</text>

        {/* Sunrise/sunset markers */}
        {sun && (
          <>
            <line
              x1={timeToX(sun.rise)} y1={MARGIN.top}
              x2={timeToX(sun.rise)} y2={MARGIN.top + PLOT_H}
              stroke="#f59e0b" strokeWidth="0.7" strokeDasharray="2,3"
            />
            <line
              x1={timeToX(sun.set)} y1={MARGIN.top}
              x2={timeToX(sun.set)} y2={MARGIN.top + PLOT_H}
              stroke="#f59e0b" strokeWidth="0.7" strokeDasharray="2,3"
            />
          </>
        )}

        {/* Tide fill */}
        <path
          d={`${pathD} L${timeToX(points[points.length - 1].hour).toFixed(1)},${valToY(minV, minV, maxV).toFixed(1)} L${timeToX(points[0].hour).toFixed(1)},${valToY(minV, minV, maxV).toFixed(1)} Z`}
          fill="#0ea5e9" opacity="0.06"
        />

        {/* Tide curve */}
        <path d={pathD} fill="none" stroke="#0ea5e9" strokeWidth="2" strokeLinejoin="round" />

        {/* Plot border */}
        <rect
          x={MARGIN.left} y={MARGIN.top}
          width={PLOT_W} height={PLOT_H}
          fill="none" stroke="#e5e7eb" strokeWidth="0.5"
        />
      </svg>
    </div>
  );
}
