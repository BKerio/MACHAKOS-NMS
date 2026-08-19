import { FastifyInstance } from 'fastify';
import { Role } from '../../shared/types/index.js';

/**
 * Yeastar P-Series Cloud Edition PBX Integration
 *
 * Auth flow (OAuth2):
 *   POST https://eoc.cras.yeastar.com/openapi/v1.0/get_token
 *   Body: { username: <CLIENT_ID>, password: <CLIENT_SECRET> }
 *   → { access_token, access_token_expire_time: 1800, refresh_token, refresh_token_expire_time: 86400 }
 *
 *   All API calls append ?access_token={token} to the URL.
 *   User-Agent: OpenAPI header is required on every request.
 *
 * Webhook: enable "Webhook Event Push" in PBX > Integrations > API
 *   Set URL to: http://<your-server>/pbx/webhook
 *
 * Credentials in .env:
 *   YEASTAR_BASE_URL         = https://eoc.ras.yeastar.com  (check your browser URL - no "c" in "ras")
 *   YEASTAR_CLIENT_ID        = <Client ID from PBX API page>
 *   YEASTAR_CLIENT_SECRET    = <Client Secret from PBX API page>
 *   YEASTAR_WEBHOOK_SECRET   = <any shared secret you set>
 */

// P-Series webhook event shapes
interface PSeriesCdrEvent {
  event: 'NewCdr';
  callid: string;
  timestart: string;
  callfrom: string;
  callto: string;
  callduraction: number | string;
  talkduraction: number | string;
  srctrunkname?: string;
  desttrunkname?: string;
  didnumber?: string;
  status: string;
  type: string;
  recording?: string;
}

interface PSeriesCallStatusEvent {
  event: 'CallStatus';
  callid: string;
  callfrom: string;
  callto: string;
  callstatus: string; // 'Ringing' | 'Talking' | 'Idle'
  calltype: string;   // 'Inbound' | 'Outbound' | 'Internal'
}

export interface ActiveCall {
  callId: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  callFrom: string;
  callTo: string;
  status: 'RINGING' | 'ANSWERED';
  startedAt: string;
}

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry
const HEARTBEAT_INTERVAL_MS = 20 * 60 * 1000; // 20 min - well within 30 min expiry

