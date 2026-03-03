# Next.js Project Structure Review

Reviewed on: 2026-03-03

## Scope

This review covers the hand-written source and configuration in the repository root, `app/`, `components/`, and `lib/`.

Excluded from detailed documentation:

- `node_modules/`: installed dependencies
- `.next/`: generated Next.js build artifacts
- binary image files in `public/`: described as groups rather than line-by-line
- `package-lock.json`: dependency lockfile, important for reproducible installs but not application logic

## High-Level Summary

This is a small App Router Next.js application whose real purpose is not generic content delivery but three in-browser stochastic simulators:

- `CTMC Gillespie`: exact stochastic simulation algorithm
- `CTMP Time Var`: fixed-step simulation for time-varying continuous-time Markov processes
- `SDE Solver`: Euler-Maruyama integration for stochastic differential equations

The architecture is simple and understandable:

1. `app/` defines routes and the global shell.
2. `components/simulators/*` contains the bulk of the UI and simulation orchestration.
3. `components/simulators/*/engine.js` contains the numerical engines.
4. `lib/` contains shared parsing and expression-compilation utilities.

The codebase is easy to navigate because there are few directories, but most of the logic is concentrated in three very large simulator components. That keeps the project approachable today, but it will become the main maintenance pressure point if more simulators or editor features are added.

## Directory Map

```text
.
|-- app/
|   |-- layout.js
|   |-- page.js
|   |-- globals.css
|   |-- gillespie/page.js
|   |-- ctmp-inhomo/page.js
|   `-- sde/page.js
|-- components/
|   |-- Navbar.jsx
|   `-- simulators/
|       |-- shared/
|       |   |-- ExpressionListSection.jsx
|       |   |-- SimChart.jsx
|       |   `-- seriesColors.js
|       |-- gillespie/
|       |   |-- GillespieSimulator.jsx
|       |   `-- engine.js
|       |-- ctmp-inhomo/
|       |   |-- CTMPInhomoSimulator.jsx
|       |   `-- engine.js
|       `-- sde/
|           |-- SDESimulator.jsx
|           `-- engine.js
|-- lib/
|   |-- compile.js
|   `-- modelParsers.js
|-- public/
|   |-- favicon and app icon files
|   `-- starter SVG assets
|-- README.md
|-- package.json
|-- eslint.config.mjs
|-- next.config.mjs
|-- postcss.config.mjs
|-- jsconfig.json
`-- .gitignore
```

## Architectural Notes

### What is well structured

- The simulation engines are separated from the React components. That is the right boundary: UI state lives in React, math and stepping logic lives in plain JavaScript classes.
- Shared parser/compiler utilities in `lib/` reduce repeated string parsing logic across simulators.
- The three simulator screens use a consistent visual model: editor on the left, chart on the right, controls at the bottom.
- `ExpressionListSection.jsx` and `SimChart.jsx` are useful shared building blocks rather than simulator-specific one-offs.

### What is structurally expensive

- The three main simulator components are large: `702`, `753`, and `711` lines. Most of that size is UI state, row editing helpers, preset loading, simulation execution, chart dataset formatting, and repeated control layout.
- There is heavy duplication between `GillespieSimulator.jsx` and `CTMPInhomoSimulator.jsx`, and moderate duplication in `SDESimulator.jsx`. The repeated patterns are similar enough that a shared simulator editor framework could remove a large amount of boilerplate.
- `compileExpression()` uses `new Function(...)` on user input. That is acceptable only because the app is intentionally browser-side and the expression execution stays client-side. It should not be reused in a server runtime without a hard security review.
- The route files under `app/*/page.js` are very thin wrappers and do not need to be client components themselves. They could remain server components and render the client simulator components directly.

### Current documentation quality

- `README.md` is still mostly `create-next-app` boilerplate and does not document the actual purpose, routes, DSL formats, or simulator architecture.
- The code itself is more informative than the README right now.

## File-by-File Documentation

