#!/usr/bin/env python3
"""
Standalone catalog importer (zero app-dependencies alternative to `npm run import`).

    pip install xlrd
    python3 scripts/import_catalog.py "<MG.xls>" "<WP.xls>" [data/catalog.db]

Builds catalog.db from the two store XLS exports + Store API photos, identical
schema/logic to src/lib/catalogImport.ts. Then `scp data/catalog.db` to the VPS.

Join key: MG.КОД == WP.ID(col0) == Store API `sku`.
"""

import json
import sqlite3
import sys
import time
import urllib.request

import xlrd  # pip install xlrd

STORE_API = "https://maniagroup.com.ua/wp-json/wc/store/products"
SYNTH_OFFSET = 10_000_000

TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c",
    "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya", "і": "i", "ї": "i", "є": "ie", "ґ": "g",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, sku TEXT DEFAULT '', name TEXT DEFAULT '', slug TEXT DEFAULT '',
  brand TEXT DEFAULT '', category TEXT DEFAULT '', category_slug TEXT DEFAULT '', gender TEXT DEFAULT '',
  price REAL DEFAULT 0, regular_price REAL DEFAULT 0, sale_price REAL,
  is_in_stock INTEGER DEFAULT 1, status TEXT DEFAULT 'publish',
  image_src TEXT DEFAULT '', images TEXT DEFAULT '[]', attributes TEXT DEFAULT '[]',
  description TEXT DEFAULT '', short_description TEXT DEFAULT '',
  color TEXT DEFAULT '', country TEXT DEFAULT '', season TEXT DEFAULT '',
  collection TEXT DEFAULT '', composition TEXT DEFAULT '',
  created_at TEXT DEFAULT '', updated_at TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_products_category_slug ON products(category_slug);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_gender ON products(gender);
CREATE INDEX IF NOT EXISTS idx_products_in_stock ON products(is_in_stock);
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  name, brand, category, content=products, content_rowid=id, tokenize='unicode61');
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL,
  parent INTEGER DEFAULT 0, count INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, val TEXT DEFAULT '');
