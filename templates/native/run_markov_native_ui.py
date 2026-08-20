#!/usr/bin/env python3

from __future__ import annotations

import csv
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time


# Edit these values before running the script.
CONFIG_FILE = "your-model.json"
NUM_RUNS = 1000
OUTPUT_CSV = "results.csv"
THREADS = None  # Set to an integer, or keep as None to use the runner default.
SEED = None  # Set to an integer for repeatable native runs.
RUNS_TO_PLOT = [0]  # Example: [0], [0, 1, 2], or None to plot every run.
PLOT_COLUMNS = None  # Example: ["X", "Y"], or None to plot every state column.
PLOT_IMAGE = None  # Example: "results.png". In headless mode this defaults to OUTPUT_CSV with a .png suffix.
SAVE_ONLY_PLOTTED_RUNS = True  # Much faster for large NUM_RUNS when you only want to visualize a subset.
MAX_PLOT_POINTS_PER_TRACE = 4000  # Plot decimation only. The simulation still runs exactly.


SERIES_PALETTES = {
  "gillespie": ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#6366f1"],
  "ctmp-inhomo": ["#4f46e5", "#db2777", "#059669", "#d97706", "#7c3aed"],
  "sde": ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea", "#0891b2"],
}


def resolve_path(value: str) -> Path:
  path = Path(value).expanduser()
  if path.is_absolute():
    return path
  return (Path(__file__).resolve().parent / path).resolve()


def run_native(output_path: Path) -> None:
  runner_path = Path(__file__).resolve().parent / "run_markov_native.py"
  recorded_runs = None
  if SAVE_ONLY_PLOTTED_RUNS and RUNS_TO_PLOT is not None:
    recorded_runs = sorted({int(value) for value in RUNS_TO_PLOT})
  command = [
    sys.executable,
    str(runner_path),
    "--config",
    str(resolve_path(CONFIG_FILE)),
    "--runs",
    str(int(NUM_RUNS)),
    "--output",
    str(output_path),
  ]

  if THREADS is not None:
    command.extend(["--threads", str(int(THREADS))])
  if SEED is not None:
    command.extend(["--seed", str(int(SEED))])
  if recorded_runs is not None:
    command.extend(["--record-runs", ",".join(str(value) for value in recorded_runs)])

  print("Starting native runner...", flush=True)
  subprocess.run(command, check=True)


def load_series(csv_path: Path):
  with csv_path.open("r", newline="", encoding="utf-8") as handle:
    reader = csv.DictReader(handle)
    fieldnames = reader.fieldnames or []
    if "run" not in fieldnames or "t" not in fieldnames:
      raise ValueError("CSV is missing the required 'run' and 't' columns.")

    state_columns = [name for name in fieldnames if name not in {"run", "t"}]
    plot_columns = PLOT_COLUMNS or state_columns
    selected_runs = None if RUNS_TO_PLOT is None else {int(value) for value in RUNS_TO_PLOT}
    traces = {}

    for row in reader:
      run_index = int(row["run"])
      if selected_runs is not None and run_index not in selected_runs:
        continue

      trace = traces.setdefault(
        run_index,
        {"t": [], **{column: [] for column in plot_columns}},
      )
      trace["t"].append(float(row["t"]))
      for column in plot_columns:
        trace[column].append(float(row[column]))

  return traces, plot_columns


def build_series_metadata(config: dict, plot_columns: list[str]):
  simulator_type = str(config.get("simulatorType") or "").strip()
  palette = SERIES_PALETTES.get(simulator_type, ["#334155"])
  model = config.get("model") or {}
  source_items = model.get("components") if simulator_type == "sde" else model.get("variables")
  source_items = source_items if isinstance(source_items, list) else []
  metadata = {}

  for index, column in enumerate(plot_columns):
    source = source_items[index] if index < len(source_items) and isinstance(source_items[index], dict) else {}
    name = str(source.get("name") or column).strip() or column
    note = str(source.get("label") or "").strip()
    if note:
      label = f"{note}: {name}" if simulator_type == "sde" else f"{note} : {name}"
    else:
      label = name
    metadata[column] = {
      "label": label,
      "color": palette[index % len(palette)],
    }

  return metadata


def choose_plot_style(trace_count: int):
  alpha = 0.9
  line_width = 1.8
  if trace_count > 1:
    alpha = 0.6
    line_width = 1.5
  if trace_count > 10:
    alpha = 0.3
    line_width = 1.0
  if trace_count > 50:
    alpha = 0.15
    line_width = 1.0
  return alpha, line_width


