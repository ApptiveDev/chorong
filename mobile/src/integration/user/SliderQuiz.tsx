// SLIDER(0~1) 퀴즈(API v2). 화면은 SliderQuizView(Figma 300:672)를 쓴다.
// 드래그 중에는 위치만 바꾸고, 손을 뗄 때 한 번 제출한다. 채점·근접도·정답 위치는 서버 응답만 쓴다.
// Figma 의 '정답 확인' 버튼은 손을 떼면 자동 제출하는 동작과 겹쳐 넣지 않는다.
import { useRef, useState } from 'react';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import {
  closenessText,
  createReleaseSubmitter,
  serverAnswerPosition,
  tickPositions,
} from './sliderQuizState';
import { DEFAULT_SLIDER_HINT, SliderFeedback, SliderQuizView } from './SliderQuizView';

export function isSliderQuiz(quiz: Quiz | null | undefined): boolean {
  const ticks = quiz?.options?.ticks;
  return (
    quiz?.type === 'SLIDER' &&
    Array.isArray(ticks) &&
    ticks.length >= 2 &&
    ticks.every((tick) => typeof tick === 'string')
  );
}

export function SliderQuiz({
  quiz,
  disabled,
  submit,
  onGraded,
  onAdvance,
}: {
  quiz: Quiz;
  disabled: boolean;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult) => void;
  // 없으면 부모 화면이 다음 이동을 처리한다(복습 화면의 전체 터치 영역).
  onAdvance?: () => Promise<void> | void;
}) {
  const ticks = tickPositions(quiz.options?.ticks as string[]);
  const hint = typeof quiz.options?.hint === 'string' ? quiz.options.hint : DEFAULT_SLIDER_HINT;
  const [position, setPosition] = useState(0.5);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const latest = useRef(0.5);
  const advancing = useRef(false);
  const submitter = useRef(
    createReleaseSubmitter((value: number) => submit({ position: value })),
  ).current;
  const locked = disabled || !!result || busy;

  const move = (next: number) => {
    if (locked) return;
    latest.current = next;
    setPosition(next);
  };
  const release = async (next: number) => {
    if (locked) return;
    move(next);
    setBusy(true);
    setError('');
    try {
      const graded = await submitter.release(latest.current);
      if (graded) {
        setResult(graded);
        onGraded(graded);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '답안을 확인하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };
  const advance = () => {
    if (!result || !onAdvance || advancing.current) return;
    advancing.current = true;
    void Promise.resolve()
      .then(onAdvance)
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : '다음 콘텐츠로 이동하지 못했습니다.');
      })
      .finally(() => {
        advancing.current = false;
      });
  };

  const canAdvance = !!result && !!onAdvance;
  // 손잡이 아래 문구는 가장 가까운 눈금 라벨을 보여 준다. 표시용이며 제출 값은 스냅하지 않는다.
  const nearestLabel = ticks[Math.round(position * (ticks.length - 1))]?.label ?? '';

  return (
    <SliderQuizView
      question={quiz.question}
      hint={hint}
      ticks={ticks}
      position={position}
      valueLabel={nearestLabel}
      answerAt={result ? serverAnswerPosition(result) : null}
      locked={locked}
      onMove={move}
      onRelease={(next) => void release(next)}
      canAdvance={canAdvance}
      onAdvance={advance}
      error={error}
    >
      {result ? (
        <SliderFeedback
          correct={result.isCorrect}
          title={result.isCorrect ? '맞았어요!' : '함께 확인해 볼까요?'}
          lines={[closenessText(result), result.explanation]}
          canAdvance={canAdvance}
          onAdvance={advance}
        />
      ) : null}
    </SliderQuizView>
  );
}
