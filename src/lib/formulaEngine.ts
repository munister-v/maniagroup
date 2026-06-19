/**
 * Compact formula engine for ERP grid.
 *
 * Supported functions:
 *   SUM/СУММ, MIN/МИН, MAX/МАКС, AVERAGE/AVG/СРЗНАЧ, COUNT/СЧЁТ, COUNTA
 *   IF/ЕСЛИ, AND/И, OR/ИЛИ, NOT/НЕ
 *   ROUND/ОКРУГЛ, ABS, CEIL/ПОТОЛОК, FLOOR/ПОЛ, TRUNC
 *   VLOOKUP/ВПР (key, TABLE_NAME, "col")
 *   MARGIN(price, cost) → (price-cost)/price*100
 *   PERCENT(val, total) → val/total*100
 *   ISNUMBER/ISBLANK, IFERROR/ЕСЛИОШИБКА
 *
 * Named fields per row: PRICE, COST, STOCK, SKU, BRAND
 * Size ranges: XS:XL (resolved from allSizes)
 * Comparison in conditions: > < >= <= == != <>
 */

export type FormulaRow = {
  sizeQty: Record<string, number>;
  price: number;
  cost: number | null;
  sku: string;
  brand: string;
  allSizes: string[];
};

export type NamedTable = Record<string, string | number | null>;
export type NamedTables = Record<string, NamedTable[]>;

/* ── tokenizer ──────────────────────────────────────────────────────────── */

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
    // Two-char ops first
    if (i + 1 < src.length) {
      const two = src.slice(i, i + 2);
      if ([">=", "<=", "<>", "==", "!="].includes(two)) {
        out.push({ t: "OP", v: two }); i += 2; continue;
      }
    }
    if ("+-*/^%<>=!".includes(c)) { out.push({ t: "OP", v: c }); i++; continue; }
    if (c === "(") { out.push({ t: "LPAREN", v: c }); i++; continue; }
    if (c === ")") { out.push({ t: "RPAREN", v: c }); i++; continue; }
    if (c === "," || c === ";") { out.push({ t: "COMMA", v: c }); i++; continue; }
    if (c === ":") { out.push({ t: "COLON", v: c }); i++; continue; }
    i++;
  }
  out.push({ t: "EOF", v: "" });
  return out;
}

/* ── evaluator (recursive descent) ─────────────────────────────────────── */

type Val = number | string | number[];

function flat(v: Val | undefined): number {
  if (v === undefined || v === null) return 0;
  if (Array.isArray(v)) return v.length ? v[0] : 0;
  if (typeof v === "string") return parseFloat(v) || 0;
  return isNaN(v) ? 0 : v;
}

function round(v: number, d: number): number {
  const f = Math.pow(10, Math.round(d));
  return Math.round(v * f) / f;
}

class Eval {
  private i = 0;
  constructor(
    private toks: Tok[],
    private row: FormulaRow,
    private tables: NamedTables,
  ) {}

  private peek() { return this.toks[this.i]; }
  private consume() { return this.toks[this.i++]; }

  run(): number { return flat(this.compare()); }

  /* ── compare: ==  !=  <>  >  <  >=  <= ── */
  private compare(): Val {
    let left = this.expr();
    const CMP_OPS = [">=", "<=", "<>", "==", "!=", ">", "<", "="];
    while (this.peek().t === "OP" && CMP_OPS.includes(this.peek().v)) {
      const op = this.consume().v;
      const right = this.expr();
      const l = flat(left), r = flat(right);
      if (op === ">")  { left = l > r  ? 1 : 0; continue; }
      if (op === "<")  { left = l < r  ? 1 : 0; continue; }
      if (op === ">=") { left = l >= r ? 1 : 0; continue; }
      if (op === "<=") { left = l <= r ? 1 : 0; continue; }
      // == / = / != / <>
      const eq = Math.abs(l - r) < 1e-9 ||
        (typeof left === "string" && typeof right === "string" &&
          String(left).toLowerCase() === String(right).toLowerCase());
      left = (op === "==" || op === "=") ? (eq ? 1 : 0) : (eq ? 0 : 1);
    }
    return left;
  }

