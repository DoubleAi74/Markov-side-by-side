# Accounts, Auth, and MongoDB Upgrade Specification

Reviewed and specified on: 2026-03-03

## Purpose

This document is the implementation specification for adding:

- user accounts
- passwordless email authentication
- MongoDB persistence
- user-owned saved simulator configurations

It is written so an AI coding agent can implement the upgrade without having to invent product scope, architecture, or data contracts.

## Product Goal

Keep the simulators publicly usable, but let authenticated users persist their work.

The upgraded application must support this flow:

1. Anonymous visitors can still use all three simulators without signing in.
2. A visitor can sign in with an email login link sent through Resend.
3. Once signed in, the user can save simulator configurations to MongoDB.
4. The user can see their saved configurations in a dashboard.
5. The user can reopen, update, and delete their saved configurations.

## Scope

In scope for this upgrade:

- Auth.js-based email login with Resend
- MongoDB for persistence
- Mongoose for application models
- Auth.js MongoDB adapter for auth collections
- a protected dashboard for saved simulations
- save/update/delete/load flows for all three simulators
- ownership checks on all persisted simulator data

Out of scope for this upgrade:

- OAuth providers
- usernames, passwords, or profile editing
- teams, orgs, or sharing between users
- public model links
- billing
- saving raw simulation result histories or chart traces
- rewriting the project to TypeScript
- large UI refactors unrelated to auth/persistence

## Critical Version Decision

This project currently uses Next.js 16 App Router and plain JavaScript.

Auth.js has two relevant tracks as of 2026-03-03:

- `next-auth` stable: `4.24.13`
- `next-auth` beta: `5.0.0-beta.30`

This specification intentionally targets the Auth.js v5 App Router pattern documented on `authjs.dev`, even though it is still published under the beta dist-tag.

Reason:

- the official modern Auth.js docs use the `auth.js` root config pattern
- the project is already App Router only
- the v5 pattern fits Next.js 16 better than the older Pages Router-oriented v4 structure

Implementation rule:

- use `next-auth@beta`
- do not mix this spec with v4-only patterns such as `pages/api/auth/[...nextauth].js`
- use `AUTH_*` environment variables, not `NEXTAUTH_*`

## Stack Choice

Use this stack:

- Next.js App Router
- Auth.js v5 beta via `next-auth@beta`
- `@auth/mongodb-adapter`
- `mongodb` native driver for the Auth.js adapter connection
- `mongoose` for application domain models
- Resend provider from `next-auth/providers/resend`

Optional only if a custom branded email sender is implemented:

- `resend`

## High-Level Architecture

Use one MongoDB database, but two access layers:

1. Auth.js adapter access
   - uses the native MongoDB driver
   - manages auth collections
   - does not use Mongoose

2. Application domain access
   - uses Mongoose
   - manages application collections such as saved simulator configurations

This separation is required.

Do not try to make Auth.js use Mongoose models.

## Primary Product Feature Added

The app will gain a new persisted domain object:

- `SavedSimulation`

This is the only new application collection required for the first version.

Each `SavedSimulation` belongs to exactly one authenticated user and stores:

- which simulator it belongs to
- a human-readable name
- the editor payload needed to reconstruct the simulator state
- timestamps

The app must persist only simulator definitions and run settings.

The app must not persist:

- generated chart datasets
- simulation event histories
- transient errors
- transient loading state
- UI-only row ids

## Public/Private Route Policy

Public routes:

- `/`
- `/gillespie`
- `/ctmp-inhomo`
- `/sde`
- `/login`

Protected routes:

- `/dashboard`
- `/api/saved-simulations`
- `/api/saved-simulations/[id]`

Auth route:

- `/api/auth/[...nextauth]`

Important Next.js 16 rule:

- do not add `middleware.js`
- if route guarding ever needs edge-style interception later, Next.js 16 uses `proxy.js`
- for this upgrade, do not use `proxy.js`
- enforce protection with `auth()` in server components and route handlers

