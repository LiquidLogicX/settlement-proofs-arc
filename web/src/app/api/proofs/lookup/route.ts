import { NextResponse } from "next/server";
import { getNetwork } from "@/lib/config";
import { lookupProof, resolveNetworkId, serializeLookup } from "@/lib/proofs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? searchParams.get("query") ?? "";
  const networkId = resolveNetworkId(searchParams.get("network"));
  const network = getNetwork(networkId);

  if (network.role !== "registry") {
    return NextResponse.json(
      {
        error: `${network.label} hosts the USDC payment, not the notarization registry. Switch to Arc or Tempo to verify a proof.`,
        network: networkId,
      },
      { status: 400 },
    );
  }

  try {
    const result = await lookupProof(q, networkId);
    const status =
      result.status === "invalid" ? 400 : result.status === "not_found" ? 404 : 200;
    return NextResponse.json({ ...serializeLookup(result), network: networkId }, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, network: networkId }, { status: 500 });
  }
}
