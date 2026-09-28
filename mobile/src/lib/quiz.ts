import axios from 'axios';
import { api } from './api';
import type { QuizPreviewResult, QuizResponse, QuizSummary } from '../types/quiz';

const previewApi = axios.create({
  baseURL: api.defaults.baseURL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

export function parseLessonId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value.trim())) return null;
  const id = Number(value.trim());
  return Number.isSafeInteger(id) ? id : null;
}

export const quizApi = {
  list: (lessonId: number, signal?: AbortSignal) =>
    previewApi
      .get<QuizSummary[]>('/api/dev/quizzes', { params: { lessonId }, signal })
      .then(({ data }) => {
        if (
          !Array.isArray(data) ||
          data.some(
            (q) =>
              !q ||
              !Number.isSafeInteger(q.quizId) ||
              q.quizId <= 0 ||
              !Number.isSafeInteger(q.lessonId) ||
              q.lessonId <= 0 ||
              typeof q.question !== 'string' ||
              typeof q.instruction !== 'string' ||
              typeof q.difficulty !== 'string' ||
              typeof q.interactionType !== 'string',
          )
        ) {
          throw new Error('퀴즈 목록 형식을 확인할 수 없습니다.');
        }
        return data;
      }),
  check: (quizId: number, response: QuizResponse) =>
    previewApi
      .post<QuizPreviewResult>(`/api/dev/quizzes/${quizId}/check`, { response })
      .then((r) => r.data),
};

export function quizErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response)
      return '서버에 연결하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
    if (error.response.data?.code === 'QUIZ_PREVIEW_DISABLED')
      return '이 환경에서는 퀴즈 테스트를 사용할 수 없습니다.';
    switch (error.response.status) {
      case 400:
        return '답안 또는 학습 ID 형식이 올바르지 않습니다. 입력을 확인해 주세요.';
      case 401:
        return '퀴즈 테스트 API에 접근할 수 없습니다. 서버 설정을 확인해 주세요.';
      case 404:
        return '문제가 삭제되었거나 존재하지 않습니다. 목록을 다시 조회해 주세요.';
      case 409:
        return '저장된 퀴즈 데이터에 오류가 있습니다. 관리자에게 확인해 주세요.';
      default:
        return `서버 요청에 실패했습니다. (HTTP ${error.response.status})`;
    }
  }
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}

export function quizImageUri(value: string): string | null {
  try {
    const url = new URL(value, api.defaults.baseURL);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
