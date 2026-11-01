import 'expo';
import { Platform } from 'react-native';
import { api as existingApi } from '../lib/api';
import { IntegrationClient, integrationBaseURL } from './client';
import { createIntegrationApi } from './api';
import { storage, persistTokens } from './storage';

export function randomUuid() {
  if (Platform.OS === 'web') {
    if (!globalThis.crypto?.randomUUID)
      throw new Error('UUID 생성에는 HTTPS 또는 localhost 환경이 필요합니다.');
    return globalThis.crypto.randomUUID();
  }
  return globalThis.expo.uuidv4();
}
let baseURL = '';
try {
  baseURL = integrationBaseURL(existingApi.defaults.baseURL!);
} catch {
  /* 요청을 차단하고 화면에 설정 오류를 표시한다. */
}
export const client = new IntegrationClient(baseURL, storage, randomUuid, persistTokens);
export const integrationApi = createIntegrationApi(client);
