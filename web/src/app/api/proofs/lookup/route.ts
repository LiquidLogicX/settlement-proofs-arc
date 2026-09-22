import { NextResponse } from "next/server";
import { lookupProof, serializeLookup } from "@/lib/proofs";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? searchParams.get("query") ?? "";

  try {
    const result = await lookupProof(q);
    const status =
      result.status === "invalid" ? 400 : result.status === "not_found" ? 404 : 200;
    return NextResponse.json(serializeLookup(result), { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
