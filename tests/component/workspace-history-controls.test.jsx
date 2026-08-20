import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WorkspaceHistoryControls, { useWorkspaceHistory } from "../../components/simulators/shared/WorkspaceHistoryControls.jsx";

function Harness() {
  const [snapshot, setSnapshot] = useState({ value: 0 });
  const history = useWorkspaceHistory({ snapshot, onApply: setSnapshot });
  return <><output>{snapshot.value}</output><button type="button" onClick={() => setSnapshot({ value: 1 })}>Edit</button><WorkspaceHistoryControls history={history} /></>;
}

describe("workspace history controls", () => {
  it("undoes and redoes a canonical editor snapshot", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("1")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("0")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByText("1")).toBeVisible();
  });
});
