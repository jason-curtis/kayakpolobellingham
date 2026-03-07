import { NextRequest, NextResponse } from "next/server";

const STATION_ID = "9449211"; // Bellingham, Bellingham Bay

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date param required (YYYY-MM-DD)" }, { status: 400 });
  }

  // Fetch day before, day of, and day after for smooth interpolation at boundaries
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

  const res = await fetch(url.toString());
  if (!res.ok) {
    return NextResponse.json({ error: "NOAA API error" }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json({ ...data, requestedDate: date }, {
    headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
  });
}
