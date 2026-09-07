# Agent Instructions: Build the Next.js Template

## Mission

You are building a Next.js application template from scratch. Your specification is in `TEMPLATE_PRD.md` in the same directory as this file. Read it in full before you do anything else.

The output is a complete, runnable codebase in a new directory called `nextjs-template/` located alongside this file. When finished, a developer should be able to `cd nextjs-template && npm install && npm run dev` and have a working application.

---

## Before You Start

1. **Read `TEMPLATE_PRD.md` in full.** Understand every section before writing a single file.
2. **Read this file in full.** The build order and loop structure are important — do not skip ahead.
3. **Do not invent features.** If something is not in the PRD, do not add it. Keep every file minimal. Comments only where logic is non-obvious.
4. **Do not use TypeScript.** Plain JavaScript throughout, matching the PRD spec.
5. **Check the target directory.** If `nextjs-template/` already exists and contains files, read what is there before writing. Do not blindly overwrite in-progress work.

---

## Build Order

Work through these phases in sequence. **Complete each phase fully before starting the next.** This order respects dependency chains — later phases import from earlier ones.

### Phase 1 — Project Scaffolding
Create the project skeleton. No application logic yet.

- `nextjs-template/package.json` — dependencies as specified in PRD (next, react, react-dom, auth.js / next-auth@beta, mongoose, mongodb, bcryptjs, resend, tailwindcss)
- `nextjs-template/next.config.mjs` — minimal config
- `nextjs-template/postcss.config.mjs` — Tailwind PostCSS setup
- `nextjs-template/jsconfig.json` — path aliases (`@/*` → `./*`)
- `nextjs-template/.env.local.example` — every variable from the PRD's env section, with comments explaining each one
- `nextjs-template/app/globals.css` — Tailwind base directives only
- `nextjs-template/.gitignore` — standard Next.js gitignore (node_modules, .next, .env.local)

**Verify:** All files exist. `package.json` has correct dependency names and version ranges. `.env.local.example` documents every required variable.

---

### Phase 2 — Database Layer
No auth, no models, just connections.

- `nextjs-template/lib/db/mongodb.js` — Native MongoClient singleton via `globalThis`. Reads `MONGODB_URI` and optional `MONGODB_DB`. Used by Auth.js adapter.
- `nextjs-template/lib/db/mongoose.js` — Mongoose connection cache via `globalThis`. Same env vars. Used by app models.

**Verify:** Both files export a single default function/promise. Both guard against re-connecting in serverless (check `globalThis` before connecting). Neither imports from the other.

---

### Phase 3 — Mongoose Models

- `nextjs-template/models/UserCredential.js` — Schema: `userId` (ObjectId, unique, indexed), `email` (String, unique, lowercase, indexed), `passwordHash` (String). Timestamps.
- `nextjs-template/models/PasswordResetToken.js` — Schema: `userId` (ObjectId, indexed), `email` (String, indexed), `tokenHash` (String, unique, indexed), `expiresAt` (Date, TTL index). Timestamps.
- `nextjs-template/models/Note.js` — Schema per PRD: `userId`, `name` (max 120), `slug` (max 80), `description` (max 300), `body` (max 10000). Indexes: `userId + updatedAt desc`, `userId + slug` (unique, sparse). Timestamps.

**Verify:** All three models use `mongoose.models.X || mongoose.model('X', schema)` guard to prevent re-registration. Indexes are declared in schema, not applied manually. TTL on `PasswordResetToken.expiresAt`.

---

### Phase 4 — Auth Utilities

Build the library files that auth routes and the Auth.js config will depend on.

- `nextjs-template/lib/auth/passwords.js` — `hashPassword(plain)` and `verifyPassword(plain, hash)` using bcryptjs (12 rounds).
- `nextjs-template/lib/auth/users.js` — `getUserByEmail(email)`, `getUserById(id)`, `ensureUsername(userId, email)` (generates unique username from email handle if user has none), `updateUsername(userId, username)` (validates format, checks uniqueness, writes to DB).
- `nextjs-template/lib/auth/credentials-service.js` — `registerWithCredentials(email, password)` (validates input, checks for existing account, creates Auth.js user + UserCredential), `loginWithCredentials(email, password)` (looks up credential, verifies hash, returns user or throws).
- `nextjs-template/lib/auth/password-reset-service.js` — `requestPasswordReset(email)` (generates token, hashes it, stores in DB, sends reset email via Resend), `confirmPasswordReset(token, newPassword)` (finds token by hash, checks expiry, updates/creates UserCredential, deletes token).
- `nextjs-template/lib/auth/session-user.js` — `buildSessionUser(userId)` — fetches user from DB, calls `ensureUsername`, returns `{ id, email, name, username }`. Called from root layout.
- `nextjs-template/lib/auth/events.js` — exports `ACCOUNT_USERNAME_UPDATED_EVENT = 'account:username-updated'` constant.
- `nextjs-template/lib/auth/redirects.js` — `isSafeRedirect(url)` — returns true if URL is a relative path (starts with `/`, not `//`).

