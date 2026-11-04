import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../src/app.js";
import { createHealthCache } from "../src/health-cache.js";
import type { Rail, RailId } from "../src/rails.js";

/** Minimal rail: only health() matters for these tests. */
function fakeRail(id: RailId, health: () => Promise<Record<string, unknown>>): Rail {
  return { id, health } as unknown as Rail;
}

function app(rails: Partial<Record<RailId, Rail>>, health = {}) {
  return createApp({
    rails,
    recorderApiKey: "k",
    verifierBaseUrl: "https://proofs.liquidlogicx.com",
    quiet: true,
    health,
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const never = () => new Promise<Record<string, unknown>>(() => {});

describe("GET /health — generic liveness, no internal detail", () => {
  it("answers { ok: true } and nothing else, even when the rail snapshot has secrets", async () => {
    const a = app(
      {
        arc: fakeRail("arc", async () => ({
          rail: "arc",
          recorder: "0xrecorder",
          recorderArcBalanceWei: "500",
          settlementProofs: "0xregistry",
          arcChainId: 5042,
        })),
      },
      { refreshMs: 60_000 },
    );
    const res = await a.request("/health");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true });
    const text = JSON.stringify(body);
    assert.equal(text.includes("recorder"), false);
    assert.equal(text.includes("500"), false);
    assert.equal(text.includes("0xregistry"), false);
  });

  it("cold start with a hung RPC still answers 200 within firstWaitMs", async () => {
    const a = app({ arc: fakeRail("arc", never) }, { firstWaitMs: 50, timeoutMs: 10_000 });
    const t0 = Date.now();
    const res = await a.request("/health");
    const ms = Date.now() - t0;
    assert.equal(res.status, 200);
    assert.ok(ms < 1_000, `took ${ms} ms`);
    assert.deepEqual(await res.json(), { ok: true });
  });

  it("does not call RPC on every probe", async () => {
    let calls = 0;
    const a = app(
      {
        arc: fakeRail("arc", async () => {
          calls++;
          return { rail: "arc", recorderArcBalanceWei: "500" };
        }),
      },
      { refreshMs: 60_000 },
    );
    for (let i = 0; i < 5; i++) assert.equal((await a.request("/health")).status, 200);
    assert.equal(calls, 1);
  });

  it("a later hung RPC still answers fast", async () => {
    let hang = false;
    const a = app(
      {
        arc: fakeRail("arc", () => (hang ? never() : Promise.resolve({ rail: "arc", recorderArcBalanceWei: "900" }))),
      },
      { refreshMs: 0, timeoutMs: 30 },
    );
    await a.request("/health");
    hang = true;
    const t0 = Date.now();
    const res = await a.request("/health");
    assert.ok(Date.now() - t0 < 500);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
});

describe("health cache — chain snapshot stays internal", () => {
  it("cold start marks the rail pending and invents no balance", async () => {
    const cache = createHealthCache([fakeRail("arc", never)], { firstWaitMs: 50, timeoutMs: 10_000 });
    const view = await cache.view();
    assert.equal(view.byId.arc?.status, "pending");
    assert.equal(view.byId.arc?.recorderArcBalanceWei, undefined);
    assert.equal(view.chain.stale, true);
  });

  it("serves cached balances and does not call RPC on every read", async () => {
    let calls = 0;
    const cache = createHealthCache(
      [
        fakeRail("arc", async () => {
          calls++;
          return { rail: "arc", recorderArcBalanceWei: "500", lowGas: false, arcChainId: 5042 };
        }),
        fakeRail("tempo", async () => ({ rail: "tempo", recorderFeeBalance: "7", lowGas: false })),
      ],
      { refreshMs: 60_000 },
    );
    for (let i = 0; i < 5; i++) await cache.view();
    const view = await cache.view();
    assert.equal(calls, 1);
    assert.equal(view.byId.arc?.recorderArcBalanceWei, "500");
    assert.equal(view.byId.arc?.arcChainId, 5042);
    assert.equal(view.byId.tempo?.recorderFeeBalance, "7");
    assert.equal(view.chain.stale, false);
    assert.equal(view.chain.errors, undefined);
  });

  it("a later hung RPC keeps the last good values", async () => {
    let hang = false;
    const cache = createHealthCache(
      [
        fakeRail("arc", () =>
          hang ? never() : Promise.resolve({ rail: "arc", recorderArcBalanceWei: "900", lowGas: false }),
        ),
      ],
      { refreshMs: 0, timeoutMs: 30 },
    );
    await cache.view();
    hang = true;
    const during = await cache.view();
    assert.equal(during.byId.arc?.recorderArcBalanceWei, "900");
    await sleep(60);
    const after = await cache.view();
    assert.equal(after.byId.arc?.recorderArcBalanceWei, "900");
    assert.match(String(after.chain.errors?.arc), /timed out after 30 ms/);
  });

  it("only one refresh runs at a time", async () => {
    let calls = 0;
    let release!: () => void;
    const cache = createHealthCache(
      [
        fakeRail("arc", () => {
          calls++;
          return new Promise((r) => {
            release = () => r({ rail: "arc", recorderArcBalanceWei: "1" });
          });
        }),
      ],
      { refreshMs: 0, firstWaitMs: 10, timeoutMs: 10_000 },
    );
    for (let i = 0; i < 10; i++) await cache.view();
    assert.equal(calls, 1);
    release();
    await sleep(5);
    const view = await cache.view();
    assert.equal(view.byId.arc?.recorderArcBalanceWei, "1");
  });

  it("marks values stale when the last good check is old", async () => {
    let t = 1_000_000;
    let fail = false;
    const cache = createHealthCache(
      [
        fakeRail("arc", () =>
          fail ? Promise.reject(new Error("rpc down")) : Promise.resolve({ rail: "arc", recorderArcBalanceWei: "3" }),
        ),
      ],
      { refreshMs: 1_000, staleAfterMs: 120_000, now: () => t },
    );
    await cache.view();
    fail = true;
    t += 200_000;
    await cache.view();
    await sleep(5);
    const view = await cache.view();
    assert.equal(view.byId.arc?.recorderArcBalanceWei, "3");
    assert.equal(view.byId.arc?.stale, true);
    assert.equal(view.chain.stale, true);
    assert.equal(view.chain.errors?.arc, "rpc down");
  });
});
