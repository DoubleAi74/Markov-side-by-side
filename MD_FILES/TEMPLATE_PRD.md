# Next.js App Template — Product Requirements Document

## Overview

A reusable Next.js starter template demonstrating a complete, production-ready web application with user authentication, a MongoDB-backed data layer, a personal dashboard, and public-facing per-object pages. The "object" in this template is a **Note** — a named, described, text-body record owned by a user.

The template is designed to be cloned and extended. Variable names like `Note`, `note`, and `notes` should be easy to find-and-replace with your domain's concept.

---

## Goals

- Provide a working, minimal example of Auth.js v5 with both email/password and magic link authentication
- Demonstrate a clean MongoDB + Mongoose data layer with two collections (`users` and `notes`)
- Show a private user dashboard with a grid of object cards
- Show public-facing per-object pages via slug-based URLs (`/-/[username]/[slug]`)
- Include the username system that bridges user accounts to public URLs
- Be straightforward enough to understand in full, simple enough to extend quickly

---

## Tech Stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Framework | Next.js 15+ (App Router) | Server components, route handlers |
| Language | JavaScript (no TypeScript) | Lower barrier for template users |
| Styling | Tailwind CSS v4 | Utility-first, no component library |
| Auth | Auth.js v5 (beta) | JWT sessions, MongoDB adapter |
| Auth providers | Credentials + Resend | Email/password + magic links |
| Database | MongoDB | Via native driver + Mongoose ODM |
| ODM | Mongoose | Schema enforcement, connection caching |
| Email | Resend | Transactional email for magic links + password reset |
| Password hashing | bcryptjs | 12 rounds |
| Deployment | Vercel (default) | Standard Next.js target |

---

## Authentication

### Providers

**1. Email + Password (Credentials)**
- Register at `/api/auth/register`
- Login via NextAuth credentials provider
- Password: min 8 chars, max 72 chars, bcrypt (12 rounds)
- Stored in `usercredentials` collection (separate from Auth.js `users`)

**2. Magic Link (Resend)**
- User enters email → Resend sends magic link → click to authenticate
- Auth.js Resend provider handles token issuance and verification
- No password required

### Password Reset
- User requests reset at `/login` (link on password form) → email sent via Resend
- One-hour expiry token, SHA256-hashed, stored in `passwordresettokens` collection
- Reset form at `/reset-password?token=X&email=Y`
- On confirm: updates (or creates) `UserCredential` record

### Session
- JWT-based sessions (stateless)
- JWT callback: embeds `userId` and `username` in token
- Session callback: surfaces `session.user.id` and `session.user.username`
- `buildSessionUser()` helper ensures username is always populated (auto-generated if missing)

### Protected Routes
- `/dashboard` — redirect to `/login` if no session
- All `/api/notes/*` routes — return 401 if no session

---

## Username System

Every user gets a unique username used in public URLs. It is:
- Auto-generated from their email handle on first login (e.g., `alice@example.com` → `alice` or `alice-2` if taken)
- Max 32 characters, lowercase alphanumeric + hyphens only
- Editable by the user from the dashboard/navbar
- Stored directly on the Auth.js `users` document
- Exposed via `GET /api/account/username` and `PATCH /api/account/username`

---

## Database Collections

### `users` (managed by Auth.js MongoDB adapter)
Standard Auth.js schema. The template adds one field:
```
{
  // ...Auth.js fields (name, email, emailVerified, image)
  username: String (unique, sparse index)
}
```

### `usercredentials`
```
{
  userId:       ObjectId  (unique, indexed, ref to users._id)
  email:        String    (unique, lowercase, indexed)
  passwordHash: String    (bcrypt)
  createdAt, updatedAt
}
```

### `passwordresettokens`
```
{
  userId:    ObjectId  (indexed)
  email:     String    (indexed)
  tokenHash: String    (SHA256, unique, indexed)
  expiresAt: Date      (TTL index — auto-deletes expired tokens)
  createdAt, updatedAt
}
```

### `notes`
```
{
  userId:      ObjectId  (required, indexed, ref to users._id)
  name:        String    (required, max 120 chars)
  slug:        String    (max 80 chars, unique per user, sparse)
  description: String    (max 300 chars)
  body:        String    (the text content, max 10,000 chars)
  createdAt, updatedAt

  Indexes:
  - userId + updatedAt desc  (dashboard listing)
  - userId + slug            (unique, sparse — public URL lookup)
}
```

---

## Slug System

