import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkspaceHeader from "../../components/simulators/shared/WorkspaceHeader.jsx";

describe("WorkspaceHeader", () => {
  it("exposes explicit bounded-summary consent and the fixed seed", () => {
    render(<WorkspaceHeader
      title="Reaction network"
      method="Direct SSA"
      mode="guided"
      onModeChange={vi.fn()}
      mobileView="editor"
      onMobileViewChange={vi.fn()}
      seed="42"
      onSeedChange={vi.fn()}
      onNewSeed={vi.fn()}
      retentionMode="summary"
      onRetentionModeChange={vi.fn()}
    />);
    expect(screen.getByLabelText(/root seed/i)).toHaveValue("42");
    expect(screen.getByLabelText(/result retention/i)).toHaveValue("summary");
    expect(screen.getByText(/full-path CSV is unavailable/i)).toBeVisible();
  });
});
