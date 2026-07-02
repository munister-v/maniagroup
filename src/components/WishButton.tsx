"use client";

import { useWishlist } from "./WishlistContext";

export function WishButton({
  productId,
  className,
}: {
  productId: string;
  className?: string;
}) {
  const { ids, toggle } = useWishlist();
  const active = ids.has(productId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(productId);
      }}
      aria-label={active ? "Видалити з обраного" : "До обраного"}
      className={className}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        style={{ color: active ? "#b3392c" : "currentColor" }}
      >
        <path
          d="M12 20.5 4.6 13.2a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 0 1 6.5 6.5L12 20.5Z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
