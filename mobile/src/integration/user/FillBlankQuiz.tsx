// BLANK(빈칸 채우기) 퀴즈. 보기를 고르면 바로 제출하고, 채점 뒤 해설은 하단 시트(QuizFeedbackSheet)로 보인다.
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { QuizFeedbackSheet } from './QuizFeedbackSheet';
import { QUIZ_FEEDBACK_COLORS } from './quizFeedbackColors';
import { gradedAnnouncement, isUngraded } from './quizGrading';
import { AnimatedReveal } from './AnimatedReveal';

type Choice = { index: number; label: string };
type Phase = 'UNANSWERED' | 'GRADING' | 'GRADED' | 'TRANSITIONING';

function choicesFor(quiz: Quiz): Choice[] {
  const raw = quiz.options?.choices;
  if (!Array.isArray(raw)) return [];
  if (
    !raw.every(
      (choice): choice is Choice =>
        typeof choice === 'object' &&
        choice !== null &&
        Number.isSafeInteger(choice.index) &&
        typeof choice.label === 'string',
    )
  )
    return [];
  return raw;
}

export function hasFillBlankChoices(quiz: Quiz): boolean {
  return (
    quiz.type === 'FILL_BLANK' &&
    quiz.options?.mockHtmlType !== 'range' &&
    choicesFor(quiz).length > 0
  );
}

function sentenceFor(quiz: Quiz) {
  const question = quiz.question.trim();
  // 문장 안 줄바꿈은 화면 폭에 맞춰 다시 감싸므로 공백 하나로 바꾼다.
  const flat = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim();
  const marker = /\[\[blank\]\]|\{blank\}|_{2,}/i.exec(question);
  if (marker) {
    const before = flat(question.slice(0, marker.index));
    const after = flat(question.slice(marker.index + marker[0].length));
    return { before, after };
  }
  if (quiz.options?.mockHtmlType === 'blank') {
    return { before: question.split('\n')[0].trim(), after: '있어야 해요.' };
  }
  return { before: question, after: '' };
}

function correctLabel(result: AnswerResult, quiz: Quiz, choices: Choice[]): string | null {
  const answer = result.correctAnswer;
  const raw = answer.index ?? answer.answer ?? answer.texts ?? quiz.options?.answer;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value === 'number')
    return choices.find((choice) => choice.index === value)?.label ?? null;
  return typeof value === 'string' ? value : null;
}

