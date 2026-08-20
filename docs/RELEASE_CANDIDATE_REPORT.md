# Markov Lab release-candidate report

Report date: 2026-08-20

This repository state is a local release candidate. It has not been deployed and
has not been applied to a production database.

## Implemented release surface

- Canonical `markov-lab/model` version 2 payloads with stable UUID references,
  deterministic migration, repair retention, definition hashes, immutable slugs,
  optimistic revisions, public/private visibility, forks, soft deletion, and
  bounded private run records.
- Source-located expression parsing, symbol resolution, serialisable bytecode,
  transactional rename support, and a runtime-source audit that prohibits `eval`
  and the `Function` constructor.
- Deterministic uint64 root seeds, per-run xoshiro256** streams, f64 Gillespie,
  integrated-hazard and compatibility CTMP, Euler–Maruyama, restricted Milstein,
  structured termination, bounded summary retention, and complete provenance.
- Browser worker coordination with compile-once workers, typed buffers,
  deterministic scheduling, 250 ms progress throttling, cooperative/forced
  cancellation, stale-job rejection, and device-memory preflight.
- Shared responsive simulator workspaces with canonical Guided/Expert editing,
  fixed seeds, explicit raw/summary retention, stale-result protection,
  revision-aware save/fork flows, bounded local draft recovery, undo/redo,
  navigation protection, private run history, time and 2D/3D phase plots,
  histogram/PMF/KDE/ECDF, scatter/hexbin, phase matrices, first-passage
  Kaplan–Meier, reaction/extinction/Fano/stoichiometry diagnostics,
  ACF/Welch diagnostics, provenance-aware PNG/CSV export, parameter sweeps,
  centred sensitivity, and convergence assistants.
- Anonymous and public-sandbox run histories in bounded IndexedDB storage,
  client JSON v1/v2 import/export, strict browser SBML interchange, and
  keyboard-resizable desktop panes with local width persistence.
- Strict JSON and SBML interchange, public/owner export scopes, a native f64
  bundle, secured purge workflow, and disabled-by-default content-free performance
  telemetry.
- Markov Lab scientific-editorial landing page, route metadata, keyboard focus,
  reduced-motion handling, mobile run access, and public `noindex` behaviour.

## Verification evidence

The following checks passed in this workspace on the report date:

| Check | Result |
| --- | --- |
| Node scientific, API, execution, analysis, and workspace tests | 65/65 passed |
| Vitest component and property tests | 5/5 passed |
| ESLint | Passed with no findings |
| Runtime code-execution security audit | Passed |
| npm dependency audit at moderate severity | 0 vulnerabilities |
| Next.js 16.3.1 webpack production build | Passed; 17 pages generated |
| Native C++17 syntax check | Passed |
| Native Python wrapper bytecode compilation | Passed |
| Native scheduling and JS f64 seeded-trajectory conformance | Passed; 20/20 trajectory rows identical with 1 and 4 native threads |
| Isolated database migration/rollback | Passed; 5/5 converted, idempotent, exact rollback digest, slugs continuous |
| Isolated database/run/object purge | Passed; 1/1 synthetic fixture and preview object removed |
| Playwright suite discovery | 24 tests across Chromium, Firefox, WebKit, and mobile Chromium |
| Reference benchmark | 5,000,000 iterations in 632.96 ms; checksum 1463782798 |

The deterministic suites cover worker counts 1/2/4, migration idempotency,
injection rejection, exact final time, invalid propensities/transitions,
integrated and compatibility CTMP behaviour, correlated SDE covariance, summary
memory bounds, raw-buffer preservation, cancellation, lazy CSV, strict SBML,
backend gates, and preview revision binding.

## Gates that remain closed

- WASM Auto is disabled because no checked-in pair of representative workloads
  yet proves at least 1.5x end-to-end improvement within the memory limit.
- Experimental WebGPU is not exposed because no f64 calibration and ten-million
  update benchmark proves its statistical and 3x performance gates.
- The local in-app browser provider reported no available browser. The Playwright,
  axe, mobile, and Lighthouse configurations are checked in, but their rendered
  cross-browser results and the Performance 90 / Accessibility 95 thresholds must
  be confirmed in browser-enabled CI before promotion.
- Linux native compilation and the same checked-in f64 conformance command run
  in the Ubuntu CI workflow, but the remote Linux job remains a promotion gate
  until that workflow completes on the committed candidate.

## Product surfaces not claimed by this candidate

The following deep-editor and presentation surfaces remain explicit follow-up
work rather than hidden or partially advertised features:

- repeatable multi-card plot layouts and one composite all-plot PNG (every
  individual plot/table currently exports a provenance-labelled PNG);
- equation autocomplete/previews and the remaining fully structured
  transition/noise-matrix controls. Units, descriptions, labels, non-autorun
  sliders, stable identities, and Guided/Expert canonical round trips are
  implemented.

These omissions are stated explicitly because passing library tests is not the
same as shipping an accessible product workflow. They must be implemented and
re-audited before describing the entire long-range overhaul as complete.

These are promotion gates, not silent fallbacks. The product continues to use
the JavaScript worker f64 backend, and large raw jobs require an explicit change
to bounded summary retention when preflight rejects them.
