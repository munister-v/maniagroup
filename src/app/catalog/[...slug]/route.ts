import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * Serves migrated product photos from public/catalog/ at runtime. Next 16 does
 * NOT serve files added to public/ after the server starts, and next/image's
 * optimizer fetches sources from the Next origin (bypassing nginx) — so this
 * handler is what makes both the optimizer and any direct hit resolve. nginx
 * also serves /catalog/ directly for speed; this is the in-app fallback.
 */

const ROOT = path.join(process.cwd(), "public", "catalog");
const TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", avif: "image/avif", gif: "image/gif",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const rel = (slug ?? []).join("/");
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) return new Response("Not found", { status: 404 });
  try {
    const buf = await readFile(file);
    const ext = file.split(".").pop()?.toLowerCase() ?? "";
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=2592000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
