'use client';

import { useEffect, useRef } from 'react';
import {
  Chart,
  LinearScale,
  LineElement,
  PointElement,
  LineController,
  Legend,
  Tooltip,
  Title,
} from 'chart.js';

Chart.register(
  LinearScale,
  LineElement,
  PointElement,
  LineController,
  Legend,
  Tooltip,
  Title
);

/**
 * A Chart.js Line chart wrapper.
 * Accepts datasets and options and renders/updates via imperative Chart.js API.
 *
 * Props:
 *  - datasets: array of Chart.js dataset objects
 *  - xMax: number, sets the x-axis maximum
 *  - xLabel: string (default "Time")
 *  - yLabel: string (default "Count")
 *  - stepped: boolean — use stepped 'after' lines (for CTMPs)
 */
export default function SimChart({ datasets = [], xMax, xLabel = 'Time', yLabel = 'Count', stepped = false, showTooltips = true }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');

    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        elements: {
          point: { radius: 0, hitRadius: 5 },
          line: { borderWidth: 2 },
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: xLabel },
            min: 0,
          },
          y: {
            title: { display: true, text: yLabel },
            beginAtZero: true,
          },
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              filter: (item) => item.text !== '',
            },
          },
          tooltip: { mode: 'nearest', axis: 'x', intersect: false },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update chart whenever datasets/xMax/showTooltips change
  useEffect(() => {
    if (!chartRef.current || datasets.length === 0) return;
    chartRef.current.data.datasets = datasets;
    if (xMax != null) chartRef.current.options.scales.x.max = xMax;
    chartRef.current.options.plugins.tooltip.enabled = showTooltips;
    chartRef.current.update();
  }, [datasets, xMax, showTooltips]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <canvas ref={canvasRef} />
    </div>
  );
}
