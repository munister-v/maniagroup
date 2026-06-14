/** Film-grain texture layer. Drop inside any `relative` art surface. */
export function Grain({ variant = "soft" }: { variant?: "soft" | "strong" }) {
  return (
    <div
      className={`grain-layer ${variant === "strong" ? "grain-strong" : "grain-soft"}`}
      aria-hidden
    />
  );
}
