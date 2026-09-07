# Agent Codebase Report

This report is meant to get another agent productive in this repo quickly, especially for:

- making targeted edits without re-mapping the whole app
- building partner projects that integrate with the current app
- understanding where state, persistence, auth, and public share URLs actually come from

## 1. Fast Mental Model

This is a single Next.js 16 App Router app that exposes three browser-side stochastic simulators:

- `/gillespie`: exact CTMC Gillespie simulator
- `/ctmp-inhomo`: fixed-step time-varying CTMP simulator
- `/sde`: Euler-Maruyama SDE simulator

Important architectural split:

- Simulation execution is client-side in React components and local engine files.
- Auth, saved-model persistence, username/slug routing, and preview-image uploads are server-side.
- Anonymous users can run simulations.
- Logged-in users can save models, manage them in `/dashboard`, and access them via `/-/:username/:slug`.

## 2. Tech Stack And Boundaries

- Framework: Next.js 16 App Router
- UI: React 19
- Styling: Tailwind CSS 4
- Charts: Chart.js with `react-chartjs-2` only indirectly; this app mostly uses Chart.js directly
- Auth: Auth.js v5 beta (`next-auth`)
- Database:
  - native MongoDB driver for Auth.js collections and username lookups
  - Mongoose for app-domain models
- Email: Resend
- Object storage: Cloudflare R2 for saved-model preview thumbnails
- Path alias: `@/*` maps to repo root via `jsconfig.json`

Current constraints:

- API routes explicitly run on `runtime = "nodejs"`.
- There is no test suite in the repo right now.
- `npm run lint` is the only built-in verification script.

## 3. Repo Shape

High-signal folders:

- `app/`
  - App Router pages and API routes
- `components/`
  - client UI, simulator editors, dashboard cards, navbar
- `lib/`
  - auth helpers, database connectors, saved-model services, expression parsing/compilation, preview generation, storage helpers
- `models/`
  - Mongoose schemas for app-owned records

Most important files by responsibility:

- `auth.js`
  - Auth.js config, providers, JWT/session callbacks
- `app/layout.js`
  - global shell, session lookup, navbar wiring
- `lib/saved-simulations/service.js`
  - main persistence layer for saved models and public lookup by username/slug
- `lib/saved-simulations/validators.js`
  - source of truth for request payload shapes
- `lib/saved-simulations/serializers.js`
  - client simulator state <-> stored payload shape
- `lib/auth/users.js`
  - username creation, uniqueness, lookup in Auth.js users collection
- `lib/compile.js`
  - user math expression compiler
- `lib/modelParsers.js`
  - parser for text-entry model definitions
- `components/simulators/*/*Simulator.jsx`
  - each simulator's real UI/state orchestration
- `components/simulators/*/engine.js`
  - actual numerical/stochastic stepping logic

## 4. Route Map

### Pages

- `/`
  - landing page with cards into the three simulators
- `/gillespie`
  - server wrapper that optionally loads a saved model from `?model=<id>`
- `/ctmp-inhomo`
  - same pattern for time-varying CTMP
- `/sde`
  - same pattern for SDE
- `/login`
  - login/signup UI; supports magic-link and password auth
- `/reset-password`
  - request-reset and confirm-reset UI depending on `?token=...`
- `/dashboard`
  - logged-in user's saved simulations
- `/-/[username]`
  - public saved-simulation list for a user; page is `noindex`
- `/-/[username]/[modelSlug]`
  - public saved-model page; renders the correct simulator with stored payload; page is `noindex`

### API Routes

- `GET /api/saved-simulations`
  - list current user's models
- `POST /api/saved-simulations`
  - create a new saved model
- `GET /api/saved-simulations/:id`
  - fetch one saved model owned by current user
- `PATCH /api/saved-simulations/:id`
  - update one saved model owned by current user
- `DELETE /api/saved-simulations/:id`
  - delete one saved model owned by current user
- `PUT /api/saved-simulations/:id/preview`
  - upload/update preview image for a saved model
- `GET /api/account/username`
  - fetch ensured username for current user
- `PATCH /api/account/username`
  - update username for current user
- `POST /api/auth/register`
  - create password credentials for an email
