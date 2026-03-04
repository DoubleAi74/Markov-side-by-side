# Codebase Overview

This is a **Next.js web app** that provides interactive tools for running stochastic (random process) simulations in the browser. Users can run simulations without an account, and optionally log in to save and reload their models.

---

## What It Does

The app offers three types of mathematical simulators:

| Simulator             | Page           | What it models                                             |
| --------------------- | -------------- | ---------------------------------------------------------- |
| **Gillespie**         | `/gillespie`   | Exact random events in a chemical/biological system (CTMC) |
| **Time-Varying CTMP** | `/ctmp-inhomo` | Same as Gillespie but rates can change over time           |
| **SDE Solver**        | `/sde`         | Stochastic differential equations (continuous noise)       |

All three share the same pattern: the user defines variables, parameters, and equations in a text-based editor, runs the simulation, and sees trajectories plotted on a chart.

---

## Tech Stack

| Layer            | Technology                                                 |
| ---------------- | ---------------------------------------------------------- |
| Framework        | Next.js 16 (App Router)                                    |
| UI               | React 19 + Tailwind CSS 4                                  |
| Icons            | Lucide React, FontAwesome                                  |
| Charts           | Chart.js + react-chartjs-2                                 |
| Database         | MongoDB (via Mongoose + native driver)                     |
| Auth             | Auth.js v5 (magic links + email/password)                  |
| Email            | Resend (for sending magic links and password reset emails) |
| Password hashing | bcryptjs (12 rounds)                                       |

---

## Folder Structure

```
stochastic-app-DB/
│
├── app/                    ← Pages and API routes (Next.js App Router)
│   ├── page.js             ← Home page (landing/simulator cards)
│   ├── layout.js           ← Root layout (wraps all pages, provides session)
│   ├── globals.css         ← Global Tailwind styles
│   │
│   ├── login/              ← Login/register page
│   ├── dashboard/          ← Saved simulations list (requires login)
│   ├── gillespie/          ← Gillespie simulator page
│   ├── ctmp-inhomo/        ← Time-varying CTMP simulator page
│   ├── sde/                ← SDE simulator page
│   ├── reset-password/     ← Password reset page
│   │
│   └── api/
│       ├── auth/
│       │   ├── [...nextauth]/  ← Auth.js handler (magic links, credentials)
│       │   ├── register/       ← POST: create password account
│       │   └── password-reset/
│       │       ├── request/    ← POST: send reset email
│       │       └── confirm/    ← POST: apply new password
│       └── saved-simulations/
│           ├── route.js        ← GET list, POST create
│           └── [id]/route.js   ← GET, PATCH update, DELETE
│
├── components/             ← React UI components
│   ├── Navbar.jsx          ← Top navigation bar
│   ├── auth/
│   │   ├── LoginForm.jsx       ← Tabbed login form (magic link or password)
│   │   └── PasswordResetForm.jsx
│   ├── dashboard/
│   │   └── SavedSimulationList.jsx  ← List, open, delete saved models
│   └── simulators/
│       ├── shared/
│       │   ├── ExpressionListSection.jsx  ← Reusable row editor (vars, params, etc.)
│       │   ├── SaveModelControls.jsx      ← Save / Update model panel
│       │   ├── SimChart.jsx               ← Chart.js wrapper
│       │   └── seriesColors.js            ← Color palette for chart lines
│       ├── gillespie/
│       │   ├── GillespieSimulator.jsx     ← Gillespie simulator UI
│       │   └── engine.js                  ← Gillespie algorithm
│       ├── ctmp-inhomo/
│       │   ├── CTMPInhomoSimulator.jsx    ← Time-varying CTMP UI
│       │   └── engine.js                  ← CTMP simulation engine
│       └── sde/
│           ├── SDESimulator.jsx           ← SDE simulator UI
│           └── engine.js                  ← Euler-Maruyama algorithm
│
├── lib/                    ← Business logic and utilities
│   ├── auth/
│   │   ├── credentials-service.js  ← Register/login with password
│   │   ├── users.js                ← Auth.js user operations
│   │   ├── passwords.js            ← Hash and verify passwords
│   │   ├── password-reset-service.js
│   │   └── redirects.js
│   ├── db/
│   │   ├── mongodb.js              ← MongoDB native client (singleton)
│   │   └── mongoose.js             ← Mongoose connection (singleton)
│   ├── saved-simulations/
│   │   ├── service.js              ← CRUD logic for saved models
│   │   ├── validators.js           ← Validate API payloads
│   │   └── serializers.js          ← Convert UI state ↔ API payload
│   ├── compile.js          ← Compiles user math expressions at runtime
│   └── modelParsers.js     ← Parses "name = value" text input into structured data
│
├── models/                 ← Mongoose database schemas
│   ├── SavedSimulation.js  ← A user's saved model
│   ├── UserCredential.js   ← Email/password login credentials
│   └── PasswordResetToken.js ← Temporary reset link tokens
│
├── auth.js                 ← Auth.js configuration (providers, callbacks)
├── next.config.mjs         ← Next.js configuration
├── package.json            ← Dependencies
└── .env.local              ← Environment variables (not in git)
```

---

## How Authentication Works

There are two ways to log in:

### 1. Magic Link (passwordless)

1. User enters their email on `/login`
2. Auth.js sends a one-time link via **Resend** email
3. User clicks the link → automatically signed in
4. A **JWT session** is created

### 2. Email + Password

1. User registers with email and password on `/login`
   - Password is bcrypt-hashed and stored in `UserCredential`