**Verify:** `passwords.js` exports exactly two functions. `users.js` username validation: lowercase, alphanumeric + hyphens only, max 32 chars. `credentials-service.js` does not import `passwords.js` directly if `users.js` already handles hashing — keep responsibilities clean. `session-user.js` is the single place that assembles the user object put into the JWT.

---

### Phase 5 — Slug Utilities

- `nextjs-template/lib/slugs.js` — Three exports:
  - `normalizeSlug(input)` — lowercase, strip non-alphanumeric (keep hyphens), collapse multiple hyphens, trim hyphens from ends, truncate to 80 chars
  - `createSlug(input, fallback)` — calls `normalizeSlug`, returns `fallback` if result is empty
  - `withNumericSlugSuffix(slug, index)` — returns `slug` if index ≤ 1, else `slug-{index}` (truncate base to fit within 80 chars before appending)

**Verify:** Edge cases — empty string, special-char-only input, very long strings. No external dependencies.

---

### Phase 6 — Notes Library

- `nextjs-template/lib/notes/validators.js` — `ValidationError` class (extends Error, has `field` and `message`). `validateNoteInput({ name, description, body })` — checks required fields, max lengths, returns cleaned object or throws `ValidationError`.
- `nextjs-template/lib/notes/serializers.js` — `serializeNote(doc)` — converts a Mongoose document to a plain JS object safe to return from API routes (converts `_id` to `id` string, strips `__v`). `serializeNoteList(docs)` — maps array through `serializeNote` but omits the `body` field.
- `nextjs-template/lib/notes/service.js` — Functions:
  - `listNotes(userId)` — returns notes without body, sorted by updatedAt desc
  - `createNote(userId, { name, description, body })` — validates, generates unique slug, inserts
  - `getNote(id, userId)` — fetches by id, enforces owner check, returns full doc
  - `updateNote(id, userId, fields)` — validates, enforces owner, updates
  - `deleteNote(id, userId)` — enforces owner, deletes
  - `getNoteBySlug(username, slug)` — for public pages: looks up user by username, then note by userId + slug, returns full doc (no owner check)
  - `ensureUniqueSlug(userId, baseSlug, excludeId?)` — internal helper, checks for collisions within user's notes, appends numeric suffix as needed

**Verify:** Every mutating function enforces `userId` ownership. `ensureUniqueSlug` is only called internally. `serializeNoteList` definitely excludes `body`.

---

### Phase 7 — Auth.js Configuration

- `nextjs-template/auth.js` — Configure Auth.js with:
  - MongoDB adapter (uses `lib/db/mongodb.js` connection)
  - Credentials provider: calls `loginWithCredentials`, returns user object or `null`
  - Resend provider: configured with `AUTH_RESEND_KEY` and `AUTH_EMAIL_FROM`
  - Session strategy: `jwt`
  - JWT callback: embed `userId` and `username` from `token` or `user` object
  - Session callback: populate `session.user.id` and `session.user.username` from token
  - `pages`: `{ signIn: '/login' }`

**Verify:** JWT callback handles both the initial sign-in case (where `user` is present) and subsequent requests (where only `token` is present). Session callback reads from token, not from DB. The file exports `{ auth, handlers, signIn, signOut }`.

---

### Phase 8 — API Routes

Build all route handlers. Each should: parse input, call a library function, serialize output, handle errors.

**Auth routes:**

- `nextjs-template/app/api/auth/[...nextauth]/route.js` — exports `{ GET, POST }` from `auth.js` handlers.
- `nextjs-template/app/api/auth/register/route.js` — POST only. Calls `registerWithCredentials`. Returns `{ ok: true, user }` or 400/409/500.
- `nextjs-template/app/api/auth/password-reset/request/route.js` — POST only. Calls `requestPasswordReset`. Always returns `{ ok: true }` (never reveals if email exists).
- `nextjs-template/app/api/auth/password-reset/confirm/route.js` — POST only. Calls `confirmPasswordReset`. Returns `{ ok: true, email }` or 400/500.

**Account routes:**