def decimate_trace(times: list[float], values: list[float]):
  if MAX_PLOT_POINTS_PER_TRACE is None or MAX_PLOT_POINTS_PER_TRACE <= 0:
    return times, values
  if len(times) <= MAX_PLOT_POINTS_PER_TRACE:
    return times, values

  stride = max(1, math.ceil(len(times) / MAX_PLOT_POINTS_PER_TRACE))
  decimated_times = times[::stride]
  decimated_values = values[::stride]
  if decimated_times[-1] != times[-1]:
    decimated_times.append(times[-1])
    decimated_values.append(values[-1])
  return decimated_times, decimated_values


def plot_output(csv_path: Path) -> None:
  cache_dir = Path(tempfile.gettempdir()) / "markov_native_matplotlib_cache"
  cache_dir.mkdir(parents=True, exist_ok=True)
  os.environ.setdefault("MPLCONFIGDIR", str(cache_dir))

  try:
    import matplotlib
    headless = not sys.stdout.isatty()
    if headless:
      matplotlib.use("Agg")
    from matplotlib.collections import LineCollection
    from matplotlib.lines import Line2D
    import matplotlib.pyplot as plt
  except ImportError:
    print(
      "Matplotlib is not installed. Install it with: python3 -m pip install matplotlib"
    )
    return

  config = json.loads(resolve_path(CONFIG_FILE).read_text(encoding="utf-8"))
  traces, plot_columns = load_series(csv_path)
  if not traces:
    print("No matching runs were found in the CSV for plotting.")
    return

  metadata = build_series_metadata(config, plot_columns)
  alpha, line_width = choose_plot_style(len(traces))
  figure, axis = plt.subplots(figsize=(10, 6))
  legend_handles = []
  x_min = None
  x_max = None
  y_min = None
  y_max = None

  for column in plot_columns:
    segments = []
    for run_index in sorted(traces):
      trace = traces[run_index]
      times, values = decimate_trace(trace["t"], trace[column])
      if len(times) < 2:
        continue
      segment = list(zip(times, values))
      segments.append(segment)

      x_min = times[0] if x_min is None else min(x_min, times[0])
      x_max = times[-1] if x_max is None else max(x_max, times[-1])
      local_y_min = min(values)
      local_y_max = max(values)
      y_min = local_y_min if y_min is None else min(y_min, local_y_min)
      y_max = local_y_max if y_max is None else max(y_max, local_y_max)

    if not segments:
      continue

    color = metadata[column]["color"]
    axis.add_collection(
      LineCollection(
        segments,
        colors=[color],
        linewidths=line_width,
        alpha=alpha,
      )
    )
    legend_handles.append(
      Line2D([0], [0], color=color, linewidth=2.0, label=metadata[column]["label"])
    )

  axis.set_title(csv_path.name)
  axis.set_xlabel("t")
  axis.set_ylabel("value")
  axis.grid(True, alpha=0.3)

  if x_min is not None and x_max is not None:
    axis.set_xlim(x_min, x_max)
  if y_min is not None and y_max is not None:
    if math.isclose(y_min, y_max):
      padding = max(1.0, abs(y_min) * 0.05)
    else:
      padding = (y_max - y_min) * 0.05
    axis.set_ylim(y_min - padding, y_max + padding)

  if legend_handles:
    axis.legend(handles=legend_handles)
  figure.tight_layout()

  if headless:
    image_path = resolve_path(PLOT_IMAGE) if PLOT_IMAGE else csv_path.with_suffix(".png")
    figure.savefig(image_path, dpi=150)
    print(f"Plot written to {image_path}")
    return

  plt.show()


def main() -> int:
  output_path = resolve_path(OUTPUT_CSV)

  try:
    started_at = time.perf_counter()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    run_started_at = time.perf_counter()
    run_native(output_path)
    print(f"CSV written to {output_path}")
    print(f"Native execution time: {time.perf_counter() - run_started_at:.2f}s")

    plot_started_at = time.perf_counter()
    plot_output(output_path)
    print(f"Plot preparation time: {time.perf_counter() - plot_started_at:.2f}s")
    print(f"Total UI script time: {time.perf_counter() - started_at:.2f}s")
  except PermissionError:
    print(
      "Permission denied while preparing the output path.\n"
      "If you are running from Downloads on macOS, move the bundle to a normal "
      "project folder such as ~/Projects/markov-native or choose an OUTPUT_CSV "
      "outside protected folders.",
      file=sys.stderr,
    )
    return 1
  except subprocess.CalledProcessError as error:
    print(f"Native runner failed with exit code {error.returncode}.", file=sys.stderr)
    return error.returncode or 1
  except Exception as error:
    print(f"Error: {error}", file=sys.stderr)
    return 1

  return 0


if __name__ == "__main__":
  raise SystemExit(main())
