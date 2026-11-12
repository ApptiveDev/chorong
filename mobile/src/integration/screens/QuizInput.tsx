import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { QuizCard } from '../user/QuizCard';

export function QuizInput({
  quiz,
  submit,
  onAnswered,
  disabled = false,
}: {
  quiz: Quiz;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onAnswered?: (result: AnswerResult) => void;
  disabled?: boolean;
}) {
  return (
    <QuizCard
      quiz={quiz}
      submit={submit}
      onGraded={(result) => onAnswered?.(result)}
      disabled={disabled}
    />
  );
}
