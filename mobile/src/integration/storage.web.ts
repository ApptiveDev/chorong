import type { SessionStorage } from './client';

// 웹에는 토큰을 기록하지 않는다. 디바이스 식별자만 브라우저 저장소에 유지한다.
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
};
export const persistTokens = false;
export const storageNotice =
  '웹 토큰은 메모리에만 보관합니다. 새로고침 후 다시 로그인하세요. UUID는 브라우저에 유지됩니다.';
