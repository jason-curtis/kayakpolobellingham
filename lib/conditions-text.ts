/**
 * Server-side conditions fetcher: tides + weather formatted as plain text
 * for game-on notification emails.
 */

const STATION_ID = "9449211"; // Bellingham, Bellingham Bay
const NWS_GRIDPOINT = "https://api.weather.gov/gridpoints/SEW/131,123";
const NWS_UA = "kayakpolobellingham";

interface HiLoPoint {
  t: string; // "YYYY-MM-DD HH:MM"
  v: string; // feet
  type: string; // "H" or "L"
}

interface NwsTimeValue {
  validTime: string; // "2026-03-11T00:00:00+00:00/PT6H"
  value: number;
}

interface NwsSeries {
  uom: string;
  values: NwsTimeValue[];
}

const COMPASS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
] as const;

export function degreesToCompass(deg: number): string {
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return COMPASS[idx];
}

function parseToHours(timeStr: string, targetDate: string): number {
  const [datePart, timePart] = timeStr.split(" ");
  const [h, m] = (timePart ?? "0:00").split(":").map(Number);
  if (datePart < targetDate) return h + m / 60 - 24;
  if (datePart > targetDate) return h + m / 60 + 24;
  return h + m / 60;
}

function interpolateTideAtHour(
  hiloPoints: { hour: number; ft: number }[],
  targetHour: number,
): number | null {
  for (let i = 0; i < hiloPoints.length - 1; i++) {
    const a = hiloPoints[i], b = hiloPoints[i + 1];
    if (a.hour <= targetHour && b.hour >= targetHour) {
      const duration = b.hour - a.hour;
      if (duration <= 0) continue;
      const frac = (targetHour - a.hour) / duration;
      // Cosine interpolation for tide curves
      return a.ft + (b.ft - a.ft) * (1 - Math.cos(Math.PI * frac)) / 2;
    }
  }
  return null;
}

export interface ConditionsText {
  tides: string | null;
  weather: string | null;
}

/** Fetch tides from NOAA for a given date. Returns text summary for game window. */
export async function fetchTideText(date: string, gameStartH: number, gameEndH: number): Promise<string | null> {
  const d = new Date(`${date}T12:00:00Z`);
  const prev = new Date(d.getTime() - 86400000);
  const next = new Date(d.getTime() + 86400000);
  const fmt = (dt: Date) => dt.toISOString().slice(0, 10).replace(/-/g, "");

  const url = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  url.searchParams.set("begin_date", fmt(prev));
  url.searchParams.set("end_date", fmt(next));
  url.searchParams.set("station", STATION_ID);
  url.searchParams.set("product", "predictions");
  url.searchParams.set("datum", "MLLW");
  url.searchParams.set("units", "english");
  url.searchParams.set("time_zone", "lst_ldt");
  url.searchParams.set("interval", "hilo");
  url.searchParams.set("format", "json");
  url.searchParams.set("application", "kayakpolo");

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json() as { predictions?: HiLoPoint[] };
    const predictions = data.predictions ?? [];
    if (predictions.length < 2) return null;

    const hiloPoints = predictions
      .map(p => ({ hour: parseToHours(p.t, date), ft: parseFloat(p.v) }))
      .sort((a, b) => a.hour - b.hour);

    const startFt = interpolateTideAtHour(hiloPoints, gameStartH);
    const endFt = interpolateTideAtHour(hiloPoints, gameEndH);
    if (startFt == null || endFt == null) return null;

    const delta = endFt - startFt;
    const absDelta = Math.abs(delta);
    if (absDelta < 0.75) {
      const avg = (startFt + endFt) / 2;
      return `Tide steady ~${avg.toFixed(1)}ft during game`;
    }
    const verb = delta > 0 ? "flooding" : "ebbing";
    return `Tide ${verb} ${startFt.toFixed(1)}ft → ${endFt.toFixed(1)}ft during game`;
  } catch {
    return null;
  }
}

/**
 * Expand NWS interval time-series to a map of local hour → value for a target date.
 * NWS times are UTC with ISO 8601 durations (e.g. "2026-03-11T00:00:00+00:00/PT6H").
 * PDT offset is hardcoded to -7 (Pacific Daylight); PST would be -8. Good enough for
 * Bellingham game forecasts which are always within the DST/standard transition window.
 */
