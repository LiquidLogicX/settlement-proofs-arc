/**
 * Cached chain status for GET /health.
 *
 * Render probes /health every few seconds and fails the probe after 5 s. Each rail's
 * `health()` makes live JSON-RPC calls (Arc chainId + gas balance, Tempo fee-token
 * balance), and viem's HTTP transport waits up to 10 s per attempt with 3 retries, so a
 * slow public RPC could hold /health for ~40 s and Render would mark the instance
 * unhealthy and restart it, even though the process was fine.
 *
 * This cache keeps RPC work off the probe's request path:
 *   - /health answers from the last snapshot right away;
 *   - a refresh starts in the background when the snapshot is older than `refreshMs`
 *     (only one refresh at a time, so slow RPCs never pile up);
 *   - each rail's check is capped at `timeoutMs`; a failure keeps the last good values
 *     and records the error;
 *   - only the very first request (cold start) waits, and at most `firstWaitMs`.
 *
 * Writes still check gas / fee balance live (`assertCanWrite`), so cached values in
 * /health are informational and never gate a write on their own.
 */
import type { Rail } from "./rails.js";

export type HealthCacheOptions = {
  /** Start a background refresh when the snapshot is older than this. Default 15 s. */
  refreshMs?: number;
  /** Cap on one rail's health() call. Default 4 s. */
  timeoutMs?: number;
  /** Cold start only: how long the first /health waits for the first check. Default 2 s. */
  firstWaitMs?: number;
  /** Mark rails stale when their last good check is older than this. Default 120 s. */
  staleAfterMs?: number;
  /** Clock override for tests. */
  now?: () => number;
};

type RailEntry = {
  data: Record<string, unknown> | null;
  okAt: number | null;
  error: string | null;
  errorAt: number | null;
};

export type HealthView = {
  byId: Record<string, Record<string, unknown>>;
  chain: {
    checkedAt: string | null;
    ageMs: number | null;
    stale: boolean;
    refreshing: boolean;
    errors?: Record<string, string>;
  };
};

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

export function createHealthCache(rails: Rail[], opts: HealthCacheOptions = {}) {
  const refreshMs = opts.refreshMs ?? 15_000;
  const timeoutMs = opts.timeoutMs ?? 4_000;
  const firstWaitMs = opts.firstWaitMs ?? 2_000;
  const staleAfterMs = opts.staleAfterMs ?? 120_000;
  const now = opts.now ?? Date.now;

  const entries = new Map<string, RailEntry>(
    rails.map((r) => [r.id, { data: null, okAt: null, error: null, errorAt: null }]),
  );
  let lastAttemptAt: number | null = null;
  let inflight: Promise<void> | null = null;

  async function checkRail(rail: Rail) {
    const entry = entries.get(rail.id)!;
    const started = now();
    try {
      entry.data = await withTimeout(rail.health(), timeoutMs);
      entry.okAt = now();
      entry.error = null;
      entry.errorAt = null;
    } catch (err) {
      entry.error = err instanceof Error ? err.message : String(err);
      entry.errorAt = now();
      console.warn(
        JSON.stringify({
          msg: "health check: chain status refresh failed (serving last known values)",
          rail: rail.id,
          error: entry.error.slice(0, 300),
          ms: now() - started,
        }),
      );
    }
  }

  function refresh(): Promise<void> {
    if (inflight) return inflight;
    lastAttemptAt = now();
    inflight = Promise.all(rails.map(checkRail))
      .then(() => undefined)
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  async function view(): Promise<HealthView> {
    const t = now();
    if (!inflight && (lastAttemptAt === null || t - lastAttemptAt >= refreshMs)) {
      void refresh();
    }
    const cold = [...entries.values()].every((e) => e.okAt === null && e.errorAt === null);
    if (cold && inflight) {
      await withTimeout(inflight, firstWaitMs).catch(() => undefined);
    }

    const t2 = now();
    const byId: Record<string, Record<string, unknown>> = {};
    const errors: Record<string, string> = {};
    let oldestOk: number | null = null;
    let stale = false;
    for (const rail of rails) {
      const e = entries.get(rail.id)!;
      if (e.error) errors[rail.id] = e.error;
      if (e.data && e.okAt !== null) {
        const railStale = t2 - e.okAt > staleAfterMs;
        stale ||= railStale;
        oldestOk = oldestOk === null ? e.okAt : Math.min(oldestOk, e.okAt);
        byId[rail.id] = { ...e.data, checkedAt: new Date(e.okAt).toISOString(), stale: railStale };
      } else {
        stale = true;
        byId[rail.id] = { rail: rail.id, status: e.error ? "unavailable" : "pending" };
      }
    }
    return {
      byId,
      chain: {
        checkedAt: oldestOk === null ? null : new Date(oldestOk).toISOString(),
        ageMs: oldestOk === null ? null : t2 - oldestOk,
        stale,
        refreshing: inflight !== null,
        ...(Object.keys(errors).length ? { errors } : {}),
      },
    };
  }

  return { view, refresh };
}
