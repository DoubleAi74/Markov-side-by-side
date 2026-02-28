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
function gridColor(ctx) {
  const value = ctx.tick?.value;
  if (value === 0) return 'rgba(15, 23, 42, 0.65)';
  return 'rgba(15, 23, 42, 0.16)';
}

function gridWidth(ctx) {
  return ctx.tick?.value === 0 ? 2 : 1;
}

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
        interaction: {
          mode: 'nearest',
          axis: 'xy',
          intersect: false,
        },
        elements: {
          point: { radius: 0, hitRadius: 5 },
          line: { borderWidth: 2, tension: 0 },
        },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: xLabel },
            min: 0,
            grid: {
              color: gridColor,
              lineWidth: gridWidth,
            },
            ticks: {
              color: '#334155',
              maxTicksLimit: 14,
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
              color: '#334155',
              maxTicksLimit: 12,
            },
          },
        },
        plugins: {
          legend: {
            display: false,
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

  // Update chart whenever datasets/options change
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.data.datasets = datasets;
    chartRef.current.options.scales.x.title.text = xLabel;
    chartRef.current.options.scales.y.title.text = yLabel;
    if (xMax != null) {
      chartRef.current.options.scales.x.max = xMax;
    } else {
      delete chartRef.current.options.scales.x.max;
    }
    chartRef.current.options.plugins.tooltip.enabled = showTooltips;
    chartRef.current.update();
  }, [datasets, xMax, xLabel, yLabel, showTooltips]);

  return (
    <div className="relative w-full h-full min-h-[280px] md:min-h-[400px]">
      <canvas ref={canvasRef} />
    </div>
  );
}