"""


def slugify(s):
    return "".join(TRANSLIT.get(c, c) for c in s.lower()).strip()


def slug_clean(s):
    out, prev_dash = [], False
    for c in slugify(s):
        if c.isalnum():
            out.append(c); prev_dash = False
        elif not prev_dash:
            out.append("-"); prev_dash = True
    return "".join(out).strip("-")


def norm_gender(t):
    s = t.strip().lower()
    if s.startswith("жен"):
        return "women"
    if s.startswith("муж"):
        return "men"
    return ""


def parse_mg(path):
    wb = xlrd.open_workbook(path, encoding_override="cp1251")
    sh = wb.sheet_by_index(0)
    out = {}
    for r in range(sh.nrows):
        code = str(sh.cell_value(r, 0)).strip().split(".")[0]
        if not code.isdigit():
            continue
        out[code] = {
            "article": str(sh.cell_value(r, 1)).strip(), "brand": str(sh.cell_value(r, 2)).strip(),
            "name": str(sh.cell_value(r, 3)).strip(), "sizes": str(sh.cell_value(r, 4)).strip(),
            "base": float(sh.cell_value(r, 5) or 0), "sale": float(sh.cell_value(r, 6) or 0),
            "composition": str(sh.cell_value(r, 7)).strip(), "collection": str(sh.cell_value(r, 8)).strip(),
            "gender": norm_gender(str(sh.cell_value(r, 9))), "color": str(sh.cell_value(r, 10)).strip(),
            "country": str(sh.cell_value(r, 11)).strip(),
        }
    return out


def parse_wp(path):
    wb = xlrd.open_workbook(path, encoding_override="cp1251")
    sh = wb.sheet_by_index(0)
    hdr = [str(sh.cell_value(0, c)).strip() for c in range(sh.ncols)]
    col = {h: i for i, h in enumerate(hdr)}
    out = {}

    def g(r, name):
        return sh.cell_value(r, col[name]) if name in col else ""

    for r in range(1, sh.nrows):
        pid = str(g(r, "ID")).strip().split(".")[0]
        if not pid.isdigit():
            continue
        p = out.get(pid)
        if not p:
            p = {
                "name": str(g(r, "Name")).strip(), "regular": float(g(r, "Regular Price") or 0),
                "sale": float(g(r, "Sale Price") or 0), "category": str(g(r, "Categories")).split(",")[0].strip(),
                "sizes": [], "season": str(g(r, "Сезон")).strip(), "color": str(g(r, "Цвет")).strip(),
                "country": str(g(r, "Страна производитель")).strip(),
            }
            out[pid] = p
        size = str(g(r, "Attribute 1 Value(s)")).strip()
        qty = float(g(r, "In Stock?") or 0)
        if size and qty > 0 and size not in p["sizes"]:
            p["sizes"].append(size)
    return out


def fetch_store_index():
    index, page = {}, 1
    while True:
        url = f"{STORE_API}?per_page=100&page={page}&orderby=date&order=desc"
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                data = json.load(resp)
        except Exception as e:
            print("  store api stop:", e); break
        if not data:
            break
        for p in data:
            sku = str(p.get("sku") or "").strip()
            if not sku:
                continue
            imgs = p.get("images") if isinstance(p.get("images"), list) else []
            index[sku] = {
                "postId": p["id"], "name": p.get("name", ""),
                "images": [{"id": i.get("id"), "src": i.get("src"),
                            "thumbnail": i.get("thumbnail") or i.get("src"),
                            "alt": i.get("alt") or p.get("name", "")} for i in imgs],
            }
        print(f"  store api: page {page}, {len(index)} sku")
        if len(data) < 100:
            break
        page += 1
    return index


def size_attrs(sizes):
    if not sizes:
        return "[]"
    return json.dumps([{"taxonomy": "pa_size", "name": "Розмір",
                        "terms": [{"name": s, "slug": slug_clean(s) or s.lower()} for s in sizes]}],
                       ensure_ascii=False)


def main():
    if len(sys.argv) < 3:
        print('Usage: python3 scripts/import_catalog.py "<MG.xls>" "<WP.xls>" [data/catalog.db]')
        sys.exit(1)
    mg_path, wp_path = sys.argv[1], sys.argv[2]
    db_path = sys.argv[3] if len(sys.argv) > 3 else "data/catalog.db"
    start = time.time()

    print("Парсинг MG…"); mg = parse_mg(mg_path); print(f"  MG: {len(mg)}")
    print("Парсинг WP…"); wp = parse_wp(wp_path); print(f"  WP: {len(wp)}")
    print("Store API…"); store = fetch_store_index(); print(f"  фото: {len(store)}")

    now = time.strftime("%Y-%m-%dT%H:%M:%S")
    rows, cats = [], {}
    for pid, w in wp.items():
        m = mg.get(pid); e = store.get(pid)
        rid = e["postId"] if e else SYNTH_OFFSET + int(pid)
        cat = w["category"] or (m["name"] if m else "Одяг")
        cslug = slug_clean(cat) or "tovar"
        reg = w["regular"] or (m["base"] if m else 0)
        sale = w["sale"] if (w["sale"] and w["sale"] < reg) else 0
        c = cats.setdefault(cslug, {"name": cat, "n": 0}); c["n"] += 1
        rows.append((rid, pid, (e["name"] if e else w["name"]), str(rid),
                     (m["brand"] if m and m["brand"] else "Mania Group"), cat, cslug,
                     (m["gender"] if m else ""), (sale or reg), reg, (sale or None), 1, "publish",
                     (e["images"][0]["src"] if e and e["images"] else ""),
                     json.dumps(e["images"] if e else [], ensure_ascii=False), size_attrs(w["sizes"]),
                     "", "", (w["color"] or (m["color"] if m else "")),
                     (w["country"] or (m["country"] if m else "")), w["season"],
                     (m["collection"] if m else ""), (m["composition"] if m else ""), now, now))
    for code, m in mg.items():
        if code in wp:
            continue
        cat = m["name"] or "Одяг"; cslug = slug_clean(cat) or "tovar"
        sale = m["sale"] if (m["sale"] and m["sale"] < m["base"]) else 0
        rows.append((SYNTH_OFFSET + int(code), code, f'{m["name"]} {m["brand"]}'.strip(), code,
                     (m["brand"] or "Mania Group"), cat, cslug, m["gender"],
                     (sale or m["base"]), m["base"], (sale or None), 0, "publish",
                     "", "[]", "[]", "", "", m["color"], m["country"], "", m["collection"],
                     m["composition"], now, now))

    cols = ("id,sku,name,slug,brand,category,category_slug,gender,price,regular_price,sale_price,"
            "is_in_stock,status,image_src,images,attributes,description,short_description,"
            "color,country,season,collection,composition,created_at,updated_at")
    db = sqlite3.connect(db_path)
    db.executescript(SCHEMA)
    db.execute("DELETE FROM products"); db.execute("DELETE FROM categories")
    db.executemany(f"INSERT OR REPLACE INTO products({cols}) VALUES ({','.join('?' * 25)})", rows)
    db.executemany("INSERT OR REPLACE INTO categories(id,name,slug,parent,count) VALUES (?,?,?,?,?)",
                   [(i + 1, c["name"], s, 0, c["n"]) for i, (s, c) in enumerate(cats.items())])
    db.execute("INSERT INTO products_fts(products_fts) VALUES('rebuild')")
    in_stock = sum(1 for r in rows if r[11] == 1)
    for k, v in {"last_sync": now, "source": "xls", "total_products": str(len(rows)),
                 "in_stock_products": str(in_stock), "sync_status": "idle", "sync_error": ""}.items():
        db.execute("INSERT OR REPLACE INTO sync_meta(key,val) VALUES (?,?)", (k, v))
    db.commit(); db.close()

    print(f"\n✓ Готово: у наявності {in_stock}, архів {len(rows) - in_stock}, "
          f"усього {len(rows)}, категорій {len(cats)}, час {time.time() - start:.1f}s → {db_path}")


if __name__ == "__main__":
    main()