function expandNwsSeries(
  series: NwsTimeValue[],
  targetDate: string,
  utcOffsetH: number,
): Map<number, number> {
  const hourly = new Map<number, number>();
  for (const entry of series) {
    const [timePart, durPart] = entry.validTime.split("/");
    const startUtc = new Date(timePart).getTime();
    const hours = parseInt(durPart.replace("PT", "").replace("H", ""), 10) || 1;
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

/**
 * Expand NWS precip series to hourly rate (in/hr) for a target date.
 * NWS quantitativePrecipitation is cumulative mm over the interval,
 * so divide by interval hours and convert mm→in.
 */
function expandNwsPrecip(
  series: NwsTimeValue[],
  targetDate: string,
  utcOffsetH: number,
): Map<number, number> {
  const hourly = new Map<number, number>();
  const MM_TO_IN = 0.0393701;
  for (const entry of series) {
    const [timePart, durPart] = entry.validTime.split("/");
    const startUtc = new Date(timePart).getTime();
    const hours = parseInt(durPart.replace("PT", "").replace("H", ""), 10) || 1;
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

/** Get Pacific timezone UTC offset for a date (-7 PDT or -8 PST). */
function getPacificOffset(date: string): number {
  const d = new Date(`${date}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "longOffset",
  }).formatToParts(d);
  const tz = parts.find(p => p.type === "timeZoneName");
  const m = tz?.value?.match(/GMT([+-]\d{2})/);
  return m ? parseInt(m[1], 10) : -8;
}

/** Fetch weather from NWS for a given date. Returns text summary for game window. */
export async function fetchWeatherText(date: string, gameStartH: number): Promise<string | null> {
  const startH = Math.max(0, Math.floor(gameStartH));
  const endH = Math.min(23, Math.floor(gameStartH + 2));
  const utcOffset = getPacificOffset(date);

  try {
    const res = await fetch(NWS_GRIDPOINT, {
      headers: { "User-Agent": NWS_UA },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      properties: {
        temperature: NwsSeries;
        skyCover: NwsSeries;
        quantitativePrecipitation: NwsSeries;
        windSpeed: NwsSeries;
        windGust: NwsSeries;
        windDirection: NwsSeries;
      };
    };
    const p = data.properties;

    const temps = expandNwsSeries(p.temperature.values, date, utcOffset);
    const sky = expandNwsSeries(p.skyCover.values, date, utcOffset);
    const precip = expandNwsPrecip(p.quantitativePrecipitation.values, date, utcOffset);
    const winds = expandNwsSeries(p.windSpeed.values, date, utcOffset);
    const gusts = expandNwsSeries(p.windGust.values, date, utcOffset);
    const windDirs = expandNwsSeries(p.windDirection.values, date, utcOffset);

    let tempSum = 0, cloudSum = 0, precipMax = 0;
    let windMax = 0, gustMax = 0, windDirAtMax = 0;
    let count = 0;

    for (let i = startH; i <= endH; i++) {
      const t = temps.get(i);
      if (t == null) continue;
      tempSum += t * 9 / 5 + 32; // °C → °F
      cloudSum += sky.get(i) ?? 0;
      precipMax = Math.max(precipMax, precip.get(i) ?? 0);
      const w = (winds.get(i) ?? 0) * 0.621371; // km/h → mph
      const g = (gusts.get(i) ?? 0) * 0.621371;
      if (w > windMax) {
        windMax = w;
        windDirAtMax = windDirs.get(i) ?? 0;
      }
      gustMax = Math.max(gustMax, g);
      count++;
    }

    if (count === 0) return null;

    const avgTemp = Math.round(tempSum / count);
    const avgCloud = Math.round(cloudSum / count);
    const compassDir = degreesToCompass(windDirAtMax);
    const windStr = Math.round(windMax);
    const gustStr = Math.round(gustMax);

    const parts: string[] = [];
    parts.push(`${avgTemp}°F`);

    if (avgCloud < 20) parts.push("clear skies");
    else if (avgCloud < 50) parts.push("partly cloudy");
    else if (avgCloud < 80) parts.push("mostly cloudy");
    else parts.push("overcast");

    if (precipMax > 0.01) parts.push(`rain ${precipMax.toFixed(2)} in/hr`);

    let windText = `wind ${compassDir} ${windStr}mph`;
    if (gustMax > windMax + 5) windText += ` gusts ${gustStr}`;
    parts.push(windText);

    return parts.join(", ");
  } catch {
    return null;
  }
}

/** Fetch both tides and weather, return formatted text block. */
export async function fetchConditionsText(
  date: string,
  gameTime: string,
): Promise<string> {
  const [gh, gm] = gameTime.split(":").map(Number);
  const gameStartH = gh + gm / 60;
  const gameEndH = gameStartH + 2;

  const [tides, weather] = await Promise.all([
    fetchTideText(date, gameStartH, gameEndH),
    fetchWeatherText(date, gameStartH),
  ]);

  const lines: string[] = [];
  if (tides) lines.push(tides);
  if (weather) lines.push(weather);

  return lines.length > 0 ? lines.join("\n") : "Conditions unavailable";
}
