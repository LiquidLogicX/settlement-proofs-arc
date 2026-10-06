/**
 * HTTP API (Hono). Pure wiring over `Rail`s so tests can inject fakes.
 *
 *   POST /v1/proofs            { chain?: "base"|"arc"|"tempo", txHash, payee, amountUSDC, memo?, refId?, paidAt? }
 *   POST /v1/tempo/proofs      same body; chain forced to "tempo"
 *   GET  /v1/proofs/lookup     ?chain=&refId=  or  ?chain=&txHash=&payee=&amountUSDC=
 *   GET  /health
 *
 * Every write verifies the payment on its own chain first; unmatched amounts are
 * rejected (400) and never recorded.
 */
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { type Address, type Hex, getAddress, isAddress, isHash, isHex } from "viem";
import { deriveRefId, isDuplicateRefError, serializeProof, type Proof } from "./arc.js";
import { type Erc20UsdcAmount, parseErc20UsdcAmount } from "./decimals.js";
import type { Rail, RailId, VerifiedPayment } from "./rails.js";

export type ProofBody = {
  chain?: string;
  refId?: string;
  txHash?: string;
  payee?: string;
  amountUSDC?: string | number;
  memo?: string;
  paidAt?: string | number;
};

export type AppDeps = {
  rails: Partial<Record<RailId, Rail>>;
  recorderApiKey: string;
  verifierBaseUrl: string;
  /** Disable request logging in tests. */
  quiet?: boolean;
};

/** Write path: 30 POSTs per IP per minute. Lookup path: 120 GETs per IP per minute. */
const RATE_WINDOW_MS = 60_000;
const WRITE_RATE_MAX = 30;
const READ_RATE_MAX = 120;

export function resolveRailId(
  raw: string | undefined | null,
  rails: Partial<Record<RailId, Rail>>,
): RailId | { error: string } {
  const value = raw?.trim().toLowerCase();
  if (!value) {
    if (rails.arc) return "arc";
    if (rails.tempo) return "tempo";
    return { error: "No rail configured" };
  }
  if (value === "base" || value === "arc" || value === "eip155:8453") {
    return rails.arc ? "arc" : { error: "The Base → Arc rail is not configured on this recorder" };
  }
  if (value === "tempo" || /^eip155:(42431|4217)$/.test(value)) {
    return rails.tempo ? "tempo" : { error: "The Tempo rail is not configured on this recorder" };
  }
  return { error: `Unknown chain "${raw}". Use "base" (Base → Arc) or "tempo" (Tempo → Tempo).` };
}

type ParsedBody = {
  refId?: Hex;
  txHash: Hex;
  payee: Address;
  amountUSDC: Erc20UsdcAmount;
  memo: string;
  paidAt?: number;
};

export function parseBody(body: ProofBody): { error: string } | ParsedBody {
  if (!body.txHash || !isHash(body.txHash)) {
    return { error: "txHash must be a 32-byte 0x-prefixed payment transaction hash" };
  }
  if (!body.payee || !isAddress(body.payee)) {
    return { error: "payee must be a valid address" };
  }
  if (body.amountUSDC === undefined || body.amountUSDC === "") {
    return {
      error:
        "amountUSDC is required (integer, 6-decimal stablecoin units; 1 USDC = 1000000). Not Arc native 18-dec wei.",
    };
  }
  let amountUSDC: Erc20UsdcAmount;
  try {
    amountUSDC = parseErc20UsdcAmount(body.amountUSDC);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  let refId: Hex | undefined;
  if (body.refId) {
    if (!isHex(body.refId) || body.refId.length !== 66) {
      return { error: "refId must be a 32-byte 0x-prefixed hex string" };
    }
    refId = body.refId;
  }

  let paidAt: number | undefined;
  if (body.paidAt !== undefined && body.paidAt !== "") {
    paidAt = Number(body.paidAt);
    if (!Number.isFinite(paidAt) || paidAt < 0) {
      return { error: "paidAt must be a unix timestamp in seconds" };
    }
    paidAt = Math.floor(paidAt);
  }

  if (body.memo !== undefined && typeof body.memo !== "string") {
    return { error: "memo must be a string" };
  }

  return {
    refId,
    txHash: body.txHash,
    payee: getAddress(body.payee),
    amountUSDC,
    memo: body.memo ?? "",
    paidAt,
  };
}

type Req = { req: { header: (name: string) => string | undefined } };

function clientIp(c: Req): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return c.req.header("x-real-ip") || "unknown";
}

function extractApiKey(c: Req): string | undefined {
  const xApiKey = c.req.header("x-api-key")?.trim();
  if (xApiKey) return xApiKey;
  const auth = c.req.header("authorization")?.trim();
  if (!auth) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match?.[1]?.trim();
}

