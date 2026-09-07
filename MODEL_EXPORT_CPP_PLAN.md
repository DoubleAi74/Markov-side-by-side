# Model Export, Shared Native Runner, And Python Wrapper Plan

## Overview

This feature set will let a user do two things with any public or private saved model:

- download the model as a clean, human-editable config JSON file
- download a native execution bundle that includes:
  - one shared C++ simulator source file used for all models
  - one shared Python wrapper used for all models
  - the selected model's config JSON

The intended workflow is:

1. User opens a saved/public model in the web app
2. User downloads the config JSON or full native bundle
3. User edits the JSON directly if desired
4. User runs the Python wrapper locally
5. The Python wrapper validates the config, compiles the shared C++ runner, executes the simulations natively, and writes CSV output

This is no longer a model-specific C++ code generation feature. It is a reusable native runtime plus a clean exported model format.

## Confirmed Product Decisions

These decisions are now fixed in the plan:

- Downloads are open.
  - Public shared models can be exported by any visitor.
- The exported config schema must be clean, readable, and suitable for direct user editing.
- There will be one shared C++ simulator source file used by all models.
- There will be one shared Python wrapper file used by all models.
- Native output will be CSV.
- Native execution should match the app's simulation algorithms exactly in method and semantics.
- Native execution should be heavily optimized, safely and robustly, with parallelization across CPU cores on many kinds of user machines.
- Compiler choice should be whatever is most practical and reliable.

## One Remaining Clarification

There is one important technical interpretation to confirm:

When you say the models should be simulated exactly, I am planning to interpret that as:

- Gillespie: exact SSA behavior matching the web app's algorithm
- CTMP inhomogeneous: exact reproduction of the current fixed-step algorithm
- SDE: exact reproduction of the current Euler-Maruyama solver semantics

That is different from:

- bitwise identical trajectories to the current browser app for the same seed

Bitwise browser/native parity would require replacing the browser RNG and expression runtime too, not just adding native export.

## Product Goals

- Let any user download a saved/public model as a readable config file.
- Let any user download everything needed to run that model natively on their machine.
- Make the config format stable enough for future tooling and partner integrations.
- Keep the native toolchain as dependency-light and cross-machine friendly as possible.
- Use multicore parallelization to make very large simulation batches fast.
- Preserve correctness and reproducibility ahead of "unsafe" speed tricks.

## User Experience

## Download Surfaces

### Public model page

Primary export location:

- `/-/[username]/[modelSlug]`

Buttons:

- `Download Config`
- `Download Native Bundle`

### Private simulator page

If the current saved model is loaded in `/gillespie`, `/ctmp-inhomo`, or `/sde`:

- show the same export controls in the shared save/export area

### Dashboard

Later enhancement:

- add the same actions to saved model cards

Not required for the first implementation.

## Downloaded Files

### 1. Config download

Filename:

- `<model-slug>.json`

### 2. Native bundle download

Filename:

- `<model-slug>-native-bundle.zip`

Contents:

- `<model-slug>.json`
- `markov_native_runner.cpp`
- `run_markov_native.py`
- `README_NATIVE.md`

Rationale:

- the C++ and Python files are shared across all models
- bundling them with the selected model config gives the user a one-click native handoff

## Clean Exported Config Schema

The exported config should not mirror the current internal payload structure directly.

It should be a cleaner external schema with:

- explicit versioning
- human-readable field names
- separated model definition and run settings
- stable structure across internal app refactors

## Proposed top-level schema

```json
{
  "format": "markov-side-by-side/model-config",
  "formatVersion": 1,
  "name": "Predator Prey",
  "description": "",
  "simulatorType": "gillespie",
  "exportedAt": "2026-03-20T12:00:00.000Z",
  "model": {
    "...": "simulator-specific model definition"
  },
  "run": {
    "numSimulations": 1000,
    "seed": 12345,
    "csv": {
      "filename": "predator-prey.csv",
      "includeHeader": true
    }
  }
}
```

## Simulator-specific config shapes

### Gillespie

