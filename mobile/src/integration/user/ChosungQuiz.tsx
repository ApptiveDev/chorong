// CHOSUNG(초성) 퀴즈 최소 구현. 정식 Figma 디자인 전까지 쓰는 임시 화면이다.
// 채점은 서버(API-406·502) 결과만 쓴다. 앱은 정답을 알지 못한다.
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AnswerResult, Quiz, QuizAnswer } from '../models';
import { Button, styles } from '../ui';
import { QUIZ_FEEDBACK_COLORS, quizFeedbackSurface } from './quizFeedbackColors';

export function isChosungQuiz(quiz: Quiz | null | undefined): boolean {
  return quiz?.type === 'CHOSUNG' && typeof quiz.options?.hint === 'string';
}

export function ChosungQuiz({
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
  const [text, setText] = useState('');
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const advancing = useRef(false);
  const locked = disabled || !!result || busy;

  const check = async () => {
    if (locked || submitting.current || !text.trim()) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const graded = await submit({ texts: [text] });
      setResult(graded);
      onGraded(graded);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '답안을 확인하지 못했습니다.');
    } finally {
      submitting.current = false;
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

  const expected =
    result && !result.isCorrect && typeof result.correctAnswer.answer === 'string'
      ? result.correctAnswer.answer
      : null;
  const canAdvance = !!result && !!onAdvance;

  return (
    <View style={s.stage}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="다음 학습 콘텐츠로 이동"
        disabled={!canAdvance}
        onPress={advance}
        style={s.upperSpace}
      />
      <View style={s.group}>
        <Text style={s.question}>{quiz.question}</Text>
        <Text style={s.hint}>{String(quiz.options?.hint ?? '')}</Text>
        <TextInput
          accessibilityLabel="정답 입력"
          value={text}
          onChangeText={setText}
          editable={!locked}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={() => void check()}
          placeholder="정답을 입력하세요"
          style={[styles.input, result && (result.isCorrect ? s.correctInput : s.wrongInput)]}
        />
        {!result ? (
          <Button
            title={busy ? '확인 중' : '제출'}
            disabled={locked || !text.trim()}
            onPress={() => void check()}
          />
        ) : (
          <View style={[s.feedback, result.isCorrect ? s.feedbackGood : s.feedbackWrong]}>
            <Text style={s.feedbackTitle}>
              {result.isCorrect ? '맞았어요!' : '다시 확인해 볼까요?'}
            </Text>
            {expected ? <Text style={s.feedbackText}>정답: {expected}</Text> : null}
            {result.explanation?.trim() ? (
              <Text style={s.feedbackText}>{result.explanation}</Text>
            ) : null}
          </View>
        )}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="다음 학습 콘텐츠로 이동"
        disabled={!canAdvance}
        onPress={advance}
        style={s.lowerSpace}
      />
    </View>
  );
}

// 정오답 색상은 FillBlankQuiz 와 같은 값을 쓴다.
const s = StyleSheet.create({
  stage: { flexGrow: 1, width: '100%' },
  upperSpace: { minHeight: 80 },
  group: { gap: 12 },
  question: { color: '#161616', fontSize: 20, lineHeight: 26, fontFamily: 'PretendardBold' },
  hint: {
    color: '#746284',
    fontSize: 24,
    letterSpacing: 4,
    textAlign: 'center',
    fontFamily: 'PretendardBold',
  },
  correctInput: quizFeedbackSurface.correct,
  wrongInput: quizFeedbackSurface.incorrect,
  feedback: { borderRadius: 14, padding: 17, gap: 5 },
  feedbackGood: { backgroundColor: QUIZ_FEEDBACK_COLORS.correct.background },
  feedbackWrong: { backgroundColor: QUIZ_FEEDBACK_COLORS.incorrect.background },
  feedbackTitle: { color: '#282636', fontSize: 13, fontFamily: 'PretendardBold' },
  feedbackText: { color: '#282636', fontSize: 13, lineHeight: 20, fontFamily: 'PretendardRegular' },
  lowerSpace: { flexGrow: 1, minHeight: 80 },
});
