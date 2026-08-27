import { NextResponse } from "next/server";
import { q } from "@/lib/pg";

/**
 * Redirect a path a file used to live at.
 *
 * nginx serves media straight off disk and 404s on a miss; this is where that
 * miss lands. A path that was moved is remembered in media_aliases, so an open
 * customer tab, a search result or a marketplace feed pointing at the old URL
 * gets a permanent redirect instead of a broken image. Anything genuinely
 * unknown still 404s — an alias table is not a place to guess.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // nginx passes the original path it failed to find.
  const wanted = url.searchParams.get("p") ?? url.pathname;
  const clean = wanted.split("?")[0];
  if (!/^\/(catalog|uploads)\//.test(clean) || clean.includes("..")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const rows = await q<{ path: string }>(
    `SELECT m.path FROM media_aliases a JOIN media m ON m.id = a.media_id WHERE a.old_path = $1`,
    [clean],
  ).catch(() => []);

  const target = rows[0]?.path;
  if (!target) return new NextResponse("Not found", { status: 404 });

  // A relative Location on purpose. Absolute would be built from the origin
  // nginx proxied with — 127.0.0.1:3010 — and that is what the browser would
  // then be sent to. RFC 7231 allows a relative reference here.
  //
  // Percent-encode per segment: a folder can be named «сезон-2026», and a
  // header value has to be a ByteString. new URL() used to hide this by
  // encoding on the way in.
  const location = target.split("/").map(encodeURIComponent).join("/");
  return new NextResponse(null, { status: 301, headers: { Location: location, "Cache-Control": "no-store" } });
}
