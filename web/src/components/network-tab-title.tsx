"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { networkTabTitle } from "@/lib/tab-title";

/**
 * Keeps document.title in sync with ?network= after client-side navigation
 * (network switcher, Ledger/Proofs nav). The server sets the same title via
 * generateMetadata on first load.
 *
 * On soft navigations Next can re-apply a head cached from a previous search
 * param (seen: Base → Tempo mainnet → Tempo testnet left the tab on "· Base",
 * since both Tempo tabs share one title and a plain effect never re-ran).
 * So we also watch <head> and correct any title that drifts from ?network=.
 */
export function NetworkTabTitle() {
  const searchParams = useSearchParams();
  const title = networkTabTitle(searchParams.get("network"));

  useEffect(() => {
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);

  return null;
}