  /* ── expr: + − ── */
  private expr(): Val {
    let left = this.term();
    while (this.peek().t === "OP" && "+-".includes(this.peek().v) && this.peek().v.length === 1) {
      const op = this.consume().v;
      const right = this.term();
      left = op === "+" ? flat(left) + flat(right) : flat(left) - flat(right);
    }
    return left;
  }

  /* ── term: * / % ── */
  private term(): Val {
    let left = this.unary();
    while (this.peek().t === "OP" && "*/%".includes(this.peek().v)) {
      const op = this.consume().v;
      const right = this.unary();
      if (op === "*") left = flat(left) * flat(right);
      else if (op === "/") { const d = flat(right); left = d !== 0 ? flat(left) / d : 0; }
      else left = flat(left) % flat(right);
    }
    return left;
  }

  /* ── unary: negation ── */
  private unary(): Val {
    if (this.peek().t === "OP" && this.peek().v === "-") {
      this.consume();
      return -flat(this.factor());
    }
    return this.factor();
  }

  /* ── factor: literals, parens, function calls, ranges, identifiers ── */
  private factor(): Val {
    const tok = this.peek();
    if (tok.t === "NUM") { this.consume(); return parseFloat(tok.v); }
    if (tok.t === "STR") { this.consume(); return tok.v; }
    if (tok.t === "LPAREN") {
      this.consume();
      const v = this.compare();
      if (this.peek().t === "RPAREN") this.consume();
      return v;
    }
    if (tok.t === "ID") {
      this.consume();
      const name = tok.v;
      if (this.peek().t === "LPAREN") {           // function call
        this.consume();
        const args = this.argList();
        if (this.peek().t === "RPAREN") this.consume();
        return this.callFn(name, args);
      }
      if (this.peek().t === "COLON") {            // size range e.g. XS:XL
        this.consume();
        const to = this.peek().t === "ID" ? this.consume().v : "*";
        return this.resolveRange(name, to);
      }
      return this.resolveId(name);
    }
    this.consume();
    return 0;
  }

  /* ── argList: collect comma-separated compare() exprs ── */
  private argList(): Val[] {
    const args: Val[] = [];
    while (this.peek().t !== "RPAREN" && this.peek().t !== "EOF") {
      args.push(this.compare());
      if (this.peek().t === "COMMA") this.consume();
    }
    return args;
  }

  /* ── named field / size resolvers ── */
  private resolveId(name: string): Val {
    if (name === "PRICE") return this.row.price;
    if (name === "COST")  return this.row.cost ?? 0;
    if (name === "STOCK") return Object.values(this.row.sizeQty).reduce((a, b) => a + b, 0);
    if (name === "SKU")   return this.row.sku;
    if (name === "BRAND") return this.row.brand;
    if (this.tables[name] !== undefined) return name; // table name reference for VLOOKUP
    if (name in this.row.sizeQty) return this.row.sizeQty[name];
    return 0;
  }

  private resolveRange(from: string, to: string): number[] {
    const sizes = this.row.allSizes;
    if (from === "*" || to === "*") return Object.values(this.row.sizeQty);
    const fi = sizes.indexOf(from), ti = sizes.indexOf(to);
    if (fi === -1 || ti === -1) return Object.values(this.row.sizeQty);
    const [lo, hi] = fi <= ti ? [fi, ti] : [ti, fi];
    return sizes.slice(lo, hi + 1).map((s) => this.row.sizeQty[s] ?? 0);
  }

