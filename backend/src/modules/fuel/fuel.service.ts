import { FastifyInstance } from 'fastify';

/**
 * Uffizio Fuel Fill/Drain API.
 *
 *   getFuelFillDrainData        → per-vehicle summary over a date range
 *   getFuelFillDrainDetailData  → individual fill/drain events for one vehicle
 *
 * IMPORTANT: this data only exists for vehicles that have a **fuel sensor**
 * fitted to the tracker. For a plain GPS unit Uffizio returns the vehicle with
 * zeroed figures and an empty `sensor_info`, which is why `hasSensor` is derived
 * and surfaced explicitly - a fleet showing "0 litres consumed" because nobody
 * fitted a probe must not be mistaken for a fleet that used no fuel.
 */

export interface FuelSummaryRow {
  imei: string;
  vehicleId: string | null;
  registrationNumber: string;
  /** False when no fuel sensor is fitted - all figures below are meaningless. */
  hasSensor: boolean;
  sensorModel: string | null;
  distanceKm: number;
  fuelConsumedL: number;
  /** km per litre as reported by Uffizio. */
  mileageKmPerL: number;
  startFuelL: number;
  endFuelL: number;
  filledL: number;
  drainedL: number;
  fillCount: number;
  drainCount: number;
  runningTime: string | null;
  idleTime: string | null;
  stopTime: string | null;
}

export interface FuelEvent {
  type: 'Fill' | 'Drain' | string;
  startDateTime: string | null;
  endDateTime: string | null;
  beforeLevelL: number;
  afterLevelL: number;
  /** Positive for a fill, negative for a drain (normalised from `fuel_diff`). */
  changeL: number;
  odometer: number | null;
  location: string | null;
  driver: string | null;
  distanceKm: number;
  mileageKmPerL: number;
  fuelConsumedL: number;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return !s || s === '--' ? null : s;
};

/** Uffizio expects "DD-MM-YYYY HH:mm:ss". Bare dates are treated as Nairobi days. */
function toUffizioStamp(value: string, edge: 'start' | 'end'): string {
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = bare
    ? new Date(`${value}T${edge === 'start' ? '00:00:00' : '23:59:59'}+03:00`)
    : new Date(value);
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)?.value ?? '00';
  return `${g('day')}-${g('month')}-${g('year')} ${g('hour')}:${g('minute')}:${g('second')}`;
}

/**
 * Uffizio throttles the fuel report API hard - its own message quotes a wait of
 * around 15 minutes, unlike the 1-minute limit on live GPS data. That makes
 * fetch-on-page-load impossible, so results are cached per date range and
 * shared across every user of the app.
 *
 * The cache and cooldown are module-level (not per-instance) because the limit
 * is enforced per Uffizio account, and a new FuelService is constructed on each
 * plugin registration.
 */
interface CacheEntry { data: any; fetchedAt: number }
const cache = new Map<string, CacheEntry>();
/** Epoch ms before which Uffizio will reject any further fuel call. */
let cooldownUntil = 0;
/** Serve cache without hitting Uffizio at all within this window. */
const CACHE_TTL_MS = 15 * 60 * 1000;

export interface FuelMeta {
  /** True when the payload came from cache rather than a live call. */
  cached: boolean;
  /** When the data was actually retrieved from Uffizio. */
  fetchedAt: string | null;
  /** Older than the TTL - shown, but flagged in the UI. */
  stale: boolean;
  /** When another live call becomes possible, if currently throttled. */
  retryAfter: string | null;
}

/** Parses Uffizio's "Please wait for 00:14:02 Minutes" into milliseconds. */
function parseCooldownMs(message: string): number | null {
  const m = /(\d{1,2}):(\d{2}):(\d{2})/.exec(message);
  if (!m) return null;
  return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000;
}

export class FuelService {
  private readonly baseUrl: string;
  private readonly projectId: number;

