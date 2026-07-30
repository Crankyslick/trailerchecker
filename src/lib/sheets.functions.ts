/**
 * Google Sheets bidirectional sync via connector gateway.
 * All column resolution is dynamic — we read the header row (A1:Z1) and
 * match by trimmed, case-insensitive string. This protects writebacks from
 * dispatcher column re-ordering.
 */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

function normalizeHeader(s: string): string {
  return (s ?? "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

/** 0-based index -> spreadsheet column letter (A, B, ..., Z, AA, ...). */
function colLetter(idx: number): string {
  let n = idx;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

async function gwFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const lovKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_SHEETS_API_KEY_1 ?? process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovKey || !connKey) {
    throw new Error("Google Sheets connection not configured. Connect the Google Sheets connector in Lovable.");
  }
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovKey}`,
      "X-Connection-Api-Key": connKey,
      ...(init.headers ?? {}),
    },
  });
  return res;
}

async function readConfig(): Promise<{ spreadsheet_id: string; sheet_name: string }> {
  // sync_config is admin-only under RLS; this server-side read uses the service
  // client and returns nothing but the spreadsheet target.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("sync_config").select("spreadsheet_id, sheet_name").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { spreadsheet_id: string | null; sheet_name: string | null } | null;
  if (!row?.spreadsheet_id) throw new Error("Spreadsheet ID not set. Configure it in Settings.");
  return { spreadsheet_id: row.spreadsheet_id, sheet_name: row.sheet_name ?? "Sheet1" };
}


/** Read header row and return { normalized -> {index, letter} }. */
export const getSheetHeaders = createServerFn({ method: "GET" }).handler(async () => {
  const { spreadsheet_id, sheet_name } = await readConfig();
  const range = `${sheet_name}!A1:Z1`;
  const res = await gwFetch(`/spreadsheets/${spreadsheet_id}/values/${range}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets header read failed [${res.status}]: ${body}`);
  }
  const json = (await res.json()) as { values?: string[][] };
  const row = json.values?.[0] ?? [];
  const map: Record<string, { index: number; letter: string; original: string }> = {};
  const warnings: string[] = [];
  row.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (!key) return;
    if (map[key]) warnings.push(`Duplicate header "${h}" at col ${colLetter(i)}`);
    map[key] = { index: i, letter: colLetter(i), original: h };
  });
  return { map, headers: row, warnings, sheet_name, spreadsheet_id };
});

/**
 * Look up a set of column names in the header row. Missing headers are
 * returned in `missing` rather than thrown — callers decide fatal-ness.
 */
export const resolveColumns = createServerFn({ method: "POST" })
  .inputValidator((data: { names: string[] }) => data)
  .handler(async ({ data }) => {
    const headers = await getSheetHeaders();
    const found: Record<string, { index: number; letter: string }> = {};
    const missing: string[] = [];
    for (const name of data.names) {
      const key = normalizeHeader(name);
      const hit = headers.map[key];
      if (hit) found[name] = { index: hit.index, letter: hit.letter };
      else missing.push(name);
    }
    return { found, missing, sheet_name: headers.sheet_name };
  });

/**
 * Write one or more cells for a specific row, resolving column letters
 * dynamically from the header. `matchColumn` + `matchValue` locate the row
 * (e.g. `matchColumn: "Load ID", matchValue: "75253901"`).
 * If no row matches, does nothing (returns matched:false).
 */
export const writeCellsByHeader = createServerFn({ method: "POST" })
  .inputValidator((data: {
    matchColumn: string;
    matchValue: string;
    updates: Record<string, string | number | null>;
  }) => data)
  .handler(async ({ data }) => {
    const { spreadsheet_id, sheet_name } = await readConfig();
    const headers = await getSheetHeaders();
    const matchKey = normalizeHeader(data.matchColumn);
    const matchCol = headers.map[matchKey];
    if (!matchCol) {
      return { ok: false, matched: false, reason: `Match column "${data.matchColumn}" not found in sheet.` };
    }

    // Pull the entire match column to find the row
    const colRange = `${sheet_name}!${matchCol.letter}2:${matchCol.letter}`;
    const colRes = await gwFetch(`/spreadsheets/${spreadsheet_id}/values/${colRange}`);
    if (!colRes.ok) {
      const body = await colRes.text();
      throw new Error(`Sheets column read failed [${colRes.status}]: ${body}`);
    }
    const colJson = (await colRes.json()) as { values?: string[][] };
    const values = colJson.values ?? [];
    const target = String(data.matchValue).trim();
    const rowIdx = values.findIndex((r) => (r[0] ?? "").toString().trim() === target);
    if (rowIdx === -1) {
      return { ok: false, matched: false, reason: `No row where "${data.matchColumn}" = "${data.matchValue}".` };
    }
    const rowNumber = rowIdx + 2; // 1-based, +1 for header

    // Build batchUpdate payload with resolved columns
    const dataRanges: Array<{ range: string; values: string[][] }> = [];
    const warnings: string[] = [];
    for (const [colName, val] of Object.entries(data.updates)) {
      const key = normalizeHeader(colName);
      const col = headers.map[key];
      if (!col) { warnings.push(`Column "${colName}" not found — skipped`); continue; }
      dataRanges.push({
        range: `${sheet_name}!${col.letter}${rowNumber}`,
        values: [[val == null ? "" : String(val)]],
      });
    }
    if (dataRanges.length === 0) return { ok: true, matched: true, rowNumber, written: 0, warnings };

    const buRes = await gwFetch(`/spreadsheets/${spreadsheet_id}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: dataRanges }),
    });
    if (!buRes.ok) {
      const body = await buRes.text();
      throw new Error(`Sheets batchUpdate failed [${buRes.status}]: ${body}`);
    }
    return { ok: true, matched: true, rowNumber, written: dataRanges.length, warnings };
  });

