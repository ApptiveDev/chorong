import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  Content,
  LessonStartResponse,
  LessonCompleteResponse,
  QuizAnswer,
  AnswerResult,
} from '../models';
import { integrationApi as api, useMockApi } from '../runtime';
import { useTask, useIntegration } from '../hooks';
import { positiveId, styles } from '../ui';
import { UserScreen, UserStatus } from './Screen';
import { QuizCard } from './QuizCard';
import { AnimatedReveal } from './AnimatedReveal';
import { LessonQuizWireframe } from '../../components/quiz/LessonQuizWireframe';

export default function StudyScreen() {
  const { generation } = useIntegration();
  return <Study key={generation} />;
}
function Study() {
  const params = useLocalSearchParams<{ lessonId: string; replay?: string; title?: string }>(),
    router = useRouter(),
    task = useTask();
  const [start, setStart] = useState<LessonStartResponse | null>(null),
    [position, setPosition] = useState(0);
  const [answered, setAnswered] = useState<Set<number>>(new Set()),
    [completed, setCompleted] = useState<Set<number>>(new Set());
  const [lessonDone, setLessonDone] = useState(false),
    [reward, setReward] = useState<LessonCompleteResponse | null>(null);
  const [refreshNotice, setRefreshNotice] = useState(''),
    [wallet, setWallet] = useState<{ star: number; stardust: number } | null>(null);
  const replay = params.replay === 'true';
  const lessonId = positiveId(String(params.lessonId));
  useEffect(() => {
    let active = true;
    void task.run(async () => {
      const data = await api.learning.start(lessonId, replay);
      if (!active) return data;
      setStart(data);
      setLessonDone(data.progress.status === 'COMPLETED' && !replay);
      const index =
        data.progress.resumeContentId === null
          ? 0
          : data.contents.findIndex((c) => c.contentId === data.progress.resumeContentId);
      if (data.progress.resumeContentId !== null && index < 0)
        throw new Error('이어하기 위치가 콘텐츠 목록에 없습니다.');
      const lastIndex =
        data.progress.lastContentId === null
          ? -1
          : data.contents.findIndex((c) => c.contentId === data.progress.lastContentId);
      if (data.progress.lastContentId !== null && lastIndex < 0)
        throw new Error('완료 위치가 콘텐츠 목록에 없습니다.');
      setPosition(index);
      setCompleted(new Set(data.contents.slice(0, lastIndex + 1).map((c) => c.contentId)));
      return data;
    });
    return () => {
      active = false;
    };
  }, [lessonId, replay]);
  const contents = start?.contents ?? [],
    current = contents[position];
  const refreshAfterDone = async () => {
    try {
      await api.learning.progress();
      const balance = await api.benefits.wallet();
      setWallet(balance);
      setRefreshNotice('진행도와 잔액을 다시 조회했습니다.');
    } catch (error) {
      setRefreshNotice(
        `완료 처리됨. 후속 조회 실패: ${error instanceof Error ? error.message : '연결 실패'}`,
      );
    }
  };
  const completeContent = (content: Content) =>
    task.run(async () => {
      const result = await api.learning.completeContent(content.contentId);
      setCompleted((previous) => new Set(previous).add(content.contentId));
      if (result.lessonCompleted) {
        setLessonDone(true);
        setReward(result.completion ?? null);
        await refreshAfterDone();
      }
      return result;
    });
  const completeLesson = () =>
    task.run(async () => {
      const result = await api.learning.completeLesson(lessonId);
      setLessonDone(true);
      setReward(result);
      await refreshAfterDone();
      return result;
    });
  const advance = async () => {
    if (!current || task.busy || lessonDone) return;
    if (current.contentType === 'QUIZ' && !answered.has(current.contentId)) return;
    if (!replay && !completed.has(current.contentId)) {
      const result = await completeContent(current);
      if (!result) return;
      if (result.lessonCompleted) return;
    }
    if (position < contents.length - 1) setPosition(position + 1);
    else if (!replay) await completeLesson();
  };
  const last = position === contents.length - 1;
  return (
    <UserScreen title={params.title ?? '학습'} scroll={false}>
      <Pressable accessibilityRole="button" style={s.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={18} color="#273a52" />
        <Text style={s.backText}>레슨 목록</Text>
      </Pressable>
      <Text style={s.progress}>
        {start?.reviewRequired
          ? '선행 복습이 필요합니다.'
          : `${position + 1} / ${contents.length || 0}`}
      </Text>
      <UserStatus task={task} />
      {start?.reviewRequired ? (
        <>
          <Text style={styles.text}>복습을 마친 뒤 이 레슨을 다시 시작하세요.</Text>
          <StudyAction
            label="복습하기"
            onPress={() =>
              router.push({ pathname: '/review', params: { lessonId: String(lessonId) } })
            }
          />
        </>
      ) : null}
      {start && !start.reviewRequired ? (
        <>
          <View style={s.content}>
            {current?.contentType === 'TEXT' ? (
              <DialogueText
                contentId={current.contentId}
                body={current.body}
                disabled={task.busy || lessonDone}
                onPress={() => void advance()}
              />
            ) : current ? (
              <AnimatedReveal key={current.contentId} style={s.content}>
                <ScrollView
                  key={current.contentId}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={s.scrollContent}
                >
                  {current.body ? <Text style={s.body}>{current.body}</Text> : null}
                  {current.contentType === 'IMAGE' && current.mediaUrl ? (
                    <Image
                      source={{ uri: current.mediaUrl }}
                      style={s.media}
                      resizeMode="contain"
                    />
                  ) : null}
                  {current.contentType === 'VIDEO' && current.mediaUrl ? (
                    <StudyAction
                      label="영상 열기"
                      onPress={() => void Linking.openURL(current.mediaUrl!).catch(() => {})}
                    />
                  ) : null}
                  {current.contentType === 'QUIZ' && current.quiz ? (
                    useMockApi ? (
                      <LessonQuizWireframe
                        key={current.contentId}
                        lessonId={lessonId}
                        quiz={current.quiz}
                        disabled={answered.has(current.contentId)}
                        submitLegacy={(answer: QuizAnswer) =>
                          api.learning.answer(current.quiz!.quizId, answer, replay)
                        }
                        onAnswered={() =>
                          setAnswered((previous) => new Set(previous).add(current.contentId))
                        }
                      />
                    ) : (
                      <QuizCard
                        key={current.contentId}
                        quiz={current.quiz}
                        disabled={answered.has(current.contentId)}
                        submit={(answer: QuizAnswer) =>
                          api.learning.answer(current.quiz!.quizId, answer, replay)
                        }
                        onGraded={(_result: AnswerResult) =>
                          setAnswered((previous) => new Set(previous).add(current.contentId))
                        }
                      />
                    )
                  ) : null}
                  {current.contentType === 'QUIZ' && !current.quiz ? (
                    <Text style={styles.error}>퀴즈 내용을 불러오지 못했습니다.</Text>
                  ) : null}
                </ScrollView>
              </AnimatedReveal>
            ) : (
              <View style={s.explanation}>
                <Text style={s.progress}>표시할 콘텐츠가 없습니다.</Text>
              </View>
            )}
          </View>
          <View style={s.footer}>
            {current?.contentType === 'QUIZ' && !answered.has(current.contentId) ? (
              <Text style={s.hint}>답안을 확인한 뒤 다음으로 이동하세요.</Text>
            ) : null}
            {replay ? (
              <Text style={s.hint}>다시 학습 중입니다. 보상은 변경되지 않습니다.</Text>
            ) : null}
            {lessonDone ? (
              <AnimatedReveal style={s.reward} duration={400} delay={120} offsetY={8}>
                <CompletionStar />
                <Text style={s.body}>
                  {reward
                    ? `보상 ${reward.rewards.length}건 · 별 ${reward.wallet.star} · 별가루 ${reward.wallet.stardust}`
                    : '레슨 완료 결과를 받았습니다.'}
                </Text>
                {wallet ? (
                  <Text style={s.body}>
                    현재 잔액: 별 {wallet.star} · 별가루 {wallet.stardust}
                  </Text>
                ) : null}
                {refreshNotice ? <Text style={s.hint}>{refreshNotice}</Text> : null}
              </AnimatedReveal>
            ) : null}
            <View style={s.actions}>
              <StudyAction
                label="이전"
                secondary
                disabled={position === 0 || task.busy}
                onPress={() => setPosition(position - 1)}
              />
              <StudyAction
                label={lessonDone || (replay && last) ? '레슨 목록' : last ? '레슨 완료' : '다음'}
                disabled={
                  !current ||
                  task.busy ||
                  (!lessonDone &&
                    current?.contentType === 'QUIZ' &&
                    !answered.has(current.contentId))
                }
                onPress={
                  lessonDone || (replay && last) ? () => router.back() : () => void advance()
                }
              />
            </View>
          </View>
        </>
      ) : null}
    </UserScreen>
  );
}

function StudyAction({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.action, secondary && s.secondary, disabled && s.disabled]}
    >
      <Text style={[s.actionText, secondary && s.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

function DialogueText({
  contentId,
  body,
  disabled,
  onPress,
}: {
  contentId: number;
  body: string | null;
  disabled: boolean;
  onPress: () => void;
}) {
  const [visible, setVisible] = useState(body);
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const previous = useRef({ contentId, body });
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    const changed = previous.current.contentId !== contentId;
    progress.stopAnimation();
    progress.setValue(0);
    setOutgoing(changed ? previous.current.body : null);
    setVisible(body);
    previous.current = { contentId, body };
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduceMotion) => {
        if (!active) return;
        if (reduceMotion) {
          progress.setValue(1);
          setOutgoing(null);
          return;
        }
        Animated.timing(progress, {
          toValue: 1,
          duration: 280,
          delay: changed ? 80 : 0,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }).start(({ finished }) => {
          if (active && finished) setOutgoing(null);
        });
      });
    return () => {
      active = false;
      progress.stopAnimation();
    };
  }, [body, contentId, progress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="다음 학습 콘텐츠로 이동"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={s.explanation}
    >
      {outgoing !== null ? (
        <Animated.View
          pointerEvents="none"
          style={[
            s.dialogueOverlay,
            {
              opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              transform: [
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
              ],
            },
          ]}
        >
          <Text style={s.explanationText}>{outgoing}</Text>
        </Animated.View>
      ) : null}
      <Animated.View
        style={{
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
        }}
      >
        <Text style={s.explanationText}>{visible}</Text>
      </Animated.View>
    </Pressable>
  );
}

