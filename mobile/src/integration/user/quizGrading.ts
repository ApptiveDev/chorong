import type { AnswerResult, Quiz } from '../models';

// 채점하지 않는 문항인지. 학습 레슨의 첫 퀴즈(흥미를 끄는 도입 질문)가 해당한다(0.4.1).
// 결과는 정답·오답 표시와 색 변화 없이 해설(있으면)과 [다음]만 보여 준다.
// 서버가 AnswerResult.graded·isCorrect=null 을 보내기 전에도 문제의 graded=false 로 판단한다.
export function isUngraded(
  quiz: Pick<Quiz, 'graded'> | null | undefined,
  result?: AnswerResult | null,
): boolean {
  return quiz?.graded === false || result?.graded === false || result?.isCorrect === null;
}

// 정답·오답 색과 문구를 보여 줄 결과인지. 채점하지 않는 문항이면 정답이어도 false 다.
export const showsCorrect = (quiz: Pick<Quiz, 'graded'>, result: AnswerResult | null) =>
  !!result && !isUngraded(quiz, result) && result.isCorrect === true;
export const showsWrong = (quiz: Pick<Quiz, 'graded'>, result: AnswerResult | null) =>
  !!result && !isUngraded(quiz, result) && result.isCorrect === false;

// 스크린리더 안내. 채점하지 않는 문항은 결과 대신 '답 제출'을 알린다.
export const gradedAnnouncement = (quiz: Pick<Quiz, 'graded'>, result: AnswerResult) =>
  isUngraded(quiz, result) ? '답 제출' : result.isCorrect ? '정답' : '오답';
