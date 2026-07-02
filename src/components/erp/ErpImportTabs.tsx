"use client";

import { ErpImport } from "./ErpImport";

/**
 * "Завантажити товари" modal. Single real flow: drop the MG master .xls
 * and/or the Intertop prices.csv, preview the diff, apply.
 *
 * (Used to be a 4-tab Intertop-cabinet-style wizard with two template-export
 * tabs and a price-upload tab — all three were either broken or fully
 * duplicated this one real importer, and confused people into thinking they
 * needed an extra "create template" step that doesn't exist. Removed.)
 */
export function ErpImportTabs({
  onClose,
  onImported,
  onGoToCatalog,
}: {
  onClose?: () => void;
  onImported?: (msg: string) => void;
  onGoToCatalog?: () => void;
} = {}) {
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
          <h2 className="text-[18px] font-normal text-[#212121]">Завантажити товари</h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center text-[#9E9E9E] hover:text-[#212121] text-[20px] leading-none">✕</button>
        </div>
      )}

      <div className={isModal ? "max-h-[70vh] overflow-y-auto p-6" : undefined}>
        <p className="mb-4 text-[13px] text-[#9c8f7d]">
          <b className="text-[#17130f]">Оберіть файл</b> — таблиця MG (.xls) створює й оновлює товари, таблиця ОСТАТКИ (.csv) оновлює лише наявність і ціни.
          Система сама розпізнає тип файлу.
        </p>
        <ErpImport onBack={onClose} onImported={onImported} onGoToCatalog={onGoToCatalog} />

        <div className="mt-6 flex items-center gap-3 border-t border-[#e8e4de] pt-4 text-[12px] text-[#9c8f7d]">
          <span>Вивантажити поточний каталог:</span>
          <button onClick={() => downloadCatalog("csv")} className="text-[#17130f] hover:underline">CSV</button>
          <span>·</span>
          <button onClick={() => downloadCatalog("xlsx")} className="text-[#17130f] hover:underline">Excel</button>
        </div>
      </div>
    </div>
  );
}
