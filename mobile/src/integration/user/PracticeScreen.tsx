import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { integrationApi as api, client } from '../runtime';
import { useTask } from '../hooks';
import { reviewCompletion, reviewScore } from '../completionResult';
import { isReviewSessionClosed } from './reviewStart';
import type {
  AnswerResult,
  Lesson,
  QuizAnswer,
  ReviewCompleteResponse,
  ReviewSet,
} from '../models';
import { Button, Card, styles } from '../ui';
import { QuizCard } from './QuizCard';
import { QuizBackdrop, QuizBackIcon } from './QuizBackdrop';
import { QuizStageQuiz, quizScrollContentStyle, quizStageKind } from './QuizStage';
import { AnimatedReveal } from './AnimatedReveal';
import { UserScreen, UserStatus } from './Screen';
import { CompletionResult } from './CompletionResult';
import { SessionConfirmModal } from './SessionConfirmModal';

export function ReviewScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const quizScale = Math.min(windowWidth / 402, windowHeight / 874, 1);
  const router = useRouter(),
    task = useTask();
  const [set, setSet] = useState<ReviewSet | null>(null),
    [done, setDone] = useState<number[]>([]),
    // 복습 회차 완료(API-503) 응답. null 이면 아직 완료 전이다.
    [completed, setCompleted] = useState<ReviewCompleteResponse | null>(null),
    // 문항별 첫 채점 결과(API-502 isCorrect). 완료 응답에 정답 수가 없을 때만 완료 화면에 쓴다.
    [graded, setGraded] = useState<Record<number, boolean>>({}),
    [position, setPosition] = useState(0);
  const [sessionKey, setSessionKey] = useState('');
  const [exitOpen, setExitOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // ERR-22 REVIEW_SESSION_CLOSED: 이 회차가 서버에서 이미 끝났다(다른 화면·기기에서 새 복습을 시작했거나 종료됨).
  const [closedOpen, setClosedOpen] = useState(false);
  const loaded = useRef(false);
  const quizTapLocked = useRef(false);
  // API-501 은 부를 때마다 새 회차를 만들고 끝나지 않은 이전 회차를 닫는다. 화면 진입·다시 시작에서만 부른다.
  const load = () =>
    task.run(async () => {
      const result = await api.review.next();
      setSet(result);
      setDone([]);
      setGraded({});
      setPosition(0);
      setCompleted(null);
      setClosedOpen(false);
      setSessionKey(client.idempotencyKey(`review:${result.reviewSessionId ?? Date.now()}`));
    });
  const sessionId = set?.reviewSessionId ?? null;
  const complete = () =>
    task.run(async () => {
      if (!sessionId) throw new Error('복습 회차 정보가 없습니다. 복습을 다시 시작해 주세요.');
      try {
        setCompleted(await api.review.complete(sessionId, sessionKey));
        return true;
      } catch (error) {
        if (!isReviewSessionClosed(error)) throw error;
        setClosedOpen(true);
        return false;
      }
    });
  const submitAnswer = (reviewItemId: number) => async (answer: QuizAnswer) => {
    try {
      return await api.review.answer(reviewItemId, answer);
    } catch (error) {
      if (isReviewSessionClosed(error)) setClosedOpen(true);
      throw error;
    }
  };
  // M03_2 '나가기'. 열린 회차가 있으면 API-505 로 닫고 나간다.
  // 종료 요청이 실패해도 나간다. 서버는 다음 API-501 호출에서 열린 회차를 닫으므로 기록이 남지 않는다.
  const leave = async () => {
    if (leaving) return;
    setLeaving(true);
    if (sessionId && !completed && !closedOpen) {
      try {
        await api.review.abandon(sessionId);
      } catch {
        // 위 설명대로 실패를 무시하고 나간다.
      }
    }
    setExitOpen(false);
    setLeaving(false);
    router.replace('/');
  };
  const onGraded = (reviewItemId: number) => (result: AnswerResult | undefined) => {
    setDone((old) => [...old, reviewItemId]);
    if (result)
      setGraded((old) =>
        old[reviewItemId] === undefined
          ? { ...old, [reviewItemId]: result.isCorrect === true }
          : old,
      );
  };
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    void load();
  }, []);
  const items = set?.reviewItems ?? [];
  const current = items[position];
  const notice = completed
    ? reviewCompletion(
        completed,
        reviewScore(
          graded,
          items.map((item) => item.reviewItemId),
        ),
      )
    : null;
  // 학습 화면과 같은 퀴즈 화면(QuizStage)을 쓴다. 문항이 보이는 동안은 모든 유형이 퀴즈 배경·머리말을 쓴다.
  const quizStage = !notice && !!current;
  const quizKind = current ? quizStageKind(current.quiz) : null;
  // 다음 문항 또는 복습 완료(API-503). 이동했으면 true.
  const goNext = async () => {
    if (quizTapLocked.current || task.busy) return false;
    quizTapLocked.current = true;
    try {
      if (position === items.length - 1) return (await complete()) === true;
      setPosition(position + 1);
      return true;
    } finally {
      quizTapLocked.current = false;
    }
  };
  // 채점 뒤 문항 컴포넌트가 직접 넘어갈 때. 실패하면 예외로 알려 문항이 오류를 보여 주고 다시 누르게 한다.
  const advanceFromQuiz = async () => {
    if (!(await goNext())) throw new Error('다음 문제로 이동하지 못했습니다.');
  };
  return (
    <UserScreen title="복습하기" showTitle={false} scroll={false} quiz={quizStage} dark={!!notice}>
      {quizStage ? <QuizBackdrop /> : null}
      {notice ? <StatusBar style="light" /> : null}
      {!notice ? (
        <View
          style={[
            reviewStyles.header,
            quizStage && reviewStyles.quizHeader,
            quizStage && {
              paddingTop: Math.max(0, 60 * quizScale - insets.top),
              paddingHorizontal: 30 * quizScale,
              gap: 20 * quizScale,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="복습 나가기"
            style={quizStage && reviewStyles.quizBack}
            onPress={() => setExitOpen(true)}
          >
            {quizStage ? <QuizBackIcon /> : <Text style={reviewStyles.close}>×</Text>}
          </Pressable>
          {items.length ? (
            <View style={[reviewStyles.progressWrap, quizStage && reviewStyles.quizProgressWrap]}>
              {quizStage ? (
                <Text style={[reviewStyles.caption, reviewStyles.quizCaption]}>
                  복습 · {position + 1}/{items.length}
                </Text>
              ) : null}
              <View style={[reviewStyles.segments, quizStage && reviewStyles.quizSegments]}>
                {items.map((item, index) => (
                  <View
                    key={item.reviewItemId}
                    style={[
                      reviewStyles.segment,
                      quizStage && reviewStyles.quizSegment,
                      index <= position && reviewStyles.segmentOn,
                    ]}
                  />
                ))}
              </View>
              {!quizStage ? (
                <Text style={reviewStyles.caption}>
                  복습 · {position + 1}/{items.length}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      <UserStatus task={task} floatingBusy={quizStage} />
      {notice ? (
        // Figma L06_6 복습 완료 / 오늘 첫 보상(740:1879) · L06_7 오늘 보상 이미 받음(740:1903)
        <CompletionResult
          title="복습을 마쳤어요"
          score={notice.score ? `정답 ${notice.score.correct}/${notice.score.total}` : undefined}
          stardust={notice.kind === 'reviewRewarded' ? notice.stardust : 0}
          notice={
            notice.kind === 'reviewAlreadyRewarded' ? '오늘의 복습 보상은 이미 받았어요' : undefined
          }
          action={{ label: '완료', onPress: () => router.replace('/') }}
        />
      ) : null}
      {set?.message && !notice ? <Text style={styles.text}>{set.message}</Text> : null}
      {current && !notice ? (
        <View style={reviewStyles.stage}>
          <AnimatedReveal key={current.reviewItemId} style={reviewStyles.stage}>
            <ScrollView
              key={current.reviewItemId}
              style={reviewStyles.stage}
              contentContainerStyle={quizScrollContentStyle(quizKind!, quizScale)}
              keyboardShouldPersistTaps="handled"
            >
              <QuizStageQuiz
                quiz={current.quiz}
                itemKey={current.reviewItemId}
                scale={quizScale}
                disabled={done.includes(current.reviewItemId)}
                submit={submitAnswer(current.reviewItemId)}
                onGraded={onGraded(current.reviewItemId)}
                onAdvance={advanceFromQuiz}
              />
            </ScrollView>
          </AnimatedReveal>
        </View>
      ) : null}
      {current && !notice && !quizKind?.selfAdvancing && done.includes(current.reviewItemId) ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={position === items.length - 1 ? '복습 완료' : '다음 문제로 이동'}
          disabled={task.busy}
          style={reviewStyles.advanceOverlay}
          onPress={() => void goNext()}
        />
      ) : null}
      {!set && !task.busy && !notice ? (
        <Button title="복습 문제 불러오기" onPress={() => void load()} />
      ) : null}
      {set?.reviewItems.length === 0 && !set.message ? (
        <Text style={styles.text}>복습할 문제가 없습니다.</Text>
      ) : null}
      {/* 복습은 이어 하기가 없다. 나가면 이번 회차를 닫고(API-505) 다음에 처음부터 다시 시작한다.
          M03_2 복습 도중 나가기. 학습의 '잠시 멈출까요?'(Figma 알림창_선택지 2개_세로 462:718)와 같은 모달이다. */}
      <SessionConfirmModal
        visible={exitOpen}
        title="복습을 그만할까요?"
        notice="지금 나가면 이번 복습은 끝나요. 다시 시작하면 첫 문제부터 풀어요."
        arrowBullet
        centerNotice
        stacked
        confirmLabel="계속 복습하기"
        cancelLabel="나가기"
        busy={leaving}
        onConfirm={() => setExitOpen(false)}
        onCancel={() => void leave()}
        onDismiss={() => setExitOpen(false)}
      />
      {/* ERR-22 이미 끝난 회차. Figma 프레임이 없어 문구는 앱이 정했다. 틀은 M03_2 와 같은 두 버튼 모달이다.
          '다시 시작'은 새 회차(API-501)를 받고, 닫기(뒤로 가기)는 학습 홈으로 간다. */}
      <SessionConfirmModal
        visible={closedOpen}
        title="이번 복습이 끝났어요."
        notice="복습을 처음부터 다시 시작해 주세요."
        arrowBullet
        centerNotice
        stacked
        confirmLabel="다시 시작"
        cancelLabel="학습 홈으로"
        busy={task.busy}
        onConfirm={() => void load()}
        onCancel={() => router.replace('/')}
        onDismiss={() => router.replace('/')}
      />
    </UserScreen>
  );
}

const reviewStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  quizHeader: { alignItems: 'flex-end' },
  quizBack: { width: 26, height: 22 },
  close: { color: '#282636', fontSize: 30, lineHeight: 34 },
  progressWrap: { flex: 1, gap: 8, paddingTop: 9 },
  quizProgressWrap: { gap: 4, paddingTop: 0 },
  segments: { flexDirection: 'row', gap: 4, height: 4 },
  segment: { flex: 1, backgroundColor: '#eeecf1', borderRadius: 4 },
  quizSegments: { gap: 5, marginVertical: 9 },
  quizSegment: { backgroundColor: '#aaa' },
  segmentOn: { backgroundColor: '#ebc60f' },
  caption: { color: '#888591', fontSize: 12 },
  quizCaption: { color: '#747474', textAlign: 'right', fontFamily: 'PretendardRegular' },
  advanceOverlay: { ...StyleSheet.absoluteFill, zIndex: 5 },
  stage: { flex: 1, minHeight: 0 },
});

export function OnboardingScreen() {
  const task = useTask(),
    [lesson, setLesson] = useState<Lesson | null>(null),
    [answered, setAnswered] = useState<number[]>([]),
    [notice, setNotice] = useState('');
  const load = () =>
    task.run(async () => {
      const result = await api.onboarding.load();
      setLesson(result.lesson);
    });
  const complete = (skipped: boolean) =>
    task.run(async () => {
      const result = await api.onboarding.complete(skipped);
      setNotice(
        `온보딩 ${skipped ? '건너뛰기' : '완료'} · 보상 ${result.rewards.length}건 · ${result.onboardingCompleted ? '서버 완료 상태 확인' : '서버 완료 대기'}`,
      );
    });
  return (
    <UserScreen title="시작 안내">
      <Button title="온보딩 시작" disabled={task.busy} onPress={() => void load()} />
      <UserStatus task={task} />
      {lesson ? (
        <>
          <Text style={styles.subtitle}>{lesson.title}</Text>
          <Text style={styles.text}>{lesson.description}</Text>
          {lesson.contents.map((content) => (
            <Card key={content.contentId} title={`학습 ${content.order}`}>
              <Text style={styles.text}>{content.body}</Text>
              {content.quiz ? (
                <QuizCard
                  quiz={content.quiz}
                  disabled={answered.includes(content.contentId)}
                  submit={(answer) => api.learning.answer(content.quiz!.quizId, answer)}
                  onGraded={() => setAnswered((old) => [...old, content.contentId])}
                />
              ) : null}
            </Card>
          ))}
          <Button
            title="온보딩 완료"
            disabled={
              task.busy ||
              !!notice ||
              lesson.contents.some((v) => v.quiz && !answered.includes(v.contentId))
            }
            onPress={() => void complete(false)}
          />
        </>
      ) : null}
      <Button
        title="건너뛰기"
        disabled={task.busy || !!notice}
        onPress={() => void complete(true)}
      />
      {notice ? <Text style={styles.text}>{notice}</Text> : null}
    </UserScreen>
  );
}
