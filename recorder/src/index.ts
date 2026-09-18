import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import {
  type Address,
  type Hex,
  createPublicClient,
  getAddress,
  http,
  isAddress,
  isHash,
  isHex,
} from "viem";
import { loadConfig } from "./config.js";
import {
  arcChainFromId,
  createArcClients,
  deriveRefId,
  isDuplicateRefError,
  readProof,
  serializeProof,
  verifyArcPayment,
  writeProof,
} from "./arc.js";

type ProofBody = {
  refId?: string;
  txHash?: string;
  payee?: string;
  amountUSDC?: string | number;
  memo?: string;
  paidAt?: string | number;
};

const config = loadConfig();

const arcProbe = await createPublicClient({
  transport: http(config.arcRpcUrl),
}).getChainId();

const arc = createArcClients({
  rpcUrl: config.arcRpcUrl,
  privateKey: config.recorderPrivateKey,
  chain: arcChainFromId(arcProbe),
});

/** Write path: 30 POSTs per IP per minute. */
const WRITE_RATE_WINDOW_MS = 60_000;
const WRITE_RATE_MAX = 30;
const writeHitsByIp = new Map<string, number[]>();

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return c.req.header("x-real-ip") || "unknown";
}

function checkRateLimit(
  store: Map<string, number[]>,
  ip: string,
  windowMs: number,
  max: number,
): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;
  const prev = store.get(ip) ?? [];
  const recent = prev.filter((t) => t > windowStart);
  if (recent.length >= max) {
    store.set(ip, recent);
    return false;
  }
  recent.push(now);
  store.set(ip, recent);
  return true;
}

function extractApiKey(c: {
  req: { header: (name: string) => string | undefined };
}): string | undefined {
  const xApiKey = c.req.header("x-api-key")?.trim();
  if (xApiKey) return xApiKey;
  const auth = c.req.header("authorization")?.trim();
  if (!auth) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match?.[1]?.trim();
}

function requireAuth(c: {
  req: { header: (name: string) => string | undefined };
}): true | { error: string; code: string; status: 401 } {
  const apiKey = extractApiKey(c);
  if (!apiKey || apiKey !== config.recorderApiKey) {
    return { error: "Unauthorized", code: "UNAUTHORIZED", status: 401 };
  }
  return true;
}

const app = new Hono();
app.use("*", logger());
app.use("*", cors());

app.get("/health", async (c) => {
  try {
    const [arcId, recorderBalance] = await Promise.all([
      arc.publicClient.getChainId(),
      arc.publicClient.getBalance({ address: arc.account.address }),
    ]);
    return c.json({
      ok: true,
      recorder: arc.account.address,
      settlementProofs: config.settlementProofsAddress,
      arcChainId: arcId,
      recorderArcBalanceWei: recorderBalance.toString(),
      minConfirmations: config.minConfirmations,
      settlementRail: "arc-usdc",
      note: "Recorder holds no treasury funds; Arc balance is gas (native USDC) only. Verifies Arc USDC Transfer for srcTxHash, then records cleartext payee + public srcTxHash.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 503);
  }
});

app.post("/v1/proofs", async (c) => {
  const auth = requireAuth(c);
  if (auth !== true) {
    return c.json({ error: auth.error, code: auth.code }, auth.status);
  }

  const ip = clientIp(c);
  if (!checkRateLimit(writeHitsByIp, ip, WRITE_RATE_WINDOW_MS, WRITE_RATE_MAX)) {
    return c.json({ error: "Rate limit exceeded (30 requests/minute)", code: "RATE_LIMITED" }, 429);
  }

  let body: ProofBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parseBody(body);
  if ("error" in parsed) {
    return c.json({ error: parsed.error }, 400);
  }

  const { txHash, payee, amountUSDC, memo } = parsed;
  const refId = parsed.refId ?? deriveRefId(txHash, payee, amountUSDC);

  try {
    const existing = await readProof({
      publicClient: arc.publicClient,
      address: config.settlementProofsAddress,
      refId,
    });
    if (existing) {
      return c.json({
        idempotent: true,
        proof: serializeProof(existing),
      });
    }

    const verified = await verifyArcPayment({
      client: arc.publicClient,
      txHash,
      payee,
      amountUSDC,
      minConfirmations: config.minConfirmations,
    });

    const paidAt = parsed.paidAt ?? Number(verified.blockTimestamp);

    let proofTxHash: Hex;
    try {
      proofTxHash = await writeProof({
        walletClient: arc.walletClient,
        publicClient: arc.publicClient,
        account: arc.account,
        address: config.settlementProofsAddress,
        refId,
        payee,
        amountUSDC,
        paidAt,
        srcTxHash: txHash,
        memo,
      });
    } catch (err) {
      if (isDuplicateRefError(err)) {
        const raced = await readProof({
          publicClient: arc.publicClient,
          address: config.settlementProofsAddress,
          refId,
        });
        if (raced) {
          return c.json({
            idempotent: true,
            proof: serializeProof(raced),
          });
        }
      }
      throw err;
    }

    const proof = await readProof({
      publicClient: arc.publicClient,
      address: config.settlementProofsAddress,
      refId,
    });

    return c.json(
      {
        idempotent: false,
        proofTxHash,
        proof: proof
          ? serializeProof(proof)
          : {
              refId,
              payee,
              amountUSDC: amountUSDC.toString(),
              paidAt,
              srcTxHash: txHash,
              memo,
            },
      },
      201,
    );
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const code = (err as { code?: string }).code;
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ msg: "record proof failed", code, message }));
    return c.json({ error: message, code }, status as 400);
  }
});

function parseBody(body: ProofBody):
  | { error: string }
  | {
      refId?: Hex;
      txHash: Hex;
      payee: Address;
      amountUSDC: bigint;
      memo: string;
      paidAt?: number;
    } {
  if (!body.txHash || !isHash(body.txHash)) {
    return { error: "txHash must be a 32-byte 0x-prefixed Arc settlement transaction hash" };
  }
  if (!body.payee || !isAddress(body.payee)) {
    return { error: "payee must be a valid address" };
  }
  if (body.amountUSDC === undefined || body.amountUSDC === "") {
    return { error: "amountUSDC is required (integer, 6 decimals; 1 USDC = 1000000)" };
  }
  let amountUSDC: bigint;
  try {
    amountUSDC = BigInt(body.amountUSDC);
  } catch {
    return { error: "amountUSDC must be an integer string (6 decimals)" };
  }
  if (amountUSDC <= 0n) {
    return { error: "amountUSDC must be > 0" };
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

  return {
    refId,
    txHash: body.txHash,
    payee: getAddress(body.payee),
    amountUSDC,
    memo: body.memo ?? "",
    paidAt,
  };
}

const port = config.port;
console.log(
  JSON.stringify({
    msg: "settlement recorder listening",
    host: config.host,
    port,
    recorder: arc.account.address,
    settlementProofs: config.settlementProofsAddress,
    arcChainId: arcProbe,
    minConfirmations: config.minConfirmations,
    settlementRail: "arc-usdc",
  }),
);

serve({ fetch: app.fetch, hostname: config.host, port });
