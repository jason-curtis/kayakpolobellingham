# Kayak Polo Bellingham - Signup Tracker

A web app for managing weekly kayak polo game signups with deadline enforcement and attendance tracking.

## Features

- **Public Signup**: Players can quickly sign "in" or "out" for games
- **Deadline Enforcement**: Signups close the day before at 6pm
- **Game Threshold**: Games require 6+ signups to happen
- **Regulars List**: See who's signed up at a glance
- **Admin Portal**: Manage games and player info
- **Browser Storage**: Remembers your name for quick signups
- **Cloudflare Deployment**: Free-tier compatible (Workers + D1)

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Admin Login

Default password: `changeme` (change in production!)

Visit [http://localhost:3000/admin](http://localhost:3000/admin)

## Deployment

Deploys automatically when you push to `main`. Cloudflare picks up the push via GitHub integration — **never run `wrangler deploy` manually**.

### Initial Setup (one-time)

```bash
wrangler d1 create kayakpolo
```

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **Backend**: Cloudflare Workers (serverless)
- **Database**: D1 (SQLite, free tier)
- **Auth**: Simple password + browser storage

## Future Enhancements

- [ ] Google Auth for admin
- [ ] Email integration with groups.io
- [ ] Attendance analytics & flakiness tracking
- [ ] Game history and trends
- [ ] Automated game schedule updates