```json
{
  "format": "markov-side-by-side/model-config",
  "formatVersion": 1,
  "name": "Predator Prey",
  "simulatorType": "gillespie",
  "model": {
    "variables": [
      { "name": "Prey", "initial": 300, "label": "" },
      { "name": "Pred", "initial": 10, "label": "" }
    ],
    "parameters": [
      { "name": "a", "value": 1.1 },
      { "name": "b", "value": 0.01 }
    ],
    "transitions": [
      {
        "rate": "a * Prey",
        "change": { "Prey": 1, "Pred": 0 },
        "label": ""
      },
      {
        "rate": "b * Prey * Pred",
        "change": { "Prey": -1, "Pred": 1 },
        "label": ""
      }
    ],
    "time": {
      "tMax": 5
    }
  },
  "run": {
    "numSimulations": 1000,
    "seed": 12345,
    "csv": {
      "filename": "predator-prey.csv",
      "includeHeader": true
    }
  }
}
```

### CTMP inhomogeneous

Same shape as Gillespie, plus:

```json
{
  "model": {
    "helpers": [
      { "name": "Season", "expression": "1 + A*sin(w*t)" }
    ],
    "time": {
      "tMax": 7,
      "dt": 0.000002
    }
  }
}
```

### SDE

```json
{
  "format": "markov-side-by-side/model-config",
  "formatVersion": 1,
  "name": "Stochastic LV",
  "simulatorType": "sde",
  "model": {
    "parameters": [
      { "name": "a", "value": 1.1 },
      { "name": "sigma_x", "value": 0.2 }
    ],
    "components": [
      {
        "name": "Prey",
        "initial": 300,
        "drift": "a*Prey - b*Prey*Pred",
        "diffusion": "sigma_x * Prey",
        "label": ""
      }
    ],
    "time": {
      "tMax": 20,
      "dt": 0.005
    }
  },
  "run": {
    "numSimulations": 1000,
    "seed": 12345,
    "csv": {
      "filename": "stochastic-lv.csv",
      "includeHeader": true
    }
  }
}
```

## Why This Schema Is Better Than The Current Internal Payload

- It is readable without knowing the React editor internals.
- It removes client-only row IDs entirely.
- It turns transition deltas into named maps instead of positional arrays.
- It separates model definition from execution settings.
- It is easier for external tools, scripts, and humans to edit safely.

## Native Architecture

## Shared runtime model

The native feature should be built around three layers:

1. Human-editable JSON config
2. Python normalization/validation/compilation layer
3. Shared C++ execution engine

The C++ file should not parse the original user-facing JSON directly.

Instead:

- the Python wrapper reads the editable JSON
- validates it
- converts it into a normalized compiled intermediate representation
- compiles the C++ runner if needed
- invokes the runner with the compiled representation

This division matches your requirement that Python should handle data representation.

## Recommended execution pipeline

1. User edits `<model-slug>.json`
2. User runs:

```bash
python3 run_markov_native.py --config predator-prey.json
```

3. Python wrapper:
   - loads JSON
   - validates schema
   - resolves model type
   - parses expressions into a shared AST
   - converts AST to a compact serialized IR
   - compiles `markov_native_runner.cpp`
   - runs the native binary
   - writes CSV

4. C++ runner:
   - loads compiled IR
   - runs the requested number of simulations
   - writes machine-readable CSV

## Native intermediate representation

Introduce a canonical compiled IR between the config JSON and C++ runtime.

This IR should contain:

- simulator type
- ordered variables/components
- ordered parameters
- helper functions where relevant
- transitions or SDE components
- time settings
- run settings
- precompiled expression bytecode or a compact AST form

The compiled IR should be deterministic and not depend on browser-only code paths.

## Expression System

This is the core enabling feature.

The current app evaluates user expressions as JavaScript strings with `new Function()`.

That is not strong enough for:

- a reusable shared native runner
- exact semantic parity requirements
- safe robust export tooling

## Required change

Build a shared restricted expression parser with a real AST.

Supported expression features:

- numeric literals
- variables
- parameters
- `t`
- parentheses
- unary `+` and `-`
- binary `+ - * /`
- exponentiation
- math functions:
  - `sin`
  - `cos`
  - `tan`
  - `exp`
  - `log`
  - `sqrt`
  - `abs`
  - `pow`
  - `min`
  - `max`