- `POST /api/auth/password-reset/request`
  - send reset link
- `POST /api/auth/password-reset/confirm`
  - consume reset token and set new password
- `/api/auth/[...nextauth]`
  - Auth.js handler

## 5. Data Model And Persistence

### SavedSimulation

`models/SavedSimulation.js` defines the main app record.

Core fields:

- `userId`
- `simulatorType`: `"gillespie" | "ctmp-inhomo" | "sde"`
- `name`
- `slug`
- `description`
- `payloadVersion`
- `payload`
- `preview`
- `lastOpenedAt`
- `createdAt`, `updatedAt`

Important indexes:

- `(userId, updatedAt)`
- `(userId, simulatorType, updatedAt)`
- unique partial index on `(userId, slug)`

### Auth Data Split

Auth-related data is split across two storage styles:

- Auth.js adapter collections in MongoDB native driver:
  - especially `users`
- Mongoose models for app-specific auth helpers:
  - `models/UserCredential.js`
  - `models/PasswordResetToken.js`

Important nuance:

- usernames live on the Auth.js `users` collection, not in a separate Mongoose model
- sessions use JWT strategy, so server session state is not stored as DB sessions

### Public URL Identity

Two independent slug systems exist:

- usernames: managed in `lib/auth/users.js`
- model slugs: managed in `lib/slugs.js` and enforced per user in `lib/saved-simulations/service.js`

Read operations can mutate data:

- ensuring a session user may backfill a missing username
- listing/loading saved simulations may backfill a missing model slug

That matters if a partner integration assumes reads are side-effect free.

## 6. Saved Payload Shapes

The validator in `lib/saved-simulations/validators.js` is the real contract.

Shared rules:

- `payloadVersion` is currently `1`
- max `numSims` is `200`
- update requests cannot change `userId` or `simulatorType`

### Gillespie payload

```json
{
  "varRows": [{ "text": "A = 100", "noteEnabled": false, "noteLabel": "" }],
  "paramRows": [{ "text": "k = 0.1", "noteEnabled": false, "noteLabel": "" }],
  "transitions": [
    {
      "rate": "k * A",
      "deltas": ["-1", "1"],
      "noteEnabled": false,
      "noteLabel": ""
    }
  ],
  "settings": { "tMax": 5, "numSims": 1 }
}
```

### CTMP-inhomo payload

Same as Gillespie, plus:

```json
{
  "helperRows": [{ "text": "Season(t) = 1 + A*sin(w*t)", "noteEnabled": false, "noteLabel": "" }],
  "settings": { "tMax": 7, "dt": 0.000002, "numSims": 1 }
}
```

### SDE payload

```json
{
  "paramRows": [{ "text": "a = 1.1", "noteEnabled": false, "noteLabel": "" }],
  "components": [
    {
      "name": "Prey",
      "init": 300,
      "drift": "a*Prey - b*Prey*Pred",
      "diff": "sigma_x * Prey",
      "noteEnabled": false,
      "noteLabel": ""
    }
  ],
  "settings": { "tMax": 20, "dt": 0.005, "numSims": 1 }
}
```

Serializer nuance:

- client editor rows/components contain ephemeral `id` fields for UI control
- those IDs are never persisted
- hydration recreates new client IDs when loading stored payloads

## 7. Runtime Flow

### Simulator page load

Server page files such as `app/gillespie/page.js` do this:

1. call `auth()`
2. build `sessionUser` via `buildSessionUser`
3. inspect `searchParams.model`
4. if `?model=` exists:
   - require login
   - load saved simulation by owner ID
   - verify simulator type matches route
   - redirect to `/-/:username/:slug` when possible
5. render the client simulator with `initialSavedSimulation`

### Save flow

`SaveModelControls.jsx` drives all saving:

1. build payload from simulator state via serializer
2. `POST /api/saved-simulations` for new saves
3. `PATCH /api/saved-simulations/:id` for updates
4. update browser URL:
   - prefer `/-/:username/:slug`
   - fallback to `?model=<id>`
5. optionally queue preview upload

Behavior nuance:

- `Save New` always creates a new record
- `Update` saves over the current record
- `Set Image` updates the current record and uploads a fresh preview image
- creating a model also attempts preview upload in the background

