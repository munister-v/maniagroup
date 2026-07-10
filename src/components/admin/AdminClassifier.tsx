"use client";

import { useEffect, useMemo, useState } from "react";
import { CLASSIFIER_TREE } from "@/lib/classifierTree";

/**
 * «Класифікатор товарів» — Intertop's product classifier screen. Their version
 * is a curated tree (Категорія / Тип товару / Вид товара / Підвид, ~760 rows).
 * Our catalog uses a FLAT category per product (plus the new `subtype` field —
 * see products.ts), and our existing category values are free-text Russian
 * spellings that don't line up 1:1 with Intertop's Ukrainian vocabulary or its
 * category/subtype split (e.g. our category "Футболка" is actually at THEIR
 * subtype level, under parent "Футболки і поло") — reconciling that would mean
 * guessing translations for hundreds of values, so this deliberately does NOT
 * force a mapping. Instead it shows two honest, separate things: our real
 * catalog's current categories (as before), and — new — Intertop's real
 * classifier tree as a reference lookup (verified against an actual odezda.xlsx
 * export, see lib/classifierTree.ts) for admins filling in `subtype` going
 * forward.
 */
type Category = { slug: string; name: string; count: number };

const PER_PAGE_OPTS = [20, 50, 100];

export function AdminClassifier() {
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [treeSearch, setTreeSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/admin/products/facets")
      .then((r) => r.json())
      .then((d) => setCats((d.categories ?? []) as Category[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredTree = useMemo(() => {
    const q = treeSearch.trim().toLowerCase();
    if (!q) return CLASSIFIER_TREE;
    return CLASSIFIER_TREE
      .map((n) => ({
        category: n.category,
        subtypes: n.subtypes.filter((s) => s.toLowerCase().includes(q)),
      }))
      .filter((n) => n.category.toLowerCase().includes(q) || n.subtypes.length > 0);
  }, [treeSearch]);

  const toggle = (cat: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    return next;
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? cats.filter((c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)) : cats;
    return [...list].sort((a, b) => b.count - a.count);
  }, [cats, search]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);
  useEffect(() => { setPage(1); }, [search, perPage]);

  const thCls = "whitespace-nowrap border-b border-[#e6eaec] bg-[#eef2f3] px-3 py-2.5 text-left text-[12px] font-semibold text-[#3a4250]";

  return (
    <div>
      <h2 className="mb-1 text-[22px] font-semibold tracking-tight text-[#2b2d42]">Класифікатор товарів</h2>
      <p className="mb-4 text-[12px] text-[#8a94a0]">Категорії каталогу · {total.toLocaleString("uk-UA")}</p>

      {/* Довідкова структура — Intertop's real Вид товара → Підвид tree, from
          a genuine odezda.xlsx export (see lib/classifierTree.ts). Reference
          only: our catalog's own categories below are unrelated free text. */}
      <div className="mb-5 rounded-[6px] border border-[#e6eaec] bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-[#2b2d42]">Довідкова структура (Intertop)</h3>
            <p className="text-[12px] text-[#8a94a0]">Вид товара → Підвид · з реального експорту одягу · заповнюйте поле «Підвид» на картці товару за цим списком</p>
          </div>
          <input
            value={treeSearch} onChange={(e) => setTreeSearch(e.target.value)}
            placeholder="Пошук у структурі…"
            className="h-9 w-56 rounded-[4px] border border-[#e6eaec] bg-white px-3 text-[13px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none"
          />
        </div>
        <div className="divide-y divide-[#eef2f3]">
          {filteredTree.map((node) => {
            const isOpen = expanded.has(node.category) || !!treeSearch.trim();
            return (
              <div key={node.category}>
                <button
                  onClick={() => toggle(node.category)}
                  className="flex w-full items-center justify-between gap-2 py-2 text-left text-[13px] font-medium text-[#2b2d42] hover:text-[#2f9488]"
                >
                  <span className="flex items-center gap-2">
                    <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                    {node.category}
                  </span>
                  <span className="text-[11px] font-normal text-[#8a94a0]">{node.subtypes.length} підвид.</span>
                </button>
                {isOpen && (
                  <div className="flex flex-wrap gap-1.5 pb-3 pl-5">
                    {node.subtypes.map((s) => (
                      <span key={s} className="rounded-[3px] bg-[#eef2f3] px-2 py-1 text-[12px] text-[#3a4250]">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {filteredTree.length === 0 && (
            <p className="py-6 text-center text-[12px] text-[#8a94a0]">Нічого не знайдено</p>
          )}
        </div>
      </div>

      <p className="mb-2 text-[13px] font-semibold text-[#2b2d42]">Категорії в нашому каталозі</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук: категорія, slug…"
          className="h-9 w-64 rounded-[4px] border border-[#e6eaec] bg-white px-3 text-[13px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-[6px] border border-[#e6eaec] bg-white">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              <th className={`${thCls} w-16`}>#</th>
              <th className={thCls}>Категорія</th>
              <th className={thCls}>Класифікатор (slug)</th>
              <th className={`${thCls} text-right`}>Товарів</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-3 py-12 text-center text-[#8a94a0]">Завантаження…</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-12 text-center text-[#8a94a0]">Нічого не знайдено</td></tr>
            ) : pageRows.map((c, i) => (
              <tr key={c.slug} className="border-b border-[#eef2f3] transition-colors hover:bg-[#f7f9fa]">
                <td className="px-3 py-2.5 tabular-nums text-[#8a94a0]">{(page - 1) * perPage + i + 1}</td>
                <td className="px-3 py-2.5 font-medium text-[#2b2d42]">{c.name}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[12px] text-[#5a6472]">{c.slug}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[#2b2d42]">{c.count.toLocaleString("uk-UA")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Intertop-style footer */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[#5a6472]">
        <div className="flex items-center gap-1.5">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#e6eaec] bg-white text-[#5a6472] transition-colors disabled:opacity-30 hover:enabled:border-[#2f9488] hover:enabled:text-[#2f9488]">‹</button>
          <span className="tabular-nums text-[#8a94a0]">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-[#e6eaec] bg-white text-[#5a6472] transition-colors disabled:opacity-30 hover:enabled:border-[#2f9488] hover:enabled:text-[#2f9488]">›</button>
        </div>
        <label className="flex items-center gap-2">
          Відображати на сторінці
          <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}
            className="h-8 rounded-[4px] border border-[#e6eaec] bg-white px-2 text-[13px] text-[#2b2d42] focus:border-[#2f9488] focus:outline-none">
            {PER_PAGE_OPTS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="ml-auto tabular-nums text-[#8a94a0]">Кількість записів: {total.toLocaleString("uk-UA")}</span>
      </div>
    </div>
  );
}
