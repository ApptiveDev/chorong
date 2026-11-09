import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  Animated,
  Easing,
  Image,
  type ImageSourcePropType,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { HtmlLessonQuiz, isHtmlLessonQuiz } from './HtmlLessonQuiz';
import { AnimatedReveal } from './AnimatedReveal';
import { LessonQuizWireframe } from '../../components/quiz/LessonQuizWireframe';
import { HomeStars } from './CoursesScreen';
import type { RegisterQuizFooter } from './quizFooter';

const completionStarSource = require('../../../assets/completion-star.png');
const completionArcSource = require('../../../assets/completion-arc.png');
const completionDustSource = require('../../../assets/completion-dust.png');
const localStudyImages: Record<string, ImageSourcePropType> = {
  'mock-study-fusion': require('../../../assets/study-fusion.png'),
  'mock-study-mass': require('../../../assets/study-mass.png'),
  'mock-study-star': require('../../../assets/study-star.png'),
};

function studyImageSource(mediaUrl: string): ImageSourcePropType {
  return localStudyImages[mediaUrl] ?? { uri: mediaUrl };
}

export default function StudyScreen() {
  const { generation } = useIntegration();
  return <Study key={generation} />;
}
function Study() {
  const session = useIntegration();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
      lessonId: string;
      replay?: string;
      resume?: string;
      title?: string;
      fromWelcome?: string;
    }>(),
    router = useRouter(),
    task = useTask();
  const [start, setStart] = useState<LessonStartResponse | null>(null),
    [position, setPosition] = useState(0);
  const [dialogueReveal, setDialogueReveal] = useState({ contentId: 0, count: 1 });
  const [answered, setAnswered] = useState<Set<number>>(new Set()),
    [completed, setCompleted] = useState<Set<number>>(new Set());
  const [lessonDone, setLessonDone] = useState(false),
    [reward, setReward] = useState<LessonCompleteResponse | null>(null);
  const [showConstellation, setShowConstellation] = useState(false);
  const [quizFooter, setQuizFooter] = useState<{
    quizId: number;
    enabled: boolean;
    onPress: () => void;
  } | null>(null);
  const registerQuizFooter = useCallback<RegisterQuizFooter>((quizId, enabled, onPress) => {
    setQuizFooter({ quizId, enabled, onPress });
  }, []);
  const [constellationName, setConstellationName] = useState('별자리');
  const [constellationDate, setConstellationDate] = useState<string | null>(null);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [resumePosition, setResumePosition] = useState(0);
  const [refreshNotice, setRefreshNotice] = useState(''),
    [wallet, setWallet] = useState<{ star: number; stardust: number } | null>(null);
  const replay = params.replay === 'true';
  const lessonId = positiveId(String(params.lessonId));
  const leaveStudy = () => router.replace('/quiz');
  const firstGuestStudy = params.fromWelcome === 'true' && session.user?.status === 'GUEST';
  const finishStudyFlow = () =>
    firstGuestStudy
      ? router.replace({ pathname: '/quiz', params: { view: 'join' } })
      : router.replace('/quiz');
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
      setResumePosition(index);
      if (!replay && (params.resume === 'true' || data.progress.lastContentId !== null))
        setResumeOpen(true);
      setCompleted(new Set(data.contents.slice(0, lastIndex + 1).map((c) => c.contentId)));
      return data;
    });
    return () => {
      active = false;
    };
  }, [lessonId, replay]);
  useEffect(() => {
    if (!start) return;
    const urls = new Set(
      start.contents
        .filter((content) => content.contentType === 'IMAGE' && content.mediaUrl)
        .map((content) => content.mediaUrl!)
        .filter((url) => !localStudyImages[url]),
    );
    urls.forEach((url) => {
      void Image.prefetch(url).catch(() => false);
    });
  }, [start]);
  const preloadSources: { source: ImageSourcePropType; width: number; height: number }[] = start
    ? [
        { source: completionStarSource, width: 212, height: 212 },
        { source: completionArcSource, width: 402, height: 463 },
        { source: completionDustSource, width: 18, height: 20 },
        ...Object.entries(localStudyImages)
          .filter(([mediaUrl]) =>
            start.contents.some(
              (content) => content.contentType === 'IMAGE' && content.mediaUrl === mediaUrl,
            ),
          )
          .map(([, source]) => ({ source, width: 354, height: 267 })),
      ]
    : [];
  const contents = start?.contents ?? [],
    current = contents[position];
  const progressLabel = current?.quiz?.options?.mockHtmlType
    ? String(current.quiz.options.label ?? params.title ?? '학습')
    : current?.mediaUrl?.startsWith('mock-study-')
      ? current.mediaUrl === 'mock-study-star'
        ? '다른 별'
        : current.mediaUrl === 'mock-study-mass'
          ? '줄어든 질량'
          : '핵융합'
      : current?.contentType === 'TEXT' && current.contentId >= 1101 && current.contentId <= 1114
        ? current.contentId === 1102
          ? '핵융합'
          : '줄어든 질량'
        : (params.title ?? '학습');
  const dialogue = current?.contentType === 'TEXT' ? getDialogueContent(current) : null;
  const visibleDialogueCount =
    dialogueReveal.contentId === current?.contentId ? dialogueReveal.count : 1;
  const dialogueStack =
    dialogue && current ? getDialogueStack(contents, position, visibleDialogueCount) : null;
  const refreshAfterDone = async (completion?: LessonCompleteResponse | null) => {
    try {
      await api.learning.progress();
      const balance = await api.benefits.wallet();
      setWallet(balance);
      try {
        const lesson = await api.learning.lesson(lessonId);
        const constellations = await api.benefits.constellations();
        setConstellationName(
          constellations.constellations.find((item) => item.courseId === lesson.courseId)?.name ??
            '별자리',
        );
        if (completion?.rewards.some((item) => item.type === 'CONSTELLATION')) {
          let cursor: string | null = null;
          do {
            const page = await api.benefits.rewards({ size: 100, ...(cursor ? { cursor } : {}) });
            const record = page.data.rewards.find(
              (item) =>
                item.type === 'CONSTELLATION' && Number(item.source.courseId) === lesson.courseId,
            );
            if (record) {
              const date = new Date(new Date(record.grantedAt).getTime() + 9 * 60 * 60 * 1000);
              setConstellationDate(date.toISOString().slice(0, 10).replaceAll('-', '.'));
              break;
            }
            cursor = page.meta.nextCursor;
          } while (cursor);
        }
      } catch {
        // 완료 결과는 별자리 이름 조회 실패와 관계없이 표시한다.
      }
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
        await refreshAfterDone(result.completion);
      }
      return result;
    });
  const completeLesson = () =>
    task.run(async () => {
      const result = await api.learning.completeLesson(lessonId);
      setLessonDone(true);
      setReward(result);
      await refreshAfterDone(result);
      return result;
    });
  const advance = async () => {
    if (!current || task.busy || lessonDone) return;
    if (current.contentType === 'QUIZ' && !answered.has(current.contentId)) return;
    if (dialogue && visibleDialogueCount < dialogue.messages.length) {
      setDialogueReveal({ contentId: current.contentId, count: visibleDialogueCount + 1 });
      return;
    }
    if (!replay && !completed.has(current.contentId)) {
      const result = await completeContent(current);
      if (!result) return;
      if (result.lessonCompleted) return;
    }
    if (position < contents.length - 1) setPosition(position + 1);
    else if (!replay) await completeLesson();
  };
  const last = position === contents.length - 1;
  const stardustReward =
    reward?.rewards.find((item) => item.type === 'WALLET' && item.currency === 'STARDUST')
      ?.amount ?? 0;
  const constellationCompleted =
    reward?.courseCompleted && reward.rewards.some((item) => item.type === 'CONSTELLATION');
  const constellationBonus = constellationCompleted
    ? (reward?.rewards.filter((item) => item.type === 'WALLET' && item.currency === 'STARDUST')[1]
        ?.amount ?? 0)
    : 0;
  const completionView = Boolean(
    start && !start.reviewRequired && lessonDone && !showConstellation,
  );
  const completionScale = Math.min(Math.min(windowWidth, 480) / 402, windowHeight / 874, 1);
  const completionTop = (value: number) => Math.max(0, value * completionScale - insets.top);
  return (
    <UserScreen
      title={params.title ?? '학습'}
      scroll={false}
      showTitle={false}
      completion={completionView}
    >
      {completionView ? <StatusBar style="light" /> : null}
      {start ? (
        <View pointerEvents="none" style={s.imagePreload}>
          {preloadSources.map(({ source, width, height }, index) => (
            <Image key={index} source={source} style={{ width, height }} />
          ))}
        </View>
      ) : null}
      {!showConstellation && !completionView ? (
        <View style={s.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="학습 나가기"
            style={s.back}
            onPress={() => (lessonDone ? leaveStudy() : setExitOpen(true))}
          >
            <Ionicons name="close" size={24} color="#282636" />
          </Pressable>
          <View style={s.progressWrap}>
            <View style={s.segments}>
              {contents.map((content, index) => (
                <View
                  key={content.contentId}
                  style={[s.segment, index <= position && s.segmentOn]}
                />
              ))}
            </View>
            <Text style={s.progress}>
              {start?.reviewRequired
                ? '선행 복습 필요'
                : `${progressLabel} · ${contents.length ? position + 1 : 0}/${contents.length}`}
            </Text>
          </View>
        </View>
      ) : null}
      {completionView ? (
        <View style={s.completionStatus}>
          <UserStatus task={task} />
        </View>
      ) : (
        <UserStatus task={task} />
      )}
      {replay && !lessonDone ? (
        <Text style={s.hint}>다시 학습 중입니다. 보상은 변경되지 않습니다.</Text>
      ) : null}
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
            {lessonDone && showConstellation ? (
              <View style={s.constellationCompletion}>
                <Text style={s.constellationLabel}>탐험의 기록</Text>
                <View style={s.constellationPicture}>
                  <HomeStars progress={1} height={140} />
                </View>
                <Text style={s.constellationTitle}>{constellationName}</Text>
                <Text style={s.constellationSubtitle}>작은 별들이 하나의 이야기가 되었어요.</Text>
                <Text style={s.constellationDate}>
                  {constellationDate ??
                    new Date(Date.now() + 9 * 60 * 60 * 1000)
                      .toISOString()
                      .slice(0, 10)
                      .replaceAll('-', '.')}{' '}
                  완성
                </Text>
                {constellationBonus > 0 ? (
                  <Text style={s.constellationReward}>
                    완성 보너스 · 별가루 +{constellationBonus}
                  </Text>
                ) : null}
              </View>
            ) : lessonDone ? (
              <View style={s.completion}>
                <Image
                  source={completionArcSource}
                  resizeMode="stretch"
                  style={[
                    s.completionArc,
                    {
                      top: completionTop(209),
                      height: 463 * completionScale,
                    },
                  ]}
                />
                <View style={[s.completionStarWrap, { top: completionTop(124) }]}>
                  <CompletionStar size={212 * completionScale} />
                </View>
                <Text style={[s.resultTitle, { top: completionTop(400) }]}>별을 밝혔어요 !</Text>
                <View style={[s.resultSubtitleUnderline, { top: completionTop(458) }]}>
                  <Text style={s.resultSubtitle}>{params.title ?? '학습'}</Text>
                </View>
                {stardustReward > 0 ? (
                  <View style={[s.rewardRow, { top: completionTop(520) }]}>
                    <Image
                      source={completionDustSource}
                      style={s.rewardIcon}
                      resizeMode="contain"
                    />
                    <Text style={s.rewardAmount}>별가루 +{stardustReward}</Text>
                  </View>
                ) : null}
                {constellationCompleted || wallet || refreshNotice.startsWith('완료 처리됨') ? (
                  <View style={[s.completionDetails, { top: completionTop(556) }]}>
                    {constellationCompleted ? (
                      <Text style={s.completionDetail}>별자리가 완성되었어요.</Text>
                    ) : null}
                    {wallet ? (
                      <Text style={s.completionBalance}>보유 별가루: {wallet.stardust}</Text>
                    ) : null}
                    {refreshNotice.startsWith('완료 처리됨') ? (
                      <Text style={s.completionDetail}>{refreshNotice}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : current?.contentType === 'TEXT' ? (
              <DialogueText
                messages={dialogueStack?.messages ?? []}
                source={dialogueStack?.source}
                disabled={task.busy || lessonDone}
                onPress={() => void advance()}
              />
            ) : current ? (
              <AnimatedReveal key={current.contentId} style={s.content}>
                <ScrollView
                  key={current.contentId}
                  style={s.content}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={
                    current.contentType === 'QUIZ' ? s.quizScrollContent : s.scrollContent
                  }
                >
                  {current.body && (current.contentType !== 'IMAGE' || !current.mediaUrl) ? (
                    <Text style={current.contentType === 'QUIZ' ? s.quizBody : s.body}>
                      {current.body}
                    </Text>
                  ) : null}
                  {current.contentType === 'IMAGE' && current.mediaUrl ? (
                    <>
                      <Text style={s.conceptTitle}>{progressLabel}</Text>
                      <View style={s.conceptImage}>
                        <Image
                          source={studyImageSource(current.mediaUrl)}
                          style={[
                            s.media,
                            current.mediaUrl.startsWith('mock-study-') && s.htmlMedia,
                          ]}
                          resizeMode="contain"
                        />
                      </View>
                      {current.body ? <Text style={s.body}>{current.body}</Text> : null}
                    </>
                  ) : null}
                  {current.contentType === 'VIDEO' && current.mediaUrl ? (
                    <StudyAction
                      label="영상 열기"
                      onPress={() => void Linking.openURL(current.mediaUrl!).catch(() => {})}
                    />
                  ) : null}
                  {current.contentType === 'QUIZ' && current.quiz ? (
                    useMockApi && isHtmlLessonQuiz(current.quiz) ? (
                      <HtmlLessonQuiz
                        key={current.contentId}
                        quiz={current.quiz}
                        disabled={answered.has(current.contentId)}
                        submit={(answer) =>
                          api.learning.answer(current.quiz!.quizId, answer, replay)
                        }
                        onGraded={() =>
                          setAnswered((previous) => new Set(previous).add(current.contentId))
                        }
                        registerFooter={registerQuizFooter}
                      />
                    ) : useMockApi ? (
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
                        stage
                        registerFooter={registerQuizFooter}
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
                        stage
                        registerFooter={registerQuizFooter}
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
          <View
            style={[
              s.footer,
              completionView && s.completionFooter,
              completionView && { bottom: Math.max(12, 89 * completionScale - insets.bottom) },
            ]}
          >
            {showConstellation ? (
              <>
                <StudyAction
                  label="별자리 기록 보기"
                  onPress={() => router.replace({ pathname: '/quiz', params: { view: 'record' } })}
                />
                <Pressable
                  accessibilityRole="button"
                  style={s.constellationHomeLink}
                  onPress={leaveStudy}
                >
                  <Text style={s.constellationHomeText}>학습 홈으로</Text>
                </Pressable>
              </>
            ) : (
              <>
                <StudyAction
                  completion={completionView}
                  label={
                    !lessonDone &&
                    current?.contentType === 'QUIZ' &&
                    !answered.has(current.contentId)
                      ? '정답 확인'
                      : lessonDone
                        ? '완료'
                        : replay && last
                          ? '레슨 목록'
                          : last
                            ? '레슨 완료'
                            : '다음'
                  }
                  secondary={current?.contentType === 'TEXT' && !lessonDone}
                  disabled={
                    !current ||
                    task.busy ||
                    (current.contentType === 'QUIZ' &&
                      !answered.has(current.contentId) &&
                      (quizFooter?.quizId !== current.quiz?.quizId || !quizFooter?.enabled))
                  }
                  onPress={
                    !lessonDone &&
                    current?.contentType === 'QUIZ' &&
                    !answered.has(current.contentId)
                      ? () => quizFooter?.onPress()
                      : lessonDone
                        ? () =>
                            firstGuestStudy
                              ? finishStudyFlow()
                              : constellationCompleted
                                ? setShowConstellation(true)
                                : leaveStudy()
                        : replay && last
                          ? leaveStudy
                          : () => void advance()
                  }
                />
                {!completionView ? (
                  <View style={s.previousSlot}>
                    {!lessonDone && position > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={task.busy}
                        onPress={() => setPosition(position - 1)}
                        style={s.previous}
                      >
                        <Text style={s.previousText}>이전</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </>
            )}
          </View>
        </>
      ) : null}
      <Modal
        visible={resumeOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setResumeOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalPanel}>
            <Text style={s.modalTitle}>이어서 탐험할까요?</Text>
            <Text style={s.modalCopy}>마지막으로 보던 부분부터 이어갈 수 있어요.</Text>
            <View style={s.modalActions}>
              <Pressable
                accessibilityRole="button"
                style={s.modalSecondary}
                onPress={() => {
                  setPosition(0);
                  setResumeOpen(false);
                }}
              >
                <Text style={s.modalSecondaryText}>처음부터</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={s.modalPrimary}
                onPress={() => {
                  setPosition(resumePosition);
                  setResumeOpen(false);
                }}
              >
                <Text style={s.modalPrimaryText}>이어서</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={exitOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExitOpen(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalPanel}>
            <Text style={s.modalTitle}>잠시 탐험을 멈출까요?</Text>
            <Text style={s.modalCopy}>여기까지의 진행은 저장돼요. 다음에 이어서 볼 수 있어요.</Text>
            <View style={s.modalActions}>
              <Pressable
                accessibilityRole="button"
                style={s.modalSecondary}
                onPress={() => setExitOpen(false)}
              >
                <Text style={s.modalSecondaryText}>계속 학습하기</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={s.modalPrimary} onPress={leaveStudy}>
                <Text style={s.modalPrimaryText}>나가기</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </UserScreen>
  );
}

function StudyAction({
  label,
  onPress,
  secondary = false,
  disabled = false,
  completion = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  completion?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.action,
        secondary && s.secondary,
        completion && s.completionAction,
        disabled && s.disabled,
      ]}
    >
      <Text
        style={[s.actionText, secondary && s.secondaryText, completion && s.completionActionText]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type DialogueMessage = {
  key: string;
  speaker: '초롱이' | '별지기';
  text: string;
};

function getDialogueContent(content: Content): { messages: DialogueMessage[]; source?: string } {
  const raw = content.body?.trim() ?? '';
  const sourceMatch = raw.match(/(?:^|\r?\n)\s*((?:출처\s*[·:]|Source\s*:)[^\r\n]*)\s*$/i);
  const body = sourceMatch ? raw.slice(0, sourceMatch.index).trim() : raw;
  const turns = [...body.matchAll(/(?:^|\r?\n)\s*(초롱이|별지기)\s*[:：]\s*/g)];
  const messages: DialogueMessage[] =
    turns.length && turns[0].index === 0
      ? turns.map((turn, index) => ({
          key: `${content.contentId}-${index}`,
          speaker: turn[1] as DialogueMessage['speaker'],
          text: body.slice(turn.index + turn[0].length, turns[index + 1]?.index).trim(),
        }))
      : body
        ? [{ key: `${content.contentId}-0`, speaker: '별지기', text: body }]
        : [];
  return { messages, source: sourceMatch?.[1] };
}

function getDialogueStack(
  contents: Content[],
  position: number,
  visibleCount: number,
): { messages: DialogueMessage[]; source?: string } {
  let first = position;
  while (first > 0 && contents[first - 1].contentType === 'TEXT') first -= 1;

  const messages: DialogueMessage[] = [];
  let source: string | undefined;
  for (let index = first; index <= position; index += 1) {
    const entry = getDialogueContent(contents[index]);
    messages.push(...(index === position ? entry.messages.slice(0, visibleCount) : entry.messages));
    if (entry.source) source = entry.source;
  }
  return { messages, source };
}

function DialogueText({
  messages,
  source,
  disabled,
  onPress,
}: {
  messages: DialogueMessage[];
  source?: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const scroll = useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={scroll}
      style={s.content}
      contentContainerStyle={s.explanationScroll}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityHint="다음 학습 콘텐츠로 이동"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={s.explanation}
      >
        <View style={s.dialogue}>
          {messages.map((message) => (
            <AnimatedReveal
              key={message.key}
              duration={280}
              offsetY={8}
              style={[s.bubble, message.speaker === '초롱이' && s.catBubble]}
            >
              <Text style={s.bubbleLabel}>{message.speaker}</Text>
              <Text style={s.explanationText}>{message.text}</Text>
            </AnimatedReveal>
          ))}
        </View>
        {source ? <Text style={s.source}>{source}</Text> : null}
      </Pressable>
    </ScrollView>
  );
}

function CompletionStar({ size }: { size: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const started = useRef(false);
  useEffect(() => {
    return () => progress.stopAnimation();
  }, [progress]);
  const reveal = () => {
    if (started.current) return;
    started.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: 700,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        opacity: progress,
        transform: [
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
          { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-10deg', '0deg'] }) },
        ],
      }}
    >
      <Image
        source={completionStarSource}
        onLoad={reveal}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingTop: 8 },
  progressWrap: { flex: 1, gap: 9, paddingTop: 10 },
  segments: { flexDirection: 'row', gap: 4, height: 4 },
  segment: { flex: 1, borderRadius: 4, backgroundColor: '#eeecf1' },
  segmentOn: { backgroundColor: '#494050' },
  back: { alignItems: 'center', justifyContent: 'center', width: 38, height: 38 },
  progress: { color: '#888591', fontSize: 12 },
  resultTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    color: '#f1f1f1',
    fontSize: 24,
    fontFamily: 'PretendardBold',
    textAlign: 'center',
    textShadowColor: '#f1f1f1',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  resultSubtitleUnderline: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '80%',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#aaa',
  },
  resultSubtitle: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 16,
    includeFontPadding: false,
    fontFamily: 'PretendardLight',
    textAlign: 'center',
  },
  rewardAmount: {
    color: '#ffde23',
    fontSize: 16,
    fontFamily: 'PretendardLight',
    textShadowColor: '#f1f1f1',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
  completion: { flex: 1, alignItems: 'center', backgroundColor: '#161616' },
  imagePreload: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  completionStatus: { position: 'absolute', top: 4, alignSelf: 'center', zIndex: 2 },
  completionArc: { position: 'absolute', left: 0, right: 0, width: '100%' },
  completionStarWrap: { position: 'absolute', alignSelf: 'center' },
  rewardRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  rewardIcon: { width: 18, height: 20 },
  completionDetails: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 3 },
  completionDetail: { color: '#aaa', fontSize: 12, fontFamily: 'PretendardLight' },
  completionBalance: {
    color: '#aaa',
    fontSize: 12,
    fontFamily: 'PretendardRegular',
    fontWeight: '400',
    textAlign: 'center',
  },
  constellationCompletion: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  constellationLabel: { color: '#a49caf', fontSize: 12, letterSpacing: 1 },
  constellationPicture: { width: '100%', marginTop: 25 },
  constellationTitle: { color: '#282636', fontSize: 25, fontWeight: '700', marginTop: 18 },
  constellationSubtitle: { color: '#888591', fontSize: 14, marginTop: 17, textAlign: 'center' },
  constellationDate: { color: '#888591', fontSize: 12, marginTop: 24 },
  constellationReward: {
    color: '#aa8746',
    backgroundColor: '#faf6ec',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingVertical: 12,
    marginTop: 27,
    fontSize: 13,
  },
  constellationHomeLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  constellationHomeText: { color: '#817790', fontSize: 13 },
  content: { flex: 1, minHeight: 0 },
  explanationScroll: { flexGrow: 1 },
  explanation: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 7, paddingVertical: 22 },
  dialogue: { gap: 24 },
  bubble: { borderRadius: 20, backgroundColor: '#f4f1f8', padding: 20 },
  catBubble: { backgroundColor: '#fbf7ed', marginLeft: 38 },
  bubbleLabel: { color: '#9c8ca9', fontSize: 12, marginBottom: 7 },
  explanationText: { color: '#282636', fontSize: 17, lineHeight: 32 },
  source: { color: '#b0a7b9', fontSize: 11, lineHeight: 19, marginTop: 15 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 23,
    paddingVertical: 22,
    paddingHorizontal: 7,
  },
  quizScrollContent: {
    flexGrow: 1,
    gap: 15,
    paddingTop: 30,
    paddingBottom: 16,
    paddingHorizontal: 7,
  },
  body: { color: '#282636', fontSize: 17, lineHeight: 32 },
  conceptTitle: {
    color: '#756387',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
  },
  quizBody: { color: '#888591', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  conceptImage: {
    borderWidth: 1,
    borderColor: '#e9e4ee',
    borderRadius: 19,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  media: { height: 220, width: '100%' },
  htmlMedia: { height: 267 },
  footer: { gap: 8, paddingBottom: 16, backgroundColor: '#fff' },
  completionFooter: {
    position: 'absolute',
    alignSelf: 'center',
    width: '80%',
    maxWidth: 322,
    height: 48,
    paddingBottom: 0,
    gap: 0,
    backgroundColor: 'transparent',
  },
  previousSlot: { minHeight: 28, justifyContent: 'center' },
  previous: { alignSelf: 'center', minHeight: 28, paddingHorizontal: 12, justifyContent: 'center' },
  previousText: { color: '#8e8498', fontSize: 12 },
  hint: { color: '#7b8795', fontSize: 12, lineHeight: 18 },
  action: {
    width: '100%',
    minHeight: 52,
    borderRadius: 13,
    backgroundColor: '#373044',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  completionAction: {
    minHeight: 48,
    borderRadius: 4,
    backgroundColor: '#f1f1f1',
    boxShadow: '0px 0px 4px 0px #f1f1f1',
  },
  completionActionText: {
    color: '#161616',
    fontSize: 16,
    fontFamily: 'PretendardRegular',
    fontWeight: '400',
  },
  secondary: { backgroundColor: '#f3f1f6' },
  secondaryText: { color: '#655b76' },
  disabled: { opacity: 0.45 },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#34273c63',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalPanel: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 23,
    padding: 25,
    gap: 12,
  },
  modalTitle: { color: '#282636', fontSize: 20, fontWeight: '700' },
  modalCopy: { color: '#807188', fontSize: 13, lineHeight: 22 },
  modalActions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  modalPrimary: {
    flex: 1,
    minHeight: 45,
    borderRadius: 13,
    backgroundColor: '#373044',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  modalSecondary: {
    flex: 1,
    minHeight: 45,
    borderRadius: 13,
    backgroundColor: '#f3f1f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryText: { color: '#655b76', fontSize: 13, fontWeight: '600' },
});
