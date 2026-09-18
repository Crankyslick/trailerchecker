/**
 * Google Sheets bidirectional sync via connector gateway.
 * All column resolution is dynamic — we read the header row (A1:Z1) and
 * match by trimmed, case-insensitive string. This protects writebacks from
 * dispatcher column re-ordering.
 *
 * Durability: every sheet write the app performs is first recorded in
 * `sheet_sync_outbox`. A drain pass (processSheetOutbox) executes pending
 * entries with exponential backoff, so a failed or offline sheet never
 * silently loses a dispatch, check-in or bulk update.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    throw new Error(
      "Google Sheets connection not configured. Connect the Google Sheets connector in Lovable.",
    );
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

const NOT_CONFIGURED = "Google Sheet not configured — set the Spreadsheet ID in Settings.";

/**
 * Daily dispatch columns that have a fixed position in the Target layout.
 * Used only when the header row does not spell the column out (renamed or
 * blank header) — writing to the known letter is better than silently
 * dropping Trip ID or the sweep flag. Other columns are untouched.
 */
const FIXED_COLUMNS: Record<string, { index: number; letter: string }> = {
  "trip id": { index: 3, letter: "D" },
  "round trip sweep": { index: 17, letter: "R" },
};

function resolveColumn(headers: Headers, name: string) {
  const key = normalizeHeader(name);
  return headers.map[key] ?? FIXED_COLUMNS[key] ?? null;
}

type SheetConfig = { spreadsheet_id: string; sheet_name: string };
type HeaderMap = Record<string, { index: number; letter: string; original: string }>;
type Headers = {
  map: HeaderMap;
  headers: string[];
  warnings: string[];
  sheet_name: string;
  spreadsheet_id: string;
};

/** Returns the sheet target for a company, or null when none is configured. */
async function readConfig(companyId?: string | null): Promise<SheetConfig | null> {
  // Sheet settings are admin-only under RLS; this server-side read uses the
  // service client and returns nothing but the spreadsheet target.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("trailer_sync_config")
    .select("spreadsheet_id, sheet_name, company_id");
  if (companyId) q = q.eq("company_id", companyId);
  const { data, error } = await q.limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { spreadsheet_id: string | null; sheet_name: string | null } | null;
  if (!row?.spreadsheet_id) return null;
  return { spreadsheet_id: row.spreadsheet_id, sheet_name: row.sheet_name ?? "Sheet1" };
}

/** Internal: read + index the header row for a known config. */
async function fetchHeaders(cfg: SheetConfig): Promise<Headers> {
  const { spreadsheet_id, sheet_name } = cfg;
  const range = `${sheet_name}!A1:Z1`;
  const res = await gwFetch(`/spreadsheets/${spreadsheet_id}/values/${range}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets header read failed [${res.status}]: ${body}`);
  }
  const json = (await res.json()) as { values?: string[][] };
  const row = json.values?.[0] ?? [];
  const map: HeaderMap = {};
  const warnings: string[] = [];
  row.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (!key) return;
    if (map[key]) warnings.push(`Duplicate header "${h}" at col ${colLetter(i)}`);
    map[key] = { index: i, letter: colLetter(i), original: h };
  });
  return { map, headers: row, warnings, sheet_name, spreadsheet_id };
}

/** Read header row and return { normalized -> {index, letter} }. */
export const getSheetHeaders = createServerFn({ method: "GET" }).handler(async () => {
  const cfg = await readConfig();
  if (!cfg) {
    return {
      map: {} as HeaderMap,
      headers: [] as string[],
      warnings: [NOT_CONFIGURED],
      sheet_name: "",
      spreadsheet_id: "",
      configured: false,
    };
  }
  return fetchHeaders(cfg);
});

/**
 * Look up a set of column names in the header row. Missing headers are
 * returned in `missing` rather than thrown — callers decide fatal-ness.
 */
