/**
 * Спільна розмітка для довідки й документації.
 *
 * Обидва розділи писалися окремо і встигли обзавестися двома копіями одного
 * рендера. Копії розходяться мовчки: правиш відступ в одному місці, а в
 * сусідньому розділі лишається як було. Тримаємо один набір блоків на двох.
 */

export type Block =
  | { t: "p"; text: string }
  | { t: "steps"; items: string[] }
  | { t: "list"; items: string[] }
  | { t: "note"; text: string }
  | { t: "warn"; text: string }
  /** Хлібні крихти «де це в меню» — щоб не переказувати шлях словами. */
  | { t: "where"; path: string[] }
  | { t: "table"; head: string[]; rows: string[][] };

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="max-w-[78ch]">
      {blocks.map((b, i) => {
        if (b.t === "p")
          return (
            <p key={i} className="mb-3 text-[13.5px] leading-relaxed text-[#4a5560]">
              {b.text}
            </p>
          );

        if (b.t === "where")
          return (
            <div key={i} className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-[#8a94a0]">Де це:</span>
              {b.path.map((p, j) => (
                <span key={j} className="flex items-center gap-1.5">
                  {j > 0 && <span className="text-[#c4ccd2]">→</span>}
                  <span className="rounded-[4px] bg-[#eef2f3] px-2 py-0.5 text-[12px] font-medium text-[#2b2d42]">
                    {p}
                  </span>
                </span>
              ))}
            </div>
          );

        if (b.t === "steps")
          return (
            <ol key={i} className="mb-3 space-y-2">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2.5 text-[13.5px] leading-relaxed text-[#4a5560]">
                  <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#2b2d42] text-[10px] font-medium text-white">
                    {j + 1}
                  </span>
                  <span>{it}</span>
                </li>
              ))}
            </ol>
          );

        if (b.t === "list")
          return (
            <ul key={i} className="mb-3 space-y-1.5">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2.5 text-[13.5px] leading-relaxed text-[#4a5560]">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#8a94a0]" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          );

        if (b.t === "note")
          return (
            <p
              key={i}
              className="mb-3 border-l-2 border-[#2f9488] bg-[#f2f9f8] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#3d5a56]"
            >
              {b.text}
            </p>
          );

        if (b.t === "warn")
          return (
            <p
              key={i}
              className="mb-3 border-l-2 border-[#e5a04d] bg-[#fdf6ec] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#7a5620]"
            >
              {b.text}
            </p>
          );

        return (
          <div key={i} className="mb-4 overflow-x-auto">
            <table className="w-full min-w-[440px] border-collapse text-[13px]">
              <thead>
                <tr>
                  {b.head.map((h, j) => (
                    <th
                      key={j}
                      className="border-b border-[#e6eaec] px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-[#8a94a0]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td
                        key={k}
                        className={`border-b border-[#eef2f3] px-3 py-2.5 align-top leading-relaxed ${
                          k === 0 ? "font-medium text-[#2b2d42]" : "text-[#4a5560]"
                        }`}
                      >
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

/** Плоский текст розділу — для пошуку по вмісту, а не лише по заголовках. */
export function blocksText(blocks: Block[]): string[] {
  return blocks.flatMap((b) => {
    if (b.t === "table") return [...b.head, ...b.rows.flat()];
    if (b.t === "steps" || b.t === "list") return b.items;
    if (b.t === "where") return b.path;
    return [b.text];
  });
}

/**
 * Зміст розділу. У довіднику тринадцять тем, у документації — тринадцять глав;
 * гортати закритий акордеон наосліп незручно, потрібен список, з якого видно
 * все одразу.
 */
export function Toc({
  items,
  onPick,
}: {
  items: { id: string; title: string }[];
  onPick: (id: string) => void;
}) {
  return (
    <nav className="rounded-[6px] border border-[#e6eaec] bg-white p-4">
      <span className="mb-2.5 block text-[11px] uppercase tracking-wide text-[#8a94a0]">Зміст</span>
      <div className="grid gap-1 sm:grid-cols-2">
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onPick(it.id)}
            className="flex items-baseline gap-2 rounded-[4px] px-2 py-1.5 text-left text-[13px] text-[#4a5560] hover:bg-[#f7f9fa] hover:text-[#2b2d42]"
          >
            <span className="w-5 shrink-0 text-[11px] tabular-nums text-[#c4ccd2]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span>{it.title}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
