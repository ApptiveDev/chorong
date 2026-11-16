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
import type { Content, LessonDraft, LessonStartResponse, LessonCompleteResponse } from '../models';
import { integrationApi as api } from '../runtime';
import { IntegrationError } from '../client';
import { isConstellationReward } from '../contract';
import { constellationBonusLines, replayCompletion } from '../completionResult';
import { useTask, useIntegration } from '../hooks';
import { positiveId, styles } from '../ui';
import { UserScreen, UserStatus } from './Screen';
import { SessionConfirmModal } from './SessionConfirmModal';
import { QuizBackdrop, QuizBackIcon } from './QuizBackdrop';
import { QuizStageQuiz, quizScrollContentStyle, quizStageKind } from './QuizStage';
import { AnimatedReveal } from './AnimatedReveal';
import { NarrationDialogue } from './NarrationDialogue';
import { sourceLabel, toNarrationContent } from './narrationContent';
import { ConceptIllustration } from './ConceptIllustration';
import { localStudyImages, prefetchLessonImages } from './lessonImagePreload';
import { prefetchLessonAudio } from './quizAudio';
import { ConstellationComplete } from './ConstellationComplete';
import { constellationImage, constellationShape, formatDotDate } from './constellationRecord';
import { FirstStudyLoginModal } from './SocialLoginModal';
import { CompletionArc, CompletionResult, CompletionStar, EnergyIcon } from './CompletionResult';
import { ENERGY_NOTICE_SHOWN, EnergyNoticeModal } from './lessonStart';

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
      // 진입 전에 에너지 소진 안내를 이미 보여 줬으면 'shown'(lessonStart.tsx)
      energyNotice?: string;
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
  // 별자리 완성 화면의 별 그림. API-906 의 별자리 slug·이름·별 수·그림 주소.
  const [constellationFigure, setConstellationFigure] = useState<{
    slug?: string;
    name: string;
    starCount: number;
    imageUrl: string | null;
  } | null>(null);
  const [resumeOpen, setResumeOpen] = useState(false);
  // '처음부터'(API-404 restart=true) 요청 중·실패 문구
  const [restartBusy, setRestartBusy] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);
  // M02_4 에너지 소진 안내. API-404 energyNotice=true 이고 진입 전에 보여 주지 않았을 때 띄운다(lessonStart.tsx).
  const [energyNoticeOpen, setEnergyNoticeOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  // M03_1 나가기 저장(API-409) 실패 문구. 채워지면 '나가기'가 '다시 시도'로 바뀐다.
  const [exitSaveError, setExitSaveError] = useState<string | null>(null);
  const [exitSaving, setExitSaving] = useState(false);
  // 이어하기로 복원할 미제출 입력(API-404 progress.draft). 해당 콘텐츠의 퀴즈에 처음 한 번 채운다.
  const [savedDraft, setSavedDraft] = useState<LessonDraft | null>(null);
  // 나가기 때 저장할 미제출 입력. 지금은 초성 퀴즈의 입력만 담는다(QuizStage draftInput).
  // input=null 은 그 콘텐츠의 입력을 사용자가 지웠다는 뜻이다.
  const draftRef = useRef<{ contentId: number; input: LessonDraft['input'] | null } | null>(null);
  // '처음부터'로 같은 콘텐츠를 다시 그릴 때 퀴즈 입력 상태를 비우기 위한 키
  const [startKey, setStartKey] = useState(0);
  // M02_2 학습 불러오기 오류
  const [loadError, setLoadError] = useState(false);
  // M02_6 완료 결과 확인 실패. 마지막 콘텐츠 완료(API-405)나 레슨 완료(API-407)가 실패했을 때만 켠다.
  const [finishError, setFinishError] = useState(false);
  const [resumePosition, setResumePosition] = useState(0);
  const [refreshNotice, setRefreshNotice] = useState(''),
    [wallet, setWallet] = useState<{ stardust: number } | null>(null);
  const replay = params.replay === 'true';
  const lessonId = positiveId(String(params.lessonId));
  const leaveStudy = () => router.replace('/');
  // 학습 불러오기(API-404). 실패하면 M02_2 를 띄우고 '다시 시도'로 같은 함수를 다시 부른다.
  // loadSeq 로 레슨이 바뀌었거나 화면을 떠난 뒤 도착한 응답은 버린다.
  const loadSeq = useRef(0);
  const loadLesson = () => {
    const seq = ++loadSeq.current;
    const isCurrent = () => seq === loadSeq.current;
    return task.run(async () => {
      try {
        return await fetchLesson(isCurrent);
      } catch (error) {
        if (isCurrent()) setLoadError(true);
        throw error;
      }
    });
  };
  const fetchLesson = async (isCurrent: () => boolean) => {
    try {
      const balance = await api.benefits.wallet();
      if (isCurrent() && typeof balance.energy === 'number') setEnergyBefore(balance.energy);
    } catch {
      // 에너지 표시는 선택 정보라 조회 실패와 관계없이 학습을 시작한다.
    }
    const data = await api.learning.start(lessonId, replay);
    if (!isCurrent()) return data;
    applyStart(data);
    const done = data.progress.status === 'COMPLETED' && !replay;
    // 완료한 레슨은 완료 화면을 보여 주므로 이어 하기 모달을 겹쳐 띄우지 않는다.
    // 서버 이어하기 위치(resumeContentId)는 API-409 로 저장한 화면일 수도 있다.
    if (
      !done &&
      !replay &&
      (params.resume === 'true' || data.progress.lastContentId !== null || !!data.progress.draft)
    )
      setResumeOpen(true);
    // 에너지 소진 안내는 이어하기 확인보다 먼저 띄운다(resumeOpen 은 안내를 닫은 뒤 보인다).
    if (!done && data.energyNotice && params.energyNotice !== ENERGY_NOTICE_SHOWN)
      setEnergyNoticeOpen(true);
    setLoadError(false);
    return data;
  };
  // API-404 응답으로 화면 상태를 맞춘다. 첫 진입과 '처음부터'(restart) 가 같이 쓴다.
  const applyStart = (data: LessonStartResponse) => {
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
    loadedLessonId.current = lessonId;
    setStart(data);
    setLessonDone(data.progress.status === 'COMPLETED' && !replay);
    setPosition(replay ? 0 : index);
    setResumePosition(replay ? 0 : index);
    setCompleted(new Set(data.contents.slice(0, lastIndex + 1).map((c) => c.contentId)));
    // 다시 하기는 서버가 draft 를 저장·반환하지 않는다.
    const draft = replay ? null : (data.progress.draft ?? null);
    setSavedDraft(draft);
    draftRef.current = draft;
  };
  useEffect(() => {
    void loadLesson();
    return () => {
      loadSeq.current += 1;
    };
  }, [lessonId, replay]);
  useEffect(() => {
    if (!start || loadedLessonId.current !== lessonId) return;
    let active = true;
    void prefetchLessonImages(start.contents, () => active);
    void prefetchLessonAudio(start.contents, () => active);
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
  // 개념(IMAGE) 화면도 dialogue 가 있으면 나레이션처럼 탭마다 대사를 드러낸다(body 파싱은 하지 않는다).
  const dialogue =
    current?.contentType === 'TEXT' ||
    (current?.contentType === 'IMAGE' && current.dialogue?.length)
      ? toNarrationContent(current)
      : null;
  const visibleDialogueCount =
    dialogueReveal.contentId === current?.contentId ? dialogueReveal.count : 1;
  // 이어지는 대화(TEXT) 콘텐츠는 한 대화로 이어 쌓는다. 앞 콘텐츠 대사는 모두 본 상태로 위에 남는다.
  const dialogueRun = (() => {
    if (!dialogue || current?.contentType !== 'TEXT') return null;
    let first = position;
    while (first > 0 && contents[first - 1]?.contentType === 'TEXT') first -= 1;
    let last = position;
    while (contents[last + 1]?.contentType === 'TEXT') last += 1;
    const run = contents.slice(first, last + 1).map((item) => toNarrationContent(item).messages);
    const before = run.slice(0, position - first).reduce((sum, items) => sum + items.length, 0);
    return {
      key: contents[first].contentId,
      messages: run.flat(),
      visibleCount: before + visibleDialogueCount,
      endCount: before + dialogue.messages.length,
    };
  })();
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
                slug: constellation.slug,
                name: constellation.name,
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
  // final: 마지막 콘텐츠의 완료 보고. 이 호출이 레슨을 끝내므로 실패하면 M02_6 를 띄운다.
  // 중간 콘텐츠 실패는 지금처럼 상단 오류 문구와 같은 화면 재시도로 둔다.
  const completeContent = (content: Content, final: boolean) =>
    task.run(async () => {
      let result;
      try {
        result = await api.learning.completeContent(content.contentId);
      } catch (error) {
        if (final) setFinishError(true);
        throw error;
      }
      setCompleted((previous) => new Set(previous).add(content.contentId));
      if (result.lessonCompleted) {
        setFinishError(false);
        setLessonDone(true);
        // 다시 하기는 completion 이 null(이미 받은 레슨)이거나 미지급 별가루 지급 결과다(API-405).
        setReward(result.completion ?? null);
        if (!replay) await refreshAfterDone(result.completion);
      }
      return result;
    });
  // API-407 은 같은 레슨에 같은 Idempotency-Key 를 다시 쓰므로(client.idempotencyKey) 재시도해도 두 번 지급되지 않는다.
  const completeLesson = () =>
    task.run(async () => {
      let result;
      try {
        result = await api.learning.completeLesson(lessonId);
      } catch (error) {
        setFinishError(true);
        throw error;
      }
      setFinishError(false);
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
      const result = await completeContent(current, position === contents.length - 1);
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
  // M02_6 '다시 시도'. 실패한 완료 호출을 다시 보낸다. 마지막 콘텐츠 완료가 이미 기록됐으면 레슨 완료부터 한다.
  const retryFinish = async () => {
    if (!current || task.busy) return;
    if (!completed.has(current.contentId)) {
      const result = await completeContent(current, true);
      if (!result || result.lessonCompleted) return;
    }
    if (replay) leaveStudy();
    else await completeLesson();
  };
  // 이어하기 확인의 '처음부터'. 서버(API-404 restart=true)가 저장 화면·draft·완료 위치를 지우므로
  // 응답으로 완료 목록까지 다시 맞춘다. 실패하면 모달에 문구를 띄우고 '이어서'도 고를 수 있게 둔다.
  const restartLesson = async () => {
    if (restartBusy) return;
    const seq = loadSeq.current;
    setRestartBusy(true);
    setRestartError(null);
    try {
      const data = await api.learning.start(lessonId, false, true);
      if (seq !== loadSeq.current) return;
      applyStart(data);
      setAnswered(new Set());
      setStartKey((key) => key + 1);
      setResumeOpen(false);
    } catch {
      if (seq === loadSeq.current)
        setRestartError('처음부터 시작하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setRestartBusy(false);
    }
  };
  // M03_1 '나가기'·'다시 시도'. 보던 화면과 초성 퀴즈의 미제출 입력을 저장(API-409)한 뒤 나간다.
  // 다시 하기는 레슨이 COMPLETED 라 서버가 저장을 받지 않으므로(409) 저장하지 않는다. 다시 하기 위치는
  // 서버가 콘텐츠 완료(API-405) 기준으로 기억한다. 완료한 레슨·불러오기 전에도 저장할 화면이 없다.
  // 409(진행 중이 아님·아직 도달하지 않은 화면)는 다시 보내도 같으므로 저장 없이 나간다.
  // 이때 서버는 마지막 완료 화면 다음부터 이어 준다.
  const exitStudy = async () => {
    if (exitSaving) return;
    if (replay || lessonDone || !start || start.reviewRequired || !current) return leaveStudy();
    const pending = draftRef.current;
    const draft =
      pending?.contentId === current.contentId && pending.input && !answered.has(current.contentId)
        ? { contentId: pending.contentId, input: pending.input }
        : null;
    setExitSaving(true);
    setExitSaveError(null);
    try {
      await api.learning.saveProgress(lessonId, current.contentId, draft);
      leaveStudy();
    } catch (error) {
      if (error instanceof IntegrationError && error.status === 409) leaveStudy();
      else setExitSaveError('저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setExitSaving(false);
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
    ? constellationBonusLines(reward?.rewards, reward?.rewardStatus === 'GRANTED')
    : [];
  const firstWelcomeStudy = params.fromWelcome === 'true' && user?.status === 'GUEST';
  // 명세 LessonCompleteResponse.rewardStatus(#16): NO_ENERGY 면 에너지가 없어 이번 완료에서 별가루를 주지 않았다.
  // 레슨은 보상 미수령으로 남고, 에너지가 있을 때 다시 마치면 받는다.
  const noEnergyReward = reward?.rewardStatus === 'NO_ENERGY';
  const energyAfter = reward?.wallet.energy;
  const energySpent =
    energyBefore !== null && typeof energyAfter === 'number' ? energyBefore - energyAfter : 0;
  const replayOutcome = replayCompletion(reward);
  const completionView = Boolean(
    start && !start.reviewRequired && lessonDone && !showConstellation,
  );
  const completionScale = Math.min(Math.min(windowWidth, 480) / 402, windowHeight / 874, 1);
  const completionTop = (value: number) => Math.max(0, value * completionScale - insets.top);
  // 오류 모달이 떠 있으면 같은 오류를 상단 문구로 한 번 더 보이지 않는다.
  const statusTask = loadError || finishError ? { ...task, error: null } : task;
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
          <UserStatus task={statusTask} />
        </View>
      ) : (
        // 콘텐츠 완료 보고 중 스피너가 흐름에 끼어 화면 전체가 내려갔다 올라오지 않게 띄워서 표시한다.
        <UserStatus task={statusTask} floatingBusy />
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
                {...constellationShape(constellationFigure, constellationFigure?.starCount ?? 0)}
                image={constellationImage(constellationFigure, constellationFigure?.imageUrl)}
                onRecord={() => router.replace({ pathname: '/', params: { view: 'record' } })}
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
                <CompletionArc
                  style={[
                    s.completionArc,
                    {
                      top: completionTop(209),
                      height: 463 * completionScale,
                    },
                  ]}
                />
                <View style={[s.completionStarWrap, { top: completionTop(124) }]}>
                  <CompletionStar variant="ring" size={212 * completionScale} />
                </View>
                <Text style={[s.resultTitle, { top: completionTop(400) }]}>
                  {noEnergyReward
                    ? '별을 밝혔어요'
                    : firstWelcomeStudy
                      ? '첫 별을 밝혔어요 !'
                      : '별을 밝혔어요 !'}
                </Text>
                <View style={[s.resultSubtitleUnderline, { top: completionTop(458) }]}>
                  <Text style={s.resultSubtitle}>{params.title ?? '학습'}</Text>
                </View>
                {/* 에너지 없음 화면(L06_3)에는 별가루 줄이 없다. */}
                {stardustReward > 0 && !noEnergyReward ? (
                  <View style={[s.rewardRow, { top: completionTop(520) }]}>
                    <Image
                      source={completionDustSource}
                      style={s.rewardIcon}
                      resizeMode="contain"
                    />
                    <Text style={s.rewardAmount}>별가루 +{stardustReward}</Text>
                  </View>
                ) : null}
                {noEnergyReward ? (
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
                {firstWelcomeStudy || noEnergyReward ? null : constellationCompleted ||
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
                key={dialogueRun?.key ?? current.contentId}
                messages={dialogueRun?.messages ?? []}
                visibleCount={dialogueRun?.visibleCount ?? 0}
                endCount={dialogueRun?.endCount ?? 0}
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
                  keyword={current.keyword}
                  body={current.body}
                  messages={dialogue?.messages}
                  visibleCount={visibleDialogueCount}
                  source={dialogue?.source ?? sourceLabel(current.source)}
                  scale={quizScale}
                  disabled={task.busy}
                  onAdvance={advanceConcept}
                />
              </AnimatedReveal>
            ) : current ? (
              <AnimatedReveal key={`${current.contentId}:${startKey}`} style={s.content}>
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
                  {/* 퀴즈는 문항(question)만 보여 준다. 콘텐츠 body 는 퀴즈 화면에 그리지 않는다. */}
                  {current.body && current.contentType !== 'QUIZ' ? (
                    <Text style={s.body}>{current.body}</Text>
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
                      disabled={answered.has(current.contentId)}
                      submit={(answer) => api.learning.answer(current.quiz!.quizId, answer, replay)}
                      onGraded={() =>
                        setAnswered((previous) => new Set(previous).add(current.contentId))
                      }
                      onAdvance={(justGraded) => advance(justGraded)}
                      draftInput={
                        savedDraft?.contentId === current.contentId ? savedDraft.input : undefined
                      }
                      onDraftInput={
                        replay
                          ? undefined
                          : (input) => {
                              draftRef.current = { contentId: current.contentId, input };
                            }
                      }
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
                        // 온보딩 첫 학습은 이미 마친 레슨을 다시 하는 경우(replay)에도 로그인 모달을 띄운다.
                        firstWelcomeStudy
                          ? setLoginOpen(true)
                          : replay
                            ? leaveStudy()
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
        visible={resumeOpen && !energyNoticeOpen}
        title="이어서 학습할까요?"
        notice="마지막으로 본 부분부터 이어갈 수 있어요."
        arrowBullet
        error={restartError}
        cancelLabel="처음부터"
        confirmLabel="이어서"
        busy={restartBusy}
        onCancel={() => void restartLesson()}
        // 서버 이어하기 위치(API-409 저장 화면 포함). 저장한 미제출 입력은 그 화면의 퀴즈가 채운다(savedDraft).
        onConfirm={() => {
          setRestartError(null);
          setPosition(resumePosition);
          setResumeOpen(false);
        }}
        onDismiss={() => {
          setRestartError(null);
          setResumeOpen(false);
        }}
      />
      {/* M02_4 에너지 소진. 서버 안내(API-404 energyNotice). '돌아가기'는 학습 전 화면으로 돌아간다. */}
      <EnergyNoticeModal
        visible={energyNoticeOpen}
        onCancel={() => {
          setEnergyNoticeOpen(false);
          if (router.canGoBack()) router.back();
          else leaveStudy();
        }}
        onConfirm={() => setEnergyNoticeOpen(false)}
      />
      {/* Figma 알림창_선택지 2개_세로(462:718) */}
      <SessionConfirmModal
        visible={exitOpen}
        title="학습을 잠시 멈출까요?"
        notice="다음에 이 위치에서 이어서 할 수 있어요."
        arrowBullet
        centerNotice
        stacked
        error={exitSaveError}
        confirmLabel="계속 학습"
        cancelLabel={exitSaveError ? '다시 시도' : '나가기'}
        busy={exitSaving}
        onConfirm={() => {
          setExitSaveError(null);
          setExitOpen(false);
        }}
        // '나가기'와 '다시 시도' 모두 저장(API-409)에 성공해야 나간다(exitStudy).
        onCancel={() => void exitStudy()}
        onDismiss={() => {
          setExitSaveError(null);
          setExitOpen(false);
        }}
      />
      {/* M02_2 학습 불러오기 오류. Figma 알림창_선택지 2개_가로(656:4259) */}
      <SessionConfirmModal
        visible={loadError}
        title="학습 정보를 불러오지 못했어요."
        notice="연결 상태를 확인한 뒤 다시 시도해 주세요."
        arrowBullet
        cancelLabel="닫기"
        confirmLabel="다시 시도"
        busy={task.busy}
        onCancel={leaveStudy}
        onConfirm={() => void loadLesson()}
      />
      {/* M02_6 완료 결과 확인 실패. Figma 알림창_선택지 2개_가로(656:4259) */}
      <SessionConfirmModal
        visible={finishError}
        title="완료 결과를 확인하지 못했어요."
        notice="아직 완료 처리가 확인되지 않았어요. 결과를 다시 확인해 주세요."
        arrowBullet
        cancelLabel="닫기"
        confirmLabel="다시 시도"
        busy={task.busy}
        onCancel={leaveStudy}
        onConfirm={() => void retryFinish()}
      />
      {firstWelcomeStudy ? (
        <FirstStudyLoginModal
          visible={loginOpen}
          onLater={() => {
            setLoginOpen(false);
            leaveStudy();
          }}
          onDismiss={() => setLoginOpen(false)}
          onSignedIn={leaveStudy}
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