export const resolveColumns = createServerFn({ method: "POST" })
  .inputValidator((data: { names: string[] }) => data)
  .handler(async ({ data }) => {
    const cfg = await readConfig();
    if (!cfg) return { found: {}, missing: data.names, sheet_name: "" };
    const headers = await fetchHeaders(cfg);
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

type UpdateMap = Record<string, string | number | null>;

/** Internal: locate a row by match column value. Returns the 1-based row number. */
async function findRow(
  cfg: SheetConfig,
  headers: Headers,
  matchColumn: string,
  matchValue: string,
) {
  const matchCol = headers.map[normalizeHeader(matchColumn)];
  if (!matchCol)
    return {
      row: null as number | null,
      reason: `Match column "${matchColumn}" not found in sheet.`,
    };
  const colRange = `${cfg.sheet_name}!${matchCol.letter}2:${matchCol.letter}`;
  const colRes = await gwFetch(`/spreadsheets/${cfg.spreadsheet_id}/values/${colRange}`);
  if (!colRes.ok) {
    const body = await colRes.text();
    throw new Error(`Sheets column read failed [${colRes.status}]: ${body}`);
  }
  const values = ((await colRes.json()) as { values?: string[][] }).values ?? [];
  const target = String(matchValue).trim();
  const idx = values.findIndex((r) => (r[0] ?? "").toString().trim() === target);
  if (idx === -1)
    return {
      row: null as number | null,
      reason: `No row where "${matchColumn}" = "${matchValue}".`,
    };
  return { row: idx + 2, reason: null as string | null };
}

async function batchUpdate(
  cfg: SheetConfig,
  dataRanges: Array<{ range: string; values: string[][] }>,
) {
  if (dataRanges.length === 0) return;
  const buRes = await gwFetch(`/spreadsheets/${cfg.spreadsheet_id}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: dataRanges }),
  });
  if (!buRes.ok) {
    const body = await buRes.text();
    throw new Error(`Sheets batchUpdate failed [${buRes.status}]: ${body}`);
  }
}

/**
 * Internal: write cells for one row matched by a column value.
 * Upsert semantics — when no row matches, the row is appended with the match
 * value plus the supplied cells, so a dispatch for a Load ID the sheet has
 * never seen lands as a new row instead of erroring.
 */
async function doWriteCells(
  cfg: SheetConfig,
  args: { matchColumn: string; matchValue: string; updates: UpdateMap },
) {
  const headers = await fetchHeaders(cfg);
  const located = await findRow(cfg, headers, args.matchColumn, args.matchValue);
  if (!located.row) {
    // No such row yet — append it (upsert). A missing match *column* is still
    // fatal-ish: the append simply writes whatever columns do exist.
    const appended = await doAppendRow(cfg, {
      [args.matchColumn]: args.matchValue,
      ...args.updates,
    });
    return {
      ok: true,
      matched: true,
      appended: true,
      rowNumber: null as number | null,
      written: Object.keys(args.updates).length,
      warnings: appended.warnings,
      updatedRange: appended.updatedRange,
    };
  }
  const dataRanges: Array<{ range: string; values: string[][] }> = [];
  const warnings: string[] = [];
  for (const [colName, val] of Object.entries(args.updates)) {
    const col = resolveColumn(headers, colName);
    if (!col) {
      warnings.push(`Column "${colName}" not found — skipped`);
      continue;
    }
    dataRanges.push({
      range: `${cfg.sheet_name}!${col.letter}${located.row}`,
      values: [[val == null ? "" : String(val)]],
    });
  }
  await batchUpdate(cfg, dataRanges);
  return {
    ok: true,
    matched: true,
    appended: false,
    rowNumber: located.row,
    written: dataRanges.length,
    warnings,
  };
}

/** Internal: append one record keyed by header names. */
async function doAppendRow(cfg: SheetConfig, record: UpdateMap) {
  const headers = await fetchHeaders(cfg);
  const warnings: string[] = [];
  const row: string[] = new Array(headers.headers.length).fill("");
  for (const [k, v] of Object.entries(record)) {
    const col = resolveColumn(headers, k);
    if (!col) {
      warnings.push(`Column "${k}" not found — skipped`);
      continue;
    }
    row[col.index] = v == null ? "" : String(v);
  }
  const appendRes = await gwFetch(
    `/spreadsheets/${cfg.spreadsheet_id}/values/${cfg.sheet_name}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) },
  );
  if (!appendRes.ok) {
    const body = await appendRes.text();
    throw new Error(`Sheets append failed [${appendRes.status}]: ${body}`);
  }
  const j = (await appendRes.json()) as { updates?: { updatedRange?: string } };
  return { ok: true, updatedRange: j.updates?.updatedRange ?? null, warnings };
}

/**
 * Write one or more cells for a specific row, resolving column letters
 * dynamically from the header. `matchColumn` + `matchValue` locate the row
 * (e.g. `matchColumn: "Load ID", matchValue: "75253901"`).
 */
export const writeCellsByHeader = createServerFn({ method: "POST" })
  .inputValidator((data: { matchColumn: string; matchValue: string; updates: UpdateMap }) => data)
  .handler(async ({ data }) => {
    const cfg = await readConfig();
    if (!cfg) return { ok: false, matched: false, reason: NOT_CONFIGURED };
    return doWriteCells(cfg, data);
  });

/**
 * Append a new row at the bottom of the sheet using dynamic header mapping.
 * `record` keys are header names; missing headers cause blank cells (never
 * shifts). Used by guard-shack check-in.
 */
export const appendRowByHeader = createServerFn({ method: "POST" })
  .inputValidator((data: { record: UpdateMap }) => data)
  .handler(async ({ data }) => {
    const cfg = await readConfig();
    if (!cfg) return { ok: false, updatedRange: null, warnings: [NOT_CONFIGURED] };
    return doAppendRow(cfg, data.record);
  });

/**
 * Batch: update multiple rows keyed by a single match column. Used by the
 * DLM bulk parser to writeback trailer/driver/status per Load ID in one call.
 */