### Root Files

| File | LOC | Purpose | Notes |
| --- | ---: | --- | --- |
| `.gitignore` | 41 | Standard ignore rules for Next.js, build outputs, logs, env files, and local clutter. | Conventional and adequate. |
| `README.md` | 37 | Intended project documentation. | Currently stale; mostly starter content with a single trailing `# Markov-side-by-side` line. |
| `package.json` | 28 | NPM manifest, scripts, and dependency list. | Uses Next `16.1.6`, React `19.2.3`, Tailwind `4`, Chart.js, Lucide, and Font Awesome. |
| `eslint.config.mjs` | 16 | ESLint setup. | Uses `eslint-config-next/core-web-vitals` with the standard build output ignores. |
| `next.config.mjs` | 6 | Next.js runtime/build config. | Effectively empty at the moment. |
| `postcss.config.mjs` | 7 | PostCSS configuration. | Minimal Tailwind v4 plugin setup. |
| `jsconfig.json` | 7 | JavaScript path alias configuration. | Defines `@/*` to point at the repo root, which simplifies imports. |

### `app/`

| File | LOC | Purpose | Notes |
| --- | ---: | --- | --- |
| `app/layout.js` | 46 | Root layout for all routes. Imports global CSS, disables Font Awesome auto CSS insertion, defines site metadata and icons, renders `Navbar`, wraps page content in `<main>`. | Good placement for shell concerns. Metadata points to icons in `public/`. |
| `app/page.js` | 97 | Home page. Renders three simulator cards with descriptions, badges, and links. | Clean landing page; simulator metadata is hard-coded directly in the file. |
| `app/globals.css` | 63 | Global styling and Tailwind import. | Includes mobile form tweaks, monospace utility for code-like inputs, loader animation, and number input spinner removal. |
| `app/gillespie/page.js` | 7 | Route entry for `/gillespie`. | Thin wrapper that renders `GillespieSimulator`. `'use client'` is not strictly necessary here. |
| `app/ctmp-inhomo/page.js` | 7 | Route entry for `/ctmp-inhomo`. | Thin wrapper that renders `CTMPInhomoSimulator`. Same note on `'use client'`. |
| `app/sde/page.js` | 7 | Route entry for `/sde`. | Thin wrapper that renders `SDESimulator`. Same note on `'use client'`. |

### `components/`

| File | LOC | Purpose | Notes |
| --- | ---: | --- | --- |
| `components/Navbar.jsx` | 116 | Shared navigation bar with desktop links and a mobile menu toggle. | Uses `usePathname()` to highlight the active route and local state for the mobile drawer. |

### `components/simulators/shared/`

| File | LOC | Purpose | Notes |
| --- | ---: | --- | --- |
| `components/simulators/shared/ExpressionListSection.jsx` | 203 | Reusable editor for line-based text rows such as variables, parameters, and helper functions. Supports row insertion, deletion, focus management, optional note labels, and optional color markers. | One of the better abstractions in the codebase. It centralizes keyboard behavior and row lifecycle. |
| `components/simulators/shared/SimChart.jsx` | 247 | Imperative Chart.js wrapper used by all simulators. Creates a line chart once, then updates datasets/options when props change. | Handles legend de-duplication, mobile tooltip suppression, tick formatting, and placeholder legend rendering before a simulation runs. |
| `components/simulators/shared/seriesColors.js` | 57 | Color palettes and small color helpers. | Keeps simulator series colors consistent and converts hex colors to RGBA for layered multi-run plots. |

### `components/simulators/gillespie/`

| File | LOC | Purpose | Notes |
| --- | ---: | --- | --- |
| `components/simulators/gillespie/engine.js` | 82 | Exact SSA engine. Defines `Transition` and `Gillespie` classes, computes total event rate, samples event times, picks the next transition, and records state history. | Clean separation from React. State updates are clamped to non-negative integers. |
| `components/simulators/gillespie/GillespieSimulator.jsx` | 702 | Full UI and orchestration for the exact CTMC simulator. Manages editable variables, parameters, transitions, presets, validation, compilation, repeated runs, chart dataset generation, and summary stats. | This is the main feature module for the Gillespie page, but it is large enough to benefit from extraction of reusable hooks/components. |

