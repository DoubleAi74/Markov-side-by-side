# Markov Side-by-Side

Interactive stochastic simulation tools built with Next.js:

- CTMC Gillespie simulator
- time-varying CTMP simulator
- SDE solver with Euler-Maruyama

The app remains publicly usable without login. Authenticated users can now save simulator configurations to MongoDB and manage them from a dashboard.

## Stack

- Next.js 16 App Router
- React 19
- Tailwind CSS 4
- Chart.js
- Auth.js v5 beta (`next-auth@beta`)
- Resend email magic links
- MongoDB
- Mongoose

## Features

- Public simulator access for anonymous users
- Passwordless email login
- Optional email/password login
- JWT-backed Auth.js sessions
- User-owned saved simulations
- Dashboard for reopening and deleting saved models
- Route-level loading of saved models via `?model=<id>`

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env.local` with:

```bash
AUTH_SECRET=
MONGODB_URI=
AUTH_RESEND_KEY=
AUTH_EMAIL_FROM=
AUTH_TRUST_HOST=true
```

Optional:

```bash
AUTH_URL=
MONGODB_DB=
```

Notes:

- `AUTH_EMAIL_FROM` must be a sender address from a verified Resend domain in production.
- `MONGODB_URI` should point at the MongoDB database used for both Auth.js collections and app data.
- The app uses the MongoDB adapter for auth collections and Mongoose only for app-domain models.

## Development

Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Saved Simulation Model

The primary persisted app record is `SavedSimulation`.

Each record stores:

- owner `userId`
- simulator type
- human-readable model name
- payload version
- serialized simulator editor state

The app saves simulator definitions and settings, not raw simulation histories or chart traces.

## Main Routes

- `/` home page
- `/gillespie` exact CTMC simulator
- `/ctmp-inhomo` time-varying CTMP simulator
- `/sde` stochastic differential equation simulator
- `/login` email login page
- `/dashboard` saved simulations for the current user

## Auth Notes

- Auth is configured in [`auth.js`](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/stochastic-app-DB/auth.js).
- Auth route handler lives at [`app/api/auth/[...nextauth]/route.js`](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/stochastic-app-DB/app/api/auth/%5B...nextauth%5D/route.js).
- The project uses Auth.js JWT sessions while still keeping the MongoDB adapter for users and verification tokens.
- `session.user.id` is populated in the Auth.js session callback.

## Persistence Notes

- Native MongoDB client helper: [`lib/db/mongodb.js`](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/stochastic-app-DB/lib/db/mongodb.js)
- Mongoose connection helper: [`lib/db/mongoose.js`](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/stochastic-app-DB/lib/db/mongoose.js)
- Saved simulation model: [`models/SavedSimulation.js`](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/stochastic-app-DB/models/SavedSimulation.js)
- Saved simulation API routes:
  - [`app/api/saved-simulations/route.js`](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/stochastic-app-DB/app/api/saved-simulations/route.js)
  - [`app/api/saved-simulations/[id]/route.js`](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/stochastic-app-DB/app/api/saved-simulations/%5Bid%5D/route.js)

## Documentation

- Structure review: [`PROJECT_STRUCTURE_REVIEW.md`](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/stochastic-app-DB/PROJECT_STRUCTURE_REVIEW.md)
- Auth/database implementation spec: [`AUTH_MONGODB_UPGRADE_SPEC.md`](/Users/adamaldridge/Desktop/Projects%20A/Markob.sbs/stochastic-app-DB/AUTH_MONGODB_UPGRADE_SPEC.md)
