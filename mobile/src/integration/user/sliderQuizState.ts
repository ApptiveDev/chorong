// SLIDER 퀴즈의 화면 밖 로직. 위치는 0(왼쪽 끝)~1(오른쪽 끝) 실수이며 눈금에 스냅하지 않는다.
// 정답 위치·허용 오차는 서버만 안다. 앱은 서버 응답(isCorrect·closeness·correctAnswer)만 표시한다.
import type { AnswerResult } from '../models';

export const clampPosition = (position: number) =>
  Number.isFinite(position) ? Math.min(1, Math.max(0, position)) : 0;

export const positionAt = (x: number, width: number) => (width > 0 ? clampPosition(x / width) : 0);

// N 개 눈금의 i 번째 위치는 i / (N - 1). 라벨은 서버 문자열 그대로 쓴다.
export const tickPositions = (ticks: string[]) =>
  ticks.map((label, index) => ({ label, position: index / (ticks.length - 1) }));

export const closenessText = (result: AnswerResult) =>
  typeof result.closeness === 'number' ? `정답에 ${result.closeness}% 근접했어요` : null;

export const serverAnswerPosition = (result: AnswerResult) => {
  const value = result.correctAnswer.answer;
  return typeof value === 'number' && value >= 0 && value <= 1 ? value : null;
};

// 손을 뗄 때 한 번만 제출한다. 응답 대기 중·채점 후 다시 놓아도 보내지 않고,
// 실패하면 다시 놓아 재시도할 수 있게 idle 로 돌린다.
export function createReleaseSubmitter<T>(submit: (position: number) => Promise<T>) {
  let state: 'idle' | 'submitting' | 'graded' = 'idle';
  return {
    get state() {
      return state;
    },
    async release(position: number): Promise<T | null> {
      if (state !== 'idle') return null;
      state = 'submitting';
      try {
        const result = await submit(clampPosition(position));
        state = 'graded';
        return result;
      } catch (error) {
        state = 'idle';
        throw error;
      }
    },
  };
}