### Strong recommendation

Do not support arbitrary JavaScript-only semantics in exportable/native models.

### Important restriction

`random()` inside model expressions should be rejected for native execution in MVP.

Reason:

- randomness should come from the simulator runtime, not arbitrary expression calls
- this is necessary for reproducibility and exact algorithm control

## Exactness And Reproducibility

## What "exact" should mean in this implementation

### Gillespie

- exact SSA algorithm
- same event-time and event-choice semantics as the web app
- state update semantics preserved exactly

### CTMP inhomogeneous

- same fixed-step stepping logic as the web app
- same transition probability interpretation per step
- same clamping/flooring semantics where relevant

### SDE

- same Euler-Maruyama update formula
- same recording cadence
- same diffusion increment construction logic

Important note:

- SDE and fixed-step CTMP are numerical methods
- the native runner can exactly match the current app's algorithm
- it cannot turn those methods into an analytic exact solver for the underlying process

## RNG strategy

To maximize reproducibility across different machines and compilers:

- do not rely on implementation-dependent distribution helpers
- implement a custom explicit PRNG in C++
- implement Gaussian generation explicitly, for example via a fixed Box-Muller implementation

This should also be mirrored in Python-side tests.

### Recommended approach

- one master seed in config
- deterministic per-run or per-thread seed derivation
- stable output for the same config, seed, and native toolchain

## Parallelization Plan

This feature should be designed around the fact that simulation runs are embarrassingly parallel.

## Primary parallelization target

Parallelize across independent simulation runs, not within one run.

That means:

- split `numSimulations` across worker threads
- each worker simulates its own batch independently
- merge results into one CSV output in a deterministic order

## Implementation strategy

Use portable standard C++ threading first:

- `std::thread`
- a small internal thread pool or work-queue
- one worker per CPU core by default

Why this is preferred for MVP:

- better portability across many user machines
- no dependency on OpenMP availability
- easier to reason about and support via the Python wrapper

## Output and memory strategy

To stay fast and safe for large runs:

- each worker writes to its own output buffer or temp file
- avoid global locks in the inner simulation loop
- merge outputs after worker completion
- preserve final CSV row ordering by `run` then `t`

## Optimization strategy

Use safe optimizations first:

- default compile flags:
  - `-O3`
  - `-DNDEBUG`
  - `-pthread`
- optional local tuning:
  - `-march=native`
  - `-flto` when supported

Do not use unsafe floating-point flags like:

- `-ffast-math`

Reason:

- correctness and semantic fidelity matter more than risky floating-point shortcuts

## Compiler Strategy

Recommended MVP compiler support:

- Linux: prefer `g++`
- macOS: prefer `clang++`
- allow override via Python wrapper flag

MSVC can be a later follow-up unless Windows support is required immediately.

Recommended language level:

- C++17

Reason:

- broad compiler support
- sufficient for portable threading, filesystem, and robust implementation patterns

## Python Wrapper Responsibilities

`run_markov_native.py` should do more than shell out to a compiler.

It should own:

- config loading
- schema validation
- expression parsing and normalization
- compiled IR generation
- compiler detection
- build caching
- thread count selection
- native process invocation
- CSV file naming and output path handling

Optional nice-to-have behavior:

- lightweight helper functions to load CSV output back into Python
- optional pandas DataFrame loading if pandas is installed

MVP requirement:

- standard library only should be enough to use it

## Proposed CLI

```bash
python3 run_markov_native.py --config predator-prey.json
python3 run_markov_native.py --config predator-prey.json --threads 16
python3 run_markov_native.py --config predator-prey.json --seed 12345
python3 run_markov_native.py --config predator-prey.json --output results.csv
python3 run_markov_native.py --config predator-prey.json --compiler clang++
```

## API And Download Endpoints

Because downloads are open, public export endpoints are required.

### Public routes

- `GET /api/public-models/[username]/[modelSlug]/export/config`
- `GET /api/public-models/[username]/[modelSlug]/export/native-bundle`