Notes get URL-safe slugs auto-generated from their name on creation:
- Normalisation: lowercase, strip special chars, spaces → hyphens
- Truncated to 80 chars
- Uniqueness per user ensured by appending `-2`, `-3`, etc.
- Exposed in public URLs: `/-/[username]/[slug]`
- Reusable `lib/slugs.js` module: `normalizeSlug()`, `createSlug()`, `withNumericSlugSuffix()`

---

## Pages & Routes

### Public Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with brief description and CTA to login/dashboard |
| `/login` | Combined login + signup form (tabs). Login: password or magic link. Signup: email + password |
| `/reset-password` | Password reset form (linked from email, requires `?token=X&email=Y`) |
| `/-/[username]` | Public profile — lists all of a user's notes as cards |
| `/-/[username]/[slug]` | Public note viewer — shows note name, description, and body text |

### Authenticated Pages

| Route | Description |
|-------|-------------|
| `/dashboard` | User's private dashboard — grid of Note cards with open/delete actions |

---

## API Routes

### Auth

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Register with email + password. Body: `{ email, password }`. Returns: `{ ok, user }` |
| POST | `/api/auth/password-reset/request` | Send reset email. Body: `{ email }`. Always returns `{ ok: true }` |
| POST | `/api/auth/password-reset/confirm` | Confirm reset. Body: `{ token, password }`. Returns: `{ ok, email }` |
| * | `/api/auth/[...nextauth]` | Auth.js handler (magic link, session, etc.) |

### Account

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/account/username` | Get current user's username (with auto-generate fallback) |
| PATCH | `/api/account/username` | Update username. Body: `{ username }`. Returns: `{ username }` |

### Notes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/notes` | List authenticated user's notes (no body field) |
| POST | `/api/notes` | Create a note. Body: `{ name, description?, body? }`. Returns full note with id + slug |
| GET | `/api/notes/[id]` | Fetch single note including body (owner only) |
| PATCH | `/api/notes/[id]` | Update note. Body: `{ name?, description?, body? }`. Returns updated note |
| DELETE | `/api/notes/[id]` | Delete note. Returns 204 |

---

## Components

### Layout & Navigation

**`components/Navbar.jsx`**
- App name/logo linking to `/`
- Links to any top-level public pages
- Logged-out: Login link
- Logged-in: Profile dropdown containing:
  - Current username (editable inline, saves on submit)
  - Change password button (triggers reset email)
  - Sign out button
- Emits `ACCOUNT_USERNAME_UPDATED_EVENT` custom DOM event after username save (consumed by dashboard)

### Auth

**`components/auth/LoginForm.jsx`**
- Two tabs: Login / Sign Up
- Login tab: toggle between Password and Magic Link modes
- Magic link: email → send → confirmation message
- Password: email + password → credentials login
- Sign up: email + password → register endpoint → auto-login
- "Forgot password?" link (password mode only)
- Callback URL support for post-auth redirect

**`components/auth/PasswordResetForm.jsx`**
- Reads `?token` and `?email` from URL
- New password input → submit → success redirect to `/login`

### Dashboard

**`components/dashboard/NoteList.jsx`**
- Responsive grid (1–4 columns by breakpoint)
- Each card shows: Note name, description snippet, last updated timestamp, Open and Delete buttons
- Delete: inline confirmation before API call
- Empty state message
- `allowDelete` prop controls whether delete buttons render (owner vs public view)

### Notes

**`components/notes/NoteEditor.jsx`**
- Used on the note's own page when the logged-in user is the owner
- Name input, description input, body textarea
- Auto-saves on blur or explicit Save button
- Shows last-saved timestamp

**`components/notes/NoteViewer.jsx`**
- Read-only display of name, description, and body text
- Used on `/-/[username]/[slug]` for non-owners

**`components/notes/NoteControls.jsx`**
- Create New Note button (with name prompt)
- On the public note page: Edit button visible to owner only

---

## Directory Structure

