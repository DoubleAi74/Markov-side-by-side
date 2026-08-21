# Markov Lab

Markov Lab is a reproducible stochastic-modelling workspace for jump processes,
time-dependent continuous-time Markov processes, and stochastic differential
equations. Anonymous users can edit, run, analyse, and export locally. Accounts
add public/private models, immutable share URLs, forks, bounded run history, and
recoverable deletion.

## Scientific runtime

- Source-located safe expression parser and versioned stack bytecode; model
  expressions cannot execute JavaScript and cannot call `random()`.
- Stable UUID model entities and canonical `markov-lab/model` payload version 2.
- Worker-pooled f64 reference solvers with fixed uint64 root seeds and
  scheduling-independent per-run streams.
- Direct SSA v2, integrated-hazard time-dependent SSA, migrated piecewise-frozen
  compatibility CTMP, Euler–Maruyama v2, and restricted diagonal Milstein.
- Typed raw buffers, explicit device-memory preflight, bounded summary retention,
  display-only decimation, structured termination, and complete provenance.
- Time, 2D/3D phase, terminal distribution, ECDF, ensemble summaries, and
  diagnostics with accessible tables and provenance-aware PNG/CSV export.

See [Numerical methodology](docs/METHODOLOGY.md) for assumptions and backend
gates. JavaScript f64 is the scientific reference; WASM Auto and approximate f32
WebGPU remain disabled until their checked-in evidence gates pass.

## Local setup

Requires Node.js 22 and MongoDB.

```bash
npm install
npm run dev
```

Create `.env.local` with at least:

```text
AUTH_SECRET=
MONGODB_URI=
AUTH_RESEND_KEY=
AUTH_EMAIL_FROM=
AUTH_TRUST_HOST=true
```

Preview storage additionally uses the `R2_*` variables consumed by
`lib/storage/r2.js`. `MARKOV_LAB_MAINTENANCE_SECRET` protects the purge endpoint.
Performance telemetry is off unless
`MARKOV_LAB_PERFORMANCE_TELEMETRY_ENABLED=true`; its strict allow-list excludes
model content, seeds, and identity.

## Verification

```bash
npm run lint
npm test
npm run test:vitest
npm run audit:security
npm run build
npm run benchmark
npm run test:e2e
npm run test:lighthouse
```

Install Chromium, Firefox, and WebKit first with
`npx playwright install --with-deps`. CI performs that step, runs the
Playwright/axe matrix, and enforces mobile Lighthouse scores of Performance 90
and Accessibility 95 with development-only audited tooling.

## Migration and retention

Dry-run migration (the default) prints every proposed change:

```bash
node scripts/migrate-saved-simulations-v2.mjs
```

Apply only after reviewing the report and backing up the database:

```bash
node scripts/migrate-saved-simulations-v2.mjs --apply
```

Unconvertible payloads remain intact in `needsRepair`. Soft-deleted models are
restorable for 30 days. The secured maintenance endpoint or
`scripts/purge-deleted-simulations.mjs` permanently removes expired models, run
summaries, and preview objects. See [Operations](docs/OPERATIONS.md) and the
[release checklist](docs/RELEASE_CHECKLIST.md). The exact local checks and the
promotion gates that remain closed are recorded in the
[release-candidate report](docs/RELEASE_CANDIDATE_REPORT.md).

## Main routes

- `/gillespie`, `/ctmp-inhomo`, `/sde`: modelling workspaces
- `/-/[username]` and `/-/[username]/[modelSlug]`: owner/public model routes
- `/dashboard`: signed-in dashboard
- `/api/interchange/json` and `/api/interchange/sbml`: strict interchange
- `/api/saved-simulations/*/runs`: private bounded run history

No production deployment is included in this repository state.
