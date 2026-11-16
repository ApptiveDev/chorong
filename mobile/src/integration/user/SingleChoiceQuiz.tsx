import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { PresentedChoiceQuiz } from './PresentedChoiceQuiz';

export type Choice = { index: number; label: string };

// 소리 듣고 고르기(AudioChoiceQuiz)도 같은 SINGLE 보기·정답 해석을 쓴다.
export function choicesFor(quiz: Quiz): Choice[] | null {
  if (quiz.type !== 'MULTIPLE_CHOICE' || quiz.options?.mockHtmlType === 'multi') return null;
  const raw = quiz.options?.choices;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const choices: Choice[] = [];
  for (const item of raw) {
    if (
      !item ||
      typeof item !== 'object' ||
      !Number.isSafeInteger(item.index) ||
      typeof item.label !== 'string'
    )
      return null;
    choices.push({ index: item.index, label: item.label });
  }
  return new Set(choices.map((choice) => choice.index)).size === choices.length ? choices : null;
}

export function hasSingleChoiceOptions(quiz: Quiz): boolean {
  return choicesFor(quiz) !== null;
}

export function correctChoiceIndex(result: AnswerResult, quiz: Quiz): number | null {
  const raw = result.correctAnswer.index ?? result.correctAnswer.answer ?? quiz.options?.answer;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return Number.isSafeInteger(value) ? (value as number) : null;
}

// 하나 고르기(SINGLE, 표시 방식 없음). 표시 방식 화면과 같은 틀(PresentedChoiceQuiz)을 미디어 없이 쓴다.
// 해설은 하단 시트로 보인다. 진도 바 아래 200, 질문과 보기 사이 40 은 기존 Figma 값이다.
export function SingleChoiceQuiz(props: {
  quiz: Quiz;
  scale: number;
  disabled: boolean;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult) => void;
  onAdvance: () => Promise<void> | void;
}) {
  return <PresentedChoiceQuiz {...props} topSpace={200} gap={40} />;
}