```
/
├── app/
│   ├── layout.js                     # Root layout: Navbar, session
│   ├── page.js                       # Landing page
│   ├── login/
│   │   └── page.js
│   ├── reset-password/
│   │   └── page.js
│   ├── dashboard/
│   │   └── page.js                   # Protected — redirects if no session
│   ├── u/
│   │   └── [username]/
│   │       ├── page.js               # Public profile
│   │       └── [slug]/
│   │           └── page.js           # Public note viewer
│   └── api/
│       ├── auth/
│       │   ├── [...nextauth]/route.js
│       │   ├── register/route.js
│       │   └── password-reset/
│       │       ├── request/route.js
│       │       └── confirm/route.js
│       ├── account/
│       │   └── username/route.js
│       └── notes/
│           ├── route.js              # GET list, POST create
│           └── [id]/
│               └── route.js         # GET, PATCH, DELETE
├── components/
│   ├── Navbar.jsx
│   ├── auth/
│   │   ├── LoginForm.jsx
│   │   └── PasswordResetForm.jsx
│   ├── dashboard/
│   │   └── NoteList.jsx
│   └── notes/
│       ├── NoteEditor.jsx
│       ├── NoteViewer.jsx
│       └── NoteControls.jsx
├── lib/
│   ├── db/
│   │   ├── mongodb.js                # Native MongoClient singleton
│   │   └── mongoose.js              # Mongoose connection cache
│   ├── auth/
│   │   ├── credentials-service.js   # Register + login logic
│   │   ├── users.js                 # Username management
│   │   ├── passwords.js             # bcrypt helpers
│   │   ├── password-reset-service.js
│   │   ├── session-user.js          # buildSessionUser()
│   │   ├── events.js                # ACCOUNT_USERNAME_UPDATED_EVENT
│   │   └── redirects.js            # Safe redirect URL validation
│   ├── notes/
│   │   ├── service.js               # CRUD + slug management
│   │   ├── validators.js            # Input validation
│   │   └── serializers.js          # Payload shaping
│   └── slugs.js                     # Shared slug utilities
├── models/
│   ├── Note.js                      # Mongoose schema
│   ├── UserCredential.js
│   └── PasswordResetToken.js
├── auth.js                          # NextAuth configuration
├── next.config.mjs
├── package.json
└── .env.local.example               # All required env vars documented
```

---

## Environment Variables

```bash
# Auth.js
AUTH_SECRET=           # Random 32+ char string (openssl rand -base64 32)
AUTH_URL=              # Full URL of your deployment, e.g. https://myapp.com
AUTH_TRUST_HOST=true

# MongoDB
MONGODB_URI=           # e.g. mongodb+srv://user:pass@cluster.mongodb.net/
MONGODB_DB=            # Optional — database name override

# Resend (magic links + password reset)
AUTH_RESEND_KEY=       # Resend API key
AUTH_EMAIL_FROM=       # Verified sender address, e.g. noreply@myapp.com
```

---

## Key Patterns to Preserve from Source Project

These architectural decisions should be carried directly into the template, as they solve real problems:

1. **Dual DB connections** — `lib/db/mongodb.js` (native, for Auth.js adapter) and `lib/db/mongoose.js` (for app models), both using singleton globals to survive serverless cold starts without exhausting connections.

2. **Session user builder** — `buildSessionUser()` in `lib/auth/session-user.js` ensures `username` is always populated in the session, generating one if missing. Called from the root layout on every request.

3. **Slug uniqueness per user** — `lib/notes/service.js` checks for slug collisions within the user's own notes and appends `-2`, `-3` etc. Slugs are not globally unique, only unique per user.

4. **Custom DOM events for cross-component sync** — `ACCOUNT_USERNAME_UPDATED_EVENT` dispatched after a username save so the Navbar can update without a full page reload or a shared state library.

5. **Password reset security** — the `request` endpoint always returns `{ ok: true }` regardless of whether the email exists, preventing account enumeration.

6. **Owner-only enforcement on API routes** — every note mutation route checks `note.userId.toString() === session.user.id` and returns 403 on mismatch.

7. **Consistent ValidationError pattern** — a shared `ValidationError` class in validators, caught at the route handler level and mapped to 400 responses.

---

## Out of Scope for Template

- File/image uploads (no R2 or storage layer)
- Email verification on signup (Auth.js handles this for magic links; password accounts are unverified by default)
- OAuth social login (GitHub, Google etc.)
- Pagination on dashboard or public profile (not needed at template scale)
- Rich text / markdown rendering in note body (plain textarea only)
- Note sharing settings (all saved notes are public via their slug URL)

---

## Success Criteria

A developer should be able to:
1. Clone the repo, copy `.env.local.example` to `.env.local`, fill in credentials, and run `npm run dev`
2. Register an account, log in, create notes, and see them on their dashboard
3. Share a note URL (`/-/username/slug`) with someone not logged in and have it load
4. Follow the code from request to database and understand every step without needing external documentation

---

*PRD written 2026-03-13. Stack versions should be validated against latest stable releases at build time.*