function CompletionStar() {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduceMotion) => {
        if (!active || reduceMotion) return;
        Animated.sequence([
          Animated.delay(300),
          Animated.timing(progress, {
            toValue: 1,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: Platform.OS !== 'web',
          }),
          Animated.timing(progress, {
            toValue: 2,
            duration: 700,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: Platform.OS !== 'web',
          }),
        ]).start();
      });
    return () => {
      active = false;
      progress.stopAnimation();
    };
  }, [progress]);
  const opacity = progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] });
  return (
    <Animated.View pointerEvents="none" style={s.starOverlay}>
      <Animated.View
        style={[
          s.starGlow,
          {
            opacity: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0.12, 0] }),
            transform: [
              {
                scale: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0.5, 1.6, 2] }),
              },
            ],
          },
        ]}
      />
      <Animated.View
        style={{
          opacity,
          transform: [
            { scale: progress.interpolate({ inputRange: [0, 1, 2], outputRange: [0.7, 1.2, 1] }) },
          ],
        }}
      >
        <Ionicons name="star" size={24} color="#273a52" />
      </Animated.View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2 },
  backText: { color: '#273a52', fontSize: 12 },
  progress: { color: '#7b8795', fontSize: 12 },
  content: { flex: 1, minHeight: 0 },
  explanation: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  dialogueOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  explanationText: { color: '#273a52', fontSize: 17, lineHeight: 28, textAlign: 'center' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', gap: 14, paddingVertical: 12 },
  body: { color: '#273a52', fontSize: 14, lineHeight: 21 },
  media: { height: 260, width: '100%' },
  footer: { gap: 8, paddingBottom: 8 },
  hint: { color: '#7b8795', fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 8 },
  action: {
    flex: 1,
    minHeight: 44,
    borderRadius: 5,
    backgroundColor: '#273a52',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#dce2e8' },
  secondaryText: { color: '#273a52' },
  disabled: { opacity: 0.45 },
  reward: { padding: 12, borderRadius: 6, backgroundColor: '#eef2f5', gap: 4 },
  starOverlay: {
    position: 'absolute',
    top: 0,
    right: 16,
    bottom: 0,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starGlow: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#273a52',
  },
});
