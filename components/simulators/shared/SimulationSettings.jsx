"use client";

import { useId } from "react";
import PathOpacitySlider from "./PathOpacitySlider";

export default function SimulationSettings({
  duration,
  onDurationChange,
  discrete = false,
  dt,
  onDtChange,
  dtStep = "0.001",
  runs,
  onRunsChange,
  pathOpacity,
  onPathOpacityChange,
}) {
  const id = useId();
  return (
    <div className="simulation-settings">
      <label className="simulation-setting" htmlFor={`${id}-duration`}>
        <span>{discrete ? "Steps" : "End time"}</span>
        <input
          id={`${id}-duration`}
          type="number"
          min={discrete ? "1" : "0"}
          max={discrete ? "10000" : undefined}
          step={discrete ? "1" : "any"}
          value={duration}
          onChange={(event) => onDurationChange(event.target.value)}
        />
      </label>
      {onDtChange && (
        <label className="simulation-setting" htmlFor={`${id}-dt`}>
          <span>Time step</span>
          <input
            id={`${id}-dt`}
            type="number"
            min="0"
            step={dtStep}
            value={dt}
            onChange={(event) => onDtChange(event.target.value)}
          />
        </label>
      )}
      <div className="simulation-setting">
        <label htmlFor={`${id}-runs`}>Runs</label>
        <div className="flex min-w-0 items-center gap-1">
          <input
            id={`${id}-runs`}
            type="number"
            min="1"
            max="200"
            step="1"
            value={runs}
            onChange={(event) => onRunsChange(event.target.value)}
          />
          {Number(runs) > 1 && (
            <PathOpacitySlider
              value={pathOpacity}
              onChange={onPathOpacityChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}
