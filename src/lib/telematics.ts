/**
 * Universal telematics payload normalizer.
 *
 * Accepts webhook bodies from Motive (KeepTruckin), Samsara, Geotab, and a
 * generic/custom JSON shape, and converts them into one internal event shape
 * that `ingest_tracking_event` understands.
 *
 * Matching target: the normalized `external_id` is matched against a load's
 * outbound trailer, return trailer, or assigned driver/tractor unit.
 */

export type TelematicsProvider = "motive" | "samsara" | "geotab" | "generic";

export type AssetType = "trailer" | "tractor" | "driver" | "unknown";

export type NormalizedPing = {
  external_id: string;
  asset_type: AssetType;
  latitude: number | null;
  longitude: number | null;
  speed_mph: number | null;
  heading_deg: number | null;
  recorded_at: string;
  eta_at: string | null;
  eta_source: string | null;
};

export type NormalizeResult = {
  provider: TelematicsProvider;
  events: NormalizedPing[];
};

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

function iso(v: unknown, fallback = true): string | null {
  const s = typeof v === "number" ? new Date(v).toISOString() : str(v);
  if (s) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return fallback ? new Date().toISOString() : null;
}

const KMH_TO_MPH = 0.621371;
const MS_TO_MPH = 2.236936;

function assetTypeFrom(raw: unknown, fallback: AssetType = "unknown"): AssetType {
  const s = (str(raw) ?? "").toLowerCase();
  if (!s) return fallback;
  if (s.includes("trailer")) return "trailer";
  if (s.includes("tractor") || s.includes("truck") || s.includes("vehicle") || s.includes("unit"))
    return "tractor";
  if (s.includes("driver")) return "driver";
  return fallback;
}

/** Guess which provider sent this body. */
export function detectProvider(body: unknown, hintHeader?: string | null): TelematicsProvider {
  const hint = (hintHeader ?? "").toLowerCase();
  if (hint.includes("motive") || hint.includes("keeptruckin")) return "motive";
  if (hint.includes("samsara")) return "samsara";
  if (hint.includes("geotab")) return "geotab";

  if (isObj(body)) {
    if ("eventType" in body && isObj(body["data"]) && "eventId" in body) return "samsara";
    if (isObj(body["data"]) && (isObj((body["data"] as Json)["vehicle"]) || isObj((body["data"] as Json)["asset"])))
      return "samsara";
    if (isObj(body["vehicle"]) && isObj((body["vehicle"] as Json)["current_location"])) return "motive";
    if (isObj(body["asset"]) && isObj((body["asset"] as Json)["current_location"])) return "motive";
    if ("action" in body && "typeName" in body) return "geotab";
    if (Array.isArray(body["LogRecords"]) || "deviceSerialNumber" in body) return "geotab";
  }
  return "generic";
}

function motive(body: Json): NormalizedPing[] {
  const node = (isObj(body["vehicle"]) && (body["vehicle"] as Json)) ||
    (isObj(body["asset"]) && (body["asset"] as Json)) ||
    body;
  const loc = (isObj(node["current_location"]) && (node["current_location"] as Json)) || node;
  const speedRaw = num(loc["speed"]) ?? num(node["speed"]);
  return [
    {
      external_id:
        str(node["trailer_name"]) ??
        str(node["asset_number"]) ??
        str(node["number"]) ??
        str(node["name"]) ??
        str(node["vehicle_id"]) ??
        str(body["external_id"]) ??
        "",
      asset_type: assetTypeFrom(node["asset_type"] ?? node["type"], isObj(body["asset"]) ? "trailer" : "tractor"),
      latitude: num(loc["lat"]) ?? num(loc["latitude"]),
      longitude: num(loc["lon"]) ?? num(loc["lng"]) ?? num(loc["longitude"]),
      // Motive reports speed in mph
      speed_mph: speedRaw,
      heading_deg: num(loc["bearing"]) ?? num(loc["heading"]),
      recorded_at: iso(loc["located_at"] ?? node["located_at"] ?? body["timestamp"])!,
      eta_at: iso(body["eta"] ?? node["eta"], false),
      eta_source: body["eta"] || node["eta"] ? "motive" : null,
    },
  ];
}

