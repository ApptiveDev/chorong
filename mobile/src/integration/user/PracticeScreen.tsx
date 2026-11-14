import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { integrationApi as api, client } from '../runtime';
import { useTask } from '../hooks';
import { reviewCompletion, reviewScore, type ReviewCompletion } from '../completionResult';
import { storage } from '../storage';
import { markReviewRewardedToday } from './reviewStart';
import type { AnswerResult, Lesson, ReviewSet } from '../models';
import { Button, Card, positiveId, styles } from '../ui';
import { QuizCard } from './QuizCard';
import { QuizBackdrop, QuizBackIcon } from './QuizBackdrop';
import { QuizStageQuiz, quizScrollContentStyle, quizStageKind } from './QuizStage';
import { AnimatedReveal } from './AnimatedReveal';
import { UserScreen, UserStatus } from './Screen';
import { CompletionResult } from './CompletionResult';

export function ReviewScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const quizScale = Math.min(windowWidth / 402, windowHeight / 874, 1);
  const { lessonId } = useLocalSearchParams<{ lessonId?: string }>(),
    router = useRouter(),
    task = useTask();
  const [set, setSet] = useState<ReviewSet | null>(null),
    [done, setDone] = useState<number[]>([]),
    // 복습 세션 완료(API-503) 응답으로 고른 완료 화면. null 이면 아직 완료 전이다.
    [notice, setNotice] = useState<ReviewCompletion | null>(null),
    // 문항별 첫 채점 결과(API-502 isCorrect). 완료 화면의 정답 수에 쓴다.
    [graded, setGraded] = useState<Record<number, boolean>>({}),
    [position, setPosition] = useState(0);
  const [sessionKey, setSessionKey] = useState('');
  const [exitOpen, setExitOpen] = useState(false);
  const loadedFor = useRef<string | null>(null);
  const quizTapLocked = useRef(false);
  const load = () =>
    task.run(async () => {
      const result = await api.review.next(lessonId ? positiveId(lessonId) : undefined);
      setSet(result);
      setDone([]);
      setGraded({});
      setPosition(0);
      setSessionKey(client.idempotencyKey(`review:${Date.now()}`));
    });
  const complete = () =>
    task.run(async () => {
      const reward = await api.review.complete(done, sessionKey);
      // 복습하기 화면 안내 문구용 기록. 저장에 실패해도 완료 결과는 그대로 보여 준다.
      const userId = client.getSnapshot().user?.userId;
      if (userId) await markReviewRewardedToday(storage, userId).catch(() => {});
      setNotice(reviewCompletion(reward.rewards));
      return true;
    });
  const onGraded = (reviewItemId: number) => (result: AnswerResult | undefined) => {
    setDone((old) => [...old, reviewItemId]);
    if (result)
      setGraded((old) =>
        old[reviewItemId] === undefined ? { ...old, [reviewItemId]: result.isCorrect } : old,
      );
  };
  useEffect(() => {
    const key = lessonId ?? '';
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    void load();
  }, [lessonId]);
  const items = set?.reviewItems ?? [];
  const current = items[position];
  const score = reviewScore(
    graded,
    items.map((item) => item.reviewItemId),
  );
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
          score={score ? `정답 ${score.correct}/${score.total}` : undefined}
          stardust={notice.kind === 'reviewRewarded' ? notice.stardust : 0}
          notice={
            notice.kind === 'reviewAlreadyRewarded' ? '오늘의 복습 보상은 이미 받았어요' : undefined
          }
          action={{ label: '완료', onPress: () => router.replace('/quiz') }}
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
                submit={(answer) => api.review.answer(current.reviewItemId, answer)}
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
      <Modal
        visible={exitOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExitOpen(false)}
      >
        <View style={reviewStyles.modalOverlay}>
          <View style={reviewStyles.modalPanel}>
            <Text style={reviewStyles.modalTitle}>복습을 나갈까요?</Text>
            <Text style={reviewStyles.modalCopy}>
              이번 복습의 맞힌 문제는 오늘 다시 나오지 않아요.
            </Text>
            <View style={reviewStyles.modalActions}>
              <Pressable
                accessibilityRole="button"
                style={reviewStyles.modalSecondary}
                onPress={() => setExitOpen(false)}
              >
                <Text style={reviewStyles.modalSecondaryText}>계속 풀기</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={reviewStyles.modalPrimary}
                onPress={() => {
                  setExitOpen(false);
                  router.replace('/quiz');
                }}
              >
                <Text style={reviewStyles.modalPrimaryText}>나가기</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: '#34273c63',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalPanel: {
    width: '100%',
    maxWidth: 354,
    borderRadius: 23,
    backgroundColor: '#fff',
    padding: 25,
  },
  modalTitle: { color: '#282636', fontSize: 20, fontWeight: '700', lineHeight: 30 },
  modalCopy: { color: '#807188', fontSize: 13, lineHeight: 23, marginTop: 12 },
  modalActions: { flexDirection: 'row', gap: 9, marginTop: 22 },
  modalSecondary: {
    flex: 1,
    minHeight: 45,
    borderRadius: 13,
    backgroundColor: '#f3f1f6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  modalSecondaryText: { color: '#655b76', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  modalPrimary: {
    flex: 1,
    minHeight: 45,
    borderRadius: 13,
    backgroundColor: '#302b38',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  modalPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
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
