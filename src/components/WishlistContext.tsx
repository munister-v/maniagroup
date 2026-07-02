"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type WishCtx = { ids: Set<string>; toggle: (id: string) => Promise<void> };

const Ctx = createContext<WishCtx>({ ids: new Set(), toggle: async () => {} });

const LS_KEY = "mg_wish";

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Fast hydration from localStorage
    try {
      const local = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") as string[];
      if (local.length) setIds(new Set(local));
    } catch {}

    // Then sync with server (overwrites if user is logged in)
    fetch("/api/account/wishlist")
      .then((r) => r.json())
      .then((d: { items?: string[] }) => {
        if (Array.isArray(d.items) && d.items.length > 0) {
          setIds(new Set(d.items));
          localStorage.setItem(LS_KEY, JSON.stringify(d.items));
        }
      })
      .catch(() => {});
  }, []);

  const toggle = useCallback(async (productId: string) => {
    // Optimistic local update
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      localStorage.setItem(LS_KEY, JSON.stringify([...next]));
      return next;
    });

    try {
      const r = await fetch("/api/account/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId }),
      });
      if (r.ok) {
        const d: { items?: string[] } = await r.json();
        if (Array.isArray(d.items)) {
          setIds(new Set(d.items));
          localStorage.setItem(LS_KEY, JSON.stringify(d.items));
        }
      }
      // 401 = not logged in — local-only is fine, will sync on next login
    } catch {}
  }, []);

  return <Ctx.Provider value={{ ids, toggle }}>{children}</Ctx.Provider>;
}

export function useWishlist() {
  return useContext(Ctx);
}
