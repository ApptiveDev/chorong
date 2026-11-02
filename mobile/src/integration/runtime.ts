import 'expo';
import { Platform } from 'react-native';
import { api as existingApi } from '../lib/api';
import { IntegrationClient, integrationBaseURL } from './client';
import { createIntegrationApi } from './api';
import { storage, persistTokens } from './storage';
import { mockApi } from './mockApi';

export const useMockApi = process.env.EXPO_PUBLIC_USE_MOCK === 'true';
let mockUuidSequence = 0;

export function randomUuid() {
  if (useMockApi)
    return `00000000-0000-4000-8000-${(++mockUuidSequence).toString(16).padStart(12, '0')}`;
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
export const client = new IntegrationClient(
  useMockApi ? 'https://mock.chorong.invalid/api/v1' : baseURL,
  storage,
  randomUuid,
  persistTokens,
  useMockApi ? mockApi : undefined,
);
export const integrationApi = createIntegrationApi(client);
