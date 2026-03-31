import { describe, expect, it } from "vitest";
import {
  buildRaceId,
  buildRaceSeedRows,
  buildSessionIso,
  type JolpicaRace,
} from "../lib/jolpica";

const japanRace: JolpicaRace = {
  season: "2026",
  round: "3",
  raceName: "Japanese Grand Prix",
  Circuit: {
    circuitId: "suzuka",
    circuitName: "Suzuka Circuit",
    Location: {
      locality: "Suzuka",
      country: "Japan",
    },
  },
  date: "2026-03-29",
  time: "05:00:00Z",
  Qualifying: {
    date: "2026-03-28",
    time: "05:00:00Z",
  },
};

describe("buildSessionIso", () => {
  it("fills in midnight UTC when the API omits a session time", () => {
    expect(buildSessionIso("2026-09-13", null)).toBe("2026-09-13T00:00:00.000Z");
  });
});

describe("buildRaceId", () => {
  it("keeps stable internal ids for aliased circuits", () => {
    expect(
      buildRaceId({
        ...japanRace,
        raceName: "United States Grand Prix",
        Circuit: {
          circuitId: "americas",
          circuitName: "Circuit of the Americas",
          Location: {
            locality: "Austin",
            country: "United States",
          },
        },
      })
    ).toBe("usa-2026");
  });
});

describe("buildRaceSeedRows", () => {
  it("derives row data and lock state from the API schedule", () => {
    const [row] = buildRaceSeedRows([japanRace], new Date("2026-03-28T04:00:00.000Z"));

    expect(row).toMatchObject({
      id: "japan-2026",
      season: 2026,
      round: 3,
      grand_prix_name: "Japanese Grand Prix",
      country: "Japan",
      circuit: "Suzuka Circuit",
      race_date: "2026-03-29",
      race_starts_at: "2026-03-29T05:00:00Z",
      qualifying_starts_at: "2026-03-28T05:00:00Z",
      is_locked: false,
      race_locked: false,
    });
  });
});