- `nextjs-template/app/api/account/username/route.js` — GET: returns `{ username }` for current user (calls `ensureUsername` as fallback). PATCH: validates + calls `updateUsername`, dispatches `ACCOUNT_USERNAME_UPDATED_EVENT` via response header hint (actual event dispatch happens client-side after successful fetch). Returns `{ username }` or 400/409.

**Notes routes:**

- `nextjs-template/app/api/notes/route.js` — GET: `listNotes` → `serializeNoteList`. POST: `createNote` → `serializeNote`. Both require auth.
- `nextjs-template/app/api/notes/[id]/route.js` — GET: `getNote` → `serializeNote`. PATCH: `updateNote` → `serializeNote`. DELETE: `deleteNote` → 204. All require auth + owner enforcement (already inside service layer, but catch 403-type errors here).

**Verify:** Every authenticated route calls `auth()` from `auth.js` and returns 401 if no session. Route handlers do not contain business logic — they delegate entirely to library functions. Error responses are consistent JSON: `{ error: "message" }`.

---

### Phase 9 — App Pages & Root Layout

**Root layout:**

- `nextjs-template/app/layout.js` — imports globals.css, calls `auth()` to get session, calls `buildSessionUser(userId)` if session exists, renders `<Navbar sessionUser={sessionUser} />` above `{children}`. Sets base HTML metadata.

**Pages (server components unless noted):**

- `nextjs-template/app/page.js` — Landing page. Brief headline, one-line description of the app, link/button to `/dashboard` (or `/login` if not authenticated). No complex logic.
- `nextjs-template/app/login/page.js` — Renders `<LoginForm callbackUrl={searchParams.callbackUrl} />`. Redirects to `/dashboard` if already authenticated.
- `nextjs-template/app/reset-password/page.js` — Renders `<PasswordResetForm token={searchParams.token} email={searchParams.email} />`.
- `nextjs-template/app/dashboard/page.js` — Protected. Fetches `listNotes(userId)` server-side. Renders page header, `<NoteControls />`, and `<NoteList initialNotes={notes} allowDelete={true} />`. Redirects to `/login?callbackUrl=/dashboard` if no session.
- `nextjs-template/app/-/[username]/page.js` — Looks up user by username (404 if not found). Fetches their notes. Renders public profile header and `<NoteList notes={notes} allowDelete={false} />`.
- `nextjs-template/app/-/[username]/[slug]/page.js` — Calls `getNoteBySlug`. 404 if not found. Determines if viewer is the owner. Renders `<NoteViewer note={note} />` with `<NoteEditor note={note} />` overlay or edit link if owner.

**Verify:** Dashboard page uses `redirect()` from `next/navigation` (not a client-side redirect). Public pages are fully accessible without a session. Note that `/-/[username]/[slug]` renders the editor only for the owner — use `sessionUser?.id === note.userId.toString()` to decide.

---

### Phase 10 — Components

Build all UI components. These are the last pieces — they depend on everything above.

