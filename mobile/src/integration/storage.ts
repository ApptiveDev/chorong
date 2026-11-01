import type { SessionStorage } from './client';
import * as SecureStore from 'expo-secure-store';

export const storage: SessionStorage = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  remove: (key) => SecureStore.deleteItemAsync(key),
};
export const persistTokens = true;
export const storageNotice =
  '네이티브 토큰과 UUID는 SecureStore에 보관합니다. 앱 재시작 시 토큰 갱신과 내 정보 조회로 세션을 확인합니다.';
