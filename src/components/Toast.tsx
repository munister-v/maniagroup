"use client";
import { createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; type: ToastType; message: string };

type ToastCtx = { toast: (msg: string, type?: ToastType) => void };
const ToastContext = createContext<ToastCtx>({ toast: () => {} });

let _counter = 0;
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++_counter;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
            className={`pointer-events-auto flex items-center gap-3 rounded-[3px] px-4 py-3 text-[13px] shadow-lg transition-all
              ${t.type === "success" ? "bg-[#007B6E] text-white"
                : t.type === "error" ? "bg-red-600 text-white"
                : "bg-[#212121] text-white"}`}>
            <span>{t.type === "success" ? "✓" : t.type === "error" ? "✕" : "ℹ"}</span>
            <span>{t.message}</span>
            <button onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
              className="ml-2 opacity-60 hover:opacity-100">✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export function useToast() { return useContext(ToastContext); }
