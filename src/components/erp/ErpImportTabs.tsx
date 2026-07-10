"use client";

import { useState } from "react";
import { ErpImport } from "./ErpImport";
import { SubTabs } from "@/components/admin/intertop/primitives";
import { AdminImportSources } from "@/components/admin/AdminImportSources";
import { AdminImportTemplates } from "@/components/admin/AdminImportTemplates";
import { AdminValueLists } from "@/components/admin/AdminValueLists";

/**
 * "Завантажити товари" — Intertop agora's own "Імпорт" screen has 4 tabs
 * (Джерела даних · Операції · Шаблони даних · Списки значень); this mirrors
 * that shell. "Операції" is the one real upload/preview/apply flow
 * (ErpImport) — everything else here is a supporting registry around it.
 *
 * (An EARLIER version of this screen tried a different 4-tab layout —
 * two template-export tabs plus a price-upload tab — and it was removed
 * for being broken/duplicative and confusing people into thinking they
 * needed an extra "create template" step that didn't exist. This version
 * is structurally different: the tabs here are registries (sources,
 * templates, value lists) around the SAME single upload flow, not
 * competing upload paths — see maniagroup-intertop-reskin memory.)
 */
type ImportTab = "sources" | "operations" | "templates" | "valueLists";

export function ErpImportTabs({
  onClose,
  onImported,
  onGoToCatalog,
}: {
  onClose?: () => void;
  onImported?: (msg: string) => void;
  onGoToCatalog?: () => void;
} = {}) {
  const [tab, setTab] = useState<ImportTab>("sources");

  function downloadCatalog(format: "csv" | "xlsx") {
    const a = document.createElement("a");
    a.href = `/api/erp/export?format=${format}&scope=all&requireImage=0`;
    a.click();
  }

  const isModal = !!onClose;

  return (
    <div className={isModal ? "flex flex-col" : undefined}>
      {/* Modal header — shown only when used as overlay */}
      {isModal && (
        <div className="flex items-center justify-between border-b border-[#E0E0E0] px-6 py-4">
          <h2 className="text-[18px] font-normal text-[#1f2733]">Завантажити товари</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center text-[#9E9E9E] hover:text-[#1f2733] text-[20px] leading-none">✕</button>
        </div>
      )}

      <div className={isModal ? "max-h-[70vh] overflow-y-auto p-6" : undefined}>
        <SubTabs
          tabs={[
            { id: "sources", label: "Джерела даних" },
            { id: "operations", label: "Операції" },
            { id: "templates", label: "Шаблони даних" },
            { id: "valueLists", label: "Списки значень" },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === "sources" && <AdminImportSources />}
        {tab === "templates" && <AdminImportTemplates />}
        {tab === "valueLists" && <AdminValueLists />}

        {tab === "operations" && (
          <>
            <p className="mb-4 text-[13px] text-[#8a94a0]">
              <b className="text-[#2b2d42]">Оберіть файл</b> — таблиця ОСТАТКИ (.csv) оновлює наявність і ціни, а рядок без товару в каталозі сам створює нову картку.
            </p>
            <ErpImport onBack={onClose} onImported={onImported} onGoToCatalog={onGoToCatalog} />

            <div className="mt-6 flex items-center gap-3 border-t border-[#e6eaec] pt-4 text-[12px] text-[#8a94a0]">
              <span>Вивантажити поточний каталог:</span>
              <button onClick={() => downloadCatalog("csv")} className="text-[#2b2d42] hover:underline">CSV</button>
              <span>·</span>
              <button onClick={() => downloadCatalog("xlsx")} className="text-[#2b2d42] hover:underline">Excel</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
