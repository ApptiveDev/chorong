import 'expo';
import { Platform } from 'react-native';
import { api as existingApi } from '../lib/api';
import { IntegrationClient, integrationBaseURL } from './client';
import { createIntegrationApi } from './api';
import { storage, persistTokens } from './storage';
import { mockApi } from './mockApi';
import { restoreMockState, saveMockState } from './mockStorage';

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
  useMockApi || persistTokens,
  useMockApi
    ? async (id, options) => {
        const result = mockApi(id, options);
        await saveMockState();
        return result;
      }
    : undefined,
);
if (useMockApi) {
  const initialize = client.initialize;
  // 저장된 목업 상태는 앱 시작 때 한 번만 읽는다. 화면마다(useIntegration) 다시 읽으면
  // 진행 중인 복습 문항 연결(activeReview)·다시 하기 진행이 지워져 MOCK_QUIZ_NOT_FOUND 가 난다.
  let restored: Promise<void> | null = null;
  client.initialize = async () => {
    restored ??= restoreMockState();
    await restored;
    return initialize();
  };
}
export const integrationApi = createIntegrationApi(client);
