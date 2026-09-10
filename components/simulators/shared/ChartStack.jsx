"use client";

import SimChart from "./SimChart";
import { applyPathOpacity, hexToRgba } from "./seriesColors";
import {
  MEAN_GRAPH_KEY,
  buildMeanDatasets,
  buildPairDatasets,
  listVariablePairs,
} from "@/lib/extra-graphs";

function colorForName(variableSeries, name, alpha = 1) {
  return hexToRgba(variableSeries?.get(name)?.color, alpha);
}

export function buildExtraGraphPanels({
  snapshot,
  pairs = [],
  enabledPairKeys = [],
  meanEnabled = false,
  variableSeries,
} = {}) {
  const panels = [];
  const names = snapshot?.variableNames ?? [];
  const runs = snapshot?.runs ?? [];
  const hasRuns = runs.length > 0;

  enabledPairKeys.forEach((key) => {
    const pair =
      pairs.find((item) => item.key === key) ??
      listVariablePairs(names).find((item) => item.key === key);
    if (!pair) return;
    const xIndex = names.indexOf(pair.xName);
    const yIndex = names.indexOf(pair.yName);
    const canPlot = hasRuns && xIndex >= 0 && yIndex >= 0;

    panels.push({
      key: `pair:${pair.key}`,
      title: pair.label,
      placeholder: canPlot
        ? null
        : hasRuns
          ? "Re-run the simulation to plot this pair."
          : "Run the simulation to plot this pair.",
      datasets: canPlot
        ? buildPairDatasets({
            runs,
            xIndex,
            yIndex,
            color: colorForName(variableSeries, pair.yName),
            stepped: Boolean(snapshot.stepped),
          }).map((dataset) => {
            const seriesHex = variableSeries?.get(pair.yName)?.color;
            return {
              ...dataset,
              seriesHex,
              borderColor: colorForName(
                variableSeries,
                pair.yName,
                dataset.seriesAlpha,
              ),
              backgroundColor: colorForName(
                variableSeries,
                pair.yName,
                dataset.seriesAlpha,
              ),
            };
          })
        : [],
      xLabel: pair.xName,
      yLabel: pair.yName,
      xMin: null,
      yBeginAtZero: false,
      showLegend: false,
      showTooltips: false,
    });
  });

  if (meanEnabled) {
    const canPlotMean = runs.length >= 2;
    panels.push({
      key: MEAN_GRAPH_KEY,
      title: `Mean vs ${snapshot?.xLabel ?? "Time"}`,
      placeholder: canPlotMean
        ? null
        : "Run at least two simulations to plot mean values.",
      datasets: canPlotMean
        ? buildMeanDatasets({
            runs,
            variableNames: names,
            legendLabels: snapshot.legendLabels ?? names,
            colors: names.map((name) => colorForName(variableSeries, name)),
            xMax: snapshot.xMax,
            interpolate: snapshot.interpolate ?? "step",
          })
        : [],
      legendItems: snapshot?.legendItems,
      xLabel: snapshot?.xLabel ?? "Time",
      yLabel: snapshot?.yLabel ?? "Value",
      xMax: snapshot?.xMax,
      xMin: 0,
      yBeginAtZero: true,
      xTickSignificantFigures: snapshot?.xTickSignificantFigures,
      xTickAutoSkip: snapshot?.xTickAutoSkip ?? true,
      showLegend: true,
      showTooltips: true,
    });
  }

  return panels;
}

export default function ChartStack({ main, extras = [], pathOpacity }) {
  const hasExtras = extras.length > 0;
  const panels =
    pathOpacity == null
      ? extras
      : extras.map((panel) => ({
          ...panel,
          datasets: applyPathOpacity(panel.datasets, pathOpacity),
        }));

  return (
    <div className="simulator-chart-stack no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" role="region" aria-label="Simulation charts">
      <div
        className={`simulator-main-chart border border-slate-300 bg-white ${
          hasExtras
            ? "h-full min-h-full shrink-0"
            : "min-h-[280px] flex-1 md:min-h-0"
        }`}
      >
        {main}
      </div>

      {panels.map((panel) => (
        <div
          key={panel.key}
          className="simulator-extra-chart flex h-[min(32rem,70vh)] min-h-[280px] shrink-0 flex-col border border-slate-300 bg-white"
        >
          <div className="border-b border-slate-200 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            {panel.title}
          </div>
          <div className="min-h-0 flex-1">
            {panel.placeholder ? (
              <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500">
                {panel.placeholder}
              </div>
            ) : (
              <SimChart
                datasets={panel.datasets}
                legendItems={panel.legendItems}
                xMax={panel.xMax}
                xMin={panel.xMin}
                xLabel={panel.xLabel}
                yLabel={panel.yLabel}
                yBeginAtZero={panel.yBeginAtZero}
                xTickSignificantFigures={panel.xTickSignificantFigures}
                xTickAutoSkip={panel.xTickAutoSkip}
                showLegend={panel.showLegend}
                showTooltips={panel.showTooltips}
                minHeightClass="min-h-0"
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
