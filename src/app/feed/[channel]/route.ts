/**
 * E6 — Live marketplace feeds by URL.
 *
 * Public endpoints the marketplace pulls on its own schedule (no admin auth):
 *   /feed/google.xml    → Google Merchant RSS
 *   /feed/price.csv     → generic CSV price list
 *   /feed/price.xlsx    → generic XLSX price list
 *
 * Served from a per-process in-memory cache (TTL 30 min) so a marketplace bot
 * hammering the URL never re-queries the DB on every hit. PM2 runs 2 workers;
 * each caches independently — acceptable for a 30-min feed.
 *
 * Scope: in-stock + has-image (what marketplaces accept) unless overridden.
 * Accepts the same filters as the admin export — scope, brand, category,
 * gender, minPrice, maxPrice, requireImage, requireSizes — and they form part
 * of the cache key.
 */

import { NextRequest, NextResponse } from "next/server";
import { getExportRows, buildExport, parseFilters, type ExportFormat, type ExportFilters } from "@/lib/channelExport";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TTL_MS = 30 * 60 * 1000; // 30 minutes

// channel slug (after /feed/) → export format
const CHANNEL_MAP: Record<string, ExportFormat> = {
  "google.xml": "google",
  "price.csv": "csv",
  "price.xlsx": "xlsx",
};

type CacheEntry = { body: string | Buffer; contentType: string; builtAt: number };
const cache = new Map<string, CacheEntry>();

export async function GET(req: NextRequest, ctx: { params: Promise<{ channel: string }> }) {
  const { channel } = await ctx.params;
  const format = CHANNEL_MAP[channel.toLowerCase()];
  if (!format) {
    return NextResponse.json(
      { error: "Невідомий фід", available: Object.keys(CHANNEL_MAP) },
      { status: 404 },
    );
  }

  // A feed URL can be narrowed the same way the admin export is, so a channel
  // can be handed e.g. /feed/price.csv?brand=KOCCA&minPrice=1000&requireSizes=1
  // instead of the whole catalogue. Defaults stay in-stock + has-image.
  const sp = new URL(req.url).searchParams;
  const filters: ExportFilters = parseFilters(sp);

  // Filters must be part of the cache key or the first caller's narrowed feed
  // would be served to everyone else for the next 30 minutes.
  const cacheKey = `${channel.toLowerCase()}:${new URLSearchParams([...sp.entries()].sort()).toString()}`;
  const now = Date.now();

  const hit = cache.get(cacheKey);
  if (hit && now - hit.builtAt < TTL_MS) {
    return serve(hit.body, hit.contentType, hit.builtAt);
  }

  const rows = await getExportRows(filters);
  const { contentType, body } = buildExport(format, rows);

  cache.set(cacheKey, { body, contentType, builtAt: now });
  return serve(body, contentType, now);
}

function serve(body: string | Buffer, contentType: string, builtAt: number): NextResponse {
  return new NextResponse(body as BodyInit, {
    headers: {
      "Content-Type": contentType,
      // CDN/proxy may cache 30 min, serve stale up to 1h while revalidating.
      "Cache-Control": "public, max-age=1800, s-maxage=1800, stale-while-revalidate=3600",
      "X-Feed-Built-At": new Date(builtAt).toISOString(),
    },
  });
}