Detailed role of `GillespieSimulator.jsx`:

- Defines the editor tabs: variables, parameters, transitions.
- Encodes a food-chain preset directly in the component module.
- Stores editor state as arrays of row objects with generated ids.
- Uses `parseNameValueLines()` and `compileExpression()` to convert user input into executable model pieces.
- Builds per-variable delta evaluators for transitions, not just fixed integer deltas.
- Runs up to 200 simulations and overlays all trajectories in a single chart.
- Derives legend labels from optional user-provided note labels.

### `components/simulators/ctmp-inhomo/`

| File | LOC | Purpose | Notes |
| --- | ---: | --- | --- |
| `components/simulators/ctmp-inhomo/engine.js` | 86 | Fixed-time-step engine for time-dependent CTMP simulation. Defines `Transition` and `TimeStepper` classes. | Similar structure to the Gillespie engine, but uses event probabilities `rate * dt` and can emit a warning when `dt` is too coarse. |
| `components/simulators/ctmp-inhomo/CTMPInhomoSimulator.jsx` | 753 | Full UI and orchestration for the time-varying CTMP simulator. Adds helper-function support on top of the general variable/parameter/transition workflow. | The largest file in the repo. Functionally strong, but also the clearest duplication candidate. |

Detailed role of `CTMPInhomoSimulator.jsx`:

- Uses the same tabbed left-panel editing model as the Gillespie simulator.
- Adds a `Time Functions` editor so users can define helper functions like `Season(t)`.
- Uses `parseHelperLines()` and `buildHelperBlock()` to inject helper functions into compiled expressions.
- Runs multiple simulations, collects warnings from the engine, and overlays stepped trajectories.
- Uses the same note-label and per-row color model as the Gillespie page.

### `components/simulators/sde/`

| File | LOC | Purpose | Notes |
| --- | ---: | --- | --- |
| `components/simulators/sde/engine.js` | 58 | Euler-Maruyama stepping engine. Defines `SDEComponent` and `TimeStepperSDE`, with Gaussian noise generated via Box-Muller. | The simplest engine in the repo. |
| `components/simulators/sde/SDESimulator.jsx` | 711 | Full UI and orchestration for the SDE solver. Manages parameter rows plus structured variable rows containing variable name, initial value, drift, and diffusion expressions. | Slightly different editor model from the CTMC pages, but still shares many structural patterns with them. |

Detailed role of `SDESimulator.jsx`:

- Uses two tabs: variables and parameters.
- Represents variables as structured objects instead of line-based text rows.
- Validates variable definitions with `parseVariableComponents()` before compiling drift/diffusion expressions.
- Builds `SDEComponent` instances from compiled functions and runs the Euler-Maruyama solver for one or more realizations.
- Uses the same charting and note-label conventions as the other simulator pages.

### `lib/`

| File | LOC | Purpose | Notes |
| --- | ---: | --- | --- |
| `lib/compile.js` | 92 | Shared expression compiler. Rewrites math tokens, replaces variables and parameters with array/object lookups, and returns executable functions via `new Function`. | Central to all simulators. Powerful, but the main security-sensitive file in the repo. |
| `lib/modelParsers.js` | 214 | Shared text parsing helpers for variables, parameters, transitions, helper functions, and SDE component definitions, plus serialization helpers back to text. | Good single-purpose utility module. Some exports appear unused in the current UI. |

Detailed role of `compile.js`:

- Rewrites common math names like `sin`, `exp`, `sqrt`, `PI`, and `E` to `Math.*`.
- Normalizes `time` to `t`.
- Rewrites `^` to JavaScript exponentiation `**`.
- Replaces variable names with `s[index]` and parameters with `p['name']`.
- Optionally injects helper function declarations for the time-varying CTMP simulator.

