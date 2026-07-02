/**
 * Registers the cp1251 (and other ANSI) codepage table with the `xlsx`
 * package. Required because Next.js bundles `import ... from "xlsx"` against
 * the package's ESM build (xlsx.mjs, per its "module" field), which — unlike
 * the CJS build — cannot synchronously `require()` its codepage data and so
 * silently mis-decodes non-UTF8 .xls files (cp1251 bytes read as Latin1,
 * turning "КОД" into "ÊÎÄ"). Side-effect import this once before any
 * `XLSX.read(buf, { codepage: 1251 })` call.
 */
import * as XLSX from "xlsx";
// @ts-expect-error — no type declarations ship for this subpath
import * as cpexcel from "xlsx/dist/cpexcel.full.mjs";

// The CJS build (xlsx.js) auto-loads its codepage table via an internal
// require() and has no set_cptable export at all; only the ESM build
// (xlsx.mjs, picked up by bundlers via the package's "module" field) needs —
// and exposes — this explicit registration.
if (typeof XLSX.set_cptable === "function") XLSX.set_cptable(cpexcel);
