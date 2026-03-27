import { describe, expect, it } from "vitest";
import { formatCountdown, resolvePredictionWindow } from "../lib/predictionWindows";

describe("resolvePredictionWindow", () => {
  it("keeps a session editable until 10 minutes before the start time", () => {
    const window = resolvePredictionWindow(
      {
        qualifying_starts_at: "2026-03-27T12:00:00.000Z",
        quali_locked: false,
      },
      "qualifying",
      new Date("2026-03-27T11:45:00.000Z")
    );

    expect(window.editable).toBe(true);
    expect(window.paidEdit).toBe(false);
    expect(window.locked).toBe(false);
    expect(window.lockAt).toBe("2026-03-27T11:50:00.000Z");
  });

  it("opens the paid edit window for 10 minutes after session start", () => {
    const window = resolvePredictionWindow(
      {
        race_starts_at: "2026-03-27T14:00:00.000Z",
        race_locked: false,
      },
      "race",
      new Date("2026-03-27T14:05:00.000Z")
    );

    expect(window.editable).toBe(true);
    expect(window.paidEdit).toBe(true);
    expect(window.locked).toBe(false);
    expect(window.paidEditClosesAt).toBe("2026-03-27T14:10:00.000Z");
  });

  it("locks the session after the paid edit window closes", () => {
    const window = resolvePredictionWindow(
      {
        race_starts_at: "2026-03-27T14:00:00.000Z",
        race_locked: false,
      },
      "race",
      new Date("2026-03-27T14:11:00.000Z")
    );

    expect(window.editable).toBe(false);
    expect(window.paidEdit).toBe(false);
    expect(window.locked).toBe(true);
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
