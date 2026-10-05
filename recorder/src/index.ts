import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { ARC_ERC20_USDC_DECIMALS, ARC_NATIVE_USDC_DECIMALS } from "./decimals.js";
import { type Rail, type RailId, createArcRail, createTempoRail } from "./rails.js";

const config = loadConfig();

const rails: Partial<Record<RailId, Rail>> = {};
if (config.arc) rails.arc = await createArcRail(config.arc);
if (config.tempo) rails.tempo = await createTempoRail(config.tempo);

const app = createApp({
  rails,
  recorderApiKey: config.recorderApiKey,
  verifierBaseUrl: config.verifierBaseUrl,
});

console.log(
  JSON.stringify({
    msg: "settlement recorder listening",
    host: config.host,
    port: config.port,
    rails: Object.values(rails).map((r) => ({
      id: r.id,
      label: r.label,
      recorder: r.recorderAddress,
      settlementProofs: r.registry.address,
      registryChainId: r.registry.chainId,
      paymentChainId: r.payment.chainId,
      minConfirmations: r.minConfirmations,
    })),
    proofAmountDecimals: ARC_ERC20_USDC_DECIMALS,
    arcNativeGasDecimals: ARC_NATIVE_USDC_DECIMALS,
  }),
);

serve({ fetch: app.fetch, hostname: config.host, port: config.port });
