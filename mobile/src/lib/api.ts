import axios from 'axios';

declare module 'axios' {
  interface AxiosRequestConfig {
    skipAuth?: boolean;
    skipAuthRefresh?: boolean;
    authSessionId?: number;
    authTokenVersion?: number;
    authRetried?: boolean;
  }
}

type ApiSession = { id: number; version: number; accessToken: string };
type Authentication = {
  getSession: () => ApiSession | null;
  refresh: () => Promise<void>;
  invalidate: () => void;
};

let authentication: Authentication | null = null;

export function configureAuthentication(value: Authentication) {
  authentication = value;
}

function sessionChanged() {
  return new Error('로그인 상태가 변경되었습니다. 다시 시도해 주세요.');
}

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

export const api = axios.create({
  baseURL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// 모듈을 불러올 때 한 번 등록한다. 화면 렌더링과 함께 재등록하지 않는다.
api.interceptors.request.use((config) => {
  if (config.skipAuth) {
    config.headers.delete('Authorization');
    return config;
  }
  const session = authentication?.getSession();
  if (config.authSessionId !== undefined && config.authSessionId !== session?.id) {
    throw sessionChanged();
  }
  if (session) {
    config.authSessionId = session.id;
    config.authTokenVersion = session.version;
    config.headers.set('Authorization', `Bearer ${session.accessToken}`);
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const id = response.config.authSessionId;
    if (id !== undefined && id !== authentication?.getSession()?.id) throw sessionChanged();
    return response;
  },
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error;
    const config = error.config;
    const session = authentication?.getSession();
    if (
      error.response?.status !== 401 ||
      !config ||
      config.skipAuth ||
      config.skipAuthRefresh ||
      !session ||
      config.authSessionId !== session.id ||
      !authentication
    ) {
      throw error;
    }
    if (config.authRetried) {
      if (config.authTokenVersion === session.version) authentication.invalidate();
      throw error;
    }
    config.authRetried = true;
    // 같은 초에 발급된 JWT도 같을 수 있으므로 문자열 대신 회전 횟수를 비교한다.
    if (config.authTokenVersion === session.version) await authentication.refresh();
    if (authentication.getSession()?.id !== session.id) throw sessionChanged();
    return api.request(config);
  },
);

export type Note = {
  id: number;
  title: string;
  body: string | null;
  createdAt: string | null;
};

export const notesApi = {
  list: () => api.get<Note[]>('/api/notes', { skipAuth: true }).then((r) => r.data),
  create: (title: string, body?: string) =>
    api.post<Note>('/api/notes', { title, body }, { skipAuth: true }).then((r) => r.data),
  remove: (id: number) => api.delete(`/api/notes/${id}`, { skipAuth: true }),
};

export const healthApi = {
  check: () =>
    api.get<{ status: string }>('/api/health', { skipAuth: true }).then((r) => r.data.status),
};
