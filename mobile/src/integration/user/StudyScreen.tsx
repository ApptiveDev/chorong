import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  Image,
  type ImageSourcePropType,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Content, LessonStartResponse, LessonCompleteResponse } from '../models';
import { integrationApi as api } from '../runtime';
import { isConstellationReward } from '../contract';
import { replayCompletion } from '../completionResult';
import { useTask, useIntegration } from '../hooks';
import { positiveId, styles } from '../ui';
import { UserScreen, UserStatus } from './Screen';
import { SessionConfirmModal } from './SessionConfirmModal';
import { QuizBackdrop, QuizBackIcon } from './QuizBackdrop';
import { QuizStageQuiz, quizScrollContentStyle, quizStageKind } from './QuizStage';
import { AnimatedReveal } from './AnimatedReveal';
import { NarrationDialogue } from './NarrationDialogue';
import { toNarrationContent } from './narrationContent';
import { ConceptIllustration } from './ConceptIllustration';
import { localStudyImages, prefetchLessonImages } from './lessonImagePreload';
import { ConstellationComplete } from './ConstellationComplete';
import { constellationImage, formatDotDate, starLayout } from './constellationRecord';
import { FirstStudyLoginModal } from './FirstStudyLoginModal';
import {
  CompletionResult,
  CompletionStar,
  EnergyIcon,
  completionOrbSource,
} from './CompletionResult';

const completionStarSource = require('../../../assets/completion-star.png');
const completionArcSource = require('../../../assets/completion-arc.png');
const completionDustSource = require('../../../assets/completion-dust.png');

