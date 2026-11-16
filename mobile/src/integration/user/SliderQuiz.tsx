// SLIDER(0~1) 퀴즈(API v2). 화면은 SliderQuizView(Figma 300:672)를 쓴다.
// 드래그 중에는 위치만 바꾸고, 손을 뗄 때 한 번 제출한다. 채점·근접도·정답 위치는 서버 응답만 쓴다.
// Figma 의 '정답 확인' 버튼은 손을 떼면 자동 제출하는 동작과 겹쳐 넣지 않는다.
// 채점 뒤 근접도·해설은 하단 시트(QuizFeedbackSheet)로 보인다.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform } from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { QuizFeedbackSheet } from './QuizFeedbackSheet';
import { gradedAnnouncement, isUngraded } from './quizGrading';
import {
  closenessText,
  createReleaseSubmitter,
  serverAnswerPosition,
  tickPositions,
} from './sliderQuizState';
import { DEFAULT_SLIDER_HINT, SliderQuizView } from './SliderQuizView';

type Phase = 'UNANSWERED' | 'GRADING' | 'GRADED' | 'TRANSITIONING';

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
  onAdvance: () => Promise<void> | void;
}) {
  const ticks = tickPositions(quiz.options?.ticks as string[]);
  const hint = typeof quiz.options?.hint === 'string' ? quiz.options.hint : DEFAULT_SLIDER_HINT;
  const [position, setPosition] = useState(0.5);
  const [phase, setPhase] = useState<Phase>('UNANSWERED');
  const phaseRef = useRef<Phase>('UNANSWERED');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState('');
  const latest = useRef(0.5);
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const active = useRef(true);
  const submitter = useRef(
    createReleaseSubmitter((value: number) => submit({ position: value })),
  ).current;
  const locked = disabled || phase !== 'UNANSWERED';

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      sheetProgress.stopAnimation();
    };
  }, [sheetProgress]);

  const moveTo = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };
  const move = (next: number) => {
    if (disabled || phaseRef.current !== 'UNANSWERED') return;
    latest.current = next;
    setPosition(next);
  };
  const release = async (next: number) => {
    if (disabled || phaseRef.current !== 'UNANSWERED') return;
    move(next);
    moveTo('GRADING');
    setError('');
    try {
      const graded = await submitter.release(latest.current);
      if (!active.current) return;
      if (!graded) {
        moveTo('UNANSWERED');
        return;
      }
      setResult(graded);
      onGraded(graded);
      moveTo('GRADED');
      AccessibilityInfo.announceForAccessibility(gradedAnnouncement(quiz, graded));
      sheetProgress.setValue(0);
      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
      if (!active.current) return;
      if (reduceMotion) sheetProgress.setValue(1);
      else
        Animated.timing(sheetProgress, {
          toValue: 1,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }).start();
    } catch (cause) {
      if (!active.current) return;
      // 손잡이는 그대로 두고 다시 놓으면 재제출한다(createReleaseSubmitter 가 idle 로 돌린다).
      moveTo('UNANSWERED');
      setError(cause instanceof Error ? cause.message : '답안을 확인하지 못했습니다.');
    }
  };
  const advance = () => {
    if (phaseRef.current !== 'GRADED') return;
    moveTo('TRANSITIONING');
    void Promise.resolve()
      .then(onAdvance)
      .catch((cause) => {
        if (!active.current) return;
        setError(cause instanceof Error ? cause.message : '다음 콘텐츠로 이동하지 못했습니다.');
        moveTo('GRADED');
      });
  };

  const ungraded = isUngraded(quiz, result);
  // 손잡이 아래 문구는 가장 가까운 눈금 라벨을 보여 준다. 표시용이며 제출 값은 스냅하지 않는다.
  const nearestLabel = ticks[Math.round(position * (ticks.length - 1))]?.label ?? '';
  // 근접도는 채점 결과라 채점하지 않는 문항에서는 보이지 않는다. 해설 시트 첫 줄에 붙인다.
  const closeness = result && !ungraded ? closenessText(result) : null;
  const sheetResult =
    result && closeness
      ? { ...result, explanation: [closeness, result.explanation].filter(Boolean).join('\n') }
      : result;

  return (
    <SliderQuizView
      question={quiz.question}
      hint={hint}
      ticks={ticks}
      position={position}
      valueLabel={nearestLabel}
      answerAt={result && !ungraded ? serverAnswerPosition(result) : null}
      locked={locked}
      onMove={move}
      onRelease={(next) => void release(next)}
      canAdvance={phase === 'GRADED'}
      onAdvance={advance}
      error={error}
      sheet={
        sheetResult ? (
          <QuizFeedbackSheet
            result={sheetResult}
            progress={sheetProgress}
            nextDisabled={phase !== 'GRADED'}
            onNext={advance}
            ungraded={ungraded}
          />
        ) : null
      }
    />
  );
}