/**
 * Append a new row at the bottom of the sheet using dynamic header mapping.
 * `record` keys are header names; missing headers cause blank cells (never
 * shifts). Used by guard-shack check-in.
 */
export const appendRowByHeader = createServerFn({ method: "POST" })
  .inputValidator((data: { record: Record<string, string | number | null> }) => data)
  .handler(async ({ data }) => {
    const { spreadsheet_id, sheet_name } = await readConfig();
    const headers = await getSheetHeaders();
    const headerRow = headers.headers;
    const warnings: string[] = [];
    const row: string[] = new Array(headerRow.length).fill("");
    for (const [k, v] of Object.entries(data.record)) {
      const key = normalizeHeader(k);
      const col = headers.map[key];
      if (!col) { warnings.push(`Column "${k}" not found — skipped`); continue; }
      row[col.index] = v == null ? "" : String(v);
    }
    const appendRes = await gwFetch(
      `/spreadsheets/${spreadsheet_id}/values/${sheet_name}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: [row] }) },
    );
    if (!appendRes.ok) {
      const body = await appendRes.text();
      throw new Error(`Sheets append failed [${appendRes.status}]: ${body}`);
    }
    const j = (await appendRes.json()) as { updates?: { updatedRange?: string } };
    return { ok: true, updatedRange: j.updates?.updatedRange ?? null, warnings };
  });

/**
 * Batch: update multiple rows keyed by a single match column. Used by the
 * DLM bulk parser to writeback trailer/driver/status per Load ID in one call.
 */
export const batchWriteByHeader = createServerFn({ method: "POST" })
  .inputValidator((data: {
    matchColumn: string;
    rows: Array<{ matchValue: string; updates: Record<string, string | number | null> }>;
  }) => data)
  .handler(async ({ data }) => {
    const { spreadsheet_id, sheet_name } = await readConfig();
    const headers = await getSheetHeaders();
    const matchKey = normalizeHeader(data.matchColumn);
    const matchCol = headers.map[matchKey];
    if (!matchCol) throw new Error(`Match column "${data.matchColumn}" not found.`);

    const colRange = `${sheet_name}!${matchCol.letter}2:${matchCol.letter}`;
    const colRes = await gwFetch(`/spreadsheets/${spreadsheet_id}/values/${colRange}`);
    if (!colRes.ok) {
      const body = await colRes.text();
      throw new Error(`Sheets column read failed [${colRes.status}]: ${body}`);
    }
    const values = ((await colRes.json()) as { values?: string[][] }).values ?? [];
    const index = new Map<string, number>();
    values.forEach((r, i) => {
      const v = (r[0] ?? "").toString().trim();
      if (v) index.set(v, i + 2);
    });

    const dataRanges: Array<{ range: string; values: string[][] }> = [];
    const results: Array<{ matchValue: string; matched: boolean; row?: number }> = [];
    const warnings = new Set<string>();
    for (const r of data.rows) {
      const rowNum = index.get(String(r.matchValue).trim());
      if (!rowNum) { results.push({ matchValue: r.matchValue, matched: false }); continue; }
      results.push({ matchValue: r.matchValue, matched: true, row: rowNum });
      for (const [colName, val] of Object.entries(r.updates)) {
        const key = normalizeHeader(colName);
        const col = headers.map[key];
        if (!col) { warnings.add(`Column "${colName}" not found`); continue; }
        dataRanges.push({
          range: `${sheet_name}!${col.letter}${rowNum}`,
          values: [[val == null ? "" : String(val)]],
        });
      }
    }
    if (dataRanges.length > 0) {
      const buRes = await gwFetch(`/spreadsheets/${spreadsheet_id}/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: dataRanges }),
      });
      if (!buRes.ok) {
        const body = await buRes.text();
        throw new Error(`Sheets batchUpdate failed [${buRes.status}]: ${body}`);
      }
    }
    return { ok: true, written: dataRanges.length, results, warnings: [...warnings] };
  });
