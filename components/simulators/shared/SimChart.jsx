"use client";

import { useEffect, useRef, useState } from "react";
import {
  buildSimulationChartConfig,
  Chart,
} from "@/components/simulators/shared/chartConfig";

export default function SimChart({
  datasets = [],
  xMax,
  xMin = 0,
  xLabel = "Time",
  yLabel = "Count",
  yBeginAtZero = true,
  xTickSignificantFigures,
  xTickAutoSkip = true,
  legendItems = [],
  showTooltips = true,
  showLegend = true,
  minHeightClass = "min-h-0",
}) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [isMobileView, setIsMobileView] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const applyMatch = (event) => {
      const nextMatch = event?.matches ?? mediaQuery.matches;
      setIsMobileView(nextMatch);
    };

    applyMatch();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", applyMatch);
      return () => mediaQuery.removeEventListener("change", applyMatch);
    }
    mediaQuery.addListener(applyMatch);
    return () => mediaQuery.removeListener(applyMatch);
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");

    chartRef.current = new Chart(
      ctx,
      buildSimulationChartConfig({
        datasets: [],
        xLabel,
        yLabel,
        xTickSignificantFigures,
        xTickAutoSkip,
        legendItems,
        showLegend,
        showTooltips: false,
      }),
    );

    return () => {
      chartRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;

    const nextConfig = buildSimulationChartConfig({
      datasets,
      xMax,
      xMin,
      xLabel,
      yLabel,
      yBeginAtZero,
      xTickSignificantFigures,
      xTickAutoSkip: isMobileView || xTickAutoSkip,
      maxXTicksLimit: isMobileView ? 6 : 14,
      maxYTicksLimit: isMobileView ? 7 : 12,
      legendItems,
      showLegend,
      showTooltips: showTooltips && !isMobileView,
    });

    chartRef.current.data.datasets = nextConfig.data.datasets;
    chartRef.current.options = nextConfig.options;
    chartRef.current.update();
  }, [
    datasets,
    xMax,
    xMin,
    xLabel,
    yLabel,
    yBeginAtZero,
    xTickSignificantFigures,
    xTickAutoSkip,
    legendItems,
    showLegend,
    showTooltips,
    isMobileView,
  ]);

  return (
    <div className={`relative w-full h-full ${minHeightClass}`}>
      <canvas ref={canvasRef} role="img" aria-label={`${yLabel} plotted against ${xLabel}`} />
    </div>
  );
}
