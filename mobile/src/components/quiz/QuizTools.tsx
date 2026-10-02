import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { parseLessonId, quizApi, quizErrorMessage } from '../../lib/quiz';
import { initialResponse, prepareQuiz, responseIssue } from '../../lib/quiz-state';
import type { Quiz, QuizPreviewResult, QuizResponse, QuizSummary } from '../../types/quiz';
import { QuizRenderer } from './QuizRenderer';
import { QuizButton, styles } from './shared';

function QuizForm({ quiz }: { quiz: Quiz }) {
  const [response, setResponse] = useState<QuizResponse>(() => initialResponse(quiz));
  const [result, setResult] = useState<QuizPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const issue = responseIssue(quiz, response);
  const submit = async () => {
    if (inFlight.current || issue) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const next = await quizApi.check(quiz.quizId, response);
      if (mounted.current) setResult(next);
    } catch (e) {
      if (mounted.current) setError(quizErrorMessage(e));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <View style={styles.stack}>
      <Text style={styles.heading}>{quiz.question}</Text>
      <Text>{quiz.instruction}</Text>
      <Text style={styles.muted}>
        {quiz.interactionType} · 난이도 {quiz.difficulty} · 문제 ID {quiz.quizId}
      </Text>
      <QuizRenderer
        quiz={quiz}
        response={response}
        disabled={busy}
        checkPairs={(next) => quizApi.check(quiz.quizId, next)}
        onComplete={setResult}
        onChange={(next) => {
          if (!inFlight.current) {
            setResponse(next);
            setResult(null);
            setError(null);
          }
        }}
      />
      {quiz.interactionType !== 'FLIP_CARD' ? (
        <>
          {issue ? <Text style={styles.muted}>{issue}</Text> : null}
          <QuizButton
            label={busy ? '확인 중' : '채점하기'}
            disabled={busy || issue !== null}
            onPress={submit}
          />
        </>
      ) : null}
      {busy ? <ActivityIndicator accessibilityLabel="답안 확인 중" /> : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          채점 실패: {error}
        </Text>
      ) : null}
      {result ? (
        <View accessibilityLiveRegion="polite" style={styles.result}>
          <Text style={styles.heading}>
            {result.graded
              ? result.correct
                ? '정답입니다.'
                : '오답입니다.'
              : result.completed
                ? '학습 내용을 확인했습니다.'
                : '학습 내용 확인이 필요합니다.'}
          </Text>
          <Text>{result.explanation}</Text>
        </View>
      ) : null}
    </View>
  );
}
function QuizAttempt({ raw }: { raw: QuizSummary }) {
  const [prepared] = useState(() => {
    try {
      return { quiz: prepareQuiz(raw), error: null };
    } catch (error) {
      return { quiz: null, error: quizErrorMessage(error) };
    }
  });
  return prepared.quiz ? (
    <QuizForm quiz={prepared.quiz} />
  ) : (
    <Text accessibilityRole="alert" style={styles.error}>
      {prepared.error}
    </Text>
  );
}
export function QuizTools() {
  const [lesson, setLesson] = useState('');
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [selected, setSelected] = useState<QuizSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      request.current?.abort();
    },
    [],
  );
  const reset = () => {
    generation.current++;
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setQuizzes(null);
    setSelected(null);
    setError(null);
  };
  const load = async () => {
    if (request.current) return;
    const lessonId = parseLessonId(lesson);
    if (lessonId === null) {
      setError('학습 ID는 1부터 9007199254740991까지의 정수로 입력해 주세요.');
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    setQuizzes(null);
    setSelected(null);
    try {
      const data = await quizApi.list(lessonId, controller.signal);
      if (generation.current === current) {
        setQuizzes(data);
        setRevision((v) => v + 1);
      }
    } catch (e) {
      if (generation.current === current) setError(quizErrorMessage(e));
    } finally {
      if (generation.current === current) {
        request.current = null;
        setLoading(false);
      }
    }
  };
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>퀴즈 테스트</Text>
      <Text style={styles.muted}>
        로그인 없이 퀴즈를 확인합니다. 테스트 답안은 저장하지 않습니다.
      </Text>
      <Text style={styles.muted}>학습 ID로 문제를 조회한 뒤 선택해 주세요.</Text>
      <TextInput
        accessibilityLabel="학습 ID"
        placeholder="학습 ID"
        inputMode="numeric"
        value={lesson}
        onChangeText={(value) => {
          reset();
          setLesson(value);
        }}
        style={styles.input}
      />
      <QuizButton label="퀴즈 조회" disabled={loading} onPress={load} />
      {loading ? (
        <View style={styles.row}>
          <ActivityIndicator />
          <Text>퀴즈 불러오는 중</Text>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          조회 실패: {error}
        </Text>
      ) : null}
      {quizzes?.length === 0 ? <Text>이 학습에 등록된 퀴즈가 없습니다.</Text> : null}
      {quizzes && quizzes.length > 0 ? (
        <Text style={styles.muted}>
          {quizzes.length}개 문제 · 문제를 바꾸면 답안과 결과가 초기화됩니다.
        </Text>
      ) : null}
      {quizzes?.map((quiz, index) => (
        <QuizButton
          key={quiz.quizId}
          label={`문제 ${index + 1}: ${quiz.question}`}
          selected={selected?.quizId === quiz.quizId}
          onPress={() => setSelected(quiz)}
        />
      ))}
      {selected ? <QuizAttempt key={`${revision}:${selected.quizId}`} raw={selected} /> : null}
    </View>
  );
}