  constructor(private app: FastifyInstance) {
    this.baseUrl = (app.config.UFFIZIO_BASE_URL ?? '').replace(/\/$/, '');
    this.projectId = parseInt(app.config.UFFIZIO_PROJECT_ID ?? '49', 10);
  }

  /**
   * Cache-aware fetch. Order of preference:
   *   1. Fresh cache (< TTL) - no network call at all
   *   2. Live call, if we're not inside a known cooldown
   *   3. Stale cache, flagged as such - better than an empty screen
   *   4. Throw, with the retry time attached
   */
  private async cachedCall(
    key: string,
    method: string,
    body: Record<string, unknown>,
  ): Promise<{ data: any; meta: FuelMeta }> {
    const hit = cache.get(key);
    const now = Date.now();

    const metaFor = (entry: CacheEntry, cached: boolean): FuelMeta => ({
      cached,
      fetchedAt: new Date(entry.fetchedAt).toISOString(),
      stale: now - entry.fetchedAt > CACHE_TTL_MS,
      retryAfter: cooldownUntil > now ? new Date(cooldownUntil).toISOString() : null,
    });

    if (hit && now - hit.fetchedAt < CACHE_TTL_MS) {
      return { data: hit.data, meta: metaFor(hit, true) };
    }

    if (cooldownUntil > now) {
      if (hit) return { data: hit.data, meta: metaFor(hit, true) };
      const mins = Math.ceil((cooldownUntil - now) / 60000);
      throw new Error(
        `Uffizio limits fuel reports to one call every ~15 minutes. Next attempt possible in about ${mins} minute${mins === 1 ? '' : 's'}.`,
      );
    }

    try {
      const data = await this.call(method, body);
      const entry: CacheEntry = { data, fetchedAt: Date.now() };
      cache.set(key, entry);
      return { data, meta: metaFor(entry, false) };
    } catch (err: any) {
      const msg = String(err?.message ?? '');
      const waitMs = /wait for/i.test(msg) ? parseCooldownMs(msg) : null;
      if (waitMs) {
        // Record it so we stop hammering an endpoint we know will refuse us.
        cooldownUntil = Date.now() + waitMs;
        this.app.log.warn({ waitMs }, 'Uffizio fuel API cooling down');
        if (hit) return { data: hit.data, meta: metaFor(hit, true) };
      }
      throw err;
    }
  }

  private async call(method: string, body: Record<string, unknown>): Promise<any> {
    if (!this.baseUrl) throw new Error('Uffizio is not configured (UFFIZIO_BASE_URL missing)');

    // Reuse the tracking poller's auth code - Uffizio rate-limits per account.
    const code = await this.app.tracking.getAuthCode();

    const res = await fetch(`${this.baseUrl}/webservice?token=${method}`, {
      method: 'POST',
      headers: { 'auth-code': code, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, project_id: this.projectId }),
    });

    if (!res.ok) throw new Error(`Uffizio ${method} failed: HTTP ${res.status}`);
    const json: any = await res.json();

