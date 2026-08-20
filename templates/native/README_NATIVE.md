# Markov Lab Native Runner Bundle

This bundle contains:

- `markov_native_runner.cpp`
  - shared native simulator runtime used by all exported models
- `run_markov_native.py`
  - Python wrapper that validates the JSON config, compiles the C++ runner, and runs the simulation
- `run_markov_native_ui.py`
  - short user-facing Python script where you edit a few variables, run the native bundle, and plot the CSV with matplotlib
- `*.json`
  - the exported model config for the selected model

## Quick Start

From this directory:

```bash
python3 run_markov_native_ui.py
```

Edit these variables at the top of `run_markov_native_ui.py` first:

- `CONFIG_FILE`
- `NUM_RUNS`
- `OUTPUT_CSV`
- optionally `THREADS`, `SEED`, `RUNS_TO_PLOT`, `PLOT_COLUMNS`, `PLOT_IMAGE`, `SAVE_ONLY_PLOTTED_RUNS`, and `MAX_PLOT_POINTS_PER_TRACE`

The UI script will:

1. call `run_markov_native.py`
2. compile `markov_native_runner.cpp` once and cache the binary on the machine
3. run the native simulator
4. write CSV output
5. open a matplotlib plot of the selected runs

For large jobs, `SAVE_ONLY_PLOTTED_RUNS = True` is usually the fastest option because the native runner will only write the runs you actually want to visualize.
The console will also tell you whether it is compiling the native runner or reusing the cached binary.

If you prefer the lower-level CLI wrapper, you can still run:

```bash
python3 run_markov_native.py --config your-model.json
```

## Common Options

```bash
python3 run_markov_native.py --config your-model.json --threads 8
python3 run_markov_native.py --config your-model.json --seed 12345
python3 run_markov_native.py --config your-model.json --runs 100000
python3 run_markov_native.py --config your-model.json --output results.csv
python3 run_markov_native.py --config your-model.json --compiler clang++
```

## Compiler Notes

The wrapper will try to find a suitable compiler automatically.

Preferred defaults:

- macOS: `clang++`
- Linux: `g++`

If needed, override with:

```bash
python3 run_markov_native.py --config your-model.json --compiler g++
```

The compiled native runner is cached in the user's cache directory, so for a given bundle version and compiler it should only compile once on that machine.

## Output

The native runner writes CSV output with columns:

- `run`
- `t`
- one column per variable or component

## Plotting Notes

- `run_markov_native_ui.py` uses matplotlib for plotting.
- In non-interactive or headless environments, it writes a `.png` plot automatically instead of opening a window.
- The UI plot uses one stable color per variable/component, matching the app palettes, and only one legend entry per series type.
- For very dense trajectories, the UI plot decimates points for display only; the simulation itself still runs exactly.
- If matplotlib is missing, install it with:

```bash
python3 -m pip install matplotlib
```

## macOS Permissions Note

- If you run the bundle from `Downloads` and see `PermissionError`, move the extracted bundle to a normal project folder such as `~/Projects/markov-native`, or grant your IDE and Python interpreter access in `System Settings > Privacy & Security`.

## Numerical and provenance notes

The native runner is designed to match the web app's simulation algorithms and semantics:

- Gillespie: direct SSA with deterministic per-run seed derivation
- Migrated CTMP: compatibility method with an explicit maximum rate-freezing interval
- SDE: Euler–Maruyama on an f64 CPU reference path

The JSON configuration and CSV should be retained together. The configuration
records the model definition, root seed, solver choice, and export format. A run
index is deterministically mixed into the root seed, so thread scheduling does
not choose a trajectory.

The JavaScript f64 runtime remains the scientific reference. Floating-point
implementations may prevent bitwise identity across every browser/compiler pair;
conformance should therefore check seeded vectors, invariants, and tolerances.

## Performance Notes

- Independent simulation runs are parallelized across CPU cores.
- CSV output can become the bottleneck for very large jobs.
- If you want maximum throughput, use fewer recorded points or fewer output writes when that becomes configurable.