export const batchWriteByHeader = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { matchColumn: string; rows: Array<{ matchValue: string; updates: UpdateMap }> }) =>
      data,
  )
  .handler(async ({ data }) => {
    const cfg = await readConfig();
    if (!cfg) {
      return {
        ok: false,
        written: 0,
        results: [] as Array<{ matchValue: string; matched: boolean; row?: number }>,
        warnings: [NOT_CONFIGURED],
      };
    }
    const headers = await fetchHeaders(cfg);
    const matchCol = headers.map[normalizeHeader(data.matchColumn)];
    if (!matchCol) throw new Error(`Match column "${data.matchColumn}" not found.`);

    const colRange = `${cfg.sheet_name}!${matchCol.letter}2:${matchCol.letter}`;
    const colRes = await gwFetch(`/spreadsheets/${cfg.spreadsheet_id}/values/${colRange}`);
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
    const results: Array<{
      matchValue: string;
      matched: boolean;
      row?: number;
      appended?: boolean;
    }> = [];
    const warnings = new Set<string>();
    const toAppend: Array<{ matchValue: string; updates: UpdateMap }> = [];
    for (const r of data.rows) {
      const rowNum = index.get(String(r.matchValue).trim());
      if (!rowNum) {
        // Upsert: queue an append for keys the sheet does not have yet.
        toAppend.push(r);
        continue;
      }
      results.push({ matchValue: r.matchValue, matched: true, row: rowNum });
      for (const [colName, val] of Object.entries(r.updates)) {
        const col = resolveColumn(headers, colName);
        if (!col) {
          warnings.add(`Column "${colName}" not found`);
          continue;
        }
        dataRanges.push({
          range: `${cfg.sheet_name}!${col.letter}${rowNum}`,
          values: [[val == null ? "" : String(val)]],
        });
      }
    }
    await batchUpdate(cfg, dataRanges);
    let appended = 0;
    for (const r of toAppend) {
      const res = await doAppendRow(cfg, { [data.matchColumn]: r.matchValue, ...r.updates });
      res.warnings.forEach((w) => warnings.add(w));
      results.push({ matchValue: r.matchValue, matched: false, appended: true });
      appended++;
    }
    return {
      ok: true,
      written: dataRanges.length,
      appended,
      results,
      warnings: [...warnings],
    };
  });

/** Backoff schedule in minutes, indexed by attempt count. */
const BACKOFF_MIN = [0, 1, 5, 15, 60, 180];
const MAX_ATTEMPTS = 6;

type OutboxRow = {
  id: string;
  kind: "update" | "append";
  match_column: string | null;
  match_value: string | null;
  payload: Record<string, unknown>;
  attempts: number;
};

/**
 * Drain pending outbox entries for the signed-in user's company. Safe to call
 * repeatedly — entries are processed oldest first and rescheduled with
 * exponential backoff when the sheet is unreachable.
 */
export const processSheetOutbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { limit?: number } | undefined) => data ?? {})
  .handler(async ({ data, context }) => {
    const limit = Math.min(Math.max(data.limit ?? 25, 1), 100);
    const db = context.supabase;

    const { data: rows, error } = await db
      .from("sheet_sync_outbox")
      .select("id, kind, match_column, match_value, payload, attempts, company_id")
      .eq("status", "pending")
      .lte("next_attempt_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);

    const pending = (rows ?? []) as unknown as OutboxRow[];
    if (pending.length === 0)
      return { processed: 0, done: 0, failed: 0, retrying: 0, configured: true };

    const cfg = await readConfig(
      (pending[0] as unknown as { company_id?: string }).company_id ?? null,
    );
    if (!cfg) {
      return {
        processed: 0,
        done: 0,
        failed: 0,
        retrying: pending.length,
        configured: false,
        reason: NOT_CONFIGURED,
      };
    }

    let done = 0,
      failed = 0,
      retrying = 0;
    for (const row of pending) {
      try {
        if (row.kind === "append") {
          await doAppendRow(cfg, (row.payload.record ?? {}) as UpdateMap);
        } else {
          // Upsert: a Load ID the sheet has never seen is appended rather
          // than failing with "No row where Load ID = ...".
          await doWriteCells(cfg, {
            matchColumn: row.match_column ?? "Load ID",
            matchValue: row.match_value ?? "",
            updates: (row.payload.updates ?? {}) as UpdateMap,
          });
        }

        await db
          .from("sheet_sync_outbox")
          .update({
            status: "done",
            attempts: row.attempts + 1,
            last_error: null,
            completed_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        done++;
      } catch (e) {
        const attempts = row.attempts + 1;
        const exhausted = attempts >= MAX_ATTEMPTS;
        const delay = BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length - 1)] ?? 180;
        await db
          .from("sheet_sync_outbox")
          .update({
            status: exhausted ? "failed" : "pending",
            attempts,
            last_error: (e as Error).message.slice(0, 500),
            next_attempt_at: new Date(Date.now() + delay * 60_000).toISOString(),
          })
          .eq("id", row.id);
        if (exhausted) failed++;
        else retrying++;
      }
    }
    return { processed: pending.length, done, failed, retrying, configured: true };
  });
