import {
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from "chart.js";

Chart.register(
  LinearScale,
  LineElement,
  PointElement,
  LineController,
  Legend,
  Tooltip,
  Title,
);

function gridColor(ctx) {
  const value = ctx.tick?.value;
  if (value === 0) return "rgba(15, 23, 42, 0.65)";
  return "rgba(15, 23, 42, 0.16)";
}

function gridWidth(ctx) {
  return ctx.tick?.value === 0 ? 2 : 1;
}

export function formatAxisTick(value, xTickSignificantFigures) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;

  const absValue = Math.abs(numeric);
  const epsilon = Math.max(1e-8, absValue * 1e-6);
  const nearestInteger = Math.round(numeric);
  if (Math.abs(numeric - nearestInteger) <= epsilon) {
    return String(nearestInteger);
  }

  if (Number.isFinite(xTickSignificantFigures) && xTickSignificantFigures > 0) {
    const sigFigs = Math.max(
      1,
      Math.min(21, Math.floor(xTickSignificantFigures)),
    );
    return String(Number(numeric.toPrecision(sigFigs)));
  }

  const rounded = Number(numeric.toFixed(6));
  return String(rounded);
}

function hasSeriesData(datasets) {
  return datasets.some(
    (dataset) => Array.isArray(dataset.data) && dataset.data.length > 0,
  );
}

function hasLegendEntries(datasets) {
  return datasets.some(
    (dataset) => String(dataset.label ?? "").trim().length > 0,
  );
}

export function buildSimulationChartDatasets({
  datasets = [],
  legendItems = [],
}) {
  if (hasSeriesData(datasets) || !Array.isArray(legendItems) || legendItems.length === 0) {
    return datasets;
  }

  return legendItems.map((item, index) => ({
    label: item.label,
    data: [],
    borderColor: item.color,
    backgroundColor: item.color,
    pointRadius: 0,
    borderWidth: 2,
    showLine: false,
    parsing: false,
    order: -1000 + index,
  }));
}

export function buildSimulationChartOptions({
  renderedDatasets = [],
  xMax,
  xLabel = "Time",
  yLabel = "Count",
  xTickSignificantFigures,
  xTickAutoSkip = true,
  showLegend = true,
  showTooltips = true,
  responsive = true,
  devicePixelRatio,
  layoutPadding,
  maxXTicksLimit = 14,
  maxYTicksLimit = 12,
} = {}) {
  const legendEntries = hasLegendEntries(renderedDatasets);

  const options = {
    responsive,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: "nearest",
      axis: "xy",
      intersect: false,
    },
    layout: {
      padding:
        layoutPadding ?? {
          right: 10,
          top: showLegend && !legendEntries ? 18 : 0,
        },
    },
    elements: {
      point: { radius: 0, hitRadius: 5 },
      line: { borderWidth: 2, tension: 0 },
    },
    scales: {
      x: {
        type: "linear",
        title: { display: true, text: xLabel },
        min: 0,
        grid: {
          color: gridColor,
          lineWidth: gridWidth,
        },
        ticks: {
          color: "#334155",
          maxTicksLimit: maxXTicksLimit,
          autoSkip: xTickAutoSkip,
          callback: (value) => formatAxisTick(value, xTickSignificantFigures),
        },
      },
      y: {
        title: { display: true, text: yLabel },
        beginAtZero: true,
        grid: {
          color: gridColor,
          lineWidth: gridWidth,
        },
        ticks: {
          color: "#334155",
          maxTicksLimit: maxYTicksLimit,
        },
      },
    },
    plugins: {
      legend: {
        display: showLegend,
        position: "top",
        align: "end",
        labels: {
          filter: (legendItem, data) => {
            const text = String(legendItem.text ?? "").trim();
            if (!text) return false;
            return (
              data.datasets.findIndex(
                (dataset) => String(dataset.label ?? "").trim() === text,
              ) === legendItem.datasetIndex
            );
          },
        },
      },
      tooltip: {
        enabled: showTooltips,
        mode: "nearest",
        axis: "x",
        intersect: false,
      },
    },
  };

  if (xMax != null) {
    options.scales.x.max = xMax;
  }

  if (typeof devicePixelRatio === "number") {
    options.devicePixelRatio = devicePixelRatio;
  }

  return options;
}

export function buildSimulationChartConfig(input) {
  const renderedDatasets = buildSimulationChartDatasets(input);

  return {
    type: "line",
    data: {
      datasets: renderedDatasets,
    },
    options: buildSimulationChartOptions({
      ...input,
      renderedDatasets,
    }),
  };
}

export { Chart };