export function createApp(deps: AppDeps) {
  const writeHits = new Map<string, number[]>();
  const readHits = new Map<string, number[]>();

  function allow(store: Map<string, number[]>, ip: string, max: number): boolean {
    const now = Date.now();
    const recent = (store.get(ip) ?? []).filter((t) => t > now - RATE_WINDOW_MS);
    if (recent.length >= max) {
      store.set(ip, recent);
      return false;
    }
    recent.push(now);
    store.set(ip, recent);
    return true;
  }

  function authorized(c: Req): boolean {
    const key = extractApiKey(c);
    return Boolean(key) && key === deps.recorderApiKey;
  }

  function verifyUrl(rail: Rail, refId: Hex) {
    return `${deps.verifierBaseUrl}/proofs/${refId}?network=${rail.registry.verifierNetwork ?? rail.registry.network}`;
  }

  /** Best-effort proofId + registry tx for a refId (null on RPC error). Sequential on purpose. */
  async function proofLocation(rail: Rail, refId: Hex, recordedAt?: number) {
    const proofId = await rail.findProofId(refId).catch(() => null);
    const proofTxHash = await rail.findProofTxHash(refId, recordedAt).catch(() => null);
    return { proofId, proofTxHash };
  }

  function paymentView(
    rail: Rail,
    args: { txHash: Hex; payee: Address; amountUSDC: bigint },
    payment: VerifiedPayment | null,
  ) {
    return {
      chain: `eip155:${rail.payment.chainId}`,
      network: rail.payment.network,
      txHash: args.txHash,
      explorerUrl: `${rail.payment.explorer}/tx/${args.txHash}`,
      payer: payment?.payer ?? null,
      payee: args.payee,
      amountUSDC: args.amountUSDC.toString(),
      token: payment?.token ?? null,
      tokenSymbol: payment?.tokenSymbol ?? (rail.payment.network === "base" ? "USDC" : null),
      transferMemo: payment?.transferMemo ?? null,
      /** true when the recorder (re)checked the payment on-chain while building this response. */
      verified: payment !== null,
    };
  }

  function registryView(rail: Rail, proofTxHash: Hex | null) {
    return {
      chain: `eip155:${rail.registry.chainId}`,
      network: rail.registry.network,
      contract: rail.registry.address,
      txHash: proofTxHash,
      explorerUrl: proofTxHash
        ? `${rail.registry.explorer}/tx/${proofTxHash}`
        : `${rail.registry.explorer}/address/${rail.registry.address}`,
    };
  }

  function proofResponse(
    rail: Rail,
    proof: Proof | ReturnType<typeof serializeProof>,
    extra: {
      idempotent: boolean;
      proofId: number | null;
      proofTxHash: Hex | null;
      payment: VerifiedPayment | null;
    },
  ) {
    const serialized = "amountUSDC" in proof && typeof proof.amountUSDC === "bigint"
      ? serializeProof(proof as Proof)
      : (proof as ReturnType<typeof serializeProof>);
    return {
      idempotent: extra.idempotent,
      proofId: extra.proofId,
      proofTxHash: extra.proofTxHash,
      proof: serialized,
      rail: rail.id,
      payment: paymentView(
        rail,
        {
          txHash: serialized.srcTxHash,
          payee: serialized.payee,
          amountUSDC: BigInt(serialized.amountUSDC),
        },
        extra.payment,
      ),
      registry: registryView(rail, extra.proofTxHash),
      verifyUrl: verifyUrl(rail, serialized.refId),
    };
  }

  const app = new Hono();
  if (!deps.quiet) app.use("*", logger());
  app.use("*", cors());

  app.get("/health", async (c) => {
    const rails = Object.values(deps.rails).filter(Boolean) as Rail[];
    try {
      const healths = await Promise.all(rails.map((r) => r.health()));
      const byId = Object.fromEntries(healths.map((h, i) => [rails[i]!.id, h]));
      // Keep the original flat Arc fields at top level for existing monitors.
      const arc = byId.arc ?? {};
      return c.json({
        ok: true,
        ...arc,
        rails: byId,
        note: "Payment is verified on its own chain before any write (Base USDC for the Arc registry; TIP-20 stablecoins for the Tempo registry). Proofs are public and append-only. No confidentiality; no ALLOW_UNVERIFIED_AMOUNT.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ ok: false, error: message }, 503);
    }
  });

  async function handleWrite(c: Context, forced?: RailId) {
    if (!authorized(c)) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    if (!allow(writeHits, clientIp(c), WRITE_RATE_MAX)) {
      return c.json({ error: "Rate limit exceeded (30 requests/minute)", code: "RATE_LIMITED" }, 429);
    }

    let body: ProofBody;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const railId = resolveRailId(forced ?? body.chain, deps.rails);
    if (typeof railId !== "string") return c.json({ error: railId.error, code: "BAD_CHAIN" }, 400);
    const rail = deps.rails[railId]!;

    const parsed = parseBody(body);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);
    const noteError = rail.validateNote(parsed.memo);
    if (noteError) return c.json({ error: noteError }, 400);

    const { txHash, payee, amountUSDC } = parsed;
    const refId = parsed.refId ?? deriveRefId(txHash, payee, amountUSDC);

    try {
      const existing = await rail.readProof(refId);
      if (existing) {
        const loc = await proofLocation(rail, refId, existing.recordedAt);
        // Tempo reads are cheap (~0.5 s blocks, one RPC): re-check so the response carries payer/token.
        // Arc keeps its original idempotent path (no extra Base RPC calls).
        const payment =
          rail.id === "tempo"
            ? await rail
                .verifyPayment({
                  txHash: existing.srcTxHash,
                  payee: existing.payee,
                  amountUSDC: existing.amountUSDC,
                })
                .catch(() => null)
            : null;
        return c.json(proofResponse(rail, existing, { idempotent: true, ...loc, payment }));
      }

      const payment = await rail.verifyPayment({ txHash, payee, amountUSDC });
      const paidAt = parsed.paidAt ?? Number(payment.blockTimestamp);
      const memo = rail.buildMemo(parsed.memo, payment);

      // Low-balance guard: fail fast with 503 instead of failing mid-write.
      await rail.assertCanWrite();

      let proofTxHash: Hex;
      try {
        proofTxHash = await rail.writeProof({ refId, payee, amountUSDC, paidAt, srcTxHash: txHash, memo });
      } catch (err) {
        if (isDuplicateRefError(err)) {
          const raced = await rail.readProof(refId);
          if (raced) {
            const loc = await proofLocation(rail, refId, raced.recordedAt);
            return c.json(proofResponse(rail, raced, { idempotent: true, ...loc, payment }));
          }
        }
        throw err;
      }

      const proof = await rail.readProof(refId);
      const proofId = await rail.findProofId(refId).catch(() => null);
      return c.json(
        proofResponse(
          rail,
          proof ?? {
            refId,
            payee,
            amountUSDC: amountUSDC.toString(),
            paidAt,
            srcTxHash: txHash,
            memo,
            recordedAt: Math.floor(Date.now() / 1000),
          },
          { idempotent: false, proofId, proofTxHash, payment },
        ),
        201,
      );
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      const code = (err as { code?: string }).code;
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ msg: "record proof failed", rail: rail.id, code, message }));
      return c.json({ error: message, code }, status as 400);
    }
  }

  app.post("/v1/proofs", (c) => handleWrite(c));
  app.post("/v1/tempo/proofs", (c) => handleWrite(c, "tempo"));

  /**
   * Read-only lookup for idempotency (no write, no payment verify).
   * ?refId=0x… or ?txHash=&payee=&amountUSDC= (refId derived like POST). Optional ?chain=.
   */
  app.get("/v1/proofs/lookup", async (c) => {
    if (!authorized(c)) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    if (!allow(readHits, clientIp(c), READ_RATE_MAX)) {
      return c.json({ error: "Rate limit exceeded (120 requests/minute)", code: "RATE_LIMITED" }, 429);
    }
    const railId = resolveRailId(c.req.query("chain"), deps.rails);
    if (typeof railId !== "string") return c.json({ error: railId.error, code: "BAD_CHAIN" }, 400);
    const rail = deps.rails[railId]!;

    let refId: Hex;
    const rawRef = c.req.query("refId");
    if (rawRef) {
      if (!isHex(rawRef) || rawRef.length !== 66) {
        return c.json({ error: "refId must be a 32-byte 0x-prefixed hex string" }, 400);
      }
      refId = rawRef;
    } else {
      const parsed = parseBody({
        txHash: c.req.query("txHash"),
        payee: c.req.query("payee"),
        amountUSDC: c.req.query("amountUSDC"),
      });
      if ("error" in parsed) return c.json({ error: parsed.error }, 400);
      refId = deriveRefId(parsed.txHash, parsed.payee, parsed.amountUSDC);
    }

    try {
      const existing = await rail.readProof(refId);
      if (!existing) return c.json({ found: false, refId, rail: rail.id }, 404);
      const loc = await proofLocation(rail, refId, existing.recordedAt);
      return c.json({ found: true, ...proofResponse(rail, existing, { idempotent: true, ...loc, payment: null }) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message, code: "REGISTRY_READ_FAILED" }, 503);
    }
  });

  return app;
}
