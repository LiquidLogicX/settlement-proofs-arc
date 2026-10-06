"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  NETWORK_IDS,
  getPublicConfig,
  isTempoNetwork,
  type NetworkId,
} from "@/lib/config";

export function NetworkSwitcher({
  active,
  order = NETWORK_IDS,
}: {
  active: NetworkId;
  /** Tab order; the server puts the default Tempo tab first (see lib/tempo-default.ts). */
  order?: NetworkId[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const config = getPublicConfig();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs tracking-[0.2em] text-llx-label uppercase">Network</span>
      <div className="flex flex-wrap items-center gap-1 rounded-full border border-border bg-card p-1 text-sm">
        {order.map((id) => {
          const network = config.networks[id];
          const params = new URLSearchParams(searchParams.toString());
          params.set("network", id);
          // Keep q/query for verifier continuity when switching networks.
          const href = `${pathname}?${params.toString()}`;
          const selected = id === active;
          return (
            <Link
              key={id}
              href={href}
              className={
                selected
                  ? "rounded-full bg-primary px-2.5 py-1.5 text-primary-foreground sm:px-3"
                  : "rounded-full px-2.5 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground sm:px-3"
              }
              title={`${network.label} · ${network.eip155} · ${network.role}`}
              aria-label={network.label}
            >
              {isTempoNetwork(id) ? (
                <>
                  Tempo
                  <span className="ml-1 text-[11px] opacity-80">
                    {id === "tempo-mainnet" ? "mainnet" : "testnet"}
                  </span>
                </>
              ) : (
                <>
                  {network.shortLabel}
                  <span className="ml-1 hidden text-[10px] opacity-70 sm:inline">
                    {network.role === "registry" ? "registry" : "payment"}
                  </span>
                </>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
