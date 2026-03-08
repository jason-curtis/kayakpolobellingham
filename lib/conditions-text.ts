/**
 * Server-side conditions fetcher: tides + weather formatted as plain text
 * for game-on notification emails.
 */

const STATION_ID = "9449211"; // Bellingham, Bellingham Bay
const LAT = 48.75;
const LNG = -122.48;

interface HiLoPoint {
  t: string; // "YYYY-MM-DD HH:MM"
  v: string; // feet
  type: string; // "H" or "L"
}

interface HourlyWeather {
  hour: number;
  temp: number;
  cloud: number;
  precip: number;
  wind: number;
  gusts: number;
  windDir: number;
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
    const verb = delta > 0 ? "flooding" : "ebbing";
    return `Tide ${verb} ${startFt.toFixed(1)}ft → ${endFt.toFixed(1)}ft during game`;
  } catch {
    return null;
  }
}

/** Fetch weather from Open-Meteo for a given date. Returns text summary for game window. */
export async function fetchWeatherText(date: string, gameStartH: number): Promise<string | null> {
  const startH = Math.max(0, Math.floor(gameStartH));
  const endH = Math.min(23, Math.ceil(gameStartH + 2));

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&hourly=temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_gusts_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America/Los_Angeles&start_date=${date}&end_date=${date}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json() as {
      hourly?: {
        time: string[];
        temperature_2m: number[];
        cloud_cover: number[];
        precipitation: number[];
        wind_speed_10m: number[];
        wind_gusts_10m: number[];
        wind_direction_10m: number[];
      };
    };
    const h = data.hourly;
    if (!h?.time?.length) return null;

    // Average conditions during game window
    let tempSum = 0, cloudSum = 0, precipMax = 0;
    let windMax = 0, gustMax = 0, windDirAtMax = 0;
    let count = 0;

    for (let i = startH; i <= endH && i < h.time.length; i++) {
      tempSum += h.temperature_2m[i];
      cloudSum += h.cloud_cover[i];
      precipMax = Math.max(precipMax, h.precipitation[i]);
      if (h.wind_speed_10m[i] > windMax) {
        windMax = h.wind_speed_10m[i];
        windDirAtMax = h.wind_direction_10m[i];
      }
      gustMax = Math.max(gustMax, h.wind_gusts_10m[i]);
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