### Preview image flow

This is a separate async pipeline:

1. client enqueues job in `PreviewUploadProvider`
2. `lib/previews/chartPreview.js` renders Chart.js output to an offscreen canvas
3. preview is encoded as WebP or JPEG + blur placeholder
4. client sends base64 payload to `PUT /api/saved-simulations/:id/preview`
5. server uploads image to R2 via `lib/storage/r2.js`
6. saved model `preview` metadata is updated
7. UI listens for `saved-simulation-preview-updated` and patches local state

Failure nuance:

- save success does not depend on preview upload success
- missing R2 config breaks preview uploads, but not core model saving

### Public model flow

Public pages are rendered server-side from service helpers:

- `listPublicSavedSimulationsByUsername(username)`
- `getPublicSavedSimulationByUsernameAndSlug(username, slug)`

There is no public JSON API for these yet.

## 8. Simulator Architecture

All three simulator UIs follow the same pattern:

- local React state for editor rows/settings
- parser/compile step when user clicks Run
- client-only stochastic engine execution
- chart dataset generation for `SimChart`
- shared save controls at the bottom

Shared building blocks:

- `components/simulators/shared/ExpressionListSection.jsx`
  - row-based text editor used by variable/parameter/helper sections
- `components/simulators/shared/SimChart.jsx`
  - Chart.js wrapper
- `components/simulators/shared/SaveModelControls.jsx`
  - save/update/preview UI
- `components/simulators/shared/chartConfig.js`
  - reusable chart config and legend placeholder handling
- `components/simulators/shared/seriesColors.js`
  - palette helpers

Simulator-specific responsibilities:

- `components/simulators/gillespie/GillespieSimulator.jsx`
  - parses variables/params/transitions
  - builds `Transition` objects from rate + delta expressions
- `components/simulators/ctmp-inhomo/CTMPInhomoSimulator.jsx`
  - adds helper function rows and dt-based warning behavior
- `components/simulators/sde/SDESimulator.jsx`
  - uses structured component rows instead of transition rows

Engine files are intentionally small and isolated:

- `gillespie/engine.js`
- `ctmp-inhomo/engine.js`
- `sde/engine.js`

If an edit is numerical or algorithmic, start there.
If an edit is UX/state/save behavior, start in the `*Simulator.jsx` file.

## 9. Expression And Parser Layer

Two files are unusually central:

- `lib/modelParsers.js`
- `lib/compile.js`

`modelParsers.js` is where user-entered text becomes structured input:

- `name = number`
- `rate -> change`
- `Name(t) = expression`
- SDE `Variable = init | drift | diffusion`

`compile.js` turns user expressions into executable JS using `new Function()`.

Important caution:

- expressions are not sandboxed
- current design is tolerable only because execution happens client-side in the browser
- do not move expression execution server-side without redesigning the safety model

This is one of the biggest integration risks if a partner project wants to reuse the math layer on a server.

## 10. Auth And User Profile Flow

Auth providers configured in `auth.js`:

- `Credentials`
- `Resend`

Key auth behavior:

- Auth.js uses MongoDB adapter and JWT session strategy
- session callback populates `session.user.id` and `session.user.username`
- JWT callback ensures username existence by calling `ensureAuthUserUsername`

Password auth path:

- register via `/api/auth/register`
- credentials stored in `UserCredential`
- passwords hashed with bcryptjs, 12 rounds

Password reset path:

- request creates a hashed reset token in `PasswordResetToken`
- email is sent via direct `fetch()` to Resend API
- confirm route updates or creates `UserCredential`

Profile/username path:

- navbar settings menu calls `/api/account/username`
- dashboard and profile routes react to `account-username-updated` events

## 11. Best File To Edit By Task

### Add or change navigation or shell behavior

- `app/layout.js`
- `components/Navbar.jsx`
- `app/page.js`

### Change auth/login/signup/reset behavior

- `auth.js`
- `components/auth/LoginForm.jsx`
- `components/auth/PasswordResetForm.jsx`
- `lib/auth/credentials-service.js`
- `lib/auth/password-reset-service.js`
- `lib/auth/users.js`

