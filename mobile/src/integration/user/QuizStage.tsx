import { StyleSheet, Text } from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { useMockApi } from '../runtime';
import { QuizCard } from './QuizCard';
import { HtmlLessonQuiz, isHtmlLessonQuiz } from './HtmlLessonQuiz';
import { FillBlankQuiz, hasFillBlankChoices } from './FillBlankQuiz';
import { MatchingQuiz, hasMatchingPairs } from './MatchingQuiz';
import { SingleChoiceQuiz, hasSingleChoiceOptions } from './SingleChoiceQuiz';
import { AudioChoiceQuiz } from './AudioChoiceQuiz';
import { isAudioChoiceQuiz } from './quizAudio';
import { MultiChoiceQuiz, hasMultiChoiceOptions } from './MultiChoiceQuiz';
import { ChosungQuiz, isChosungQuiz } from './ChosungQuiz';
import { SliderQuiz, isSliderQuiz } from './SliderQuiz';

// 학습(StudyScreen)과 복습(ReviewScreen)이 같은 퀴즈 화면을 쓰도록 문항 유형 판별·배치·컴포넌트 선택을 모은다.
export type QuizStageKind = {
  ox: boolean;
  fillBlank: boolean;
  matching: boolean;
  singleChoice: boolean;
  // SINGLE 중 presentation.type === 'AUDIO'(소리 듣고 고르기). singleChoice 와 겹치지 않는다.
  audioChoice: boolean;
  multiChoice: boolean;
  chosung: boolean;
  slider: boolean;
  // 목업 range 퀴즈는 HtmlLessonQuiz 가 그리지만 SLIDER 와 같은 SliderQuizView 를 쓰고
  // 손을 떼면 바로 제출한다(정답 확인 버튼 없음).
  mockRange: boolean;
  // 채점 뒤 다음 이동을 문항 컴포넌트가 직접 처리한다(화면 전체 터치 영역을 깔지 않는다).
  selfAdvancing: boolean;
};

export function quizStageKind(quiz: Quiz | null | undefined): QuizStageKind {
  const ox = quiz?.type === 'OX';
  const fillBlank = !!quiz && hasFillBlankChoices(quiz);
  const matching = !!quiz && hasMatchingPairs(quiz);
  const choiceOptions = !!quiz && hasSingleChoiceOptions(quiz);
  const audioChoice = choiceOptions && isAudioChoiceQuiz(quiz);
  const singleChoice = choiceOptions && !audioChoice;
  const multiChoice = !!quiz && hasMultiChoiceOptions(quiz);
  const chosung = isChosungQuiz(quiz);
  const slider = isSliderQuiz(quiz);
  const mockRange = useMockApi && quiz?.options?.mockHtmlType === 'range';
  return {
    ox,
    fillBlank,
    matching,
    singleChoice,
    audioChoice,
    multiChoice,
    chosung,
    slider,
    mockRange,
    // CHOSUNG 은 해설 시트의 '다음' 버튼과 여백 터치를 문항 컴포넌트가 함께 처리한다.
    selfAdvancing: fillBlank || matching || singleChoice || audioChoice || multiChoice || chosung,
  };
}

export function quizScrollContentStyle(kind: QuizStageKind, scale: number) {
  if (kind.fillBlank) return s.fillBlankScrollContent;
  if (kind.matching) return s.matchingScrollContent;
  if (kind.singleChoice || kind.audioChoice) return s.singleChoiceScrollContent;
  if (kind.multiChoice) return s.multiChoiceScrollContent;
  if (kind.slider || kind.mockRange) return s.sliderScrollContent;
  if (kind.chosung) return s.chosungScrollContent;
  return [
    s.quizScrollContent,
    { paddingHorizontal: 36 * scale },
    kind.ox && s.oxScrollContent,
    kind.ox && { paddingTop: 200 * scale },
  ];
}