export function FillBlankQuiz({
  quiz,
  scale,
  disabled,
  submitChoiceIndex,
  submit,
  onGraded,
  onAdvance,
}: {
  quiz: Quiz;
  scale: number;
  disabled: boolean;
  submitChoiceIndex: boolean;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult) => void;
  onAdvance: () => Promise<void> | void;
}) {
  const choices = choicesFor(quiz);
  const { before, after } = sentenceFor(quiz);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('UNANSWERED');
  const phaseRef = useRef<Phase>('UNANSWERED');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState('');
  const sheetProgress = useRef(new Animated.Value(0)).current;
  const active = useRef(true);

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

  const choose = async (index: number) => {
    if (disabled || phaseRef.current !== 'UNANSWERED') return;
    moveTo('GRADING');
    setSelected(index);
    setError('');
    try {
      const answer: QuizAnswer = submitChoiceIndex
        ? { index }
        : { texts: [choices.find((choice) => choice.index === index)?.label ?? ''] };
      const graded = await submit(answer);
      if (!active.current) return;
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
      setSelected(null);
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

  const graded = phase === 'GRADED' || phase === 'TRANSITIONING';
  const locked = disabled || phase !== 'UNANSWERED';
  const ungraded = isUngraded(quiz, result);
  // 채점하지 않는 문항은 색을 바꾸지 않는다. null 은 오답이 아니다.
  const correct = !!result && !ungraded && result.isCorrect === true;
  const wrong = !!result && !ungraded && result.isCorrect === false;
  const selectedChoice = choices.find((choice) => choice.index === selected);
  const expected = wrong && result ? correctLabel(result, quiz, choices) : null;
  // 오답이면 정답을 해설 시트 첫 줄에 붙인다.
  const sheetResult =
    result && expected
      ? {
          ...result,
          explanation: [`정답: ${expected}`, result.explanation].filter(Boolean).join('\n'),
        }
      : result;

  return (
    <View style={s.stage}>
      {/* 채점 뒤 여백 터치로 다음 콘텐츠로 간다(PresentedChoiceQuiz 와 같다). */}
      <Pressable
        accessible={graded}
        accessibilityRole={graded ? 'button' : undefined}
        accessibilityLabel={graded ? '다음 학습 콘텐츠로 이동' : undefined}
        disabled={!graded}
        onPress={advance}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="box-none" style={[s.body, { paddingTop: 200 * scale }]}>
        <View pointerEvents="box-none" style={[s.group, { width: 349 * scale }]}>
          <View
            pointerEvents="none"
            style={[
              s.prompt,
              { minHeight: 150 * scale, paddingTop: 32 * scale, paddingHorizontal: 20 * scale },
            ]}
          >
            <Text style={s.sentence}>{before}</Text>
            <View style={s.sentenceRow}>
              <View style={[s.blank, { width: 164 * scale }]}>
                {selectedChoice ? (
                  <AnimatedReveal
                    key={selectedChoice.index}
                    duration={180}
                    offsetY={4}
                    style={s.answerReveal}
                  >
                    <Text style={[s.blankText, correct && s.correctText, wrong && s.wrongText]}>
                      {selectedChoice.label}
                    </Text>
                  </AnimatedReveal>
                ) : (
                  <Text style={s.placeholder}>?</Text>
                )}
              </View>
              {after ? <Text style={[s.sentence, s.suffix]}>{after}</Text> : null}
            </View>
          </View>
          <View style={s.options}>
            {choices.map((choice, position) => {
              const picked = selected === choice.index;
              return (
                <Pressable
                  key={choice.index}
                  accessibilityRole="button"
                  accessibilityState={{ selected: picked, disabled: locked }}
                  disabled={locked}
                  onPress={() => void choose(choice.index)}
                  style={({ pressed }) => [
                    s.option,
                    position > 0 && s.optionDivider,
                    pressed && s.pressedOption,
                    picked && correct && s.correctOption,
                    picked && wrong && s.wrongOption,
                  ]}
                >
                  <Text
                    style={[
                      s.optionText,
                      picked && correct && s.correctText,
                      picked && wrong && s.wrongText,
                    ]}
                  >
                    {choice.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
        </View>
      </View>
      {sheetResult ? (
        <QuizFeedbackSheet
          result={sheetResult}
          progress={sheetProgress}
          nextDisabled={phase !== 'GRADED'}
          onNext={advance}
          ungraded={ungraded}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  stage: { flexGrow: 1, width: '100%' },
  body: { alignItems: 'center' },
  group: { maxWidth: '100%' },
  prompt: { paddingBottom: 32, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  sentence: { color: '#161616', fontSize: 20, lineHeight: 24, fontFamily: 'PretendardBold' },
  // 빈칸 뒤 문장이 남은 폭에 안 들어가면 낱말 중간에서 끊지 않고 통째로 다음 줄로 보낸다.
  sentenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 16,
    // 아래 줄로 내려가도 첫 줄과 빈칸 줄 사이(marginTop 20)와 같은 간격을 둔다.
    rowGap: 20,
    marginTop: 20,
  },
  blank: {
    minHeight: 29,
    borderBottomWidth: 1.6,
    borderBottomColor: '#aaa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blankText: {
    color: '#161616',
    fontSize: 20,
    lineHeight: 24,
    fontFamily: 'PretendardMedium',
    textAlign: 'center',
  },
  answerReveal: { maxWidth: '100%' },
  placeholder: { color: '#aaa', fontSize: 20, lineHeight: 24, fontFamily: 'PretendardMedium' },
  suffix: {
    flexShrink: 1,
    maxWidth: '100%',
    ...(Platform.OS === 'web' ? ({ wordBreak: 'keep-all' } as object) : null),
  },
  options: { flexDirection: 'row', marginTop: 12, minHeight: 32 },
  option: {
    flex: 1,
    minWidth: 0,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  optionDivider: { borderLeftWidth: 1, borderColor: '#aaa' },
  optionText: {
    color: '#747474',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'PretendardSemiBold',
    textAlign: 'center',
  },
  pressedOption: { opacity: 0.65 },
  // Figma button_빈칸: 테두리 없이 배경·글자색만 바꾼다.
  correctOption: { backgroundColor: QUIZ_FEEDBACK_COLORS.correct.background },
  wrongOption: { backgroundColor: QUIZ_FEEDBACK_COLORS.incorrect.background },
  correctText: { color: QUIZ_FEEDBACK_COLORS.correct.text },
  wrongText: { color: QUIZ_FEEDBACK_COLORS.incorrect.text },
  error: { marginTop: 24, color: '#b56060', fontSize: 12, lineHeight: 18 },
});
