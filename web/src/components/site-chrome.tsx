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
    <div className="relative flex flex-1 flex-col bg-background">
      <header className="relative border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src="/llx-logo.png"
                width={40}
                height={40}
                alt="Liquid Logic X"
                className="h-10 w-10 rounded-full object-cover"
              />
              <p className="text-xs tracking-[0.35em] text-llx-label uppercase">
                Settlement proofs on Arc
              </p>
            </div>
            <nav className="flex items-center gap-1 rounded-full border border-border bg-card p-1 text-sm">
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
                className="rounded-full px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                Arc explorer
              </a>
            </nav>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
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
      <footer className="relative border-t border-border">
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
          ? "rounded-full bg-primary px-3 py-1.5 text-primary-foreground"
          : "rounded-full px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
      }
    >
      {children}
    </Link>
  );
}