**`nextjs-template/components/Navbar.jsx`** (client component)
- Accepts `sessionUser` prop (null if logged out)
- Logo/name links to `/`
- Logged-out: "Login" link
- Logged-in: profile button → dropdown with:
  - Username input (pre-filled, saves on form submit via `PATCH /api/account/username`)
  - "Change password" button (calls `POST /api/auth/password-reset/request` with user's email, shows confirmation)
  - "Sign out" button (calls Auth.js `signOut`)
- After successful username save: dispatches `new CustomEvent(ACCOUNT_USERNAME_UPDATED_EVENT, { detail: { username } })` on `window`
- Click-outside handler closes dropdown
- Handles loading + error states inline

**`nextjs-template/components/auth/LoginForm.jsx`** (client component)
- Props: `callbackUrl` (string, optional)
- Two tabs: "Log in" / "Sign up"
- Log in tab: toggle between "Password" and "Magic link"
  - Password: email + password fields → `signIn('credentials', ...)` → redirect to `callbackUrl` or `/dashboard`
  - Magic link: email field → `signIn('resend', ...)` → show "Check your email" confirmation
- Sign up tab: email + password fields → `POST /api/auth/register` → on success call `signIn('credentials', ...)` to auto-login
- "Forgot password?" link (password mode) → `/reset-password` (user enters email there, but for now just link to a page that has the request form)
- Error messages rendered inline
- No external form library — plain controlled inputs with `useState`

**`nextjs-template/components/auth/PasswordResetForm.jsx`** (client component)
- If no `token` prop: render email input form → `POST /api/auth/password-reset/request` → show confirmation
- If `token` + `email` props: render new-password form → `POST /api/auth/password-reset/confirm` → on success show "Password updated, go to login" message

**`nextjs-template/components/dashboard/NoteList.jsx`** (client component)
- Props: `initialNotes` (array), `allowDelete` (bool)
- Local state for note list (so deletes update UI without page reload)
- Responsive grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- Each card:
  - Note name (bold)
  - Description snippet (truncated, muted text)
  - Last updated (formatted date)
  - "Open" button → links to `/-/[username]/[slug]` — note: needs username, either pass it as a prop or derive from note data
  - "Delete" button (only if `allowDelete`) → inline confirmation ("Are you sure?") → `DELETE /api/notes/[id]` → remove from local state
- Empty state: centred message "No notes yet."
- Listens for a `note:created` custom event to prepend new notes without page reload

**`nextjs-template/components/notes/NoteEditor.jsx`** (client component)
- Props: `note` (full note object including `id`, `name`, `description`, `body`)
- Controlled inputs for name, description, and body (textarea)
- "Save" button → `PATCH /api/notes/[id]` with changed fields → updates local state → shows "Saved" confirmation
- Shows last-saved timestamp after a successful save
- No auto-save (explicit save only — simpler and more predictable for a template)

**`nextjs-template/components/notes/NoteViewer.jsx`** (can be server or client component)
- Props: `note`
- Read-only display: name as `<h1>`, description as subtitle, body in a `<pre>` or `<p>` block
- Minimal styling

**`nextjs-template/components/notes/NoteControls.jsx`** (client component)
- "New Note" button → opens inline prompt (a simple `<dialog>` or inline form) for note name → `POST /api/notes` → on success dispatch `note:created` custom event with new note data → close prompt
- Optional `editHref` prop: if provided, renders an "Edit" link pointing to that URL (used on public note page for owner)

**Verify:** No component imports directly from `lib/` server modules — all data access goes through API routes or is passed as props from server components. Components that use `useState`, `useEffect`, event listeners, or browser APIs are marked `'use client'`.

---

## Development Loop

After completing each phase, run this verification loop before moving to the next:

### 1. Structural Check
- Do all files listed for this phase exist?
- Do all exports match what the next phase will import?
- Are there any `import` statements pointing to files that don't exist yet?

### 2. Consistency Check
- Are function names consistent between the service layer and the route handlers that call them?
- Are field names consistent between the Mongoose schema, the serializer, and what components expect?
- Do error shapes (`{ error: "..." }`) match across all API routes?

### 3. PRD Compliance Check
- Does any file add features not in the PRD? If yes, remove them.
- Does any file omit something the PRD requires? If yes, add it.
- Are all max-length constraints from the PRD reflected in both validators and Mongoose schemas?

### 4. Dependency Direction Check
- Components → API routes only (never import from `lib/` directly)
- API routes → `lib/` functions
- `lib/` functions → models and other `lib/` utilities
- Models → db connections only
- No circular dependencies

If any check fails, fix it before proceeding. Do not accumulate debt across phases.

---

## Decisions to Make As You Go

These are left intentionally open for you to resolve based on what is simplest and most readable:

- **Username on NoteList cards:** The "Open" link needs a username. You can either pass `username` as a prop to `NoteList`, embed it in the serialized note data, or fetch it separately. Choose whichever adds the least complexity.
- **PasswordResetForm routing:** The PRD mentions `/reset-password` takes `?token` and `?email`. The login form's "Forgot password?" link can either go to `/reset-password` (where users enter their email) or trigger a modal. Choose the simpler page-based approach.
- **Note page layout for owners:** The simplest approach is to render `NoteEditor` directly on the `/-/[username]/[slug]` page when the session user is the owner, replacing the `NoteViewer`. No modal or side-by-side needed.
- **Error pages:** Add minimal `not-found.js` files for the `/-/[username]` and `/-/[username]/[slug]` routes. A simple "Not found" message is sufficient.

---

## What Done Looks Like

The build is complete when:

1. `nextjs-template/` contains all files described in the PRD's directory structure
2. No file imports a module that doesn't exist
3. `.env.local.example` is complete and accurate
4. A developer can follow this exact path without errors:
   - Fill in `.env.local` from the example
   - `npm install && npm run dev`
   - Visit `http://localhost:3000`
   - Register an account with email + password
   - Log in
   - Create a note from the dashboard
   - See the note card on the dashboard
   - Open the note, edit the body text, save
   - Copy the public URL (`/-/username/slug`) and open it in an incognito window
   - See the note rendered read-only
5. No features exist that aren't in the PRD

---

## Reference

The PRD is in `TEMPLATE_PRD.md` in the same directory as this file. The source project whose patterns this template is based on is in the parent directory of this file — you may read it for implementation reference, but do not copy it verbatim. The template should be simpler and self-contained.
