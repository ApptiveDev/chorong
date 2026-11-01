import axios, { type AxiosInstance } from 'axios';
import { catalog, idempotentApis, type EnabledApiId } from './catalog';
import { ContractError, objectValue, type Schema } from './schema';
import { pageMeta, type Page, type TokenPair, type UserBrief, type Me } from './models';

export interface SessionStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
export type Session = { tokens: TokenPair; user: UserBrief; expiresAt: number };
export type Trace = {
  sequence: number;
  api: EnabledApiId;
  method: string;
  endpoint: string;
  status: number | null;
  durationMs: number;
  success: boolean;
  code?: string;
  requestId?: string;
  request: unknown;
  response: unknown;
  issue?: string;
};
export type RequestOptions = {
  path?: Record<string, string | number>;
  query?: object;
  body?: unknown;
  key?: string;
  noRefresh?: boolean;
  public?: boolean;
};
type State = {
  ready: boolean;
  user: UserBrief | Me | null;
  authenticated: boolean;
  generation: number;
  notice: string | null;
  traces: Trace[];
};
export class IntegrationError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number | null = null,
  ) {
    super(message);
  }
}
const sensitive = /password|token|secret|authorization|credential|deviceuuid|email|verificationid/i;
export function redact(value: unknown, secrets: string[] = []): unknown {
  if (typeof value === 'string') {
    let text = value;
    for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length))
      text = text.split(secret).join('[숨김]');
    return text
      .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [숨김]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일 숨김]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '[UUID 숨김]');
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, secrets));
  if (objectValue(value))
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, sensitive.test(k) ? '[숨김]' : redact(v, secrets)]),
    );
  return value;
}
function secretValues(value: unknown): string[] {
  if (!objectValue(value)) return [];
  return Object.entries(value).flatMap(([k, v]) =>
    (sensitive.test(k) || k === 'code') && typeof v === 'string' ? [v] : secretValues(v),
  );
}
export function integrationBaseURL(root: string) {
  const base = root.trim().replace(/\/+$/, '');
  const url = new URL(base);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('EXPO_PUBLIC_API_URL 형식을 확인하세요.');
  return base.endsWith('/api/v1') ? base : `${base}/api/v1`;
}

