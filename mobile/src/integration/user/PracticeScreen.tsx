import { useCallback, useEffect, useRef, useState } from 'react';
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
import { integrationApi as api, client } from '../runtime';
import { useTask } from '../hooks';
import type { AnswerResult, Lesson, ReviewSet } from '../models';
import { Button, Card, positiveId, styles } from '../ui';
import { QuizCard } from './QuizCard';
import { QuizBackdrop, QuizBackIcon } from './QuizBackdrop';
import { HtmlLessonQuiz, isHtmlLessonQuiz } from './HtmlLessonQuiz';
import { AnimatedReveal } from './AnimatedReveal';
import { UserScreen, UserStatus } from './Screen';
import type { RegisterQuizFooter } from './quizFooter';

export function ReviewScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const quizScale = Math.min(windowWidth / 402, windowHeight / 874, 1);
  const { lessonId } = useLocalSearchParams<{ lessonId?: string }>(),
    router = useRouter(),
    task = useTask();
  const [set, setSet] = useState<ReviewSet | null>(null),
    [done, setDone] = useState<number[]>([]),
    [notice, setNotice] = useState(''),
    [position, setPosition] = useState(0);
  const [sessionKey, setSessionKey] = useState('');
  const [exitOpen, setExitOpen] = useState(false);
  const [quizFooter, setQuizFooter] = useState<{
    quizId: number;
    enabled: boolean;
    onPress: () => void;
  } | null>(null);
  const registerQuizFooter = useCallback<RegisterQuizFooter>((quizId, enabled, onPress) => {
    setQuizFooter({ quizId, enabled, onPress });
  }, []);
  const loadedFor = useRef<string | null>(null);
  const quizTapLocked = useRef(false);
  const load = () =>
    task.run(async () => {
      const result = await api.review.next(lessonId ? positiveId(lessonId) : undefined);
      setSet(result);
      setDone([]);
      setPosition(0);
      setSessionKey(client.idempotencyKey(`review:${Date.now()}`));
    });
  const complete = () =>
    task.run(async () => {
      const reward = await api.review.complete(done, sessionKey);
      setNotice(
        items.some((item) => isHtmlLessonQuiz(item.quiz))
          ? '배운 내용을 다시 확인했어요.'
          : `보상 ${reward.rewards.length}건 · ✦ ${reward.wallet.stardust}`,
      );
    });
  useEffect(() => {
    const key = lessonId ?? '';
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    void load();
  }, [lessonId]);
  const items = set?.reviewItems ?? [];
  const current = items[position];
  const oxStage = !notice && current?.quiz.type === 'OX';
  const instantQuiz =
    current?.quiz.type === 'OX' ||
    (current?.quiz.type === 'MULTIPLE_CHOICE' &&
      (!isHtmlLessonQuiz(current.quiz) || current.quiz.options?.mockHtmlType === 'single')) ||
    current?.quiz.options?.mockHtmlType === 'blank' ||
    current?.quiz.options?.mockHtmlType === 'single';
  const goNext = async () => {
    if (quizTapLocked.current || task.busy) return;
    quizTapLocked.current = true;
    try {
      if (position === items.length - 1) await complete();
      else setPosition(position + 1);
    } finally {
      quizTapLocked.current = false;
    }
  };
  return (
    <UserScreen title="복습하기" showTitle={false} scroll={false} quiz={oxStage}>
      {oxStage ? <QuizBackdrop /> : null}
      {!notice ? (
        <View
          style={[
            reviewStyles.header,
            oxStage && reviewStyles.quizHeader,
            oxStage && {
              paddingTop: Math.max(0, 60 * quizScale - insets.top),
              paddingHorizontal: 30 * quizScale,
              gap: 20 * quizScale,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="복습 나가기"
            style={oxStage && reviewStyles.quizBack}
            onPress={() => setExitOpen(true)}
          >
            {oxStage ? <QuizBackIcon /> : <Text style={reviewStyles.close}>×</Text>}
          </Pressable>
          {items.length ? (
            <View style={[reviewStyles.progressWrap, oxStage && reviewStyles.quizProgressWrap]}>
              {oxStage ? (
                <Text style={[reviewStyles.caption, reviewStyles.quizCaption]}>
                  복습 · {position + 1}/{items.length}
                </Text>
              ) : null}
              <View style={[reviewStyles.segments, oxStage && reviewStyles.quizSegments]}>
                {items.map((item, index) => (
                  <View
                    key={item.reviewItemId}
                    style={[
                      reviewStyles.segment,
                      oxStage && reviewStyles.quizSegment,
                      index <= position && reviewStyles.segmentOn,
                    ]}
                  />
                ))}
              </View>
              {!oxStage ? (
                <Text style={reviewStyles.caption}>
                  복습 · {position + 1}/{items.length}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      <UserStatus task={task} />
      {notice ? (
        <View style={reviewStyles.completion}>
          <Text style={reviewStyles.check}>✓</Text>
          <Text style={reviewStyles.result}>복습을 마쳤어요</Text>
          <Text style={reviewStyles.summary}>{notice}</Text>
        </View>
      ) : null}
      {set?.message && !notice ? <Text style={styles.text}>{set.message}</Text> : null}
      {current && !notice ? (
        <View style={reviewStyles.stage}>
          <AnimatedReveal
            key={current.reviewItemId}
            style={reviewStyles.stage}
            duration={250}
            offsetY={8}
          >
            <ScrollView
              style={reviewStyles.stage}
              contentContainerStyle={[
                reviewStyles.scrollContent,
                oxStage && reviewStyles.oxScrollContent,
                oxStage && { paddingTop: 200 * quizScale, paddingHorizontal: 36 * quizScale },
              ]}
              keyboardShouldPersistTaps="handled"
            >
              {isHtmlLessonQuiz(current.quiz) && current.quiz.type !== 'OX' ? (
                <HtmlLessonQuiz
                  quiz={current.quiz}
                  disabled={done.includes(current.reviewItemId)}
                  submit={(answer) => api.review.answer(current.reviewItemId, answer)}
                  onGraded={() => setDone((old) => [...old, current.reviewItemId])}
                  registerFooter={registerQuizFooter}
                />
              ) : (
                <QuizCard
                  quiz={current.quiz}
                  disabled={done.includes(current.reviewItemId)}
                  submit={(answer) => api.review.answer(current.reviewItemId, answer)}
                  onGraded={(_result: AnswerResult) =>
                    setDone((old) => [...old, current.reviewItemId])
                  }
                  stage
                  registerFooter={registerQuizFooter}
                />
              )}
            </ScrollView>
          </AnimatedReveal>
        </View>
      ) : null}
      {current && !notice && !instantQuiz && !done.includes(current.reviewItemId) ? (
        <View style={reviewStyles.footer}>
          <Pressable
            accessibilityRole="button"
            disabled={
              task.busy ||
              (!done.includes(current.reviewItemId) &&
                (quizFooter?.quizId !== current.quiz.quizId || !quizFooter?.enabled))
            }
            style={[
              reviewStyles.primary,
              (task.busy ||
                (!done.includes(current.reviewItemId) &&
                  (quizFooter?.quizId !== current.quiz.quizId || !quizFooter?.enabled))) &&
                reviewStyles.disabled,
            ]}
            onPress={
              done.includes(current.reviewItemId)
                ? () =>
                    position === items.length - 1 ? void complete() : setPosition(position + 1)
                : () => quizFooter?.onPress()
            }
          >
            <Text style={reviewStyles.primaryText}>
              {!done.includes(current.reviewItemId)
                ? '정답 확인'
                : position === items.length - 1
                  ? '복습 완료'
                  : '다음'}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {current && !notice && done.includes(current.reviewItemId) ? (
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
      {notice ? (
        <View style={reviewStyles.footer}>
          <Pressable
            accessibilityRole="button"
            style={reviewStyles.primary}
            onPress={() => router.replace('/quiz')}
          >
            <Text style={reviewStyles.primaryText}>완료</Text>
          </Pressable>
        </View>
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
  scrollContent: { flexGrow: 1, paddingHorizontal: 7, paddingTop: 30, paddingBottom: 16 },
  oxScrollContent: { paddingBottom: 0 },
  footer: { paddingBottom: 16 },
  primary: {
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: '#373044',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  completion: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 17,
    paddingHorizontal: 20,
  },
  check: { color: '#877496', fontSize: 72 },
  summary: { color: '#888591', fontSize: 13, textAlign: 'center', lineHeight: 22 },
  result: {
    color: '#282636',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
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
