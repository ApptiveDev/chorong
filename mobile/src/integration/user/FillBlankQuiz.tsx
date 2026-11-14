import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { QUIZ_FEEDBACK_COLORS } from './quizFeedbackColors';
import { AnimatedReveal } from './AnimatedReveal';

type Choice = { index: number; label: string };
type Phase = 'UNANSWERED' | 'ANSWERED' | 'TRANSITIONING';

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
  const marker = /\[\[blank\]\]|\{blank\}|_{2,}/i.exec(question);
  if (marker) {
    const before = question.slice(0, marker.index).trim();
    const after = question.slice(marker.index + marker[0].length).trim();
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
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const advancing = useRef(false);
  const advanceReadyAt = useRef(0);
  const advanceUnlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (advanceUnlockTimer.current) clearTimeout(advanceUnlockTimer.current);
    },
    [],
  );

  const choose = async (index: number) => {
    if (disabled || phase !== 'UNANSWERED' || submitting.current) return;
    submitting.current = true;
    setSelected(index);
    setError('');
    try {
      const answer: QuizAnswer = submitChoiceIndex
        ? { index }
        : { texts: [choices.find((choice) => choice.index === index)?.label ?? ''] };
      const graded = await submit(answer);
      setResult(graded);
      setPhase('ANSWERED');
      advanceReadyAt.current = Date.now() + 320;
      onGraded(graded);
    } catch (cause) {
      setSelected(null);
      setError(cause instanceof Error ? cause.message : '답안을 확인하지 못했습니다.');
    } finally {
      submitting.current = false;
    }
  };

  const advance = () => {
    if (phase !== 'ANSWERED' || advancing.current || Date.now() < advanceReadyAt.current) return;
    advancing.current = true;
    setPhase('TRANSITIONING');
    void Promise.resolve()
      .then(onAdvance)
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : '다음 콘텐츠로 이동하지 못했습니다.');
      })
      .finally(() => {
        advanceUnlockTimer.current = setTimeout(() => {
          advancing.current = false;
          setPhase((current) => (current === 'TRANSITIONING' ? 'ANSWERED' : current));
        }, 400);
      });
  };

  const selectedChoice = choices.find((choice) => choice.index === selected);
  const expected = result && !result.isCorrect ? correctLabel(result, quiz, choices) : null;

  return (
    <View style={s.stage}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="다음 학습 콘텐츠로 이동"
        disabled={phase !== 'ANSWERED'}
        onPress={advance}
        style={{ height: 200 * scale }}
      />
      <View style={s.groupRow}>
        <Pressable disabled={phase !== 'ANSWERED'} onPress={advance} style={s.sideSpace} />
        <View style={[s.group, { width: 349 * scale }]}>
          <View
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
                    <Text
                      style={[
                        s.blankText,
                        result && (result.isCorrect ? s.correctText : s.wrongText),
                      ]}
                    >
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
            {choices.map((choice, position) => (
              <Pressable
                key={choice.index}
                accessibilityRole="button"
                accessibilityState={{
                  selected: selected === choice.index,
                  disabled: disabled || phase !== 'UNANSWERED' || submitting.current,
                }}
                disabled={disabled || phase !== 'UNANSWERED' || submitting.current}
                onPress={() => void choose(choice.index)}
                style={({ pressed }) => [
                  s.option,
                  position > 0 && s.optionDivider,
                  pressed && s.pressedOption,
                  selected === choice.index &&
                    result &&
                    (result.isCorrect ? s.correctOption : s.wrongOption),
                ]}
              >
                <Text
                  style={[
                    s.optionText,
                    selected === choice.index &&
                      result &&
                      (result.isCorrect ? s.correctText : s.wrongText),
                  ]}
                >
                  {choice.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={s.feedbackSlot}>
            {result ? (
              <AnimatedReveal
                duration={280}
                offsetY={8}
                style={[s.feedback, result.isCorrect ? s.feedbackGood : s.feedbackWrong]}
              >
                <Text style={s.feedbackTitle}>
                  {result.isCorrect ? '맞았어요!' : '다시 확인해 볼까요?'}
                </Text>
                {expected ? <Text style={s.feedbackText}>정답: {expected}</Text> : null}
                {result.explanation?.trim() ? (
                  <Text style={s.feedbackText}>{result.explanation}</Text>
                ) : null}
              </AnimatedReveal>
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            ) : null}
          </View>
        </View>
        <Pressable disabled={phase !== 'ANSWERED'} onPress={advance} style={s.sideSpace} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="다음 학습 콘텐츠로 이동"
        disabled={phase !== 'ANSWERED'}
        onPress={advance}
        style={s.lowerSpace}
      />
    </View>
  );
}

const s = StyleSheet.create({
  stage: { flexGrow: 1, width: '100%' },
  groupRow: { width: '100%', flexDirection: 'row' },
  group: { maxWidth: '100%' },
  sideSpace: { flex: 1 },
  prompt: { paddingBottom: 32, borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  sentence: { color: '#161616', fontSize: 20, lineHeight: 24, fontFamily: 'PretendardBold' },
  sentenceRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 20 },
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
  suffix: { flex: 1 },
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
  feedbackSlot: { minHeight: 120, marginTop: 24 },
  feedback: { borderRadius: 14, padding: 17, gap: 5 },
  feedbackGood: { backgroundColor: QUIZ_FEEDBACK_COLORS.correct.background },
  feedbackWrong: { backgroundColor: QUIZ_FEEDBACK_COLORS.incorrect.background },
  feedbackTitle: { color: '#282636', fontSize: 13, fontFamily: 'PretendardBold' },
  feedbackText: { color: '#282636', fontSize: 13, lineHeight: 20, fontFamily: 'PretendardRegular' },
  error: { color: '#b56060', fontSize: 12, lineHeight: 18 },
  lowerSpace: { flexGrow: 1, minHeight: 80 },
});