Detailed role of `modelParsers.js`:

- `parseNameValueLines()`: parses `name = number` rows.
- `parseTransitionLines()`: parses `rate -> change` transition syntax.
- `parseHelperLines()`: parses `Name(t) = expression`.
- `parseSDEComponentLines()`: parses `X = init | drift | diffusion`.
- `assignmentsToText()`, `transitionsToText()`, `helpersToText()`, `sdeComponentsToText()`: serialization helpers for presets or text export/import workflows.

Observation: `parseTransitionLines()`, `parseSDEComponentLines()`, and `transitionsToText()` are not currently wired into the simulator UIs. They look like either leftover support from earlier text-only versions or preparation for future import/export features.

### `public/`

`public/` contains two categories of assets:

- Active application icons: `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`, `android-chrome-192x192.png`, `android-chrome-512x512.png`
- Likely starter leftovers: `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`

The icon set matches the metadata in `app/layout.js`. The SVG files look like create-next-app starter assets and do not appear to participate in the simulator UI.

## How Data and Control Flow Through the App

### Route flow

1. A user visits `/`, `/gillespie`, `/ctmp-inhomo`, or `/sde`.
2. `app/layout.js` provides the shared shell and navigation.
3. Each simulator route renders one large client component.

### Simulation flow

1. The user edits variables, parameters, transitions, or SDE components in controlled inputs.
2. The simulator component converts editor rows into text or structured definitions.
3. Parser helpers in `lib/modelParsers.js` validate the definitions.
4. `lib/compile.js` converts string expressions into callable functions.
5. The relevant engine in `components/simulators/*/engine.js` runs the numerical simulation.
6. The simulator component converts results into Chart.js dataset objects.
7. `SimChart.jsx` renders the trajectories.

## Structural Assessment

### Strengths

- Clear directory boundaries for routes, reusable components, engines, and parsing utilities.
- Small number of moving parts.
- Good separation of numerical logic from rendering logic.
- Consistent UX conventions across all simulator pages.
- Strong use of local utility modules instead of scattering parsing logic inside JSX event handlers.

### Weaknesses

- The simulator pages are too large for long-term maintainability.
- Repeated helper functions such as `makeId`, row insertion/removal logic, note-label handling, alpha/line-width scaling, and chart dataset assembly should be shared.
- The current README does not match the actual project.
- The project uses plain JavaScript everywhere; that keeps iteration fast, but it also weakens guarantees around parsed model shapes and simulator result types.
- There are no tests for the numerical engines or parser/compiler utilities.

### Suggested Refactor Priorities

1. Extract shared simulator hooks/utilities.
   - Examples: `useEditableRows`, `useLegendLabels`, `buildMultiRunDatasets`, `clampRunCount`, `makeId`.

2. Split each large simulator page into smaller components.
   - Examples: `TransitionEditor`, `VariableEditor`, `SimulationControls`, `StatusPanel`.

3. Update `README.md`.
   - Document the three simulators, the input formats, and the client-side expression compilation model.

4. Add tests around the non-React core.
   - Start with `lib/compile.js`, `lib/modelParsers.js`, and each `engine.js`.

5. Review the security posture of `compileExpression()`.
   - If the app ever moves expression execution to a server environment, replace `new Function` with a safer parser/evaluator.

6. Remove or confirm unused assets and parser helpers.
   - `public/*.svg` starter files and currently unused parser exports should either be justified or trimmed.

## Bottom Line

The repository is organized around a sensible core idea: thin Next.js routing, shared rendering utilities, and simulator-specific feature modules backed by small engine classes. The main architectural issue is not confusion; it is concentration. Too much repeated logic lives inside three large client components.

If the project stays at its current size, the structure is serviceable. If more models, presets, validation rules, or export/import features are planned, extracting shared simulator infrastructure should be the next structural improvement.