## Dependency Specification

Install these runtime dependencies:

```bash
npm install next-auth@beta @auth/mongodb-adapter mongodb mongoose
```

Optional if custom email sending via the Resend SDK is implemented:

```bash
npm install resend
```

Do not add Prisma.

Do not add another auth framework.

Do not convert the repo to TypeScript as part of this upgrade.

## Environment Variables

Add these variables to `.env.local` and deployment secrets.

Required:

```bash
AUTH_SECRET=
MONGODB_URI=
AUTH_RESEND_KEY=
AUTH_EMAIL_FROM=
```

Optional:

```bash
AUTH_URL=
AUTH_TRUST_HOST=true
MONGODB_DB=
```

Environment variable meanings:

- `AUTH_SECRET`: Auth.js secret
- `MONGODB_URI`: MongoDB connection string
- `AUTH_RESEND_KEY`: Resend API key used by the Auth.js Resend provider
- `AUTH_EMAIL_FROM`: verified sender email, for example `login@yourdomain.com`
- `AUTH_URL`: explicit canonical app URL when needed
- `AUTH_TRUST_HOST`: useful behind proxies/platform hosts
- `MONGODB_DB`: optional explicit database name if not embedded in `MONGODB_URI`

Operational requirement:

- `AUTH_EMAIL_FROM` must be from a verified Resend domain in production

## File and Folder Changes

Add these files:

```text
auth.js
app/api/auth/[...nextauth]/route.js
app/api/saved-simulations/route.js
app/api/saved-simulations/[id]/route.js
app/login/page.js
app/dashboard/page.js
components/auth/LoginForm.jsx
components/dashboard/SavedSimulationList.jsx
components/simulators/shared/SaveModelControls.jsx
lib/db/mongodb.js
lib/db/mongoose.js
lib/saved-simulations/service.js
lib/saved-simulations/validators.js
lib/saved-simulations/serializers.js
models/SavedSimulation.js
```

Modify these existing files:

```text
app/layout.js
app/gillespie/page.js
app/ctmp-inhomo/page.js
app/sde/page.js
components/Navbar.jsx
components/simulators/gillespie/GillespieSimulator.jsx
components/simulators/ctmp-inhomo/CTMPInhomoSimulator.jsx
components/simulators/sde/SDESimulator.jsx
package.json
README.md
```

No `pages/` directory should be introduced.

## Authentication Specification

### Auth config location

Create a root-level `auth.js`.

It must export:

- `handlers`
- `auth`
- `signIn`
- `signOut`

Use the official Auth.js v5 root-config pattern.

### Provider

Configure only one provider initially:

- `Resend`

Use:

- `from: process.env.AUTH_EMAIL_FROM`

The provider should rely on the official Auth.js Resend integration.

For the first implementation:

- use the built-in provider behavior
- do not build a custom HTML email sender unless necessary

Custom email templates are optional, not required for MVP.

### Adapter

Use:

- `MongoDBAdapter(clientPromise, { databaseName })`

`clientPromise` must come from a cached native MongoDB client helper in `lib/db/mongodb.js`.

### Session strategy

Use JWT sessions, not database sessions.

Reason:

- logged-in route navigation is faster because session reads do not require a MongoDB lookup
- the app still keeps MongoDB for users, verification tokens, and saved simulations
- this app does not require strict server-side session revocation as a first-order concern

Set:

```js
session: { strategy: "jwt" }
```

### Session callback

The session object must include the authenticated user id.

Add `jwt` and `session` callbacks so server and client code can rely on:

```js
session.user.id
```

This is required for ownership-aware UI and service logic.

### Auth pages

Use a custom login page:

- `/login`

Behavior:

- if the user is already authenticated, redirect them to `/dashboard` or the incoming callback URL
- if the user submits an email, send a magic link with Auth.js + Resend
- after submit, show a "Check your email" state

No password fields.

No signup page.

