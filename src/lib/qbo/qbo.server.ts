// Server-only QuickBooks Online helpers: OAuth2 token lifecycle + API calls.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";

// The generated Database types do not know the qbo_* tables yet.
const admin = supabaseAdmin as unknown as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generated types lag behind the schema
  from: (table: string) => any;
};

export type QboConnection = {
  id: string;
  company_id: string;
  realm_id: string;
  company_name: string | null;
  environment: string;
  access_token: string;
  refresh_token: string;
  access_expires_at: string;
  last_synced_at: string | null;
};

export function qboCreds() {
  const clientId = process.env["QBO_CLIENT_ID"];
  const clientSecret = process.env["QBO_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    throw new Error("QuickBooks is not configured yet (missing app credentials).");
  }
  return { clientId, clientSecret };
}

export function qboRedirectUri(origin: string) {
  return process.env["QBO_REDIRECT_URI"] || `${origin}/api/public/qbo/callback`;
}

export function qboEnvironment() {
  return process.env["QBO_ENVIRONMENT"] === "sandbox" ? "sandbox" : "production";
}

function apiBase() {
  return qboEnvironment() === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";
}

export function buildAuthorizeUrl(state: string, redirectUri: string) {
  const { clientId } = qboCreds();
  const p = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: QBO_SCOPE,
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

async function tokenRequest(body: URLSearchParams) {
  const { clientId, clientSecret } = qboCreds();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`QuickBooks token request failed [${res.status}]: ${text}`);
  return JSON.parse(text) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    x_refresh_token_expires_in?: number;
  };
}

export function exchangeCode(code: string, redirectUri: string) {
  return tokenRequest(
    new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  );
}

export function refreshTokens(refreshToken: string) {
  return tokenRequest(
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  );
}

export async function getConnection(companyId: string): Promise<QboConnection | null> {
  const { data, error } = await admin
    .from("qbo_connections")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  return (data as QboConnection | null) ?? null;
}

/** Returns a connection with a valid (auto-refreshed) access token. */
export async function ensureFreshToken(conn: QboConnection): Promise<QboConnection> {
  const expiresAt = new Date(conn.access_expires_at).getTime();
  if (expiresAt - Date.now() > 120_000) return conn;
  const t = await refreshTokens(conn.refresh_token);
  const patch = {
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    access_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    refresh_expires_at: t.x_refresh_token_expires_in
      ? new Date(Date.now() + t.x_refresh_token_expires_in * 1000).toISOString()
      : null,
  };
  const { error } = await admin.from("qbo_connections").update(patch).eq("id", conn.id);
  if (error) throw error;
  return { ...conn, ...patch };
}

export async function qboApi<T = unknown>(
  conn: QboConnection,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const fresh = await ensureFreshToken(conn);
  const url = `${apiBase()}/v3/company/${fresh.realm_id}${path}`;
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${fresh.access_token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`QuickBooks API ${path} failed [${res.status}]`);
    throw new Error(`QuickBooks rejected the request [${res.status}]: ${text.slice(0, 400)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export async function queryQbo<T = unknown>(conn: QboConnection, sql: string): Promise<T> {
  return qboApi<T>(conn, `/query?query=${encodeURIComponent(sql)}&minorversion=70`);
}

function escapeQ(v: string) {
  return v.replace(/'/g, "''");
}

/** Find or create a QBO customer, returning its QBO id. */
export async function ensureQboCustomer(
  conn: QboConnection,
  customer: { id: string; name: string; email: string | null; qbo_customer_id: string | null },
): Promise<string> {
  if (customer.qbo_customer_id) return customer.qbo_customer_id;

  const found = await queryQbo<{ QueryResponse?: { Customer?: Array<{ Id: string }> } }>(
    conn,
    `select Id from Customer where DisplayName = '${escapeQ(customer.name)}'`,
  );
  let qboId = found.QueryResponse?.Customer?.[0]?.Id;

  if (!qboId) {
    const created = await qboApi<{ Customer?: { Id: string } }>(conn, "/customer?minorversion=70", {
      method: "POST",
      body: {
        DisplayName: customer.name,
        ...(customer.email ? { PrimaryEmailAddr: { Address: customer.email } } : {}),
      },
    });
    qboId = created.Customer?.Id;
  }
  if (!qboId) throw new Error(`Could not create QuickBooks customer "${customer.name}".`);

  await admin.from("trailer_clients").update({ qbo_customer_id: qboId }).eq("id", customer.id);
  return qboId;
}

/** Find or create a QBO service item for a revenue code. */
export async function ensureQboItem(
  conn: QboConnection,
  name: string,
  incomeAccountRef: string | null,
): Promise<string> {
  const found = await queryQbo<{ QueryResponse?: { Item?: Array<{ Id: string }> } }>(
    conn,
    `select Id from Item where Name = '${escapeQ(name)}'`,
  );
  const existing = found.QueryResponse?.Item?.[0]?.Id;
  if (existing) return existing;

  let accountId = incomeAccountRef;
  if (!accountId) {
    const acct = await queryQbo<{ QueryResponse?: { Account?: Array<{ Id: string }> } }>(
      conn,
      "select Id from Account where AccountType = 'Income' maxresults 1",
    );
    accountId = acct.QueryResponse?.Account?.[0]?.Id ?? null;
  }
  if (!accountId) {
    throw new Error(
      `No QuickBooks income account available for "${name}". Map one in QuickBooks settings.`,
    );
  }

  const created = await qboApi<{ Item?: { Id: string } }>(conn, "/item?minorversion=70", {
    method: "POST",
    body: { Name: name, Type: "Service", IncomeAccountRef: { value: accountId } },
  });
  const id = created.Item?.Id;
  if (!id) throw new Error(`Could not create QuickBooks item "${name}".`);
  return id;
}
