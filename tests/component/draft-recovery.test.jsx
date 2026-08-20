import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DraftRecoveryBanner } from "../../components/simulators/shared/WorkspaceDraft.jsx";

describe("DraftRecoveryBanner", () => {
  it("offers non-modal restore and keep-current actions", () => {
    const restore = vi.fn();
    const discard = vi.fn();
    render(<DraftRecoveryBanner draft={{ candidate: { updatedAt: "2026-08-15T10:00:00.000Z" }, restore, discard }} />);
    expect(screen.getByText("Recover local draft?")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Restore draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep current" }));
    expect(restore).toHaveBeenCalledOnce();
    expect(discard).toHaveBeenCalledOnce();
  });
});
