"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  NETWORK_IDS,
  getPublicConfig,
  type NetworkId,
} from "@/lib/config";

export function NetworkSwitcher({ active }: { active: NetworkId }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const config = getPublicConfig();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs tracking-[0.2em] text-llx-label uppercase">Network</span>
      <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 text-sm">
        {NETWORK_IDS.map((id) => {
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
                  ? "rounded-full bg-primary px-3 py-1.5 text-primary-foreground"
                  : "rounded-full px-3 py-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              }
              title={`${network.label} · ${network.eip155} · ${network.role}`}
            >
              {network.shortLabel}
              <span className="ml-1 hidden text-[10px] opacity-70 sm:inline">
                {network.role === "registry" ? "registry" : "payment"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
