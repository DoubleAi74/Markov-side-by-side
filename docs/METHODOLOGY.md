# Numerical methodology

Markov Lab separates a canonical model snapshot from execution and analysis.
Every reference run uses f64 arithmetic, a displayed uint64 root seed, a
deterministic stream derived from the run index, an identified solver version,
and a definition hash. Changing worker count cannot change which stream belongs
to a run.

## Expressions

Model expressions use a deliberately small numerical language. The lexer and
parser accept literals, stable symbols, time (`t` or `time`), arithmetic,
parentheses, constants, and an allow-list of mathematical functions. Parsed
expressions resolve to entity UUIDs and compile to versioned stack bytecode.
Member access, statements, assignment, constructors, objects, strings, and
`random()` are rejected. Randomness belongs to the solver, where it is seeded
and recorded.

## Solvers

- Direct SSA v2 is the reference Gillespie implementation for integer-valued,
  state-dependent jump processes. Negative propensity, non-finite values, and
  invalid state changes terminate visibly rather than being clamped.
- Integrated-hazard CTMP is the default for new explicitly time-dependent jump
  models. It numerically integrates the total hazard and solves event times with
  safeguarded root finding.
- Migrated time-dependent models use the piecewise-frozen compatibility solver;
  the old `dt` is interpreted as a maximum rate-freezing interval.
- Euler–Maruyama v2 supports a state-by-noise diffusion matrix, correlated noise,
  exact final partial steps, and explicit boundary policies.
- Milstein is exposed only for independent diagonal noise with the required
  diffusion derivative.

One path is not an ensemble. Quantitative work should report included and
excluded runs, warnings, seed, solver, step/tolerance settings, backend, and
precision. CTMP results should be repeated with tighter integration controls;
SDE results should be compared at `dt`, `dt/2`, and `dt/4`.

## Retention and analysis

Raw paths remain typed buffers and analysis never mutates them. Rendering is
bounded by deterministic display-only decimation. Discrete ensembles use
right-continuous sampling; continuous paths use linear interpolation on a common
grid. Summary mode is an explicit retention choice and does not claim that
full-path CSV is available.

## Alternative backends

JavaScript f64 is always the reference. WASM may be selected automatically only
after f64 conformance, at least 1.5× end-to-end speed-up on both stress cases,
memory no more than 1.25× reference, and no material small-job regression.
WebGPU is never automatic: it is an experimental f32 SDE-summary option only
after a CPU calibration subset, ten million state updates, a 3× measured
speed-up, and finite statistically compatible results. This release includes
the evidence gates; neither backend is enabled without a passing report.