export class IntegrationClient {
  readonly http: AxiosInstance;
  private state: State = {
    ready: false,
    authenticated: false,
    user: null,
    generation: 0,
    notice: null,
    traces: [],
  };
  private listeners = new Set<() => void>();
  private session: Session | null = null;
  private epoch = 0;
  private version = 0;
  private sequence = 0;
  private refreshFlight: Promise<void> | null = null;
  private initializeFlight: Promise<void> | null = null;
  private storageQueue: Promise<void> = Promise.resolve();
  private authBusy = false;
  private device: string | null = null;
  private deviceFlight: Promise<string> | null = null;
  private keys = new Map<string, string>();
  constructor(
    readonly baseURL: string,
    private storage: SessionStorage,
    readonly uuid: () => string,
    private persistTokens: boolean,
  ) {
    if (!baseURL) this.state.notice = 'EXPO_PUBLIC_API_URL 형식을 확인하고 앱을 다시 시작하세요.';
    this.http = axios.create({
      baseURL,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private publish(update: Partial<State>) {
    this.state = { ...this.state, ...update };
    this.listeners.forEach((f) => f());
  }
  private storageKey = () =>
    `chorong.v1.session.${encodeURIComponent(this.baseURL).replace(/%/g, '_')}`;
  private persist() {
    if (!this.persistTokens) return Promise.resolve();
    const value = this.session ? JSON.stringify(this.session) : null;
    this.storageQueue = this.storageQueue
      .catch(() => {})
      .then(() =>
        value ? this.storage.set(this.storageKey(), value) : this.storage.remove(this.storageKey()),
      );
    return this.storageQueue;
  }
  async clear(notice: string | null = null, preserveTraces = false) {
    this.epoch++;
    this.session = null;
    this.keys.clear();
    this.publish({
      authenticated: false,
      user: null,
      generation: this.epoch,
      notice,
      traces: preserveTraces ? this.state.traces : [],
    });
    try {
      await this.persist();
    } catch {
      this.publish({ notice: '저장된 인증 삭제 실패. 보안 저장소를 확인하세요.' });
    }
  }
  async deviceUuid(): Promise<string> {
    if (this.device) return this.device;
    if (this.deviceFlight) return this.deviceFlight;
    this.deviceFlight = (async () => {
      const key = 'chorong.v1.device';
      const stored = await this.storage.get(key);
      if (
        stored &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)
      )
        throw new Error('저장된 디바이스 UUID 형식 오류');
      const value = stored ?? this.uuid();
      if (!stored) await this.storage.set(key, value);
      this.device = value;
      return value;
    })();
    try {
      return await this.deviceFlight;
    } finally {
      this.deviceFlight = null;
    }
  }
  initialize = () => {
    if (this.initializeFlight) return this.initializeFlight;
    this.initializeFlight = (async () => {
      try {
        if (this.persistTokens) {
          const raw = await this.storage.get(this.storageKey());
          if (raw) {
            const { tokenPair, userBrief } = await import('./models');
            const saved: unknown = JSON.parse(raw);
            if (!objectValue(saved) || typeof saved.expiresAt !== 'number')
              throw new ContractError('저장된 세션');
            this.session = {
              tokens: tokenPair(saved.tokens),
              user: userBrief(saved.user),
              expiresAt: saved.expiresAt,
            };
            this.epoch++;
            this.publish({ authenticated: true, user: this.session.user, generation: this.epoch });
            // 재시작 후에는 서버에서 세션과 회원 상태를 다시 확인한다.
            await this.refresh();
            const { me } = await import('./models');
            const user = await this.request('API-201', me);
            this.setUser(user);
          }
        }
      } catch {
        await this.clear('인증 복원 실패. 다시 로그인하세요.');
      } finally {
        this.publish({ ready: true });
      }
    })();
    return this.initializeFlight;
  };
  setUser(user: Me) {
    if (this.session) {
      this.session.user = user;
      this.publish({ user });
    }
  }
  async authenticate(action: () => Promise<TokenPair & { user: UserBrief }>) {
    if (this.authBusy) throw new Error('인증 요청 처리 중입니다.');
    this.authBusy = true;
    const epoch = this.epoch;
    try {
      if (this.refreshFlight) await this.refreshFlight;
      const data = await action();
      if (this.epoch !== epoch) throw new Error('인증 상태가 변경되었습니다.');
      this.epoch++;
      this.version = 0;
      this.session = {
        tokens: data,
        user: data.user,
        expiresAt: Date.now() + data.expiresIn * 1000,
      };
      this.publish({
        authenticated: true,
        user: data.user,
        generation: this.epoch,
        notice: null,
        traces: this.state.traces
          .filter(
            (trace) =>
              trace.success && ['API-101', 'API-103', 'API-104', 'API-105'].includes(trace.api),
          )
          .slice(0, 1),
      });
      try {
        await this.persist();
      } catch {
        await this.clear('토큰 저장 실패. 다시 로그인하세요.');
        throw new Error('토큰 저장 실패');
      }
    } finally {
      this.authBusy = false;
    }
  }
  refresh = async (): Promise<void> => {
    if (this.refreshFlight) return this.refreshFlight;
    const current = this.session,
      epoch = this.epoch;
    if (!current) throw new Error('먼저 로그인하세요.');
    const request = (async () => {
      try {
        const { tokenPair } = await import('./models');
        const tokens = await this.request('API-106', tokenPair, {
          body: { refreshToken: current.tokens.refreshToken, deviceUuid: await this.deviceUuid() },
          noRefresh: true,
          public: true,
        });
        if (epoch !== this.epoch) throw new Error('인증 상태가 변경되었습니다.');
        this.session = { ...current, tokens, expiresAt: Date.now() + tokens.expiresIn * 1000 };
        this.version++;
        await this.persist();
      } catch (error) {
        if (epoch === this.epoch) await this.clear('토큰 갱신 실패. 다시 로그인하세요.', true);
        throw error;
      }
    })();
    this.refreshFlight = request;
    try {
      await request;
    } finally {
      if (this.refreshFlight === request) this.refreshFlight = null;
    }
  };
  async endSession(action: () => Promise<unknown>) {
    if (this.authBusy) throw new Error('인증 요청 처리 중입니다.');
    this.authBusy = true;
    try {
      if (this.refreshFlight) await this.refreshFlight;
      await action();
      const completedRequest = this.state.traces[0];
      await this.clear();
      if (completedRequest) this.record(completedRequest);
    } finally {
      this.authBusy = false;
    }
  }
  idempotencyKey(scope: string) {
    let key = this.keys.get(scope);
    if (!key) {
      key = this.uuid();
      this.keys.set(scope, key);
    }
    return key;
  }
  private record(trace: Trace) {
    this.publish({ traces: [trace, ...this.state.traces].slice(0, 30) });
  }
  clearTraces = () => this.publish({ traces: [] });
  async request<T>(
    id: EnabledApiId,
    schema: Schema<T> | null,
    options: RequestOptions = {},
    paged = false,
  ): Promise<T> {
    if (!this.baseURL)
      throw new IntegrationError('EXPO_PUBLIC_API_URL 형식을 확인하세요.', 'CONFIGURATION_ERROR');
    const [method, template, , access] = catalog[id];
    if ((access as string) === 'deferred') throw new Error('명세 변경 예정으로 보류한 API입니다.');
    if (access === 'member' && this.state.user?.status !== 'ACTIVE')
      throw new IntegrationError('회원 전용 기능입니다.', 'MEMBER_ONLY');
    if ((access === 'guest' || access === 'member') && !this.session)
      throw new IntegrationError('먼저 로그인하세요.', 'UNAUTHORIZED');
    if (idempotentApis.includes(id) && !options.key)
      throw new Error('Idempotency-Key가 필요합니다.');
    const endpoint = template.replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = options.path?.[key];
      if (value === undefined || value === '') throw new Error(`${key}를 입력하세요.`);
      return encodeURIComponent(value);
    });
    const useAuth = access !== 'public' && !options.public;
    const epoch = this.epoch;
    if (
      useAuth &&
      this.session &&
      !options.noRefresh &&
      this.session.expiresAt <= Date.now() + 10000
    )
      await this.refresh();
    const send = async (retried: boolean): Promise<T> => {
      if (epoch !== this.epoch) throw new Error('인증 상태가 변경되었습니다.');
      const version = this.version;
      const started = Date.now(),
        sequence = ++this.sequence;
      const secrets = [
        ...secretValues(options.body),
        this.session?.tokens.accessToken ?? '',
        this.session?.tokens.refreshToken ?? '',
        this.device ?? '',
      ];
      const hideAuth = id.startsWith('API-10');
      const trace: Trace = {
        sequence,
        api: id,
        method,
        endpoint: template.includes('deviceUuid') ? template : endpoint,
        status: null,
        durationMs: 0,
        success: false,
        request: hideAuth
          ? '[인증 본문 숨김]'
          : redact({ query: options.query, body: options.body }, secrets),
        response: null,
      };
      try {
        const response = await this.http.request({
          method,
          url: endpoint,
          params: options.query,
          data: options.body,
          headers: {
            ...(useAuth && this.session
              ? { Authorization: `Bearer ${this.session.tokens.accessToken}` }
              : {}),
            ...(options.key ? { 'Idempotency-Key': options.key } : {}),
          },
        });
        if (epoch !== this.epoch) throw new Error('인증 상태가 변경되었습니다.');
        trace.status = response.status;
        trace.requestId = response.headers['x-request-id'];
        trace.response = hideAuth ? '[인증 본문 숨김]' : redact(response.data, secrets);
        let data: T;
        if (!schema) {
          if (response.status !== 204) throw new ContractError('HTTP 204');
          data = undefined as T;
        } else {
          if (!objectValue(response.data) || !('data' in response.data))
            throw new ContractError('$.data');
          const result = schema(response.data.data, '$.data');
          if (paged) {
            pageMeta(response.data.meta, '$.meta');
            data = response.data as T;
          } else data = result;
        }
        trace.success = true;
        return data;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const body: unknown = error.response?.data;
          const server = objectValue(body) && objectValue(body.error) ? body.error : null;
          trace.status = error.response?.status ?? null;
          trace.requestId = error.response?.headers['x-request-id'];
          trace.code =
            typeof server?.code === 'string' ? server.code : (error.code ?? 'NETWORK_ERROR');
          trace.response = hideAuth ? '[인증 본문 숨김]' : redact(body, secrets);
          if (
            trace.status === 401 &&
            useAuth &&
            (!['API-102', 'API-103', 'API-105', 'API-108'].includes(id) ||
              server?.code === 'AUTH_TOKEN_EXPIRED') &&
            this.session &&
            !options.noRefresh &&
            epoch === this.epoch
          ) {
            if (!retried) {
              if (version === this.version) await this.refresh();
              return await send(true);
            }
            await this.clear('인증 만료. 다시 로그인하세요.');
          }
          const message =
            typeof server?.message === 'string'
              ? server.message
              : trace.status
                ? '서버 오류 응답 형식이 명세와 다릅니다.'
                : '연결 실패 또는 시간 초과. API 주소와 네트워크를 확인하세요.';
          trace.issue = String(redact(message, secrets));
          throw new IntegrationError(
            `${trace.code}: ${trace.issue}${trace.status ? ` (HTTP ${trace.status})` : ''}`,
            trace.code,
            trace.status,
          );
        }
        trace.issue = error instanceof Error ? String(redact(error.message, secrets)) : '요청 실패';
        trace.code = error instanceof ContractError ? 'CONTRACT_MISMATCH' : 'CLIENT_ERROR';
        throw error;
      } finally {
        trace.durationMs = Date.now() - started;
        if (epoch === this.epoch) this.record(trace);
      }
    };
    return send(false);
  }
  page<T>(id: EnabledApiId, schema: Schema<T>, options?: RequestOptions): Promise<Page<T>> {
    return this.request(id, schema, options, true) as unknown as Promise<Page<T>>;
  }
}