2. On login, the hash is compared with the entered password
3. A **JWT session** is created

### Password Reset

1. User requests reset at `/reset-password`
2. A random token is generated, SHA256-hashed, and stored in DB (expires in 1 hour)
3. Resend emails a link with the raw token
4. User submits new password → token is verified and deleted, password updated

### Sessions

- Sessions use **JWT** (not database sessions)
- The session includes `user.id` so the app can look up the user's data
- Accessible on the server via `auth()` from Auth.js

---

## Database Models

### `SavedSimulation`

Stores a user's saved simulator configuration.

```
userId          → who owns this model
simulatorType   → "gillespie" | "ctmp-inhomo" | "sde"
name            → display name (max 120 chars)
description     → optional notes (max 500 chars)
payload         → the full editor state (variables, params, equations, settings)
payloadVersion  → schema version number (for future migrations)
lastOpenedAt    → when the user last loaded this model
createdAt / updatedAt
```

### `UserCredential`

Stores optional password-login credentials, separate from Auth.js's own user record.

```
userId       → links to Auth.js user
email        → lowercase, unique
passwordHash → bcrypt hash
```

### `PasswordResetToken`

Short-lived token for password reset flow.

```
userId    → which user is resetting
email     → their email
tokenHash → SHA256 hash of the token sent in the email
expiresAt → 1 hour from creation (MongoDB TTL auto-deletes expired tokens)
```

---

## How the Simulators Work

All three simulators follow the same UX pattern:

1. **Define inputs** in the text-based editor
   - Variables (state, e.g. `A = 100`)
   - Parameters (constants or expressions, e.g. `k = 0.01`)
   - Reactions / components / transitions (the equations)
   - Settings (how long to run, how many simulations)

2. **Click Run** → the browser runs the algorithm entirely client-side (no server involved)

3. **See the chart** → multiple simulation trajectories are plotted

### Gillespie Algorithm (engine.js)

- Draws the time until the next event from an exponential distribution
- Picks which event fires based on relative rates
- Repeats until `tMax` is reached
- Produces exact sample paths of a CTMC

### CTMP Time-Varying (engine.js)

- Same idea as Gillespie but uses fixed time steps (dt)
- Rates are re-evaluated at each time step, so they can depend on `t`
- Supports "helper functions" (user-defined functions of time)

### SDE Euler-Maruyama (engine.js)

- Discretizes `dX = μ dt + σ dW` at each time step
- Brownian motion increments `dW` are drawn from `Normal(0, dt)`
- Each simulation run is one noisy trajectory

### Expression Compilation

- Users type math expressions like `k * A * B`
- `lib/compile.js` parses and evaluates these at runtime with the current variable values in scope
- `lib/modelParsers.js` parses `name = value` lines into structured objects

---

## How Model Saving Works

Saving is only available when logged in.

1. User builds a model in any simulator
2. Clicks **Save New** → enters a name
3. The current editor state is serialized (`lib/saved-simulations/serializers.js`) and validated
4. Sent to `POST /api/saved-simulations` → stored in MongoDB
5. The URL updates to `?model=<id>`
6. Later, clicking **Update** sends a `PATCH` request to save changes

**Loading a model:**

- Visiting `/gillespie?model=<id>` loads the saved payload
- The server fetches the model, deserializes it, and passes it as initial state to the simulator component

**Dashboard (`/dashboard`):**

- Lists all the user's saved models
- Filter by type
- Click "Open" to go to the simulator with that model loaded
- Click "Delete" to remove it

---

## API Routes

All routes require an authenticated session (except the auth endpoints themselves).

| Method | Route                              | What it does                                   |
| ------ | ---------------------------------- | ---------------------------------------------- |
| POST   | `/api/auth/register`               | Create a password account                      |
| POST   | `/api/auth/password-reset/request` | Send a password reset email                    |
| POST   | `/api/auth/password-reset/confirm` | Apply a new password using the reset token     |
| GET    | `/api/saved-simulations`           | List all the user's saved models               |
| POST   | `/api/saved-simulations`           | Save a new model                               |
| GET    | `/api/saved-simulations/:id`       | Fetch a single model                           |
| PATCH  | `/api/saved-simulations/:id`       | Update a model (name, description, or payload) |
| DELETE | `/api/saved-simulations/:id`       | Delete a model                                 |

---

## Environment Variables

These must be set in `.env.local` to run the app:

```bash
AUTH_SECRET=          # Random string used to sign JWTs
MONGODB_URI=          # MongoDB connection string
AUTH_RESEND_KEY=      # Resend API key (for sending emails)
AUTH_EMAIL_FROM=      # Sender address (must be verified in Resend)
AUTH_TRUST_HOST=true  # Required for local development

# Optional
AUTH_URL=             # Explicit base URL (falls back to request origin)
MONGODB_DB=           # MongoDB database name (uses default if omitted)
```

---

## Key Design Decisions

- **Simulations run entirely in the browser.** No backend compute needed; the engines are plain JavaScript.
- **Simulators work without login.** Anyone can use them — saving is the only gated feature.
- **Two database clients coexist.** Auth.js uses the native MongoDB driver for its own collections; app models use Mongoose. Both connect to the same database.
- **Strict payload validation** (`lib/saved-simulations/validators.js`) prevents bad data from being stored and gives clear error messages.
- **Payload versioning** (`payloadVersion`) allows the saved model schema to evolve over time without breaking old data.
- **Component-level state only.** No Redux or global state manager — each simulator manages its own state with `useState`. The Auth.js session is the only "global" state.
