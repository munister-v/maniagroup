/**
 * Compact formula engine for ERP grid.
 * Supports: arithmetic, SUM/MIN/MAX/AVG/COUNT/IF/VLOOKUP/ВПР/ROUND/ABS
 * Size ranges: XS:XL, named fields: PRICE, COST, STOCK, SKU, BRAND
 * Cross-table: VLOOKUP(key, TABLE_NAME, "column")
 */

export type FormulaRow = {
  sizeQty: Record<string, number>; // size → qty for this product row
  price: number;
  cost: number | null;
  sku: string;
  brand: string;
  allSizes: string[]; // sorted size list for ranges
};

export type NamedTable = Record<string, string | number | null>;
export type NamedTables = Record<string, NamedTable[]>;

/* ── tokenizer ─────────────────────────────────────────────────────────── */

type TT = "NUM" | "STR" | "ID" | "OP" | "LPAREN" | "RPAREN" | "COMMA" | "COLON" | "EOF";
type Tok = { t: TT; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/\d/.test(c) || (c === "." && /\d/.test(src[i + 1] ?? ""))) {
      let s = "";
      while (i < src.length && /[\d.]/.test(src[i])) s += src[i++];
      out.push({ t: "NUM", v: s }); continue;
    }
    if (c === '"' || c === "'") {
      const q = c; let s = ""; i++;
      while (i < src.length && src[i] !== q) s += src[i++];
      i++;
      out.push({ t: "STR", v: s }); continue;
    }
    if (/[A-Za-zА-ЯЄІЇа-яєіїёЁ_]/.test(c)) {
      let s = "";
      while (i < src.length && /[\wА-ЯЄІЇа-яєіїёЁ_]/.test(src[i])) s += src[i++];
      out.push({ t: "ID", v: s.toUpperCase() }); continue;
    }
    if ("+-*/^%<>=!".includes(c)) {
      let op = c; i++;
      if ("=<>!".includes(c) && src[i] === "=") op += src[i++];
      out.push({ t: "OP", v: op }); continue;
    }
    if (c === "(") { out.push({ t: "LPAREN", v: c }); i++; continue; }
    if (c === ")") { out.push({ t: "RPAREN", v: c }); i++; continue; }
    if (c === "," || c === ";") { out.push({ t: "COMMA", v: c }); i++; continue; }
    if (c === ":") { out.push({ t: "COLON", v: c }); i++; continue; }
    i++;
  }
  out.push({ t: "EOF", v: "" });
  return out;
}

/* ── evaluator (recursive descent) ──────────────────────────────────────── */

class Eval {
  private i = 0;
  constructor(
    private toks: Tok[],
    private row: FormulaRow,
    private tables: NamedTables,
  ) {}

  private peek() { return this.toks[this.i]; }
  private consume() { return this.toks[this.i++]; }
  private expect(t: TT) { const tok = this.peek(); if (tok.t === t) this.i++; return tok; }

  run(): number {
    const v = this.expr();
    return flat(v);
  }

  // expr: handles +, -
  private expr(): Val {
    let left = this.term();
    while (this.peek().t === "OP" && "+-".includes(this.peek().v)) {
      const op = this.consume().v;
      const right = this.term();
      if (op === "+") left = flat(left) + flat(right);
      else left = flat(left) - flat(right);
    }
    return left;
  }

  // term: handles *, /, %
  private term(): Val {
    let left = this.unary();
    while (this.peek().t === "OP" && "*/%.".includes(this.peek().v)) {
      const op = this.consume().v;
      const right = this.unary();
      if (op === "*") left = flat(left) * flat(right);
      else if (op === "/") { const d = flat(right); left = d !== 0 ? flat(left) / d : 0; }
      else if (op === "%") left = flat(left) % flat(right);
    }
    return left;
  }

  // unary: handles negation
  private unary(): Val {
    if (this.peek().t === "OP" && this.peek().v === "-") {
      this.consume();
      return -flat(this.factor());
    }
    return this.factor();
  }

  // factor: literals, parens, function calls, ranges, identifiers
  private factor(): Val {
    const tok = this.peek();
    if (tok.t === "NUM") { this.consume(); return parseFloat(tok.v); }
    if (tok.t === "STR") { this.consume(); return tok.v; }
    if (tok.t === "LPAREN") {
      this.consume();
      const v = this.expr();
      if (this.peek().t === "RPAREN") this.consume();
      return v;
    }
    if (tok.t === "ID") {
      this.consume();
      const name = tok.v;
      // Function call?
      if (this.peek().t === "LPAREN") {
        this.consume();
        const args = this.argList();
        if (this.peek().t === "RPAREN") this.consume();
        return this.callFn(name, args);
      }
      // Range: ID:ID ?
      if (this.peek().t === "COLON") {
        this.consume();
        const to = this.expect("ID").v;
        return this.resolveRange(name, to);
      }
      // Identifier (size, field, table ref)
      return this.resolveId(name);
    }
    this.consume(); // skip unknown
    return 0;
  }

  private argList(): Val[] {
    const args: Val[] = [];
    while (this.peek().t !== "RPAREN" && this.peek().t !== "EOF") {
      // Range detection inside args: ID:ID
      const tok = this.peek();
      if (tok.t === "ID") {
        this.consume();
        if (this.peek().t === "COLON") {
          this.consume();
          const to = this.expect("ID").v;
          args.push(this.resolveRange(tok.v, to));
          if (this.peek().t === "COMMA") this.consume();
          continue;
        }
        // Not a range — push back by re-evaluating with fake prefix
        if (this.peek().t === "LPAREN") {
          this.i--;
          args.push(this.factor());
        } else {
          args.push(this.resolveId(tok.v));
        }
      } else {
        args.push(this.expr());
      }
      if (this.peek().t === "COMMA") this.consume();
    }
    return args;
  }

