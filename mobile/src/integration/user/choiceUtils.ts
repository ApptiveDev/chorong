import type { AnswerResult, Quiz } from '../models';

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