function samsara(body: Json): NormalizedPing[] {
  const data = (isObj(body["data"]) && (body["data"] as Json)) || body;
  const node =
    (isObj(data["vehicle"]) && (data["vehicle"] as Json)) ||
    (isObj(data["asset"]) && (data["asset"] as Json)) ||
    (isObj(data["trailer"]) && (data["trailer"] as Json)) ||
    data;
  const loc =
    (isObj(node["location"]) && (node["location"] as Json)) ||
    (isObj(data["location"]) && (data["location"] as Json)) ||
    node;
  const mph =
    num(loc["speedMilesPerHour"]) ??
    num(node["speedMilesPerHour"]) ??
    (num(loc["speedKilometersPerHour"]) !== null
      ? (num(loc["speedKilometersPerHour"]) as number) * KMH_TO_MPH
      : null);
  return [
    {
      external_id:
        str(node["name"]) ??
        str(node["assetSerialNumber"]) ??
        str(node["licensePlate"]) ??
        str(node["id"]) ??
        str(body["external_id"]) ??
        "",
      asset_type: assetTypeFrom(
        node["assetType"] ?? node["type"],
        isObj(data["trailer"]) || isObj(data["asset"]) ? "trailer" : "tractor",
      ),
      latitude: num(loc["latitude"]),
      longitude: num(loc["longitude"]),
      speed_mph: mph === null ? null : Math.round(mph * 10) / 10,
      heading_deg: num(loc["headingDegrees"]) ?? num(loc["heading"]),
      recorded_at: iso(loc["time"] ?? data["happenedAtTime"] ?? body["eventTime"] ?? data["time"])!,
      eta_at: iso(data["etaTime"] ?? data["eta"], false),
      eta_source: data["etaTime"] || data["eta"] ? "samsara" : null,
    },
  ];
}

function geotab(body: Json): NormalizedPing[] {
  const records = Array.isArray(body["LogRecords"])
    ? (body["LogRecords"] as unknown[])
    : Array.isArray(body["data"])
      ? (body["data"] as unknown[])
      : [body];

  return records.filter(isObj).map((rec) => {
    const device = (isObj(rec["device"]) && (rec["device"] as Json)) || {};
    const kmh = num(rec["speed"]);
    return {
      external_id:
        str(device["name"]) ??
        str(device["serialNumber"]) ??
        str(rec["deviceSerialNumber"]) ??
        str(rec["deviceName"]) ??
        str(device["id"]) ??
        "",
      asset_type: assetTypeFrom(device["deviceType"] ?? rec["assetType"], "tractor"),
      latitude: num(rec["latitude"]),
      longitude: num(rec["longitude"]),
      // Geotab reports speed in km/h
      speed_mph: kmh === null ? null : Math.round(kmh * KMH_TO_MPH * 10) / 10,
      heading_deg: num(rec["bearing"]) ?? num(rec["heading"]),
      recorded_at: iso(rec["dateTime"] ?? rec["date"])!,
      eta_at: null,
      eta_source: null,
    };
  });
}

function generic(body: Json): NormalizedPing[] {
  const list = Array.isArray(body["events"]) ? (body["events"] as unknown[]) : [body];
  return list.filter(isObj).map((ev) => {
    let speed = num(ev["speed_mph"]);
    if (speed === null && num(ev["speed_kph"]) !== null)
      speed = (num(ev["speed_kph"]) as number) * KMH_TO_MPH;
    if (speed === null && num(ev["speed_mps"]) !== null)
      speed = (num(ev["speed_mps"]) as number) * MS_TO_MPH;
    return {
      external_id:
        str(ev["external_id"]) ??
        str(ev["trailer"]) ??
        str(ev["trailer_number"]) ??
        str(ev["unit"]) ??
        str(ev["unit_number"]) ??
        str(ev["driver"]) ??
        str(ev["asset_id"]) ??
        "",
      asset_type: assetTypeFrom(ev["asset_type"], ev["driver"] && !ev["external_id"] ? "driver" : "unknown"),
      latitude: num(ev["latitude"]) ?? num(ev["lat"]),
      longitude: num(ev["longitude"]) ?? num(ev["lng"]) ?? num(ev["lon"]),
      speed_mph: speed === null ? null : Math.round(speed * 10) / 10,
      heading_deg: num(ev["heading_deg"]) ?? num(ev["heading"]) ?? num(ev["bearing"]),
      recorded_at: iso(ev["recorded_at"] ?? ev["timestamp"] ?? ev["time"])!,
      eta_at: iso(ev["eta_at"] ?? ev["eta"], false),
      eta_source: str(ev["eta_source"]) ?? (ev["eta_at"] || ev["eta"] ? "provider" : null),
    };
  });
}

/** Normalize any supported provider payload into internal ping events. */
export function normalizeTelematics(body: unknown, hintHeader?: string | null): NormalizeResult {
  if (!isObj(body) && !Array.isArray(body)) {
    return { provider: "generic", events: [] };
  }

  if (Array.isArray(body)) {
    const events = body.flatMap((item) => normalizeTelematics(item, hintHeader).events);
    return { provider: detectProvider(body[0], hintHeader), events };
  }

  const provider = detectProvider(body, hintHeader);
  const events =
    provider === "motive"
      ? motive(body)
      : provider === "samsara"
        ? samsara(body)
        : provider === "geotab"
          ? geotab(body)
          : generic(body);

  return {
    provider,
    events: events.filter(
      (e) =>
        e.external_id !== "" &&
        (e.latitude === null || (e.latitude >= -90 && e.latitude <= 90)) &&
        (e.longitude === null || (e.longitude >= -180 && e.longitude <= 180)),
    ),
  };
}
