import { isAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/pg";
import { logActivity } from "@/lib/activity";
import { mediaUrlToPath } from "@/lib/mediaStorage";
import { parseMediaFilter, selectMedia, usageFor } from "@/lib/mediaQuery";
import { SITE_URL } from "@/lib/siteUrl";
import { thumbUrl } from "@/lib/mediaThumbs";
import * as XLSX from "xlsx";

/**
 * The library as a spreadsheet: every path, what it weighs, and which product
 * shows it.
 *
 * The point is not the file list — it is the join. Nothing else in the admin can
 * answer "which photos does this product have, and which photos belong to
 * nobody", and that question is what a catalog audit consists of. The scope is
 * whatever the grid is currently showing, so what gets exported is what the
 * admin can see, including an explicit tick-box selection.
 *
 *   ?format=xlsx|csv|json  + every filter the grid understands
 *   ?since=2026-08-01      only what arrived or changed after that date
 *   ?urls=/uploads/a.webp,…  an explicit selection
 *   ?absolute=1            full https:// links instead of site-relative paths
 */
/** yyyy-mm-dd hh:mm — sorts correctly as text in Excel, unlike a locale string. */
function fmtWhen(v: unknown): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16).replace("T", " ");
}

export async function GET(req: Request) {
  if (!(await isAdmin())) return new Response("Unauthorized", { status: 401 });

  const sp = new URL(req.url).searchParams;
  const format = (sp.get("format") ?? "xlsx").toLowerCase();
  const filter = parseMediaFilter(sp);
  // Full links by default: a spreadsheet of "/catalog/59441/4.webp" is a
  // spreadsheet nobody can click, and the person opening it is usually not the
  // person who knows which host that path belongs to.
  //
  // The host is the canonical one, never the request's: this route is reached
  // through nginx, so the request origin is 127.0.0.1:3010 — the same trap the
  // media redirect fell into. ?absolute=0 gives site-relative paths back.
  const origin = sp.get("absolute") === "0" ? "" : SITE_URL;

  const rows = await selectMedia(filter, { limit: null });
  const usage = await usageFor(rows.map((r) => r.path));

  // Duplicate groups are the reason an audit is worth running at all: the same
  // photo saved twice under two UUIDs is invisible in a grid and obvious in a
  // column. Marked, never auto-deleted — which of the twins a product points at
  // is a decision, not a cleanup.
  const dupRows = await q<{ sha256: string; n: string }>(
    "SELECT sha256, count(*)::text AS n FROM media WHERE sha256 <> '' GROUP BY sha256 HAVING count(*) > 1",
  );
  const dupSha = new Set(dupRows.map((d) => d.sha256));
  const shaByPath = new Map(
    (await q<{ path: string; sha256: string }>("SELECT path, sha256 FROM media WHERE sha256 <> ''"))
      .map((r) => [r.path, r.sha256]),
  );

  const data = rows.map((r) => {
    const used = usage.get(r.path) ?? [];
    const sha = shaByPath.get(r.path) ?? "";
    return {
      "Посилання": origin ? `${origin}${r.path}` : r.path,
      "Мініатюра": origin ? `${origin}${thumbUrl(r.path)}` : thumbUrl(r.path),
      "Шлях на сайті": r.path,
      "Файл": r.original_name || r.path.split("/").pop() || "",
      "Джерело": r.source === "catalog" ? "Каталог" : "Завантажено вручну",
      "Тека": r.folder,
      "Розмір, КБ": Math.round(Number(r.bytes) / 1024),
      "Ширина": r.width,
      "Висота": r.height,
      "Alt": r.alt,
      "Заголовок": r.title,
      "Товарів": used.length,
      "Товари": used.map((u) => u.name).join("; "),
      "SKU": used.map((u) => u.sku).filter(Boolean).join("; "),
      "Стан": used.length ? "На товарі" : "Вільне",
      "Дублікат": sha && dupSha.has(sha) ? "Так" : "",
      // pg hands back a Date, not an ISO string: .toString() on it reads
      // "Thu Aug 27 2026…", and trimming that as if it were ISO ate the "T"
      // out of "Thu". Go through the Date explicitly.
      "Додано": fmtWhen(r.mtime ?? r.created_at),
      // The disk path is what someone SSH-ing in needs; the URL is what the
      // shop needs. An export that gives only one of them sends the reader
      // back to ask for the other.
      "Файл на сервері": mediaUrlToPath(r.path) ?? "",
    };
  });

  logActivity("export", `Медіатека → ${format.toUpperCase()} (${data.length} файлів)`, data.length);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `maniagroup-media-${stamp}`;

  if (format === "json") {
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.json"`,
      },
    });
  }

  const ws = XLSX.utils.json_to_sheet(data);

  if (format === "csv") {
    const csv = "﻿" + XLSX.utils.sheet_to_csv(ws); // BOM so Excel reads UTF-8
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
      },
    });
  }

  const COLS = Object.keys(data[0] ?? {});
  const WIDTH: Record<string, number> = {
    "Посилання": 54, "Мініатюра": 54, "Шлях на сайті": 34, "Файл": 30, "Джерело": 20, "Тека": 14,
    "Розмір, КБ": 11, "Ширина": 9, "Висота": 9, "Alt": 26, "Заголовок": 24, "Товарів": 9,
    "Товари": 40, "SKU": 18, "Стан": 12, "Дублікат": 11, "Додано": 18, "Файл на сервері": 46,
  };
  ws["!cols"] = COLS.map((c) => ({ wch: WIDTH[c] ?? 16 }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: Math.max(0, COLS.length - 1) } }) };

  // Make the two URL columns real hyperlinks. A link you have to copy out of a
  // cell and paste into a browser is a link the reader will not follow.
  if (origin) {
    for (const name of ["Посилання", "Мініатюра"]) {
      const col = COLS.indexOf(name);
      if (col < 0) continue;
      for (let row = 1; row <= data.length; row++) {
        const ref = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = ws[ref];
        if (cell?.v) cell.l = { Target: String(cell.v), Tooltip: "Відкрити зображення" };
      }
    }
  }
  ws["!freeze"] = { xSplit: "0", ySplit: "1" };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Медіатека");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}
