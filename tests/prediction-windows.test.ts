import { describe, expect, it } from "vitest";
import { formatCountdown, resolvePredictionWindow } from "../lib/predictionWindows";

describe("resolvePredictionWindow", () => {
  it("keeps a session editable until 10 minutes before the lock anchor", () => {
    const window = resolvePredictionWindow(
      {
        qualifying_starts_at: "2026-03-27T12:00:00.000Z",
        quali_locked: false,
      },
      "qualifying",
      new Date("2026-03-27T11:45:00.000Z")
    );

    expect(window.editable).toBe(true);
    expect(window.locked).toBe(false);
    expect(window.lockAt).toBe("2026-03-27T11:50:00.000Z");
  });

  it("locks the session at the lock anchor (10 minutes before start) — final, no paid edit", () => {
    const window = resolvePredictionWindow(
      {
        race_starts_at: "2026-03-27T14:00:00.000Z",
        race_locked: false,
      },
      "race",
      new Date("2026-03-27T13:55:00.000Z")
    );

    expect(window.editable).toBe(false);
    expect(window.locked).toBe(true);
    expect(window.lockAt).toBe("2026-03-27T13:50:00.000Z");
  });

  it("stays locked after the session has started", () => {
    const window = resolvePredictionWindow(
      {
        race_starts_at: "2026-03-27T14:00:00.000Z",
        race_locked: false,
      },
      "race",
      new Date("2026-03-27T14:11:00.000Z")
    );

    expect(window.editable).toBe(false);
    expect(window.locked).toBe(true);
  });

  it("prefers lock_time_utc as the lock anchor when present", () => {
    const window = resolvePredictionWindow(
      {
        lock_time_utc: "2026-03-27T11:00:00.000Z",
        qualifying_starts_at: "2026-03-27T12:00:00.000Z",
        race_starts_at: "2026-03-27T15:00:00.000Z",
      },
      "race",
      new Date("2026-03-27T10:55:00.000Z")
    );

    // Lock anchor is 11:00 - 10min = 10:50; at 10:55 picks are already locked.
    expect(window.locked).toBe(true);
    expect(window.lockAt).toBe("2026-03-27T10:50:00.000Z");
  });
});

describe("formatCountdown", () => {
  it("formats short windows in minutes", () => {
    expect(
      formatCountdown(
        "2026-03-27T14:10:00.000Z",
        new Date("2026-03-27T14:00:00.000Z")
      )
    ).toBe("10m");
  });
});
