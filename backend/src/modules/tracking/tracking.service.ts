import { FastifyInstance } from 'fastify';
import { Role } from '../../shared/types/index.js';

/**
 * Uffizio Pull API - GPS Tracking Service
 *
 * Auth flow:
 *   1. POST /webservice?token=generateAccessToken  → receive auth-code
 *   2. POST /webservice?token=getTokenBaseLiveData&ProjectId=49
 *      Header: auth-code: <code>
 *      Body:   { company_names, vehicle_nos, imei_nos, format }
 *
 * Credentials configured via .env:
 *   UFFIZIO_BASE_URL  = http://13.245.46.90
 *   UFFIZIO_USERNAME  = nccg@brighton.co.ke
 *   UFFIZIO_PASSWORD  = Vision@123!!
 *   UFFIZIO_PROJECT_ID = 49
 *   UFFIZIO_COMPANY   = Nairobi Emergency Operation Center
 */

interface VehicleLocation {
  vehicleId: string;
  imei: string;
  registration: string;
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  ignition: boolean;
  timestamp: string;
  agencyId: string;
  isActive: boolean;
  dbStatus: 'READY' | 'BUSY' | 'MAINTENANCE';
}

const POLL_INTERVAL_MS = 65_000;
// Refresh the auth code 5 min before we assume it expires (default: 23h)
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

export class TrackingService {
  private authCode: string | null = null;
  private authCodeExpiry: number = 0;
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly projectId: string;
  private readonly companyName: string;

  constructor(private app: FastifyInstance) {
    this.baseUrl = (app.config.UFFIZIO_BASE_URL ?? '').replace(/\/$/, '');
    this.username = app.config.UFFIZIO_USERNAME ?? '';
    this.password = app.config.UFFIZIO_PASSWORD ?? '';
    this.projectId = app.config.UFFIZIO_PROJECT_ID ?? '49';
    this.companyName = app.config.UFFIZIO_COMPANY ?? 'Nairobi Emergency Operation Center';
  }

  // ── Token management ──────────────────────────────────────────────────────