Magic-link sign-in is the signup flow.

### Sign-in UX

Navbar behavior:

- signed out: show `Login`
- signed in: show `Dashboard` and `Logout`

Do not add avatars in this first version.

Showing the user email is acceptable.

## Database Connection Specification

### Native MongoDB helper

Create `lib/db/mongodb.js`.

Responsibilities:

- create a cached `MongoClient` connection
- reuse the connection in development during HMR
- export a `clientPromise`

This helper exists only for Auth.js adapter usage.

### Mongoose helper

Create `lib/db/mongoose.js`.

Responsibilities:

- create a cached Mongoose connection
- avoid multiple parallel connects during HMR
- export an async `connectToDatabase()` function

Rules:

- use `mongoose.connect()`
- cache the pending promise globally
- return the same resolved connection on repeat calls
- do not import this helper into client components

## Domain Model Specification

### Collection: `SavedSimulation`

Create one Mongoose model:

- `SavedSimulation`

This model must use timestamps.

Required top-level fields:

- `userId`
- `simulatorType`
- `name`
- `payloadVersion`
- `payload`

Optional top-level fields:

- `description`
- `lastOpenedAt`

Recommended schema:

```js
{
  userId: ObjectId,
  simulatorType: "gillespie" | "ctmp-inhomo" | "sde",
  name: string,
  description: string,
  payloadVersion: number,
  payload: object,
  lastOpenedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### Indexes

Add these indexes:

- `{ userId: 1, updatedAt: -1 }`
- `{ userId: 1, simulatorType: 1, updatedAt: -1 }`

Do not require globally unique names.

Users may save multiple similarly named models.

### Model naming rule

Use the model name `SavedSimulation`.

Do not use the generic name `Simulation`, because it is too broad and easy to confuse with runtime results.

### Mongoose hot-reload rule

To avoid `OverwriteModelError`, export the model with the standard cached pattern:

```js
export default mongoose.models.SavedSimulation || mongoose.model("SavedSimulation", schema);
```

## Persisted Payload Specification

Persist payloads without UI-only row ids.

Client components may regenerate ids after loading.

### Shared row shape

Use this persisted row shape where applicable:

```js
{
  text: string,
  noteEnabled: boolean,
  noteLabel: string
}
```

### Gillespie payload

```js
{
  varRows: Array<{ text, noteEnabled, noteLabel }>,
  paramRows: Array<{ text, noteEnabled, noteLabel }>,
  transitions: Array<{
    rate: string,
    deltas: string[],
    noteEnabled: boolean,
    noteLabel: string
  }>,
  settings: {
    tMax: number,
    numSims: number
  }
}
```

### CTMP inhomogeneous payload

```js
{
  varRows: Array<{ text, noteEnabled, noteLabel }>,
  paramRows: Array<{ text, noteEnabled, noteLabel }>,
  helperRows: Array<{ text, noteEnabled, noteLabel }>,
  transitions: Array<{
    rate: string,
    deltas: string[],
    noteEnabled: boolean,
    noteLabel: string
  }>,
  settings: {
    tMax: number,
    dt: number,
    numSims: number
  }
}
```

### SDE payload

```js
{
  paramRows: Array<{ text, noteEnabled, noteLabel }>,
  components: Array<{
    name: string,
    init: number,
    drift: string,
    diff: string,
    noteEnabled: boolean,
    noteLabel: string
  }>,
  settings: {
    tMax: number,
    dt: number,
    numSims: number
  }
}
```

### Payload version

Set:

```js
payloadVersion: 1
```

Every saved document must include this.

Future migrations should branch on `payloadVersion`.

## Validation Specification

Create `lib/saved-simulations/validators.js`.

This module must validate:

- request bodies for create/update
- simulator type
- payload shape by simulator type
- string lengths
- numeric settings

Required validation rules:

- `name`: required, trimmed, 1 to 120 chars
- `description`: optional, max 500 chars
- `simulatorType`: one of `gillespie`, `ctmp-inhomo`, `sde`
- `payloadVersion`: must equal `1`
- text fields: strings only
- row counts: reasonable hard cap, recommended max 100 rows per array
- transition counts: recommended max 100
- component counts: recommended max 100
- `tMax`, `dt`, `numSims`, `init`: finite numbers
- `numSims`: integer, min 1, max 200

Validation policy:

- reject malformed payloads with `400`
- do not trust any client-sent `userId`
- do not allow clients to write `createdAt`, `updatedAt`, or `lastOpenedAt` directly except where the server intentionally updates `lastOpenedAt`

## Service Layer Specification

Create `lib/saved-simulations/service.js`.

This module must be server-only and contain the business logic shared by route handlers and server pages.

Create these functions:

- `listSavedSimulationsForUser(userId, filters = {})`
- `getSavedSimulationForUser(id, userId)`
- `createSavedSimulationForUser(userId, input)`
- `updateSavedSimulationForUser(id, userId, input)`
- `deleteSavedSimulationForUser(id, userId)`

Rules:

- every function must call `connectToDatabase()`
- every query must scope by `userId`
- list results should be sorted by `updatedAt desc`
- return plain JSON-safe objects, not raw Mongoose documents

Recommended response mapping:

- convert `_id` to `id`
- remove `__v`

## API Route Specification

### `POST /api/saved-simulations`

Purpose:

- create a new saved simulation owned by the authenticated user

Auth:

- required

Body:

```json
{
  "name": "Seasonal predator-prey",
  "description": "",
  "simulatorType": "ctmp-inhomo",
  "payloadVersion": 1,
  "payload": { "...": "see payload schema" }
}
```

Response:

- `201` with created resource summary or full object

### `GET /api/saved-simulations`

Purpose:

- list the authenticated user's saved simulations

Auth:

- required

Query params:

- optional `simulatorType`

Response:

- array sorted by `updatedAt desc`

### `GET /api/saved-simulations/[id]`

Purpose:

- fetch a single saved simulation if owned by the current user

Auth:

- required

Response:

- `200` if found and owned
- `404` if missing or not owned

### `PATCH /api/saved-simulations/[id]`

Purpose:

- update an existing saved simulation if owned by the current user

Auth:

- required

Allowed mutable fields:

- `name`
- `description`
- `payload`
- `payloadVersion`

Disallowed:

- `userId`
- `simulatorType` should be treated as immutable after create

Response:

- `200` with updated object

### `DELETE /api/saved-simulations/[id]`

Purpose:

- delete an existing saved simulation if owned by the current user

Auth:

- required

Response:

- `204`

## Server Rendering Specification

### `app/layout.js`

Convert the root layout to an async server component if needed.

It must:

- call `auth()`
- pass a minimal `sessionUser` object into `Navbar`

Use a minimal serializable shape:

```js
{
  id,
  email,
  name
}
```

Do not pass the full session object unless necessary.

### Simulator route pages

Modify:

- `app/gillespie/page.js`
- `app/ctmp-inhomo/page.js`
- `app/sde/page.js`

These route files should become server components.

They must:

- call `auth()`
- read `searchParams.model`
- if no `model` param is present, render the simulator with `initialSavedSimulation = null`
- if `model` is present and the user is not authenticated, redirect to `/login` with a callback back to the same simulator URL
- if `model` is present and the user is authenticated, load the saved simulation from the service layer and pass it to the simulator
- if the model does not exist or is not owned by the user, return `notFound()`

This avoids a client-side fetch on first load and keeps ownership checks server-side.

### `app/dashboard/page.js`

This route must be protected.

It must:

- call `auth()`
- redirect unauthenticated users to `/login?callbackUrl=/dashboard`
- call `listSavedSimulationsForUser(session.user.id)`
- render the current user's saved simulations

## UI Specification

### Navbar

Add authenticated navigation state to `components/Navbar.jsx`.

Required behavior:

- signed out: show `Login`
- signed in: show `Dashboard` and `Logout`
- keep the current mobile menu behavior
- preserve existing route highlighting

### Login page

Create a custom login page that matches the app's existing visual language.

Required elements:

- email input
- submit button
- callback URL preservation
- pending state
- success state after link dispatch
- error state for invalid email or failed send

The page should explain that the user will receive a sign-in link by email.

### Dashboard page

Create a dashboard listing saved simulations.

Each item must show:

- model name
- simulator type
- updated timestamp
- open action
- delete action

Open action mapping:

- `gillespie` -> `/gillespie?model=<id>`
- `ctmp-inhomo` -> `/ctmp-inhomo?model=<id>`
- `sde` -> `/sde?model=<id>`

Delete must require confirmation.

### Simulator save controls

Create a shared `SaveModelControls.jsx` component and add it to all three simulator pages.

Required behavior:

- if signed out:
  - show a compact message like `Sign in to save this model`
  - include a link to `/login` with callback back to the current simulator URL

- if signed in:
  - show editable `Model name`
  - show `Save New`
  - show `Update` when editing an existing saved model
  - show success/error status inline

Optional:

- `Description` field can live only in the dashboard or be omitted from the first UI version

Recommendation:

- omit description from simulator pages in v1
- keep the save UI compact

### Loading behavior inside simulator pages

When a saved model is passed into a simulator component:

- populate the editor state from the saved payload
- set the active saved model id in local state
- set the model name field
- do not auto-run the simulation
- clear transient errors/stats/chart data after loading

## Serialization and Hydration Rules

Create `lib/saved-simulations/serializers.js`.

This module must contain per-simulator helpers.

Recommended functions:

- `serializeGillespieState(state)`
- `hydrateGillespiePayload(payload)`
- `serializeCTMPInhomoState(state)`
- `hydrateCTMPInhomoPayload(payload)`
- `serializeSDEState(state)`
- `hydrateSDEPayload(payload)`

Rules:

- strip UI-only ids on serialize
- regenerate ids on hydrate
- normalize missing optional arrays to sensible defaults
- parse numeric settings to numbers before save
- convert persisted numeric values back to input-friendly strings where required by the UI

## Existing Simulator Integration Rules

### Gillespie

Persist:

- variable rows
- parameter rows
- transitions
- `tMax`
- `numSims`

Do not persist:

- `running`
- `error`
- `stats`
- `chartDatasets`
- `chartXMax`

### CTMP Inhomogeneous

Persist:

- variable rows
- parameter rows
- helper rows
- transitions
- `tMax`
- `dt`
- `numSims`

Do not persist:

- `running`
- `error`
- `warning`
- `stats`
- `chartDatasets`
- `chartXMax`

### SDE

Persist:

- parameter rows
- components
- `tMax`
- `dt`
- `numSims`

Do not persist:

- `running`
- `error`
- `stats`
- `chartDatasets`
- `chartXMax`

## Authorization Rules

Hard rules:

- only authenticated users may create saved simulations
- only the owner may read a saved simulation
- only the owner may update a saved simulation
- only the owner may delete a saved simulation

Implementation rules:

- ownership checks must happen server-side
- never trust a client-sent `userId`
- never expose another user's saved simulation through guessable ids

If an authenticated user requests another user's model id:

- return `404`

## Error Handling Rules

For auth:

- invalid email input -> show inline form error
- email dispatch failure -> show inline error
- unauthenticated access to protected dashboard/API -> redirect or return `401`

For saved simulations:

- invalid request body -> `400`
- missing/foreign record -> `404`
- unexpected DB failure -> `500`

Client UI must show friendly inline errors.

Do not leak stack traces to the browser.

## Performance and Runtime Rules

- keep all MongoDB and Mongoose usage server-side
- do not import Mongoose models into client components
- do not fetch your own API routes from server components when a service function can be called directly
- use cached DB connections to avoid reconnect storms in dev
- keep route handlers on Node runtime
- do not mark auth or DB routes as Edge runtime

## Security Rules

- use `AUTH_SECRET`
- require email login only, no passwords
- use verified Resend sender domains in production
- never expose MongoDB credentials to the client
- store only minimal session data in the browser
- keep ownership enforcement on the server

Recommended but optional follow-up after MVP:

- rate-limit login requests by email/IP
- audit-log login-link sends

These are not blockers for the first implementation in this repo.

## Implementation Sequence

Implement in this order:

1. Add dependencies and environment variables.
2. Add `lib/db/mongodb.js` and `lib/db/mongoose.js`.
3. Add `auth.js` and `app/api/auth/[...nextauth]/route.js`.
4. Add the protected `/login` flow and navbar auth UI.
5. Add `models/SavedSimulation.js`.
6. Add validators, serializers, and service layer modules.
7. Add the saved-simulations route handlers.
8. Add `/dashboard`.
9. Convert the three simulator route pages to server components that can preload owned saved models.
10. Add `SaveModelControls.jsx`.
11. Integrate save/load/update behavior into each simulator component.
12. Update README with setup instructions and new feature documentation.

## Acceptance Criteria

The implementation is complete only when all of these are true:

- the app still builds and existing simulator functionality still works for signed-out users
- a user can request a magic link from `/login`
- a first-time sign-in creates the necessary auth records in MongoDB
- signed-in navbar state renders correctly
- `/dashboard` redirects guests to `/login`
- an authenticated user can save a new model from each of the three simulators
- an authenticated user can open a saved model from `/dashboard`
- opening a saved model restores the editor state but does not auto-run the simulation
- an authenticated user can update an existing saved model
- an authenticated user can delete a saved model
- one user cannot load or delete another user's saved model
- auth collections and app collections both persist correctly in MongoDB
- no client bundle imports Mongoose or server-only DB helpers

## Manual Test Plan

At minimum, verify:

1. Guest can visit `/`, `/gillespie`, `/ctmp-inhomo`, and `/sde`.
2. Guest clicking save CTA is sent to `/login` with callback preserved.
3. Submitting login form sends a Resend magic link.
4. Clicking the email link returns the user to the intended callback page.
5. Logged-in user can save from Gillespie, CTMP, and SDE pages.
6. Saved model appears on `/dashboard`.
7. Opening a dashboard item lands on the correct simulator and restores state.
8. Updating a saved model changes `updatedAt`.
9. Deleting a saved model removes it from `/dashboard`.
10. A second user cannot access the first user's `?model=<id>` URL.

## Deliberate Non-Requirements

Do not add these in the same implementation unless explicitly requested later:

- sharing/public visibility
- folders/tags
- autosave
- account deletion
- admin pages
- analytics
- saving rendered chart data
- running simulations on the server

## Source Notes for the Implementing Agent

This spec was aligned to the current official docs and package state as of 2026-03-03:

- Auth.js environment variables: [authjs.dev/reference/nextjs#environment-variable-inference](https://authjs.dev/reference/nextjs#environment-variable-inference)
- Auth.js Resend provider: [authjs.dev/getting-started/providers/resend](https://authjs.dev/getting-started/providers/resend)
- Auth.js MongoDB adapter: [authjs.dev/getting-started/adapters/mongodb](https://authjs.dev/getting-started/adapters/mongodb)
- Next.js `middleware` to `proxy` rename: [nextjs.org/docs/app/api-reference/file-conventions/middleware](https://nextjs.org/docs/app/api-reference/file-conventions/middleware)

Package versions checked from npm on 2026-03-03:

- `next-auth` latest: `4.24.13`
- `next-auth` beta: `5.0.0-beta.30`
- `@auth/mongodb-adapter`: `3.11.1`
- `mongoose`: `9.2.3`
- `mongodb`: `7.1.0`
- `resend`: `6.9.3`
