import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RunHistoryPanel from "../../components/simulators/shared/RunHistoryPanel.jsx";

describe("RunHistoryPanel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads owner-private summaries and toggles preservation", async () => {
    const run = {
      id: "run-1",
      seed: "42",
      status: "complete",
      solver: { name: "gillespie-direct-v2" },
      preserved: false,
      completedAt: "2026-08-15T10:00:00.000Z",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [run] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...run, preserved: true }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<RunHistoryPanel modelId="model-1" enabled />);
    fireEvent.click(screen.getByText("Private run history"));
    expect(await screen.findByText(/gillespie-direct-v2/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Preserve" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unpreserve" })).toHaveAttribute("aria-pressed", "true"));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/saved-simulations/model-1/runs/run-1/preserve",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
