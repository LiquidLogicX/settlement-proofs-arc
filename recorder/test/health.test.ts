import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../src/app.js";
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

describe("GET /health — never waits on a slow RPC (Render probe timeout is 5 s)", () => {
  it("cold start with a hung RPC answers 200 within firstWaitMs, rail marked pending", async () => {
    const a = app({ arc: fakeRail("arc", never) }, { firstWaitMs: 50, timeoutMs: 10_000 });
    const t0 = Date.now();
    const res = await a.request("/health");
    const ms = Date.now() - t0;
    assert.equal(res.status, 200);
    assert.ok(ms < 1_000, `took ${ms} ms`);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.rails.arc.status, "pending");
    assert.equal(body.recorderArcBalanceWei, undefined, "no invented balance");
    assert.equal(body.chain.stale, true);
  });

  it("serves cached balances (flat Arc fields kept) and does not call RPC on every probe", async () => {
    let calls = 0;
    const a = app(
      {
        arc: fakeRail("arc", async () => {
          calls++;
          return { rail: "arc", recorderArcBalanceWei: "500", lowGas: false, arcChainId: 5042 };
        }),
        tempo: fakeRail("tempo", async () => ({ rail: "tempo", recorderFeeBalance: "7", lowGas: false })),
      },
      { refreshMs: 60_000 },
    );
    for (let i = 0; i < 5; i++) assert.equal((await a.request("/health")).status, 200);
    const body = await (await a.request("/health")).json();
    assert.equal(calls, 1);
    assert.equal(body.ok, true);
    assert.equal(body.recorderArcBalanceWei, "500");
    assert.equal(body.arcChainId, 5042);
    assert.equal(body.rails.tempo.recorderFeeBalance, "7");
    assert.equal(body.chain.stale, false);
    assert.equal(body.chain.errors, undefined);
  });

  it("a later hung RPC keeps the last good values and still answers fast", async () => {
    let hang = false;
    const a = app(
      {
        arc: fakeRail("arc", () =>
          hang ? never() : Promise.resolve({ rail: "arc", recorderArcBalanceWei: "900", lowGas: false }),
        ),
      },
      { refreshMs: 0, timeoutMs: 30 },
    );
    await a.request("/health"); // warm
    hang = true;
    const t0 = Date.now();
    const res = await a.request("/health");
    assert.ok(Date.now() - t0 < 500);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.recorderArcBalanceWei, "900");
    await sleep(60); // let the capped refresh time out
    const after = await (await a.request("/health")).json();
    assert.equal(after.recorderArcBalanceWei, "900");
    assert.match(after.chain.errors.arc, /timed out after 30 ms/);
  });

  it("only one refresh runs at a time, so slow RPCs do not pile up", async () => {
    let calls = 0;
    let release!: () => void;
    const a = app(
      {
        arc: fakeRail("arc", () => {
          calls++;
          return new Promise((r) => {
            release = () => r({ rail: "arc", recorderArcBalanceWei: "1" });
          });
        }),
      },
      { refreshMs: 0, firstWaitMs: 10, timeoutMs: 10_000 },
    );
    for (let i = 0; i < 10; i++) await a.request("/health");
    assert.equal(calls, 1);
    release();
    await sleep(5);
    const body = await (await a.request("/health")).json();
    assert.equal(body.recorderArcBalanceWei, "1");
  });

  it("marks values stale when the last good check is old", async () => {
    let t = 1_000_000;
    let fail = false;
    const a = app(
      {
        arc: fakeRail("arc", () =>
          fail ? Promise.reject(new Error("rpc down")) : Promise.resolve({ rail: "arc", recorderArcBalanceWei: "3" }),
        ),
      },
      { refreshMs: 1_000, staleAfterMs: 120_000, now: () => t },
    );
    await a.request("/health");
    fail = true;
    t += 200_000;
    await a.request("/health"); // kicks a refresh that fails
    await sleep(5);
    const body = await (await a.request("/health")).json();
    assert.equal(body.ok, true);
    assert.equal(body.recorderArcBalanceWei, "3");
    assert.equal(body.rails.arc.stale, true);
    assert.equal(body.chain.stale, true);
    assert.equal(body.chain.errors.arc, "rpc down");
  });
});
