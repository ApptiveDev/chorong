// 소리 듣고 하나 고르기. SINGLE + config.presentation.type === 'AUDIO'.
// Figma 소리듣고(739:1095)·정답(739:1031)을 따른다. 답안은 일반 SINGLE 과 같은 보기 순번이다.
// 음원 재생은 quizAudio.ts 가 맡고, 이 화면은 재생 상태만 받는다.
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { FEEDBACK_SHEET_COLORS, QuizFeedbackSheet } from './QuizFeedbackSheet';
import { QUIZ_FEEDBACK_COLORS } from './quizFeedbackColors';
import { quizAudioUrl, useQuizAudio, type QuizAudioStatus } from './quizAudio';
import { choicesFor, correctChoiceIndex } from './SingleChoiceQuiz';

type Phase = 'UNANSWERED' | 'GRADING' | 'GRADED' | 'TRANSITIONING';
const color = FEEDBACK_SHEET_COLORS;

export function AudioChoiceQuiz({
  quiz,
  scale,
  disabled,
  submit,
  onGraded,
  onAdvance,
}: {
  quiz: Quiz;
  scale: number;
  disabled: boolean;
  submit: (answer: QuizAnswer) => Promise<AnswerResult>;
  onGraded: (result: AnswerResult) => void;
  onAdvance: () => Promise<void> | void;
}) {
  const choices = choicesFor(quiz);
  const audio = useQuizAudio(quizAudioUrl(quiz));
  const [phase, setPhase] = useState<Phase>('UNANSWERED');
  const phaseRef = useRef<Phase>('UNANSWERED');
  const [selected, setSelected] = useState<number | null>(null);
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
    audio.stop();
    try {
      const graded = await submit({ index });
      if (!active.current) return;
      setResult(graded);
      onGraded(graded);
      moveTo('GRADED');
      AccessibilityInfo.announceForAccessibility(graded.isCorrect ? '정답' : '오답');
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
    audio.stop();
    void Promise.resolve()
      .then(onAdvance)
      .catch((cause) => {
        if (!active.current) return;
        setError(cause instanceof Error ? cause.message : '다음 콘텐츠로 이동하지 못했습니다.');
        moveTo('GRADED');
      });
  };

  if (!choices) return <Text style={s.error}>선택지를 불러오지 못했습니다.</Text>;
  const graded = phase === 'GRADED' || phase === 'TRANSITIONING';
  const locked = disabled || phase !== 'UNANSWERED';
  const correctIndex = result ? correctChoiceIndex(result, quiz) : null;

  return (
    <View style={s.stage}>
      {/* 채점 뒤 여백 터치로 다음 콘텐츠로 간다(ChosungQuiz 와 같다). */}
      <Pressable
        accessible={graded}
        accessibilityRole={graded ? 'button' : undefined}
        accessibilityLabel={graded ? '다음 학습 콘텐츠로 이동' : undefined}
        disabled={!graded}
        onPress={advance}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="box-none"
        style={[s.body, { paddingTop: 200 * scale, paddingHorizontal: 36 * scale }]}
      >
        <View pointerEvents="box-none" style={[s.group, { gap: 40 * scale }]}>
          <Text lineBreakStrategyIOS="hangul-word" style={s.question}>
            {quiz.question.replace(/\s*\n\s*/g, ' ')}
          </Text>
          <View pointerEvents="box-none" style={s.playerRow}>
            <AudioPlayButton status={audio.status} onPress={audio.toggle} />
          </View>
          <View style={[s.options, { width: 320 * scale }]}>
            {choices.map((choice) => {
              const correct =
                !!result &&
                (result.isCorrect ? selected === choice.index : correctIndex === choice.index);
              const wrong = !!result && !result.isCorrect && selected === choice.index;
              return (
                <Pressable
                  key={choice.index}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selected === choice.index, disabled: locked }}
                  disabled={locked}
                  onPress={() => void choose(choice.index)}
                  style={s.option}
                >
                  {(correct || wrong) && (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        s.optionTint,
                        correct ? s.correctTint : s.wrongTint,
                        { opacity: sheetProgress },
                      ]}
                    />
                  )}
                  <Text style={[s.optionText, correct && s.correctText, wrong && s.wrongText]}>
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
      {result ? (
        <QuizFeedbackSheet
          result={result}
          progress={sheetProgress}
          nextDisabled={phase !== 'GRADED'}
          onNext={advance}
        />
      ) : null}
    </View>
  );
}

// Figma button_음악 재생(739:1065). 32 칸 재생 삼각형. 재생 중에는 정지 아이콘으로 바꾼다.
// 정지·로딩 상태는 Figma 에 없어 같은 색·크기로만 맞춘다.
function AudioPlayButton({ status, onPress }: { status: QuizAudioStatus; onPress: () => void }) {
  const playing = status === 'playing';
  const unavailable = status === 'unavailable';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={playing ? '소리 멈추기' : '소리 듣기'}
      accessibilityState={{
        disabled: unavailable || status === 'loading',
        busy: status === 'loading',
      }}
      disabled={unavailable || status === 'loading'}
      hitSlop={12}
      onPress={onPress}
      style={[s.play, unavailable && s.playUnavailable]}
    >
      {status === 'loading' ? (
        <ActivityIndicator color={color.base} />
      ) : (
        <Svg width={32} height={32} viewBox="0 0 32 32" fill="none">
          {playing ? (
            <>
              <Rect x={8} y={4} width={6} height={24} rx={1} fill={color.base} />
              <Rect x={18} y={4} width={6} height={24} rx={1} fill={color.base} />
            </>
          ) : (
            <Path
              d="M30.5 15.134C31.1667 15.5189 31.1667 16.4811 30.5 16.866L9.5 28.9904C8.83333 29.3753 8 28.8942 8 28.1244V3.87564C8 3.10584 8.83333 2.62472 9.5 3.00962L30.5 15.134Z"
              fill={color.base}
            />
          )}
        </Svg>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  stage: { flexGrow: 1, width: '100%' },
  body: { alignItems: 'center' },
  group: { width: '100%', maxWidth: 330 },
  question: {
    color: color.base,
    fontFamily: 'PretendardBold',
    fontSize: 20,
    lineHeight: 24,
    includeFontPadding: false,
    ...(Platform.OS === 'web' ? ({ wordBreak: 'keep-all' } as object) : null),
  },
  playerRow: { width: '100%', alignItems: 'center' },
  play: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  playUnavailable: { opacity: 0.3 },
  options: { maxWidth: '100%', alignItems: 'stretch' },
  // SingleChoiceQuiz 와 같은 button_선택지 고르기
  option: {
    justifyContent: 'center',
    minHeight: 52,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.handle,
    marginBottom: -1,
    paddingHorizontal: 36,
    paddingVertical: 16,
  },
  optionTint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  correctTint: { backgroundColor: QUIZ_FEEDBACK_COLORS.correct.background },
  wrongTint: { backgroundColor: QUIZ_FEEDBACK_COLORS.incorrect.background },
  optionText: {
    color: color.tertiary,
    fontFamily: 'PretendardSemiBold',
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
  },
  correctText: { color: QUIZ_FEEDBACK_COLORS.correct.text },
  wrongText: { color: QUIZ_FEEDBACK_COLORS.incorrect.text },
  error: { color: '#b56060', fontFamily: 'PretendardMedium', fontSize: 12, lineHeight: 18 },
});
