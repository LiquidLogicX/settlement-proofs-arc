import { Ledger } from "@/components/ledger";
import { fetchLedger, serializeLedger } from "@/lib/proofs";

export const dynamic = "force-dynamic";

export default async function Home() {
  let initialData = null;
  let initialError: string | null = null;
  try {
    initialData = serializeLedger(await fetchLedger());
  } catch (err) {
    initialError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="relative flex flex-1 flex-col">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute top-40 right-0 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>
      <header className="relative border-b border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-xs tracking-[0.35em] text-violet-300 uppercase">AI treasurer</p>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-silver-50 sm:text-4xl">
                Arc Settlement Proofs
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Public, append-only <span className="text-silver-100">notarization</span> registry on Arc.
                Payments stay on <span className="text-silver-100">Base</span>; each proof stores
                cleartext payee and the public Base payment <code className="text-violet-200">srcTxHash</code>.
                No confidentiality claim. No wallet required to read this ledger.
              </p>
            </div>
          </div>
        </div>
      </header>
      <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Ledger initialData={initialData} initialError={initialError} />
      </main>
      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <span>Read-only · Arc chainId 5042 · 1A notarize (Base pay → Arc proof) · 2B public srcTxHash</span>
          <span>MIT License</span>
        </div>
      </footer>
    </div>
  );
}
