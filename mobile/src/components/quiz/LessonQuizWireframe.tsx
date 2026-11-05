import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { quizApi, quizErrorMessage } from '../../lib/quiz';
import { initialResponse, prepareQuiz, responseIssue } from '../../lib/quiz-state';
import type { Quiz as InteractiveQuiz, QuizPreviewResult, QuizResponse } from '../../types/quiz';
import type { AnswerResult, Quiz as LegacyQuiz, QuizAnswer } from '../../integration/models';
import { QuizCard } from '../../integration/user/QuizCard';
import { QuizRenderer } from './QuizRenderer';

const labels: Record<InteractiveQuiz['interactionType'], string> = {
  SLIDER: '값 움직이기',
  SWIPE: '좌우로 밀기',
  TAP: '카드 고르기',
  DRAG_DROP: '끌어 놓기',
  SORT: '순서 바꾸기',
  MATCHING: '짝 연결하기',
  FLIP_CARD: '카드 뒤집기',
  MULTIPLE_CHOICE: '답 고르기',
};

export function LessonQuizWireframe({
  lessonId,
  quiz: legacyQuiz,
  disabled,
  submitLegacy,
  onAnswered,
}: {
  lessonId: number;
  quiz: LegacyQuiz;
  disabled: boolean;
  submitLegacy: (answer: QuizAnswer) => Promise<AnswerResult>;
  onAnswered: () => void;
}) {
  const [quiz, setQuiz] = useState<InteractiveQuiz | null>(null);
  const [response, setResponse] = useState<QuizResponse | null>(null);
  const [result, setResult] = useState<QuizPreviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    quizApi
      .list(lessonId)
      .then((items) => {
        if (!active) return;
        if (items.length) {
          const prepared = prepareQuiz(items[0]);
          setQuiz(prepared);
          setResponse(initialResponse(prepared));
        }
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(quizErrorMessage(cause));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [lessonId]);

  if (loading) return <ActivityIndicator accessibilityLabel="퀴즈 불러오는 중" />;
  if (!quiz || !response) {
    return (
      <View style={s.card}>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <QuizCard
          quiz={legacyQuiz}
          disabled={disabled}
          submit={submitLegacy}
          onGraded={onAnswered}
        />
      </View>
    );
  }
  const issue = responseIssue(quiz, response);
  const submit = async () => {
    if (busy || disabled || issue) return;
    setBusy(true);
    setError(null);
    try {
      const next = await quizApi.check(quiz.quizId, response);
      setResult(next);
      if (next.correct && next.completed) onAnswered();
    } catch (cause) {
      setError(quizErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={s.card}>
      <Text style={s.eyebrow}>조작 퀴즈 · {labels[quiz.interactionType]}</Text>
      <Text style={s.question}>{quiz.question}</Text>
      <Text style={s.instruction}>{quiz.instruction}</Text>
      <QuizRenderer
        quiz={quiz}
        response={response}
        disabled={disabled || busy}
        onChange={(next) => {
          setResponse(next);
          setResult(null);
          setError(null);
        }}
        checkPairs={(next) => quizApi.check(quiz.quizId, next)}
        onComplete={(next) => {
          setResult(next);
          if (next.completed) onAnswered();
        }}
      />
      {quiz.interactionType !== 'FLIP_CARD' ? (
        <>
          {issue ? <Text style={s.instruction}>{issue}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: disabled || busy || !!issue }}
            disabled={disabled || busy || !!issue}
            onPress={() => void submit()}
            style={[s.button, (disabled || busy || !!issue) && s.disabled]}
          >
            <Text style={s.buttonText}>{busy ? '확인 중' : '정답 확인'}</Text>
          </Pressable>
        </>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {result ? (
        <View style={s.result}>
          <Text style={s.question}>{result.correct ? '정답입니다.' : '다시 살펴보세요.'}</Text>
          <Text style={s.instruction}>{result.explanation}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 8,
    padding: 14,
    gap: 12,
    backgroundColor: '#fff',
  },
  eyebrow: { color: '#7b8795', fontSize: 11 },
  question: { color: '#273a52', fontSize: 16, fontWeight: '700', lineHeight: 23 },
  instruction: { color: '#536578', fontSize: 12, lineHeight: 19 },
  button: {
    backgroundColor: '#273a52',
    borderRadius: 5,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  error: { color: '#b91c1c', fontSize: 12 },
  result: { backgroundColor: '#eef2f5', borderRadius: 6, padding: 12, gap: 5 },
});
