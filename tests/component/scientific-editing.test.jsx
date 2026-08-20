import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/simulators/shared/SimChart", () => ({
  default: () => <div data-testid="sim-chart">Time chart</div>,
}));

vi.mock("@/components/simulators/shared/PhaseThreePlot", () => ({
  default: () => <div>Three-dimensional chart</div>,
}));

import ScientificExpressionInput from "@/components/simulators/shared/ScientificExpressionInput";
import ScientificPlotLab from "@/components/simulators/shared/ScientificPlotLab";

describe("scientific editing controls", () => {
  it("offers model symbols and a safe equation preview", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ScientificExpressionInput
        label="Transition rate"
        value="birth * X"
        onChange={onChange}
        symbols={["birth", "X"]}
        showPreview
      />,
    );

    expect(screen.getByLabelText("Transition rate")).toHaveAttribute("list");
    expect([...container.querySelectorAll("datalist option")].map((option) => option.value)).toEqual(expect.arrayContaining(["birth", "X", "sin", "t"]));
    expect(screen.getByLabelText("Transition rate equation preview")).toHaveTextContent("birth × X");
    fireEvent.change(screen.getByLabelText("Transition rate"), { target: { value: "birth * X + 1" } });
    expect(onChange).toHaveBeenCalledWith("birth * X + 1");
  });

  it("maintains an ordered, persisted collection of plot cards", () => {
    const onChange = vi.fn();
    render(
      <ScientificPlotLab
        initialPlotSpecs={[
          { id: "time-card", kind: "time" },
          { id: "hist-card", kind: "histogram" },
        ]}
        onPlotSpecsChange={onChange}
      />,
    );

    expect(screen.getByLabelText("Ordered plot cards").querySelectorAll("figure")).toHaveLength(2);
    fireEvent.click(screen.getByRole("tab", { name: "Phase 2D" }));
    fireEvent.click(screen.getByRole("button", { name: "Add plot card" }));
    expect(screen.getByLabelText("Ordered plot cards").querySelectorAll("figure")).toHaveLength(3);
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ kind: "phase" })]));

    fireEvent.click(screen.getByRole("button", { name: "Move Phase 2D up" }));
    const latest = onChange.mock.calls.at(-1)[0];
    expect(latest.map((spec) => spec.kind)).toEqual(["time", "phase", "histogram"]);
  });
});
