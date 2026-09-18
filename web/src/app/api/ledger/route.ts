import { NextResponse } from "next/server";
import { fetchLedger, serializeLedger } from "@/lib/proofs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await fetchLedger();
    return NextResponse.json(serializeLedger(snapshot));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