  /* ── function dispatcher ── */
  private callFn(name: string, args: Val[]): Val {
    const nums = (): number[] => {
      const out: number[] = [];
      for (const a of args) {
        if (Array.isArray(a)) out.push(...a);
        else if (typeof a === "number") out.push(a);
        else { const n = parseFloat(String(a)); if (!isNaN(n)) out.push(n); }
      }
      return out;
    };

    switch (name) {
      /* ── aggregates ── */
      case "SUM":  case "СУММ":    return nums().reduce((a, b) => a + b, 0);
      case "MIN":  case "МИН":     { const n = nums(); return n.length ? Math.min(...n) : 0; }
      case "MAX":  case "МАКС":    { const n = nums(); return n.length ? Math.max(...n) : 0; }
      case "AVERAGE": case "AVG": case "СРЗНАЧ": {
        const n = nums(); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0;
      }
      case "COUNT":  case "СЧЁТ": case "СЧЕТ": return nums().filter((v) => v !== 0).length;
      case "COUNTA": return nums().length;

      /* ── math ── */
      case "ROUND":  case "ОКРУГЛ":  return round(flat(args[0]), flat(args[1]));
      case "ABS":                    return Math.abs(flat(args[0]));
      case "CEIL":   case "ПОТОЛОК": return Math.ceil(flat(args[0]));
      case "FLOOR":  case "ПОЛ":     return Math.floor(flat(args[0]));
      case "TRUNC":                  return Math.trunc(flat(args[0]));
      case "SQRT":                   return Math.sqrt(Math.abs(flat(args[0])));
      case "POW":                    return Math.pow(flat(args[0]), flat(args[1]));
      case "MOD":                    { const d = flat(args[1]); return d !== 0 ? flat(args[0]) % d : 0; }

      /* ── logic ── */
      case "IF":   case "ЕСЛИ": {
        const [cond, then_, else_] = args;
        return flat(cond) ? flat(then_ ?? 1) : flat(else_ ?? 0);
      }
      case "AND":  case "И":   return nums().every(Boolean) ? 1 : 0;
      case "OR":   case "ИЛИ": return nums().some(Boolean)  ? 1 : 0;
      case "NOT":  case "НЕ":  return flat(args[0]) ? 0 : 1;
      case "IFS": {
        for (let i = 0; i + 1 < args.length; i += 2) {
          if (flat(args[i])) return flat(args[i + 1]);
        }
        return 0;
      }

      /* ── lookup ── */
      case "VLOOKUP": case "ВПР": {
        const [lookupVal, tableRef, colRef, approx] = args;
        const tableName = typeof tableRef === "string" ? tableRef : String(tableRef);
        const tbl = this.tables[tableName] ?? [];
        const colKey = typeof colRef === "string" ? colRef.toLowerCase() : "";
        const lookupStr = typeof lookupVal === "string"
          ? lookupVal.toLowerCase()
          : String(flat(lookupVal));
        const exact = !flat(approx ?? 0); // default exact match
        for (const row of tbl) {
          const firstVal = String(Object.values(row)[0] ?? "").toLowerCase();
          const matches = exact
            ? firstVal === lookupStr
            : firstVal.includes(lookupStr) || lookupStr.includes(firstVal);
          if (!matches) continue;
          // Find column by name or numeric index
          const colNum = typeof colRef === "number" ? flat(colRef) - 1 : -1;
          const keys = Object.keys(row);
          const key = colKey
            ? keys.find((k) => k.toLowerCase() === colKey) ?? keys[colNum] ?? ""
            : keys[Math.max(0, colNum)];
          const cell = row[key];
          return typeof cell === "number" ? cell : parseFloat(String(cell ?? 0)) || 0;
        }
        return 0;
      }

      /* ── convenience shortcuts ── */
      case "MARGIN": {
        const [price, cost] = args.map(flat);
        return price > 0 ? round((price - cost) / price * 100, 1) : 0;
      }
      case "PERCENT": {
        const [val, total] = args.map(flat);
        return total > 0 ? round(val / total * 100, 1) : 0;
      }
      case "MARKUP": {
        const [price, cost] = args.map(flat);
        return cost > 0 ? round((price - cost) / cost * 100, 1) : 0;
      }

      /* ── type checks ── */
      case "ISNUMBER": case "ЕЧИСЛО": return typeof args[0] === "number" || !isNaN(Number(args[0])) ? 1 : 0;
      case "ISBLANK":  case "ЕПУСТО": return flat(args[0]) === 0 ? 1 : 0;

      case "IFERROR": case "ЕСЛИОШИБКА": case "COALESCE": {
        for (const a of args) { const v = flat(a); if (v !== 0) return v; }
        return 0;
      }

      default: return 0;
    }
  }
}

/** Evaluate a formula string (without leading "="). Returns a numeric result. */
export function evalFormula(
  formula: string,
  row: FormulaRow,
  tables: NamedTables,
): number {
  try {
    const toks = tokenize(formula);
    return new Eval(toks, row, tables).run();
  } catch {
    return 0;
  }
}
