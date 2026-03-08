'use client'

import { useEffect, useState } from 'react';

interface WeatherForecastProps {
  date: string;     // "YYYY-MM-DD"
  gameTime: string; // "HH:MM" 24h
}

interface HourData {
  hour: number;
  label: string;
  temp: number;
  cloud: number;
  precip: number;
  wind: number;
  gusts: number;
}

const LAT = 48.75;
const LNG = -122.48;

export default function WeatherForecast({ date, gameTime }: WeatherForecastProps) {
  const [hours, setHours] = useState<HourData[] | null>(null);

  useEffect(() => {
    // Only fetch for dates within ~16 days (Open-Meteo forecast range)
    const gameDate = new Date(`${date}T12:00:00`);
    const now = new Date();
    const diffDays = (gameDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < -1 || diffDays > 15) return;

    let cancelled = false;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&hourly=temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_gusts_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America/Los_Angeles&start_date=${date}&end_date=${date}`;

    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (cancelled) return;
        const h = data.hourly;
        if (!h?.time?.length) return;

        const [gh, gm] = gameTime.split(':').map(Number);
        const gameStartH = gh + gm / 60;
        // Show 1 hour before through 1 hour after (2hr game)
        const startH = Math.max(0, Math.floor(gameStartH) - 1);
        const endH = Math.min(23, Math.ceil(gameStartH + 2));

        const result: HourData[] = [];
        for (let i = startH; i <= endH; i++) {
          const ampm = i < 12 ? 'a' : 'p';
          const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i;
          result.push({
            hour: i,
            label: `${h12}${ampm}`,
            temp: Math.round(h.temperature_2m[i]),
            cloud: Math.round(h.cloud_cover[i]),
            precip: h.precipitation[i],
            wind: Math.round(h.wind_speed_10m[i]),
            gusts: Math.round(h.wind_gusts_10m[i]),
          });
        }
        setHours(result);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [date, gameTime]);

  if (!hours) return null;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="font-semibold text-gray-900 mb-3">
        Weather <span className="text-xs font-normal text-gray-400">Bellingham</span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-center">
          <thead>
            <tr className="text-xs text-gray-400">
              <th className="text-left font-normal pr-2"></th>
              {hours.map(h => (
                <th key={h.hour} className="font-normal px-1.5">{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-600">
            <tr>
              <td className="text-left text-xs text-gray-400 pr-2">Temp</td>
              {hours.map(h => (
                <td key={h.hour} className="px-1.5">{h.temp}°</td>
              ))}
            </tr>
            <tr>
              <td className="text-left text-xs text-gray-400 pr-2">Cloud</td>
              {hours.map(h => (
                <td key={h.hour} className="px-1.5">{h.cloud}%</td>
              ))}
            </tr>
            <tr>
              <td className="text-left text-xs text-gray-400 pr-2">Rain</td>
              {hours.map(h => (
                <td key={h.hour} className="px-1.5">
                  {h.precip > 0 ? `${h.precip.toFixed(2)}"` : '–'}
                </td>
              ))}
            </tr>
            <tr>
              <td className="text-left text-xs text-gray-400 pr-2">Wind</td>
              {hours.map(h => (
                <td key={h.hour} className="px-1.5">
                  {h.wind}
                  {h.gusts > h.wind + 5 && (
                    <span className="text-xs text-gray-400">g{h.gusts}</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">Wind in mph · Rain in inches/hr</p>
    </div>
  );
}
