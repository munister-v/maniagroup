"use client";

import { useState } from "react";

/**
 * Renders a brand logo image with a graceful text-wordmark fallback.
 * Used on the homepage strip and the header brands menu. Plain <img> (not
 * next/image) so external CDN logos work without remotePatterns and a 404
 * cleanly falls back to text via onError.
 */
export function BrandLogo({
  name,
  src,
  imgClass = "",
  textClass = "",
}: {
  name: string;
  src?: string | null;
  imgClass?: string;
  textClass?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <span className={textClass}>{name}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={imgClass}
    />
  );
}
