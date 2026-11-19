import type { SessionStorage } from './client';

// 웹은 토큰과 디바이스 식별자를 localStorage 에 둔다. 새로고침·브라우저 재시작 후에도 로그인이 유지된다.
export const storage: SessionStorage = {
  async get(key) {
    return localStorage.getItem(key);
  },
  async set(key, value) {
    localStorage.setItem(key, value);
  },
  async remove(key) {
    localStorage.removeItem(key);
  },
  // 여러 탭이 같은 리프레시 토큰으로 동시에 갱신하지 않게 한 탭씩 실행한다.
  // Web Locks 가 없는 브라우저는 그대로 실행한다.
  lock(name, task) {
    const locks = globalThis.navigator?.locks;
    return locks ? locks.request(name, task) : task();
  },
  // 다른 탭의 로그인·로그아웃·토큰 갱신을 바로 반영한다. key 가 null 이면 저장소 전체 삭제다.
  watch(key, listener) {
    if (typeof window === 'undefined') return () => {};
    const handle = (event: StorageEvent) => {
      if (event.key === key || event.key === null) listener();
    };
    window.addEventListener('storage', handle);
    return () => window.removeEventListener('storage', handle);
  },
};
export const persistTokens = true;
export const storageNotice =
  '웹 토큰과 UUID는 브라우저 저장소에 보관합니다. 새로고침 후 토큰 갱신과 내 정보 조회로 세션을 확인합니다.';
