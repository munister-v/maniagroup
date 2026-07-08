"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SiteContent } from "@/lib/siteContent";

type Device = "desktop" | "tablet" | "mobile";
type SaveState = "idle" | "saving" | "saved" | "error";

type Version = { id: number; label: string; author: string; createdAt: string };

const DEVICES: { id: Device; label: string; w: number; icon: string }[] = [
  { id: "desktop", label: "ПК", w: 1280, icon: "M3 5h18v11H3zM8 20h8M12 16v4" },
  { id: "tablet", label: "Планшет", w: 820, icon: "M5 3h14v18H5zM12 18h.01" },
  { id: "mobile", label: "Телефон", w: 390, icon: "M7 3h10v18H7zM11 18h2" },
];

const PAGES: { path: string; label: string }[] = [
  { path: "/", label: "Головна" },
  { path: "/about", label: "Про нас" },
  { path: "/delivery", label: "Доставка" },
  { path: "/returns", label: "Повернення" },
  { path: "/contacts", label: "Контакти" },
  { path: "/catalog", label: "Каталог" },
];

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ContentStudio({
  content,
  setContent,
  editor,
  showToast,
}: {
  content: SiteContent;
  setContent: (c: SiteContent) => void;
  editor: React.ReactNode;
  showToast: (msg: string) => void;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [page, setPage] = useState("/");
  const [previewOn, setPreviewOn] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [save, setSave] = useState<SaveState>("idle");
  const [publishing, setPublishing] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>(JSON.stringify(content));
  const reloadAfterSave = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pendingScroll = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Undo/redo history ──────────────────────────────────────────────────
  // History is committed on a 1.5 s idle (not every keystroke) so each step
  // covers a meaningful chunk of edits rather than single characters.
  const historyStack = useRef<SiteContent[]>([content]);
  const historyIdx = useRef<number>(0);
  const skipHistoryPush = useRef(false);

  const updateHistory = useCallback((c: SiteContent) => {
    if (skipHistoryPush.current) { skipHistoryPush.current = false; return; }
    if (historyCommitRef.current) clearTimeout(historyCommitRef.current);
    historyCommitRef.current = setTimeout(() => {
      const stack = historyStack.current.slice(0, historyIdx.current + 1);
      const last = stack[stack.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(c)) return;
      stack.push(c);
      if (stack.length > 100) stack.shift();
      historyStack.current = stack;
      historyIdx.current = stack.length - 1;
      setCanUndo(historyIdx.current > 0);
      setCanRedo(false);
    }, 1500);
  }, []);

  function undo() {
    if (historyIdx.current <= 0) return;
    historyIdx.current--;
    skipHistoryPush.current = true;
    setContent(historyStack.current[historyIdx.current]);
    setCanUndo(historyIdx.current > 0);
    setCanRedo(true);
  }

  function redo() {
    if (historyIdx.current >= historyStack.current.length - 1) return;
    historyIdx.current++;
    skipHistoryPush.current = true;
    setContent(historyStack.current[historyIdx.current]);
    setCanUndo(true);
    setCanRedo(historyIdx.current < historyStack.current.length - 1);
  }

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smooth, same-origin reload that keeps the scroll position so editing feels
  // continuous instead of jumping to the top on every keystroke-driven save.
  const reloadPreview = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    setRefreshing(true);
    try {
      if (win) {
        pendingScroll.current = win.scrollY;
        win.location.reload();
        return;
      }
    } catch {
      /* cross-origin guard — fall through to remount */
    }
    setIframeKey((k) => k + 1);
  }, []);

  // ── Draft autosave (debounced) ─────────────────────────────────────────
  const saveDraft = useCallback(async (c: SiteContent, thenReload: boolean) => {
    setSave("saving");
    try {
      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      if (!res.ok) throw new Error();
      lastSaved.current = JSON.stringify(c);
      setSave("saved");
      setDirty(false);
      if (thenReload) reloadPreview();
      setTimeout(() => setSave((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch {
      setSave("error");
      setTimeout(() => setSave((s) => (s === "error" ? "idle" : s)), 3000);
    }
  }, [reloadPreview]);

  useEffect(() => {
    updateHistory(content);
    const json = JSON.stringify(content);
    if (json === lastSaved.current) return;
    setDirty(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveDraft(content, reloadAfterSave.current && previewOn);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [content, previewOn, saveDraft, updateHistory]);

  // Reload the preview whenever edits land, but only while previewing.
  useEffect(() => {
    reloadAfterSave.current = previewOn;
  }, [previewOn]);

  // Enter the studio → immediately show the live draft; leave → stop previewing
  // so the admin doesn't keep seeing unpublished content while browsing the site.
  useEffect(() => {
    fetch("/api/admin/content/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: true }),
    }).then(() => { setPreviewOn(true); setIframeKey((k) => k + 1); }).catch(() => {});
    return () => {
      fetch("/api/admin/content/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: false }),
      }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Preview toggle ─────────────────────────────────────────────────────
  async function togglePreview(on: boolean) {
    if (on && dirty) await saveDraft(content, false);
    await fetch("/api/admin/content/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    });
    setPreviewOn(on);
    setIframeKey((k) => k + 1);
  }

  // ── Publish ────────────────────────────────────────────────────────────
  async function publish() {
    setPublishing(true);
    try {
      const res = await fetch("/api/admin/content/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error();
      lastSaved.current = JSON.stringify(content);
      setDirty(false);
      showToast("Опубліковано на сайті ✓");
      setIframeKey((k) => k + 1);
      if (versionsOpen) loadVersions();
    } catch {
      showToast("Помилка публікації");
    } finally {
      setPublishing(false);
    }
  }

  // ── Versions ───────────────────────────────────────────────────────────
  const loadVersions = useCallback(async () => {
    const res = await fetch("/api/admin/content/versions");
    if (res.ok) setVersions((await res.json()).versions ?? []);
  }, []);

  useEffect(() => {
    if (versionsOpen) loadVersions();
  }, [versionsOpen, loadVersions]);

  async function snapshot() {
    const label = window.prompt("Назва копії:", `Копія ${new Date().toLocaleDateString("uk-UA")}`);
    if (label === null) return;
    const res = await fetch("/api/admin/content/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, label }),
    });
    if (res.ok) {
      setVersions((await res.json()).versions ?? []);
      showToast("Копію збережено ✓");
    }
  }

  async function restore(id: number) {
    if (!window.confirm("Завантажити цю копію в чернетку? Поточні незбережені зміни буде замінено.")) return;
    const res = await fetch("/api/admin/content/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      const { content: restored } = await res.json();
      lastSaved.current = JSON.stringify(restored);
      setContent(restored);
      setDirty(false);
      showToast("Копію завантажено в чернетку. Перевірте та опублікуйте.");
      if (!previewOn) await togglePreview(true);
      else setIframeKey((k) => k + 1);
    }
  }

  async function resetDraft() {
    if (!window.confirm("Скинути чернетку до поточного опублікованого вмісту? Незбережені зміни буде замінено.")) return;
    const res = await fetch("/api/admin/content?slot=current");
    if (!res.ok) { showToast("Помилка при завантаженні"); return; }
    const published = await res.json() as SiteContent;
    lastSaved.current = JSON.stringify(published);
    setContent(published);
    setDirty(false);
    // Reset undo history to the freshly loaded published state
    historyStack.current = [published];
    historyIdx.current = 0;
    setCanUndo(false);
    setCanRedo(false);
    showToast("Чернетку скинуто до опублікованого ✓");
    if (previewOn) setIframeKey((k) => k + 1);
  }

  const deviceW = DEVICES.find((d) => d.id === device)!.w;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
      {/* ── Editor column ── */}
      <div className="min-w-0 lg:w-[clamp(360px,40%,520px)] lg:shrink-0">
        {/* Action bar */}
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[4px] border border-[#e6eaec] bg-white p-2">
          <button
            onClick={publish}
            disabled={publishing}
            className="flex h-9 items-center gap-2 rounded-[3px] border border-[#2f9488] px-4 text-[11px] uppercase tracking-[0.12em] text-[#2f9488] transition-opacity hover:bg-[#2f9488] hover:text-white disabled:opacity-40"
          >
            <Icon d="M5 13l4 4L19 7" className="h-3.5 w-3.5" />
            {publishing ? "Публікуємо…" : "Опублікувати"}
          </button>

          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
            {save === "saving" ? (
              <span className="text-[#8a94a0]">Збереження…</span>
            ) : dirty ? (
              <span className="flex items-center gap-1.5 text-amber-600">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Чернетка
              </span>
            ) : save === "error" ? (
              <span className="text-red-600">Помилка збереження</span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Збережено
              </span>
            )}
          </span>

          <div className="ml-auto flex items-center gap-1.5">
            {/* Undo / Redo */}
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Скасувати (Ctrl+Z)"
              className="flex h-9 w-9 items-center justify-center rounded-[3px] border border-[#e6eaec] text-[#2b2d42] transition-colors hover:border-[#2b2d42] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Icon d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-1" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Повторити (Ctrl+Shift+Z)"
              className="flex h-9 w-9 items-center justify-center rounded-[3px] border border-[#e6eaec] text-[#2b2d42] transition-colors hover:border-[#2b2d42] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Icon d="M15 14l5-5-5-5M19 9H8a5 5 0 0 0 0 10h1" />
            </button>

            <button
              onClick={snapshot}
              className="flex h-9 items-center gap-1.5 rounded-[3px] border border-[#e6eaec] px-3 text-[11px] uppercase tracking-[0.1em] text-[#2b2d42] transition-colors hover:border-[#2b2d42]"
            >
              <Icon d="M5 3h11l3 3v15H5zM9 3v5h6" className="h-3.5 w-3.5" />
              Копія
            </button>
            <button
              onClick={() => setVersionsOpen((v) => !v)}
              className={`flex h-9 items-center gap-1.5 rounded-[3px] border px-3 text-[11px] uppercase tracking-[0.1em] transition-colors ${
                versionsOpen ? "border-[#2f9488] bg-[#2f9488] text-white" : "border-[#e6eaec] text-[#2b2d42] hover:border-[#2b2d42]"
              }`}
            >
              <Icon d="M3 3v6h6M3 13a9 9 0 1 0 3-7L3 9" className="h-3.5 w-3.5" />
              Історія
            </button>
          </div>
        </div>

        {/* Versions drawer */}
        {versionsOpen && (
          <div className="mb-4 rounded-[4px] border border-[#e6eaec] bg-white">
            <div className="flex items-center justify-between border-b border-[#e6eaec] px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[#8a94a0]">Копії та історія</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetDraft}
                  className="flex items-center gap-1 rounded-[3px] border border-red-200 px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-red-600 transition-colors hover:border-red-400"
                  title="Скинути чернетку до поточного опублікованого вмісту"
                >
                  <Icon d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0M9 9l6 6M15 9l-6 6" className="h-3 w-3" />
                  Скинути до опублікованого
                </button>
                <span className="text-[10px] text-[#8a94a0]">{versions.length}</span>
              </div>
            </div>
            <ul className="max-h-72 divide-y divide-[#eef2f3] overflow-y-auto">
              {versions.length === 0 && (
                <li className="px-3 py-4 text-center text-[12px] text-[#8a94a0]">Поки що копій немає</li>
              )}
              {versions.map((v) => (
                <li key={v.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-[#2b2d42]">{v.label}</p>
                    <p className="text-[10px] text-[#8a94a0]">{new Date(v.createdAt).toLocaleString("uk-UA")}</p>
                  </div>
                  <button
                    onClick={() => restore(v.id)}
                    className="shrink-0 rounded-[3px] border border-[#e6eaec] px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-[#2b2d42] transition-colors hover:border-[#2b2d42]"
                  >
                    Відновити
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* The actual field editor */}
        <div>{editor}</div>
      </div>

      {/* ── Preview column ── */}
      <div className="min-w-0 flex-1">
        <div className="sticky top-2">
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[4px] border border-[#e6eaec] bg-white p-2">
            {/* Preview on/off */}
            <button
              onClick={() => togglePreview(!previewOn)}
              className={`flex h-9 items-center gap-1.5 rounded-[3px] px-3 text-[11px] uppercase tracking-[0.1em] transition-colors ${
                previewOn ? "bg-[#2f9488] text-white" : "border border-[#e6eaec] text-[#2b2d42] hover:border-[#2b2d42]"
              }`}
            >
              <Icon d={previewOn ? "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 12h.01" : "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"} className="h-4 w-4" />
              {previewOn ? "Чернетка" : "Опубліковане"}
            </button>

            {/* Device switch */}
            <div className="flex items-center gap-0.5 rounded-[3px] border border-[#e6eaec] p-0.5">
              {DEVICES.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDevice(d.id)}
                  title={d.label}
                  aria-label={d.label}
                  className={`flex h-8 items-center gap-1.5 rounded-[2px] px-2.5 text-[10px] uppercase tracking-[0.1em] transition-colors ${
                    device === d.id ? "bg-[#2f9488] text-white" : "text-[#8a94a0] hover:text-[#2b2d42]"
                  }`}
                >
                  <Icon d={d.icon} className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{d.label}</span>
                </button>
              ))}
            </div>

            {/* Page select */}
            <select
              value={page}
              onChange={(e) => setPage(e.target.value)}
              className="h-9 rounded-[3px] border border-[#e6eaec] bg-white px-2 text-[12px] text-[#2b2d42] focus:border-[#2b2d42] focus:outline-none"
            >
              {PAGES.map((p) => (
                <option key={p.path} value={p.path}>{p.label}</option>
              ))}
            </select>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={reloadPreview}
                title="Оновити"
                aria-label="Оновити перегляд"
                className="flex h-9 w-9 items-center justify-center rounded-[3px] border border-[#e6eaec] text-[#2b2d42] transition-colors hover:border-[#2b2d42]"
              >
                <Icon d="M3 3v6h6M3 13a9 9 0 1 0 3-7L3 9" />
              </button>
              <a
                href={page}
                target="_blank"
                rel="noreferrer"
                title="Відкрити в новій вкладці"
                className="flex h-9 w-9 items-center justify-center rounded-[3px] border border-[#e6eaec] text-[#2b2d42] transition-colors hover:border-[#2b2d42]"
              >
                <Icon d="M14 4h6m0 0v6m0-6L10 14M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
              </a>
            </div>
          </div>

          {/* Device frame */}
          <div className="flex justify-center overflow-hidden rounded-[4px] border border-[#e6eaec] bg-[#e6eaec] p-3">
            <div
              className="relative overflow-hidden rounded-[3px] bg-white shadow-sm transition-all duration-300"
              style={{ width: device === "desktop" ? "100%" : deviceW, maxWidth: "100%" }}
            >
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={page}
                title="Перегляд сайту"
                onLoad={() => {
                  setRefreshing(false);
                  const win = iframeRef.current?.contentWindow;
                  if (win && pendingScroll.current != null) {
                    try { win.scrollTo(0, pendingScroll.current); } catch { /* noop */ }
                    pendingScroll.current = null;
                  }
                }}
                className="block h-[72vh] w-full border-0"
              />
              {/* live-update shimmer — subtle, no white flash */}
              <div
                className={`pointer-events-none absolute left-0 top-0 h-0.5 bg-[#2b2d42] transition-all duration-300 ${refreshing ? "w-full opacity-100" : "w-0 opacity-0"}`}
              />
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] uppercase tracking-[0.12em] text-[#8a94a0]">
            {previewOn ? "Показано чернетку — видно лише вам" : "Показано опубліковану версію"} · {device === "desktop" ? "адаптив ПК" : `${deviceW}px`}
          </p>
        </div>
      </div>
    </div>
  );
}
