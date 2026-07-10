"use client";

import { useState } from "react";
import { SubTabs } from "./intertop/primitives";
import { AdminImportTemplates } from "./AdminImportTemplates";
import { AdminValueLists } from "./AdminValueLists";

/**
 * "Зіставлення властивостей" (Intertop 2.9 guide) — a top-level nav item
 * under Товари, sibling to Властивості товарів / Розмірні сітки, made of
 * exactly two tabs: Шаблони даних + Списки значень. Real Intertop nav does
 * NOT nest these under an "Імпорт" umbrella (see ErpImportTabs.tsx, which
 * keeps its own separate Джерела даних/Операції tabs — those came from
 * earlier screenshots, this section is the officially-documented one).
 */
export function AdminPropertyMatching() {
  const [tab, setTab] = useState<"templates" | "valueLists">("templates");
  return (
    <div>
      <SubTabs
        tabs={[
          { id: "templates", label: "Шаблони даних" },
          { id: "valueLists", label: "Списки значень" },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "templates" && <AdminImportTemplates />}
      {tab === "valueLists" && <AdminValueLists />}
    </div>
  );
}