  /** Public so the fuel module can reuse the same auth code - Uffizio rate-limits
   *  aggressively, so we deliberately share one token rather than minting two. */
  async getAuthCode(): Promise<string> {
    if (this.authCode && Date.now() < this.authCodeExpiry) {
      return this.authCode;
    }

    const url = `${this.baseUrl}/webservice?token=generateAccessToken`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });

    if (!res.ok) {
      throw new Error(`Uffizio auth failed: HTTP ${res.status}`);
    }

    const body: any = await res.json();

    // Confirmed response: { result: 1, data: { token: "..." }, message: "" }
    const code = body?.data?.token ?? body?.auth_code ?? body?.token;

    if (!code) {
      this.app.log.error({ body }, 'Uffizio: unexpected auth response - could not extract auth code');
      throw new Error('Uffizio: auth code not found in response');
    }

    this.authCode = code;
    this.authCodeExpiry = Date.now() + TOKEN_TTL_MS;
    this.app.log.info('Uffizio: auth code refreshed');
    return this.authCode!;
  }

  // ── Live data fetch ───────────────────────────────────────────────────────

  /**
   * Diagnostic: returns the COMPLETE raw field set Uffizio sends for each
   * vehicle, plus a guess at which fields look fuel-related.
   *
   * Exists because whether fuel data is available at all is a hardware question,
   * not a software one - a plain GPS tracker reports position/ignition/speed and
   * nothing else, while fuel level needs either a fuel-level sensor wired to the
   * unit or a CAN-bus/OBD link to the vehicle's own gauge. The regular poll only
   * logs the first 800 characters once at startup, which isn't enough to tell.
   */
  async fetchRawSample(): Promise<{
    vehicleCount: number;
    fieldNames: string[];
    possibleFuelFields: string[];
    sample: any;
  }> {
    const code = await this.getAuthCode();
    const url = `${this.baseUrl}/webservice?token=getTokenBaseLiveData&ProjectId=${this.projectId}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'auth-code': code, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_names: this.companyName,
        vehicle_nos: '',
        imei_nos: '',
        format: 'json',
      }),
    });

    if (res.status === 401) {
      this.authCode = null;
      throw new Error('Uffizio: auth code rejected (401) - try again, it will refresh');
    }
    if (!res.ok) throw new Error(`Uffizio live data failed: HTTP ${res.status}`);

    const body: any = await res.json();

    // Uffizio returns its rate-limit complaint as a 200 with an error body.
    if (body?.root?.error) {
      throw new Error(`Uffizio responded: ${body.root.error}`);
    }

    const rawVehicles = this.extractVehicleArray(body);
    if (!rawVehicles.length) {
      return { vehicleCount: 0, fieldNames: [], possibleFuelFields: [], sample: body };
    }

    // Union of keys across all vehicles - some units report more than others.
    const fieldNames = Array.from(
      new Set(rawVehicles.flatMap(v => Object.keys(v ?? {})))
    ).sort();

    const possibleFuelFields = fieldNames.filter(k =>
      /fuel|diesel|petrol|litre|liter|tank|consum|dte|odo|mileage/i.test(k)
    );

    return {
      vehicleCount: rawVehicles.length,
      fieldNames,
      possibleFuelFields,
      sample: rawVehicles[0],
    };
  }

  async fetchAndUpdateLocations(): Promise<void> {
    const code = await this.getAuthCode();

    const url = `${this.baseUrl}/webservice?token=getTokenBaseLiveData&ProjectId=${this.projectId}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'auth-code': code,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        company_names: this.companyName,
        vehicle_nos: '',
        imei_nos: '',
        format: 'json',
      }),
    });

    if (res.status === 401) {
      // Auth code expired early - force refresh next call
      this.authCode = null;
      throw new Error('Uffizio: auth code rejected (401) - will refresh on next poll');
    }

    if (!res.ok) {
      throw new Error(`Uffizio live data failed: HTTP ${res.status}`);
    }

    const body: any = await res.json();

    // Log the raw structure once (first successful fetch) for field-mapping verification
    if (!this._loggedStructure) {
      this._loggedStructure = true;
      this.app.log.info({ sample: JSON.stringify(body).slice(0, 800) }, 'Uffizio: raw response sample');
    }

    const rawVehicles = this.extractVehicleArray(body);
    if (!rawVehicles.length) {
      this.app.log.debug('Uffizio: no new vehicle data this poll cycle');
      return;
    }

    const locations = await this.mapToInternalFormat(rawVehicles);
    if (!locations.length) {
      this.app.log.warn('Uffizio: vehicles returned but none matched DB by IMEI - check seed');
      return;
    }

    await this.persistLocations(locations);

    this.app.io
      .to(`role:${Role.DISPATCHER}`)
      .to(`role:${Role.WATCHER}`)
      .emit('fleet:pos', locations);

    this._lastSuccessAt = new Date().toISOString();
    this._lastSuccessCount = locations.length;
    this.app.log.info(`Uffizio: updated ${locations.length} vehicle locations`);
  }

  private _loggedStructure = false;
  private _lastSuccessAt: string | null = null;
  private _lastSuccessCount = 0;
  private _lastErrorAt: string | null = null;
  private _lastError: string | null = null;

  // ── Response parsing ──────────────────────────────────────────────────────

  private extractVehicleArray(body: any): any[] {
    // Confirmed response format: { root: { VehicleData: [...] } }
    if (Array.isArray(body?.root?.VehicleData)) return body.root.VehicleData;
    // Fallback for alternative shapes
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.data)) return body.data;
    if (Array.isArray(body?.result)) return body.result;
    return [];
  }

  private async mapToInternalFormat(rawVehicles: any[]): Promise<VehicleLocation[]> {
    const dbVehicles = await this.app.prisma.vehicle.findMany({
      select: { id: true, imei: true, registrationNumber: true, agencyId: true, isActive: true, status: true },
    });
    const byImei = new Map(dbVehicles.map(v => [v.imei, v]));
    const byReg = new Map(dbVehicles.map(v => [v.registrationNumber?.toUpperCase(), v]));

    const locations: VehicleLocation[] = [];

    for (const raw of rawVehicles) {
      // Confirmed field names from live API response
      const imei = String(raw.Imeino ?? raw.imei_no ?? raw.imei ?? '');
      const reg = String(raw.Vehicle_No ?? raw.vehicle_no ?? '').toUpperCase();

      const dbV = byImei.get(imei) ?? byReg.get(reg);
      if (!dbV) continue;

      const lat = parseFloat(raw.Latitude ?? raw.latitude ?? '0');
      const lng = parseFloat(raw.Longitude ?? raw.longitude ?? '0');

      if (!lat && !lng) continue;

      // IGN field: "ON", "OFF", "--" (unknown)
      const ignRaw = String(raw.IGN ?? raw.ignition ?? '').toUpperCase();
      const ignition = ignRaw === 'ON';

      // GPSActualTime format: "11-05-2026 12:56:08" (DD-MM-YYYY HH:mm:ss)
      const rawTs = raw.GPSActualTime ?? raw.gps_actual_date_time ?? '';
      let timestamp: string;
      if (rawTs) {
        // Convert DD-MM-YYYY HH:mm:ss → ISO
        const [datePart, timePart] = rawTs.split(' ');
        const [dd, mm, yyyy] = (datePart ?? '').split('-');
        timestamp = `${yyyy}-${mm}-${dd}T${timePart ?? '00:00:00'}Z`;
      } else {
        timestamp = new Date().toISOString();
      }

      locations.push({
        vehicleId: dbV.id,
        imei: dbV.imei,
        registration: dbV.registrationNumber,
        lat,
        lng,
        speed: parseFloat(String(raw.Speed ?? raw.speed ?? '0')),
        heading: parseInt(String(raw.Angle ?? raw.heading ?? '0'), 10),
        ignition,
        timestamp,
        agencyId: dbV.agencyId,
        isActive: dbV.isActive,
        dbStatus: (dbV.status as 'READY' | 'BUSY' | 'MAINTENANCE') ?? 'READY',
      });
    }

    return locations;
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  private async persistLocations(locations: VehicleLocation[]): Promise<void> {
    await Promise.all(
      locations.map(loc =>
        this.app.prisma.vehicle.update({
          where: { id: loc.vehicleId },
          data: {
            lastLat: loc.lat,
            lastLng: loc.lng,
            lastLocationAt: new Date(loc.timestamp),
          },
        }).catch(err =>
          this.app.log.warn({ err, vehicleId: loc.vehicleId }, 'Uffizio: failed to persist vehicle location')
        )
      )
    );

    // Also cache in Redis for O(1) nearest-vehicle queries
    if (this.app.redis) {
      const pipeline = this.app.redis.pipeline();
      for (const loc of locations) {
        pipeline.set(`vehicle:${loc.imei}:location`, JSON.stringify(loc), 'EX', 120);
      }
      await pipeline.exec();
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    if (!this.username || !this.password || !this.baseUrl) {
      this.app.log.warn('Uffizio: credentials not configured - GPS polling disabled. Set UFFIZIO_BASE_URL, UFFIZIO_USERNAME, UFFIZIO_PASSWORD in .env');
      return;
    }

    this.app.log.info(`Uffizio: starting GPS polling (${POLL_INTERVAL_MS / 1000}s interval)`);

    const onError = (err: unknown) => {
      this._lastErrorAt = new Date().toISOString();
      this._lastError = err instanceof Error ? err.message : String(err);
      this.app.log.error({ err }, 'Uffizio: poll failed');
    };

    this.fetchAndUpdateLocations().catch(onError);

    this.pollingInterval = setInterval(() => {
      this.fetchAndUpdateLocations().catch(onError);
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  healthStatus() {
    return {
      isRunning: !!this.pollingInterval,
      lastSuccessAt: this._lastSuccessAt,
      lastSuccessCount: this._lastSuccessCount,
      lastErrorAt: this._lastErrorAt,
      lastError: this._lastError,
      pollIntervalSeconds: POLL_INTERVAL_MS / 1000,
    };
  }
}