export class PbxService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private activeCalls = new Map<string, ActiveCall>();

  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(private app: FastifyInstance) {
    this.baseUrl = (app.config.YEASTAR_BASE_URL ?? '').replace(/\/$/, '');
    this.clientId = app.config.YEASTAR_CLIENT_ID ?? '';
    this.clientSecret = app.config.YEASTAR_CLIENT_SECRET ?? '';
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  private async login(): Promise<string> {
    const url = `${this.baseUrl}/openapi/v1.0/get_token`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'OpenAPI',
      },
      body: JSON.stringify({ username: this.clientId, password: this.clientSecret }),
    });

    if (!res.ok) throw new Error(`Yeastar P-Series login failed: HTTP ${res.status}`);
    const body: any = await res.json();

    if (body.errcode !== 0) {
      throw new Error(`Yeastar P-Series login failed: ${body.errmsg ?? body.errcode}`);
    }

    this.accessToken = body.access_token;
    this.refreshToken = body.refresh_token;
    this.tokenExpiry = Date.now() + (body.access_token_expire_time ?? 1800) * 1000 - REFRESH_BUFFER_MS;
    this.app.log.info('Yeastar P-Series: authenticated');
    return this.accessToken!;
  }

  private async refreshAccessToken(): Promise<string> {
    if (!this.refreshToken) return this.login();

    const url = `${this.baseUrl}/openapi/v1.0/refresh_token`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'OpenAPI' },
      body: JSON.stringify({ refresh_token: this.refreshToken }),
    });

    if (!res.ok) {
      this.app.log.warn('Yeastar P-Series: refresh token failed - re-authenticating');
      return this.login();
    }

    const body: any = await res.json();
    if (body.errcode !== 0) return this.login();

    this.accessToken = body.access_token;
    if (body.refresh_token) this.refreshToken = body.refresh_token;
    this.tokenExpiry = Date.now() + (body.access_token_expire_time ?? 1800) * 1000 - REFRESH_BUFFER_MS;
    this.app.log.info('Yeastar P-Series: token refreshed');
    return this.accessToken!;
  }

  async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;
    return this.refreshAccessToken();
  }

  private apiUrl(path: string, token: string): string {
    return `${this.baseUrl}/openapi/v1.0/${path}?access_token=${token}`;
  }

  private apiHeaders(): HeadersInit {
    return { 'Content-Type': 'application/json', 'User-Agent': 'OpenAPI' };
  }

  // ── Click-to-call ─────────────────────────────────────────────────────────

  isConfigured(): boolean {
    return !!(this.baseUrl && this.clientId && this.clientSecret);
  }

  async dialOutbound(extId: string, outNumber: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('PBX integration is not configured - set YEASTAR_BASE_URL, YEASTAR_CLIENT_ID, YEASTAR_CLIENT_SECRET in .env');
    }
    const token = await this.getToken();
    const res = await fetch(this.apiUrl('call/dial', token), {
      method: 'POST',
      headers: this.apiHeaders(),
      body: JSON.stringify({ caller: extId, callee: outNumber }),
    });
    if (!res.ok) throw new Error(`Yeastar dial failed: HTTP ${res.status}`);
    const body: any = await res.json();
    if (body.errcode !== 0) throw new Error(`Yeastar dial failed: ${body.errmsg ?? body.errcode}`);
    this.app.log.info({ extId, outNumber }, 'Yeastar P-Series: outbound call initiated');
  }

  // ── CDR (pull from PBX) ───────────────────────────────────────────────────

  async queryCdrFromPbx(startTime: string, endTime: string): Promise<any[]> {
    const token = await this.getToken();
    const res = await fetch(this.apiUrl('cdr/search', token), {
      method: 'POST',
      headers: this.apiHeaders(),
      body: JSON.stringify({ starttime: startTime, endtime: endTime }),
    });
    if (!res.ok) throw new Error(`Yeastar CDR query failed: HTTP ${res.status}`);
    const body: any = await res.json();
    return body?.data ?? body?.cdrs ?? [];
  }

  // ── Webhook event handlers ────────────────────────────────────────────────

  async handleCdrPush(cdr: PSeriesCdrEvent): Promise<void> {
    const direction = cdr.type === 'Inbound' ? 'INBOUND' : cdr.type === 'Outbound' ? 'OUTBOUND' : 'INTERNAL';
    const rawStatus = (cdr.status ?? '').toUpperCase().replace(/ /g, '_');
    const status = (['ANSWERED', 'NO_ANSWER', 'BUSY', 'FAILED'] as const).includes(rawStatus as any)
      ? (rawStatus as 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'FAILED')
      : 'FAILED';

    // Yeastar sends local time as "YYYY-MM-DD HH:MM:SS" - treat as-is without forcing UTC
    const startedAt = new Date(String(cdr.timestart).replace(' ', 'T'));
    const duration = parseInt(String(cdr.callduraction ?? '0'), 10);
    const talkDuration = parseInt(String(cdr.talkduraction ?? '0'), 10);
    const endedAt = new Date(startedAt.getTime() + duration * 1000);

    const saved = await this.app.prisma.callLog.upsert({
      where: { callId: cdr.callid },
      create: {
        callId: cdr.callid,
        direction,
        callFrom: cdr.callfrom,
        callTo: cdr.callto,
        startedAt,
        endedAt,
        duration,
        talkDuration,
        status,
        recording: cdr.recording || null,
        trunkName: cdr.srctrunkname || null,
        didNumber: cdr.didnumber || null,
      },
      update: { status, endedAt, duration, talkDuration, recording: cdr.recording || null },
    });

    this.activeCalls.delete(cdr.callid);

    this.app.io
      .to(`role:${Role.DISPATCHER}`)
      .to(`role:${Role.ADMIN}`)
      .to(`role:${Role.SUPER_ADMIN}`)
      .emit('pbx:call:ended', saved);

    this.app.log.info({ callId: cdr.callid, status, direction }, 'PBX: CDR saved');
  }

  handleCallStatus(event: PSeriesCallStatusEvent): void {
    const callStatus = (event.callstatus ?? '').toLowerCase();
    const direction = event.calltype === 'Inbound' ? 'INBOUND' : event.calltype === 'Outbound' ? 'OUTBOUND' : 'INTERNAL';

    if (callStatus === 'ringing') {
      const call: ActiveCall = {
        callId: event.callid,
        direction,
        callFrom: event.callfrom,
        callTo: event.callto,
        status: 'RINGING',
        startedAt: new Date().toISOString(),
      };
      this.activeCalls.set(event.callid, call);
      this.app.io
        .to(`role:${Role.DISPATCHER}`)
        .to(`role:${Role.ADMIN}`)
        .to(`role:${Role.SUPER_ADMIN}`)
        .emit('pbx:call:new', call);
    } else if (callStatus === 'talking') {
      const existing = this.activeCalls.get(event.callid);
      if (existing) {
        const answered: ActiveCall = { ...existing, status: 'ANSWERED' };
        this.activeCalls.set(event.callid, answered);
        this.app.io
          .to(`role:${Role.DISPATCHER}`)
          .to(`role:${Role.ADMIN}`)
          .to(`role:${Role.SUPER_ADMIN}`)
          .emit('pbx:call:answered', answered);
      }
    } else if (callStatus === 'idle') {
      this.activeCalls.delete(event.callid);
    }
  }

  getActiveCalls(): ActiveCall[] {
    return Array.from(this.activeCalls.values());
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    if (!this.baseUrl || !this.clientId || !this.clientSecret) {
      this.app.log.warn(
        'Yeastar P-Series: credentials not configured - PBX integration disabled. ' +
        'Set YEASTAR_BASE_URL, YEASTAR_CLIENT_ID, YEASTAR_CLIENT_SECRET in .env'
      );
      return;
    }

    this.login().catch((err) =>
      this.app.log.warn({ err }, 'Yeastar P-Series: initial login failed - will retry on first request')
    );

    // Proactively refresh token well before it expires
    this.heartbeatTimer = setInterval(() => {
      this.refreshAccessToken().catch((err) =>
        this.app.log.warn({ err }, 'Yeastar P-Series: token refresh error')
      );
    }, HEARTBEAT_INTERVAL_MS);

    this.app.log.info('Yeastar P-Series: service started');
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  healthStatus() {
    return {
      isConfigured: this.isConfigured(),
      isConnected: !!this.accessToken && Date.now() < this.tokenExpiry,
      activeCalls: this.activeCalls.size,
      tokenExpiresAt: this.accessToken ? new Date(this.tokenExpiry).toISOString() : null,
    };
  }
}
