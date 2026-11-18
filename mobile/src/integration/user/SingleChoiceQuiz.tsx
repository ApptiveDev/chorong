import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { PresentedChoiceQuiz } from './PresentedChoiceQuiz';

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
