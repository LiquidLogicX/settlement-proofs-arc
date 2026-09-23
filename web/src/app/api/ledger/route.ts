import { NextResponse } from "next/server";
import { getNetwork } from "@/lib/config";
import { fetchLedger, resolveNetworkId, serializeLedger } from "@/lib/proofs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const networkId = resolveNetworkId(searchParams.get("network"));
  const network = getNetwork(networkId);

  if (network.role !== "registry") {
    return NextResponse.json(
      {
        error: `${network.label} is the USDC payment rail. Switch to Arc or Tempo to load the settlement proofs ledger.`,
        network: networkId,
      },
      { status: 400 },
    );
  }

  try {
    const snapshot = await fetchLedger(networkId);
    return NextResponse.json({ ...serializeLedger(snapshot), network: networkId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, network: networkId }, { status: 500 });
  }
}