    // Uffizio reports rate limiting and other soft errors inside a 200 body.
    if (json?.root?.error) throw new Error(`Uffizio: ${json.root.error}`);
    if (json?.result === 0 && json?.message) throw new Error(`Uffizio: ${json.message}`);
    return json;
  }

  /** Fleet-wide fuel summary for a date range. */
  async getSummary(from: string, to: string): Promise<{ rows: FuelSummaryRow[]; meta: FuelMeta }> {
    const vehicles = await this.app.prisma.vehicle.findMany({
      where: { isActive: true, imei: { not: '' } },
      select: { id: true, imei: true, registrationNumber: true },
    });
    if (!vehicles.length) {
      return { rows: [], meta: { cached: false, fetchedAt: null, stale: false, retryAfter: null } };
    }

    const { data: json, meta } = await this.cachedCall(
      `summary:${from}:${to}`,
      'getFuelFillDrainData',
      {
        start_date_time: toUffizioStamp(from, 'start'),
        end_date_time: toUffizioStamp(to, 'end'),
        // Documented as numeric; a 15-digit IMEI is within JS safe-integer range.
        imei_nos: vehicles.map(v => Number(v.imei)).filter(n => Number.isFinite(n)),
      },
    );

    const rows: any[] = Array.isArray(json?.data) ? json.data : [];

    // Uffizio identifies rows by `object` ("REG - REG"), not by IMEI, so match
    // back to our fleet on registration number. Built explicitly rather than via
    // new Map(arr.map(...)), which TS can infer as arrays instead of tuples.
    type FleetRef = { id: string; imei: string; registrationNumber: string };
    const byReg = new Map<string, FleetRef>();
    for (const v of vehicles) byReg.set(v.registrationNumber.toUpperCase(), v);

    const mapped = rows.map((r) => {
      const objectLabel = String(r.object ?? '');
      const reg = objectLabel.split('-')[0].trim().toUpperCase();
      const v = byReg.get(reg);
      const sensorModel = str(r?.sensor_info?.sensor_model);
      const sensorImei = str(r?.sensor_info?.sensor_imei);

      const filled = num(r.fill);
      const drained = num(r.drain);
      const consumed = num(r.fuel_consumed);

      return {
        imei: v?.imei ?? '',
        vehicleId: v?.id ?? null,
        registrationNumber: v?.registrationNumber ?? (reg || objectLabel),
        // Treat any actual fuel movement as proof of a sensor, since some
        // installs report readings while leaving sensor_info blank.
        hasSensor: !!(sensorModel || sensorImei) || filled > 0 || drained > 0 || consumed > 0,
        sensorModel,
        distanceKm: num(r.distance),
        fuelConsumedL: consumed,
        mileageKmPerL: num(r.fuel_mileage),
        startFuelL: num(r.start_fuel_level),
        endFuelL: num(r.end_fuel_level),
        filledL: filled,
        drainedL: drained,
        // Uffizio's key really is misspelled "no_fo_fill" in their API.
        fillCount: num(r.no_fo_fill ?? r.no_of_fill),
        drainCount: num(r.no_of_drain),
        runningTime: str(r.running),
        idleTime: str(r.idle),
        stopTime: str(r.stop),
      };
    });

    return { rows: mapped, meta };
  }

  /** Individual fill/drain events for one vehicle. */
  async getEvents(imei: string, from: string, to: string): Promise<{ events: FuelEvent[]; meta: FuelMeta }> {
    const { data: json, meta } = await this.cachedCall(
      `events:${imei}:${from}:${to}`,
      'getFuelFillDrainDetailData',
      {
        start_date_time: toUffizioStamp(from, 'start'),
        end_date_time: toUffizioStamp(to, 'end'),
        imei_no: Number(imei),
      },
    );

    const rows: any[] = Array.isArray(json?.data?.report_data) ? json.data.report_data : [];

    const mapped = rows.map((r) => {
      const type = String(r.event_type ?? '').trim();
      const diff = Math.abs(num(r.fuel_diff));
      const ev = r.event_date_time ?? {};
      const join = (d: unknown, t: unknown) => {
        const ds = str(d); const ts = str(t);
        return ds ? `${ds}${ts ? ` ${ts}` : ''}` : null;
      };
      return {
        type,
        startDateTime: join(ev.start_date, ev.start_time),
        endDateTime: join(ev.end_date, ev.end_time),
        beforeLevelL: num(r.before_event_fuel_level),
        afterLevelL: num(r.after_event_fuel_level),
        // Signed so the UI can render fills and drains without re-deriving it.
        changeL: /drain/i.test(type) ? -diff : diff,
        odometer: r.event_odometer_value != null ? num(r.event_odometer_value) : null,
        location: str(r.location),
        driver: str(r.driver) && !/not defined/i.test(String(r.driver)) ? str(r.driver) : null,
        distanceKm: num(r.distance),
        mileageKmPerL: num(r.mileage),
        fuelConsumedL: num(r.fuel_consumed),
      };
    });

    return { events: mapped, meta };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    tracking: { getAuthCode(): Promise<string> };
  }
}