  private resolveId(name: string): Val {
    // Named product fields
    if (name === "PRICE") return this.row.price;
    if (name === "COST") return this.row.cost ?? 0;
    if (name === "STOCK") return Object.values(this.row.sizeQty).reduce((a, b) => a + b, 0);
    if (name === "SKU") return this.row.sku;
    if (name === "BRAND") return this.row.brand;
    // Named tables (used as table reference in VLOOKUP)
    if (this.tables[name]) return name; // return table name as string for VLOOKUP
    // Size column → qty
    if (name in this.row.sizeQty) return this.row.sizeQty[name];
    // Partial match: numeric size like "36"
    const direct = this.row.sizeQty[name];
    if (direct !== undefined) return direct;
    return 0;
  }

  private resolveRange(from: string, to: string): number[] {
    const sizes = this.row.allSizes;
    const fi = sizes.indexOf(from), ti = sizes.indexOf(to);
    if (fi === -1 && to === "*") return Object.values(this.row.sizeQty);
    if (fi === -1 || ti === -1) {
      // Try to include all sizes if from/to not found
      return Object.values(this.row.sizeQty);
    }
    const [lo, hi] = fi <= ti ? [fi, ti] : [ti, fi];
    return sizes.slice(lo, hi + 1).map((s) => this.row.sizeQty[s] ?? 0);
  }

  private callFn(name: string, args: Val[]): Val {
    // Flatten all args into a flat numeric array for aggregate fns
    const nums = (): number[] => {
      const out: number[] = [];
      for (const a of args) {
        if (Array.isArray(a)) out.push(...a.map(Number));
        else if (typeof a === "string" && !isNaN(Number(a))) out.push(Number(a));
        else if (typeof a === "number") out.push(a);
      }
      return out;
    };

    switch (name) {
      case "SUM": case "СУММ": {
        return nums().reduce((a, b) => a + b, 0);
      }
      case "MIN": case "МИН": {
        const n = nums(); return n.length ? Math.min(...n) : 0;
      }
      case "MAX": case "МАКС": {
        const n = nums(); return n.length ? Math.max(...n) : 0;
      }
      case "AVERAGE": case "AVG": case "СРЗНАЧ": {
        const n = nums(); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0;
      }
      case "COUNT": case "СЧЁТ": case "СЧЕТ": {
        return nums().filter((v) => v !== 0).length;
      }
      case "COUNTA": {
        return nums().length;
      }
      case "ROUND": case "ОКРУГЛ": {
        const [v, d] = args; return round(flat(v), typeof d === "number" ? d : 0);
      }
      case "ABS": {
        return Math.abs(flat(args[0]));
      }
      case "IF": case "ЕСЛИ": {
        const [cond, then_, else_] = args;
        const c = flat(cond);
        return c ? flat(then_) : flat(else_ ?? 0);
      }
      case "AND": case "И": {
        return nums().every(Boolean) ? 1 : 0;
      }
      case "OR": case "ИЛИ": {
        return nums().some(Boolean) ? 1 : 0;
      }
      case "NOT": case "НЕ": {
        return flat(args[0]) ? 0 : 1;
      }
      case "VLOOKUP": case "ВПР": {
        // VLOOKUP(lookup_value, table_name_or_range, col_name_or_index, [exact])
        const [lookupVal, tableRef, colRef] = args;
        const tableName = typeof tableRef === "string" ? tableRef : "";
        const tbl = this.tables[tableName] ?? [];
        const colKey = typeof colRef === "string" ? colRef.toLowerCase() : "";
        const lookupStr = String(flat(lookupVal)).toLowerCase();
        for (const r of tbl) {
          // Match against first column or any column matching lookup key
          const vals = Object.values(r).map((v) => String(v ?? "").toLowerCase());
          if (vals[0] === lookupStr || vals.some((v) => v === lookupStr)) {
            const cell = colKey ? r[colKey] ?? r[Object.keys(r).find(k => k.toLowerCase() === colKey) ?? ""] : vals[1];
            return typeof cell === "number" ? cell : parseFloat(String(cell ?? 0)) || 0;
          }
        }
        return 0;
      }
      case "HLOOKUP": case "ГПР": {
        return 0;
      }
      case "ISNUMBER": case "ЕЧИСЛО": {
        return typeof args[0] === "number" || !isNaN(Number(args[0])) ? 1 : 0;
      }
      case "ISBLANK": case "ЕПУСТО": {
        return flat(args[0]) === 0 ? 1 : 0;
      }
      case "COALESCE": case "IFERROR": case "ЕСЛИОШИБКА": {
        for (const a of args) { const v = flat(a); if (v !== 0) return v; }
        return 0;
      }
      default:
        return 0;
    }
  }
}

type Val = number | string | number[];

function flat(v: Val | undefined): number {
  if (v === undefined || v === null) return 0;
  if (Array.isArray(v)) return v.length ? v[0] : 0;
  if (typeof v === "string") return parseFloat(v) || 0;
  return isNaN(v) ? 0 : v;
}

function round(v: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

/** Evaluate a formula string (without leading "="). Returns a numeric result or throws. */
export function evalFormula(
  formula: string,
  row: FormulaRow,
  tables: NamedTables,
): number {
  const toks = tokenize(formula);
  return new Eval(toks, row, tables).run();
}