export function QuizStageQuiz({
  quiz,
  itemKey,
  scale,
  disabled,
  submit,
  onGraded,
  onAdvance,
}: {
  quiz: Quiz;
  // 학습은 contentId, 복습은 reviewItemId
  itemKey: number;
  scale: number;
  disabled: boolean;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult | undefined) => void;
  // justGraded: 방금 채점한 문항에서 바로 넘어가는지(학습 화면 advance 와 같은 뜻).
  // 이동하지 못하면 예외를 던진다. 문항 컴포넌트가 오류를 보여 주고 다시 누를 수 있게 한다.
  onAdvance: (justGraded: boolean) => Promise<void>;
}) {
  const kind = quizStageKind(quiz);
  const typedKey = `${itemKey}:${quiz.quizId}`;
  if (kind.slider)
    return (
      <SliderQuiz
        key={typedKey}
        quiz={quiz}
        disabled={disabled}
        submit={submit}
        onGraded={onGraded}
        onAdvance={() => onAdvance(true)}
      />
    );
  if (kind.chosung)
    return (
      <ChosungQuiz
        key={typedKey}
        quiz={quiz}
        scale={scale}
        disabled={disabled}
        submit={submit}
        onGraded={onGraded}
        onAdvance={() => onAdvance(true)}
      />
    );
  if (kind.fillBlank)
    return (
      <FillBlankQuiz
        key={itemKey}
        quiz={quiz}
        scale={scale}
        disabled={disabled}
        submitChoiceIndex={useMockApi && quiz.options?.mockHtmlType === 'blank'}
        submit={submit}
        onGraded={onGraded}
        onAdvance={() => onAdvance(false)}
      />
    );
  if (kind.matching)
    return (
      <MatchingQuiz
        key={typedKey}
        quiz={quiz}
        scale={scale}
        disabled={disabled}
        submit={submit}
        onGraded={onGraded}
        onAdvance={() => onAdvance(true)}
      />
    );
  if (kind.singleChoice)
    return (
      <SingleChoiceQuiz
        key={typedKey}
        quiz={quiz}
        scale={scale}
        disabled={disabled}
        submit={submit}
        onGraded={onGraded}
        onAdvance={() => onAdvance(true)}
      />
    );
  if (kind.audioChoice)
    return (
      <AudioChoiceQuiz
        key={typedKey}
        quiz={quiz}
        scale={scale}
        disabled={disabled}
        submit={submit}
        onGraded={onGraded}
        onAdvance={() => onAdvance(true)}
      />
    );
  if (kind.multiChoice)
    return (
      <MultiChoiceQuiz
        key={typedKey}
        quiz={quiz}
        scale={scale}
        disabled={disabled}
        submit={submit}
        onGraded={onGraded}
        onAdvance={() => onAdvance(true)}
      />
    );
  if (useMockApi && isHtmlLessonQuiz(quiz) && quiz.type !== 'OX')
    return (
      <HtmlLessonQuiz
        key={itemKey}
        quiz={quiz}
        disabled={disabled}
        submit={submit}
        onGraded={onGraded}
      />
    );
  // 디자인된 문항 화면만 쓴다. 문항 유형(type·interactionType)으로 고르고, 레슨·데이터 출처로 고르지 않는다.
  // OX 는 QuizCard 의 퀴즈 무대 OX 화면을 쓴다. 디자인된 화면이 없는 형식은 예전 화면으로 대신하지 않고
  // 콘텐츠를 불러오지 못한 것과 같이 진행을 막는다(contract.ts UnsupportedQuizError 와 같은 정책).
  if (!kind.ox) return <Text style={s.unsupported}>지원하지 않는 퀴즈 형식입니다.</Text>;
  return (
    <QuizCard
      key={itemKey}
      quiz={quiz}
      disabled={disabled}
      submit={submit}
      onGraded={onGraded}
      stage
    />
  );
}
const s = StyleSheet.create({
  quizScrollContent: {
    flexGrow: 1,
    gap: 15,
    paddingTop: 30,
    paddingBottom: 16,
    paddingHorizontal: 7,
  },
  fillBlankScrollContent: { flexGrow: 1 },
  matchingScrollContent: { flexGrow: 1, paddingHorizontal: 16 },
  singleChoiceScrollContent: { flexGrow: 1 },
  multiChoiceScrollContent: { flexGrow: 1 },
  sliderScrollContent: { flexGrow: 1 },
  unsupported: {
    color: '#b56060',
    fontFamily: 'PretendardMedium',
    fontSize: 14,
    textAlign: 'center',
  },
  // 해설 시트가 화면 폭 전체를 쓰도록 안쪽 여백은 ChosungQuiz 가 정한다.
  chosungScrollContent: { flexGrow: 1 },
  oxScrollContent: { justifyContent: 'flex-start', paddingBottom: 0 },
});