### Private convenience routes

Optional owner routes for in-app editing flows:

- `GET /api/saved-simulations/[id]/export/config`
- `GET /api/saved-simulations/[id]/export/native-bundle`

## UI Changes

Primary files likely to change:

- `app/-/[username]/[modelSlug]/page.js`
- `components/simulators/shared/SaveModelControls.jsx`
- optionally `components/dashboard/SavedSimulationList.jsx`

UI behavior:

- show `Download Config`
- show `Download Native Bundle`
- on public pages, both actions available to any visitor
- on private pages, same actions available when a saved model is loaded

## Proposed New Code Areas

Suggested modules:

- `lib/exports/config-schema.js`
  - external clean JSON schema
- `lib/exports/config-transform.js`
  - convert internal saved payload -> external config schema
- `lib/exports/public.js`
  - public export lookup helpers
- `lib/native-ir/`
  - compiled IR builders
- `lib/native-expressions/`
  - AST parser and bytecode compiler
- `app/api/public-models/[username]/[modelSlug]/export/config/route.js`
- `app/api/public-models/[username]/[modelSlug]/export/native-bundle/route.js`
- `templates/native/markov_native_runner.cpp`
- `templates/native/run_markov_native.py`
- `templates/native/README_NATIVE.md`

## Testing Strategy

Need test coverage for:

- external config schema generation
- public download authorization behavior
- filename generation
- config validation failures
- expression AST parsing
- AST -> compiled IR conversion
- native bundle contents
- Python wrapper compiler detection
- deterministic seeded native results on sample models
- parallel execution producing the same results as single-thread execution for the same seed and run partitioning strategy

High-value verification set:

- one canonical Gillespie model
- one canonical CTMP inhomogeneous model
- one canonical SDE model

## Risks

### Risk 1: Exactness expectation is stronger than current browser architecture allows

Impact:

- user expects browser/native bitwise identity

Mitigation:

- document exactness as algorithm/semantic equivalence for now
- if bitwise parity is required, plan a later browser migration to the same shared RNG and expression engine

### Risk 2: Shared runtime becomes slow because expression evaluation is too dynamic

Impact:

- native performance gains are smaller than expected

Mitigation:

- compile expressions to compact bytecode or postfix instructions
- avoid reparsing in the hot loop

### Risk 3: Parallel output becomes the bottleneck

Impact:

- many-core runs spend too much time synchronizing or writing CSV

Mitigation:

- per-thread output buffers
- deterministic merge
- document that very high-frequency CSV output can dominate runtime

### Risk 4: Scope grows into a full import/export platform

Impact:

- the first version becomes too large

Mitigation:

- ship config export and native bundle download first
- delay import support
- delay dashboard bulk actions

## Rollout Plan

### Phase 1

- Define external config schema
- Implement config export for public and private saved models
- Add `Download Config` UI

### Phase 2

- Build shared AST and compiled IR layer
- Implement Python wrapper skeleton
- Implement shared C++ runtime skeleton

### Phase 3

- Complete Gillespie support end to end
- Add seeded reproducibility and multithreaded batching

### Phase 4

- Complete CTMP inhomogeneous support
- Complete SDE support

### Phase 5

- Add native bundle zip download
- Add polish to docs, CLI, and CSV conventions

## Acceptance Criteria

- Any public saved model can be downloaded as config JSON.
- The config JSON is clean and directly editable by a human.
- Any public saved model can be downloaded as a native bundle.
- The bundle contains one shared C++ runtime, one shared Python wrapper, and the selected model config.
- The Python wrapper can compile and run the native runner on supported machines.
- Native output is CSV.
- Native execution uses multicore parallelism across independent simulation runs.
- Native execution preserves the current app's simulator algorithms and semantics.
- The implementation avoids unsafe optimization shortcuts that would undermine correctness.

## Recommendation

This should be implemented as a reusable native runtime system, not as ad hoc model-specific C++ generation.

That gives you:

- a cleaner long-term architecture
- a readable external model format
- a better path to exact semantic parity
- a stronger base for future Python, Rust, or cloud execution backends
