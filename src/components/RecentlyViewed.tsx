"use client";

import { useEffect, useState } from "react";
import { ProductCard } from "./ProductCard";
import type { Product } from "@/lib/catalog";

const KEY = "mg_recent";
const MAX = 12;

/**
 * Tracks recently-viewed product ids in localStorage and renders the previous
 * ones (excluding the current product) as a row. Records the current id on mount.
 */
export function RecentlyViewed({ currentId }: { currentId: string }) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let ids: string[] = [];
    try {
      ids = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (!Array.isArray(ids)) ids = [];
    } catch {
      ids = [];
    }

    const others = ids.filter((id) => id !== currentId).slice(0, MAX);

    // Record current id at the front for next time.
    const next = [currentId, ...others].slice(0, MAX);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}

    if (others.length === 0) return;

    fetch(`/api/search?ids=${others.join(",")}`)
      .then((r) => r.json())
      .then((d: { products?: Product[] }) => setProducts((d.products ?? []).slice(0, 4)))
      .catch(() => {});
  }, [currentId]);

  if (products.length === 0) return null;

  return (
    <div className="mt-20 border-t border-line pt-12 md:mt-28">
      <h2 className="font-display text-2xl text-ink md:text-3xl">Нещодавно переглянуті</h2>
      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
