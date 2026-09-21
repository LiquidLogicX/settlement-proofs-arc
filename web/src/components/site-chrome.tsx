import Link from "next/link";
import type { ReactNode } from "react";
import { getPublicConfig } from "@/lib/config";

const config = getPublicConfig();

export function SiteChrome({
  children,
  active,
  title,
  subtitle,
}: {
  children: ReactNode;
  active: "ledger" | "proofs";
  title: string;
  subtitle: ReactNode;
}) {
  return (
    <div className="relative flex flex-1 flex-col">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute top-40 right-0 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>
      <header className="relative border-b border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs tracking-[0.35em] text-violet-300 uppercase">
              Settlement proofs on Arc
            </p>
            <nav className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 p-1 text-sm">
              <NavLink href="/" active={active === "ledger"}>
                Ledger
              </NavLink>
              <NavLink href="/proofs" active={active === "proofs"}>
                Proofs
              </NavLink>
              <a
                href={config.arcExplorer}
                target="_blank"
                rel="noreferrer"
                className="rounded-full px-3 py-1.5 text-silver-300 transition hover:bg-white/5 hover:text-silver-50"
              >
                Arc explorer
              </a>
            </nav>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-silver-50 sm:text-4xl">
                {title}
              </h1>
              <div className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                {subtitle}
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
      <footer className="relative border-t border-white/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <span>
            Read-only · settlement proofs on Arc (eip155:5042) · Base payment → Arc
            notarization · public srcTxHash
          </span>
          <span>MIT License</span>
        </div>
      </footer>
    </div>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-violet-500/25 px-3 py-1.5 text-violet-100"
          : "rounded-full px-3 py-1.5 text-silver-300 transition hover:bg-white/5 hover:text-silver-50"
      }
    >
      {children}
    </Link>
  );
}