export default function StudyScreen() {
  const { generation } = useIntegration();
  return <Study key={generation} />;
}
function Study() {
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
  // 온보딩 '첫 학습 시작하기'로 들어온 비회원(GUEST)의 첫 학습. 완료 후 로그인 유도 모달을 띄운다.
  const { user } = useIntegration();
  const [loginOpen, setLoginOpen] = useState(false);
  // 레슨 시작 전 에너지. 완료 응답의 지갑 에너지와 비교해 실제로 쓴 만큼만 표시한다.
  const [energyBefore, setEnergyBefore] = useState<number | null>(null);
  const quizTapLocked = useRef(false);
  const conceptTapLocked = useRef(false);
  const conceptUnlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedLessonId = useRef<number | null>(null);
  const [constellationName, setConstellationName] = useState('별자리');
  const [constellationDate, setConstellationDate] = useState<string | null>(null);
  // 별자리 완성 화면의 별 그림. API-906 의 별자리 ID·별 수·그림 주소.
  const [constellationFigure, setConstellationFigure] = useState<{
    constellationId: number | null;
    starCount: number;
    imageUrl: string | null;
  } | null>(null);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [resumePosition, setResumePosition] = useState(0);
  const [refreshNotice, setRefreshNotice] = useState(''),
    [wallet, setWallet] = useState<{ stardust: number } | null>(null);
  const replay = params.replay === 'true';
  const lessonId = positiveId(String(params.lessonId));
  const leaveStudy = () => router.replace('/quiz');
  useEffect(() => {
    let active = true;
    void task.run(async () => {
      try {
        const balance = await api.benefits.wallet();
        if (active && typeof balance.energy === 'number') setEnergyBefore(balance.energy);
      } catch {
        // 에너지 표시는 선택 정보라 조회 실패와 관계없이 학습을 시작한다.
      }
      const data = await api.learning.start(lessonId, replay);
      if (!active) return data;
      loadedLessonId.current = lessonId;
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
      setPosition(replay ? 0 : index);
      setResumePosition(replay ? 0 : index);
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
    if (!start || loadedLessonId.current !== lessonId) return;
    let active = true;
    void prefetchLessonImages(start.contents, () => active);
    return () => {
      active = false;
    };
  }, [start, lessonId]);
  useEffect(
    () => () => {
      if (conceptUnlockTimer.current) clearTimeout(conceptUnlockTimer.current);
    },
    [],
  );
  const preloadSources: { source: ImageSourcePropType; width: number; height: number }[] =
    start && loadedLessonId.current === lessonId
      ? [
          { source: completionStarSource, width: 212, height: 212 },
          { source: completionArcSource, width: 402, height: 463 },
          { source: completionDustSource, width: 18, height: 20 },
          ...(replay ? [{ source: completionOrbSource, width: 164, height: 164 }] : []),
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
  const quizStage = !lessonDone && current?.contentType === 'QUIZ';
  const narrationStage = !lessonDone && current?.contentType === 'TEXT';
  const conceptStage = !lessonDone && current?.contentType === 'IMAGE';
  const designedStage = quizStage || narrationStage || conceptStage;
  // 문항 유형 판별은 복습 화면과 같은 QuizStage 기준을 쓴다.
  const quizKind = quizStage ? quizStageKind(current.quiz) : null;
  const quizScale = Math.min(windowWidth / 402, windowHeight / 874, 1);
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
  const dialogue = current?.contentType === 'TEXT' ? toNarrationContent(current) : null;
  const visibleDialogueCount =
    dialogueReveal.contentId === current?.contentId ? dialogueReveal.count : 1;
  const refreshAfterDone = async (completion?: LessonCompleteResponse | null) => {
    try {
      await api.learning.progress();
      const balance = await api.benefits.wallet();
      setWallet(balance);
      try {
        const lesson = await api.learning.lesson(lessonId);
        const constellations = await api.benefits.constellations();
        const constellation = constellations.constellations.find(
          (item) => item.courseId === lesson.courseId,
        );
        setConstellationName(constellation?.name ?? '별자리');
        setConstellationFigure(
          constellation
            ? {
                constellationId: constellation.constellationId,
                starCount: constellation.starCount,
                imageUrl: constellation.imageUrl,
              }
            : null,
        );
        if (completion?.rewards.some(isConstellationReward)) {
          let cursor: string | null = null;
          do {
            const page = await api.benefits.rewards({ size: 100, ...(cursor ? { cursor } : {}) });
            const record = page.data.rewards.find(
              (item) =>
                isConstellationReward(item) && Number(item.source.courseId) === lesson.courseId,
            );
            if (record) {
              setConstellationDate(formatDotDate(record.grantedAt));
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
        // 다시 하기는 completion 이 null(이미 받은 레슨)이거나 미지급 별가루 지급 결과다(API-405).
        setReward(result.completion ?? null);
        if (!replay) await refreshAfterDone(result.completion);
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
  const advance = async (justGraded = false) => {
    if (!current || lessonDone) return;
    if (task.busy) {
      if (justGraded) throw new Error('다음 콘텐츠로 이동하지 못했습니다.');
      return;
    }
    if (current.contentType === 'QUIZ' && !answered.has(current.contentId) && !justGraded) return;
    if (dialogue && visibleDialogueCount < dialogue.messages.length) {
      setDialogueReveal({ contentId: current.contentId, count: visibleDialogueCount + 1 });
      return;
    }
    if (!completed.has(current.contentId)) {
      const result = await completeContent(current);
      if (!result) {
        if (justGraded) throw new Error('다음 콘텐츠로 이동하지 못했습니다.');
        return;
      }
      if (result.lessonCompleted) return;
    }
    if (position < contents.length - 1) setPosition(position + 1);
    else if (replay) leaveStudy();
    else {
      const result = await completeLesson();
      if (!result && justGraded) throw new Error('레슨을 완료하지 못했습니다.');
    }
  };
  const last = position === contents.length - 1;
  const advanceConcept = () => {
    if (conceptTapLocked.current || task.busy) return;
    conceptTapLocked.current = true;
    void advance().finally(() => {
      conceptUnlockTimer.current = setTimeout(() => {
        conceptTapLocked.current = false;
      }, 400);
    });
  };
  const stardustReward =
    reward?.rewards.find((item) => item.type === 'WALLET' && item.currency === 'STARDUST')
      ?.amount ?? 0;
  const constellationCompleted =
    reward?.courseCompleted && reward.rewards.some(isConstellationReward);
  const constellationBonus = constellationCompleted
    ? (reward?.rewards.filter((item) => item.type === 'WALLET' && item.currency === 'STARDUST')[1]
        ?.amount ?? 0)
    : 0;
  const firstWelcomeStudy = params.fromWelcome === 'true' && user?.status === 'GUEST';
  // 명세 LessonCompleteResponse.stardustSkipped: 에너지가 없어 이번 학습에서 별가루를 주지 않았으면 true.
  const stardustSkipped = reward?.stardustSkipped === true;
  const energyAfter = reward?.wallet.energy;
  const energySpent =
    energyBefore !== null && typeof energyAfter === 'number' ? energyBefore - energyAfter : 0;
  const replayOutcome = replayCompletion(reward);
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
      dark={completionView || showConstellation}
      quiz={designedStage}
    >
      {designedStage ? <QuizBackdrop /> : null}
      {completionView || showConstellation ? <StatusBar style="light" /> : null}
      {start ? (
        <View pointerEvents="none" style={s.imagePreload}>
          {preloadSources.map(({ source, width, height }, index) => (
            <Image key={index} source={source} style={{ width, height }} />
          ))}
        </View>
      ) : null}
      {!showConstellation && !completionView ? (
        <View
          style={[
            s.header,
            designedStage && s.quizHeader,
            designedStage && {
              paddingTop: Math.max(0, 60 * quizScale - insets.top),
              paddingHorizontal: 30 * quizScale,
              gap: 20 * quizScale,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="학습 나가기"
            style={[s.back, designedStage && s.quizBack]}
            onPress={() => (lessonDone ? leaveStudy() : setExitOpen(true))}
          >
            {designedStage ? <QuizBackIcon /> : <Ionicons name="close" size={24} color="#282636" />}
          </Pressable>
          <View style={[s.progressWrap, designedStage && s.quizProgressWrap]}>
            {designedStage ? (
              <Text style={[s.progress, s.quizProgress]}>
                {start?.reviewRequired
                  ? '선행 복습 필요'
                  : `${progressLabel} · ${contents.length ? position + 1 : 0}/${contents.length}`}
              </Text>
            ) : null}
            <View style={[s.segments, designedStage && s.quizSegments]}>
              {designedStage
                ? contents.map((content, index) => (
                    <View key={content.contentId} style={[s.segment, s.quizSegment]}>
                      {index <= position ? <View style={[s.segmentOn, s.quizSegmentFill]} /> : null}
                    </View>
                  ))
                : contents.map((content, index) => (
                    <View
                      key={content.contentId}
                      style={[s.segment, index <= position && s.segmentOn]}
                    />
                  ))}
            </View>
            {!designedStage ? (
              <Text style={s.progress}>
                {start?.reviewRequired
                  ? '선행 복습 필요'
                  : `${progressLabel} · ${contents.length ? position + 1 : 0}/${contents.length}`}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {completionView ? (
        <View style={s.completionStatus}>
          <UserStatus task={task} />
        </View>
      ) : (
        // 콘텐츠 완료 보고 중 스피너가 흐름에 끼어 화면 전체가 내려갔다 올라오지 않게 띄워서 표시한다.
        <UserStatus task={task} floatingBusy />
      )}
      {start?.reviewRequired ? (
        <>
          <Text style={styles.text}>복습을 마친 뒤 이 레슨을 다시 시작하세요.</Text>
          <StudyAction
            label="복습하기"
            onPress={() =>
              router.push({ pathname: '/review-start', params: { lessonId: String(lessonId) } })
            }
          />
        </>
      ) : null}
      {start && !start.reviewRequired ? (
        <>
          <View style={s.content}>
            {lessonDone && showConstellation ? (
              // Figma L04_1 별자리 완성(342:650)
              <ConstellationComplete
                name={constellationName}
                completedOn={constellationDate ?? formatDotDate(new Date().toISOString())}
                bonus={constellationBonus}
                points={starLayout(
                  constellationFigure?.constellationId,
                  constellationFigure?.starCount ?? 0,
                )}
                image={constellationImage(
                  constellationFigure?.constellationId,
                  constellationFigure?.imageUrl,
                )}
                onRecord={() => router.replace({ pathname: '/quiz', params: { view: 'record' } })}
                onHome={leaveStudy}
              />
            ) : lessonDone && replay ? (
              replayOutcome.kind === 'replayRewarded' ? (
                // Figma L06_4 다시 학습 / 미수령 보상 받음(656:3631)
                <CompletionResult
                  title="별가루를 받았어요"
                  lessonTitle={params.title ?? '학습'}
                  stardust={replayOutcome.stardust}
                  energySpent={energySpent}
                />
              ) : (
                // Figma L06_5 다시 학습 / 이미 보상 받음(656:3655)
                <CompletionResult
                  title="학습을 다시 마쳤어요"
                  lessonTitle={params.title ?? '학습'}
                />
              )
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
                  <CompletionStar source={completionStarSource} size={212 * completionScale} />
                </View>
                <Text style={[s.resultTitle, { top: completionTop(400) }]}>
                  {stardustSkipped
                    ? '별을 밝혔어요'
                    : firstWelcomeStudy
                      ? '첫 별을 밝혔어요 !'
                      : '별을 밝혔어요 !'}
                </Text>
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
                {stardustSkipped ? (
                  // Figma L06_3 학습 완료 / 에너지 없음(656:3753): 레슨명 아래 28
                  <Text style={[s.noEnergyText, { top: completionTop(505) }]}>
                    이번에는 에너지가 없어 보상이 없어요
                  </Text>
                ) : null}
                {/* Figma L06_1 첫 학습 완료(342:445)·L06_2 일반 학습 완료: 별가루 아래 12 에 사용한 에너지 */}
                {energySpent > 0 ? (
                  <View style={[s.energyRow, { top: completionTop(551) }]}>
                    <EnergyIcon />
                    <Text style={s.energyText}>에너지 -{energySpent}</Text>
                  </View>
                ) : null}
                {firstWelcomeStudy || stardustSkipped ? null : constellationCompleted ||
                  wallet ||
                  refreshNotice.startsWith('완료 처리됨') ? (
                  // 에너지 줄이 있으면 그 아래(551 + 20 + 12)로 내려 겹치지 않게 한다.
                  <View
                    style={[
                      s.completionDetails,
                      { top: completionTop(energySpent > 0 ? 583 : 556) },
                    ]}
                  >
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
              <NarrationDialogue
                key={current.contentId}
                messages={dialogue?.messages ?? []}
                visibleCount={visibleDialogueCount}
                source={dialogue?.source}
                disabled={task.busy || lessonDone}
                onAdvance={async () => {
                  await advance();
                }}
              />
            ) : current?.contentType === 'IMAGE' ? (
              <AnimatedReveal key={current.contentId} style={s.content}>
                <ConceptIllustration
                  mediaUrl={current.mediaUrl}
                  body={current.body}
                  scale={quizScale}
                  disabled={task.busy}
                  onAdvance={advanceConcept}
                />
              </AnimatedReveal>
            ) : current ? (
              <AnimatedReveal key={current.contentId} style={s.content}>
                <ScrollView
                  key={current.contentId}
                  style={s.content}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={
                    current.contentType === 'QUIZ'
                      ? quizScrollContentStyle(quizStageKind(current.quiz), quizScale)
                      : s.scrollContent
                  }
                >
                  {current.body ? (
                    <Text style={current.contentType === 'QUIZ' ? s.quizBody : s.body}>
                      {current.body}
                    </Text>
                  ) : null}
                  {current.contentType === 'VIDEO' && current.mediaUrl ? (
                    <StudyAction
                      label="영상 열기"
                      onPress={() => void Linking.openURL(current.mediaUrl!).catch(() => {})}
                    />
                  ) : null}
                  {current.contentType === 'QUIZ' && current.quiz ? (
                    <QuizStageQuiz
                      quiz={current.quiz}
                      itemKey={current.contentId}
                      scale={quizScale}
                      lessonId={lessonId}
                      disabled={answered.has(current.contentId)}
                      submit={(answer) => api.learning.answer(current.quiz!.quizId, answer, replay)}
                      onGraded={() =>
                        setAnswered((previous) => new Set(previous).add(current.contentId))
                      }
                      onAdvance={(justGraded) => advance(justGraded)}
                    />
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
          {!showConstellation && !narrationStage && !conceptStage && !quizStage ? (
            // 퀴즈는 문항 컴포넌트가 선택·입력 즉시 채점하고 여백 터치로 넘어가므로 하단 버튼을 두지 않는다.
            <View
              style={[
                s.footer,
                completionView && s.completionFooter,
                completionView && { bottom: Math.max(12, 89 * completionScale - insets.bottom) },
              ]}
            >
              <StudyAction
                completion={completionView}
                label={
                  lessonDone ? '완료' : replay && last ? '레슨 목록' : last ? '레슨 완료' : '다음'
                }
                secondary={current?.contentType === 'TEXT' && !lessonDone}
                disabled={!current || task.busy}
                onPress={
                  lessonDone
                    ? () =>
                        replay
                          ? leaveStudy()
                          : firstWelcomeStudy
                            ? setLoginOpen(true)
                            : params.fromWelcome === 'true'
                              ? leaveStudy()
                              : constellationCompleted
                                ? setShowConstellation(true)
                                : leaveStudy()
                    : () => void advance()
                }
              />
            </View>
          ) : null}
          {quizStage && !quizKind?.selfAdvancing && answered.has(current.contentId) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음 학습 콘텐츠로 이동"
              style={s.quizAdvanceOverlay}
              disabled={task.busy}
              onPress={() => {
                if (quizTapLocked.current) return;
                quizTapLocked.current = true;
                void advance().finally(() => {
                  quizTapLocked.current = false;
                });
              }}
            />
          ) : null}
        </>
      ) : null}
      {/* Figma 알림창_선택지 2개_가로(656:4259) */}
      <SessionConfirmModal
        visible={resumeOpen}
        title="이어서 학습할까요?"
        notice="마지막으로 본 부분부터 이어갈 수 있어요."
        arrowBullet
        cancelLabel="처음부터"
        confirmLabel="이어서"
        busy={false}
        onCancel={() => {
          setPosition(0);
          setResumeOpen(false);
        }}
        onConfirm={() => {
          setPosition(resumePosition);
          setResumeOpen(false);
        }}
        onDismiss={() => setResumeOpen(false)}
      />
      {/* Figma 알림창_선택지 2개_세로(462:718) */}
      <SessionConfirmModal
        visible={exitOpen}
        title="학습을 잠시 멈출까요?"
        notice="다음에 이 위치에서 이어서 할 수 있어요."
        arrowBullet
        centerNotice
        stacked
        confirmLabel="계속 학습"
        cancelLabel="나가기"
        busy={false}
        onConfirm={() => setExitOpen(false)}
        onCancel={leaveStudy}
        onDismiss={() => setExitOpen(false)}
      />
      {firstWelcomeStudy ? (
        <FirstStudyLoginModal
          visible={loginOpen}
          onLater={() => {
            setLoginOpen(false);
            leaveStudy();
          }}
          onDismiss={() => setLoginOpen(false)}
        />
      ) : null}
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

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 20,
    paddingHorizontal: 10,
  },
  quizHeader: { alignItems: 'flex-end', paddingTop: 0, paddingHorizontal: 0 },
  progressWrap: { flex: 1, gap: 9, paddingTop: 10 },
  quizProgressWrap: { gap: 4, paddingTop: 0 },
  segments: { flexDirection: 'row', gap: 4, height: 4 },
  segment: { flex: 1, borderRadius: 4, backgroundColor: '#eeecf1' },
  segmentOn: { backgroundColor: '#ebc60f', height: '100%', borderRadius: 4 },
  quizSegments: { gap: 5, marginVertical: 9 },
  quizSegment: { backgroundColor: '#aaa', overflow: 'hidden' },
  quizSegmentFill: { width: '100%' },
  quizProgress: { color: '#747474', textAlign: 'right', fontFamily: 'PretendardRegular' },
  quizAdvanceOverlay: { ...StyleSheet.absoluteFill, zIndex: 5 },
  back: { alignItems: 'center', justifyContent: 'center', width: 38, height: 38 },
  quizBack: { width: 26, height: 22 },
  progress: { color: '#888591', fontSize: 12 },
  resultTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    color: '#f1f1f1',
    fontSize: 24,
    fontFamily: 'PretendardBold',
    textAlign: 'center',
    ...(Platform.OS === 'web'
      ? ({ textShadow: '0px 0px 3px #f1f1f1' } as TextStyle)
      : {
          textShadowColor: '#f1f1f1',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 3,
        }),
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
    ...(Platform.OS === 'web'
      ? ({ textShadow: '0px 0px 2px #f1f1f1' } as TextStyle)
      : {
          textShadowColor: '#f1f1f1',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 2,
        }),
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
  // Figma 656:2108: 아이콘·문구 간격 8, 높이 20, Pretendard Light 14 #e4e4e4, 1px #f1f1f1 그림자
  noEnergyText: {
    position: 'absolute',
    left: 0,
    right: 0,
    color: '#d9d9d9',
    fontSize: 14,
    fontFamily: 'PretendardMedium',
    textAlign: 'center',
  },
  energyRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 8,
  },
  energyText: {
    color: '#e4e4e4',
    fontSize: 14,
    fontFamily: 'PretendardLight',
    ...(Platform.OS === 'web'
      ? ({ textShadow: '0px 0px 1px #f1f1f1' } as TextStyle)
      : {
          textShadowColor: '#f1f1f1',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 1,
        }),
  },
  completionDetails: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 3 },
  completionDetail: { color: '#aaa', fontSize: 12, fontFamily: 'PretendardLight' },
  completionBalance: {
    color: '#aaa',
    fontSize: 12,
    fontFamily: 'PretendardRegular',
    fontWeight: '400',
    textAlign: 'center',
  },
  content: { flex: 1, minHeight: 0 },
  explanation: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 7, paddingVertical: 22 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: 23,
    paddingVertical: 22,
    paddingHorizontal: 7,
  },
  body: { color: '#282636', fontSize: 17, lineHeight: 32 },
  quizBody: { color: '#888591', fontSize: 13, lineHeight: 20, textAlign: 'center' },
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
  hint: { color: '#7b8795', fontSize: 12, lineHeight: 18 },
  quizReplayHint: {
    position: 'absolute',
    bottom: 60,
    left: 30,
    right: 30,
    textAlign: 'center',
  },
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
});
