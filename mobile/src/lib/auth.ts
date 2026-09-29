import axios from 'axios';
import { api, configureAuthentication } from './api';

type TokenResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  created: boolean;
};

export type User = {
  userId: number;
  nickname: string | null;
  email: string | null;
  providers: string[];
};

type Credentials = { email: string; password: string };
type Operation = 'login' | 'signup' | 'me' | 'refresh' | 'logout';
type AuthState = {
  authenticated: boolean;
  user: User | null;
  operation: Operation | null;
  error: string | null;
};
type Session = { id: number; version: number; tokens: TokenResponse };

const initialState: AuthState = {
  authenticated: false,
  user: null,
  operation: null,
  error: null,
};
let state = initialState;
let session: Session | null = null;
let nextSessionId = 0;
let refreshInFlight: Promise<void> | null = null;
let loggingOut = false;
const listeners = new Set<() => void>();

function publish(update: Partial<AuthState>) {
  state = { ...state, ...update };
  listeners.forEach((listener) => listener());
}

function clearSession(error: string | null = null) {
  session = null;
  publish({ authenticated: false, user: null, error });
}

export function authErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    if (!error.response) return '서버에 연결하지 못했습니다. 네트워크와 API 연결을 확인해 주세요.';
    const message = error.response.data?.message;
    if (typeof message === 'string') return message;
    return `요청이 실패했습니다. (HTTP ${error.response.status})`;
  }
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}

async function refreshSession(forLogout = false): Promise<void> {
  if (loggingOut && !forLogout) throw new Error('로그아웃을 처리하고 있습니다.');
  if (refreshInFlight) return refreshInFlight;
  const current = session;
  if (!current) throw new Error('먼저 로그인해 주세요.');

  const request = (async () => {
    try {
      const { data } = await api.post<TokenResponse>(
        '/api/auth/refresh',
        { refreshToken: current.tokens.refreshToken },
        { skipAuth: true },
      );
      if (session?.id !== current.id) throw new Error('로그인 상태가 변경되었습니다.');
      session = { id: current.id, version: current.version + 1, tokens: data };
      publish({ error: null });
    } catch (error) {
      const message = `로그인 갱신에 실패했습니다. ${authErrorMessage(error)} 다시 로그인해 주세요.`;
      if (session?.id === current.id) clearSession(message);
      throw new Error(message);
    }
  })();
  refreshInFlight = request;
  try {
    await request;
  } finally {
    if (refreshInFlight === request) refreshInFlight = null;
  }
}

async function loadUser() {
  const id = session?.id;
  if (id === undefined) throw new Error('먼저 로그인해 주세요.');
  const { data } = await api.get<User>('/api/auth/me');
  if (session?.id === id) publish({ user: data });
}

async function authenticate(action: 'login' | 'signup', credentials: Credentials) {
  const { data } = await api.post<TokenResponse>(
    `/api/auth/password/${action}`,
    { email: credentials.email.trim(), password: credentials.password },
    { skipAuth: true },
  );
  session = { id: ++nextSessionId, version: 0, tokens: data };
  publish({ authenticated: true, user: null });
  try {
    await loadUser();
  } catch (error) {
    if (session)
      throw new Error(`로그인했지만 내 정보를 불러오지 못했습니다. ${authErrorMessage(error)}`);
    throw error;
  }
}

async function logout() {
  if (!session) throw new Error('먼저 로그인해 주세요.');
  loggingOut = true;
  try {
    // 진행 중인 회전이 끝난 뒤 가장 최근 refresh token을 폐기한다.
    if (refreshInFlight) await refreshInFlight;
    const send = () => {
      if (!session) throw new Error('로그인 상태가 변경되었습니다.');
      return api.post(
        '/api/auth/logout',
        { refreshToken: session.tokens.refreshToken },
        { skipAuthRefresh: true },
      );
    };
    try {
      await send();
    } catch (error) {
      if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error;
      await refreshSession(true);
      await send();
    }
    clearSession();
  } catch (error) {
    throw new Error(`서버 로그아웃을 확인하지 못했습니다. ${authErrorMessage(error)}`);
  } finally {
    loggingOut = false;
  }
}

async function perform(operation: Operation, action: () => Promise<void>) {
  if (state.operation) throw new Error('이전 요청이 끝난 뒤 다시 시도해 주세요.');
  publish({ operation, error: null });
  try {
    await action();
  } catch (error) {
    publish({ error: authErrorMessage(error) });
    throw error;
  } finally {
    publish({ operation: null });
  }
}

export const auth = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => state,
  getServerSnapshot: () => initialState,
  login: (credentials: Credentials) => perform('login', () => authenticate('login', credentials)),
  signup: (credentials: Credentials) =>
    perform('signup', () => authenticate('signup', credentials)),
  me: () => perform('me', loadUser),
  refresh: () => perform('refresh', () => refreshSession()),
  logout: () => perform('logout', logout),
};

configureAuthentication({
  getSession: () =>
    session && {
      id: session.id,
      version: session.version,
      accessToken: session.tokens.accessToken,
    },
  refresh: () => refreshSession(),
  invalidate: () => clearSession('인증을 확인하지 못했습니다. 다시 로그인해 주세요.'),
});
