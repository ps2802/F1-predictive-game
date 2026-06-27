"use client";

import { useEffect, useState } from "react";

export type RaceCatalogEntry = {
  id: string;
  round: number;
  name: string;
  country: string | null;
  date: string | null;
  qualifying_starts_at: string | null;
  race_starts_at: string | null;
  status: "upcoming" | "closed";
  race_locked: boolean;
  is_locked: boolean;
};

export type RaceCatalogMeta = {
  totalRounds: number;
  driverCount: number | null;
};

type RaceCatalogResponse = {
  races: RaceCatalogEntry[];
  meta: RaceCatalogMeta;
};

export function useRaceCatalog() {
  const [races, setRaces] = useState<RaceCatalogEntry[]>([]);
  const [meta, setMeta] = useState<RaceCatalogMeta>({
    totalRounds: 0,
    driverCount: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadRaces() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch("/api/races", { cache: "no-store" });
        const data = (await res.json()) as Partial<RaceCatalogResponse> & {
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load races.");
        }

        if (!cancelled) {
          setRaces(data.races ?? []);
          setMeta(
            data.meta ?? {
              totalRounds: data.races?.length ?? 0,
              driverCount: null,
            }
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load races.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadRaces();

    return () => {
      cancelled = true;
    };
  }, []);

  return { races, meta, loading, error };
}

export function findRaceById(
  races: RaceCatalogEntry[],
  raceId: string | null | undefined
) {
  return races.find((race) => race.id === raceId) ?? null;
}