### Change saved-model CRUD or storage shape

- `app/api/saved-simulations/*`
- `lib/saved-simulations/service.js`
- `lib/saved-simulations/validators.js`
- `lib/saved-simulations/serializers.js`
- `models/SavedSimulation.js`

### Change public URLs, usernames, slugs, or share pages

- `lib/slugs.js`
- `lib/auth/users.js`
- `app/-/[username]/page.js`
- `app/-/[username]/[modelSlug]/page.js`
- `components/dashboard/SavedSimulationList.jsx`

### Change chart thumbnails / image storage

- `components/providers/PreviewUploadProvider.jsx`
- `lib/previews/chartPreview.js`
- `app/api/saved-simulations/[id]/preview/route.js`
- `lib/storage/r2.js`
- `next.config.mjs`

### Change simulator input grammar or expression semantics

- `lib/modelParsers.js`
- `lib/compile.js`

### Change simulator math or numerical stepping

- `components/simulators/*/engine.js`

## 12. Integration Guidance For Partner Projects

### What exists today

Good existing integration surfaces:

- deep-link to simulator pages
- deep-link to user/model pages via `/-/:username/:slug`
- authenticated browser-session CRUD via existing API routes
- server-side reuse of persistence helpers from `lib/saved-simulations/service.js`

### What does not exist yet

Missing pieces for external partner apps:

- no API-key auth
- no OAuth-style delegated access
- no public JSON endpoint for public saved models
- no webhook/event system
- no stable versioned external API layer beyond current internal routes

### Recommended patterns

If the partner project is inside the same codebase or deployment boundary:

- reuse `lib/saved-simulations/service.js`
- reuse `validators.js` as the payload contract

If the partner project is external but only needs public read access:

- add read-only JSON endpoints backed by:
  - `listPublicSavedSimulationsByUsername`
  - `getPublicSavedSimulationByUsernameAndSlug`

If the partner project needs write access for user-owned models:

- add a dedicated external auth story first
- do not rely on scraping current browser-session endpoints

If the partner project wants to persist simulator payloads independently:

- mirror the exact payload shapes from `validators.js`
- preserve `payloadVersion`
- preserve `simulatorType`
- treat slugs and usernames as app-owned identifiers, not arbitrary strings

## 13. Environment Variables

Core app/auth:

- `AUTH_SECRET`
- `AUTH_URL`
- `AUTH_TRUST_HOST`
- `MONGODB_URI`
- `MONGODB_DB`
- `AUTH_RESEND_KEY`
- `AUTH_EMAIL_FROM`

Preview/R2 only:

- `R2_ENDPOINT` or `R2_ACCOUNT_ID`
- `R2_PUBLIC_BASE_URL`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PREVIEW_PREFIX` optional

Practical note:

- core simulation + auth + saved-model persistence can work without R2
- preview generation/upload cannot

## 14. Gotchas Worth Knowing Before Editing

- `compileExpression()` uses `new Function()` on user input.
- Read paths may backfill usernames/slugs in the database.
- Preview upload is async and can silently fail after the model itself saves.
- Public profile/model pages are `noindex`, so they are shareable but not intended for search indexing.
- The same MongoDB database is used for Auth.js collections and app data.
- The dashboard card list expects preview metadata shape from `service.js`, not raw Mongoose docs.
- Existing docs in the repo are helpful, but this report is more current for the username/slug/public-route structure.

## 15. Suggested Starting Points For Another Agent

For feature edits:

1. read this file
2. open the relevant simulator or service file from section 11
3. check `validators.js` and `serializers.js` before changing stored payload shape
4. check `app/-/*` and `lib/slugs.js` if a change affects URLs or sharing

For partner integrations:

1. decide whether the integration is public-read, authenticated-write, or internal-only
2. use section 12 to choose the right integration boundary
3. avoid reusing the expression compiler on a server without sandboxing

## 16. Existing Supplementary Docs

Useful companion docs already in the repo:

- `README.md`
- `CODEBASE.md`
- `INTEGRATION_SETUP_GUIDE.md`
- `AUTH_MONGODB_UPGRADE_SPEC.md`

This report is the quickest operational map.
