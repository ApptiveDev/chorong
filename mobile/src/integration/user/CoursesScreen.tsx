import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { Course, CourseDetail } from '../models';
import { UserScreen } from './Screen';
import { LearningHome } from './LearningHome';
import {
  completedConstellations,
  constellationImage,
  litStars,
  nextLessonOf,
  recordStars,
} from './constellationRecord';
import { ConstellationRecordView } from './ConstellationRecordView';
import { loadConstellationDates } from './constellationDates';

type Section = 'home' | 'map';
type MapTab = 'map' | 'record';
type NextLesson = CourseDetail['lessons'][number] | null;
type Wallet = Awaited<ReturnType<typeof api.benefits.wallet>>;
type ConstellationRecord = Awaited<
  ReturnType<typeof api.benefits.constellations>
>['constellations'][number];
const navy = '#4d425b';

export default function CoursesScreen() {
  const { generation } = useIntegration();
  return <Courses key={generation} />;
}

function Courses() {
  const router = useRouter();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const auth = useIntegration();
  const task = useTask();
  const [section, setSection] = useState<Section>('home');
  const [mapTab, setMapTab] = useState<MapTab>('record');
  const [courses, setCourses] = useState<Course[]>([]);
  const [constellations, setConstellations] = useState<ConstellationRecord[] | null>(null);
  const [recordDates, setRecordDates] = useState<Record<number, string>>({});
  const [joinPromptOpen, setJoinPromptOpen] = useState(false);
  const [joinSocialNotice, setJoinSocialNotice] = useState(false);
  const [currentCourseId, setCurrentCourseId] = useState<number | null>(null);
  const [nextLesson, setNextLesson] = useState<NextLesson>(null);
  // 모든 별자리의 레슨을 마쳤는지(API-401). 다음 학습 카드 문구에만 쓴다.
  const [allDone, setAllDone] = useState(false);
  // 현재 코스의 레슨 목록(API-402). 별자리 기록의 별 하나 = 레슨 하나.
  const [courseLessons, setCourseLessons] = useState<CourseDetail['lessons']>([]);
  // 에너지·별가루(API-904). 조회 실패면 칩에 '—'를 보여 준다.
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const load = () =>
    task.run(async () => {
      const result = await api.learning.courses();
      setCourses(result.courses);
      const [progress, constellationResult, records, walletResult] = await Promise.all([
        api.learning.progress().catch(() => null),
        api.benefits.constellations().catch(() => null),
        loadConstellationDates().catch(() => ({})),
        api.benefits.wallet().catch(() => null),
      ]);
      setConstellations(constellationResult?.constellations ?? null);
      setRecordDates(records);
      setWallet(walletResult);
      // progress.current 는 마지막으로 시작한 레슨의 코스라 별자리를 다 마친 뒤에도 그 코스를 가리킨다.
      // 그 코스가 끝났으면 다음 순서의 미완료 별자리로 넘어간다.
      const unfinished = (course: Course) => course.completedLessons < course.totalLessons;
      const currentIndex = result.courses.findIndex(
        (course) => course.courseId === progress?.current?.courseId,
      );
      const current = currentIndex >= 0 ? result.courses[currentIndex] : undefined;
      const candidate =
        (current && unfinished(current) ? current : undefined) ??
        result.courses.slice(currentIndex + 1).find(unfinished) ??
        result.courses.find(unfinished) ??
        current ??
        result.courses[0];
      setAllDone(result.courses.length > 0 && !result.courses.some(unfinished));
      setCurrentCourseId(candidate?.courseId ?? null);
      if (candidate) {
        try {
          const detail = await api.learning.course(candidate.courseId);
          setCourseLessons(detail.lessons);
          setNextLesson(nextLessonOf(detail.lessons));
        } catch {
          setCourseLessons([]);
          setNextLesson(null);
        }
      } else {
        setCourseLessons([]);
        setNextLesson(null);
      }
      return result;
    });
  useFocusEffect(
    useCallback(() => {
      if (auth.ready && auth.authenticated) void load();
    }, [auth.ready, auth.authenticated]),
  );
  useEffect(() => {
    if (view !== 'record') return;
    setSection('map');
    setMapTab('record');
    router.setParams({ view: '' });
  }, [view, router]);
  useEffect(() => {
    if (view !== 'join') return;
    if (auth.user?.status === 'GUEST') {
      setJoinSocialNotice(false);
      setJoinPromptOpen(true);
    }
    router.setParams({ view: '' });
  }, [view, auth.user?.status, router]);
  const currentCourse = courses.find((course) => course.courseId === currentCourseId);
  // 이미 읽은 완성일(API-905)을 함께 넘겨 상세 화면이 보상 내역을 다시 읽기 전에도 바로 보여 준다.
  const openCourse = (courseId: number) =>
    router.push({
      pathname: '/learn/course/[courseId]',
      params: {
        courseId: String(courseId),
        ...(recordDates[courseId] ? { completedOn: recordDates[courseId] } : {}),
      },
    });
  const openLesson = () => {
    if (nextLesson)
      router.push({
        pathname: '/learn/study/[lessonId]',
        params: {
          lessonId: String(nextLesson.lessonId),
          title: nextLesson.title,
          resume: nextLesson.status === 'IN_PROGRESS' ? 'true' : 'false',
        },
      });
  };
  const currentConstellation = currentCourse
    ? constellations?.find((item) => item.courseId === currentCourse.courseId)
    : undefined;
  const constellationId =
    currentConstellation?.constellationId ?? currentCourse?.constellation?.constellationId;
  const stars = currentCourse
    ? recordStars(courseLessons, nextLesson?.lessonId ?? null, constellationId)
    : [];
  const joinModal = (
    <Modal
      visible={joinPromptOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setJoinPromptOpen(false)}
    >
      <View style={s.joinOverlay}>
        <ScrollView style={s.joinPanel} contentContainerStyle={s.joinContent}>
          <Text style={s.joinTitle}>첫 탐험을 오래 간직해요</Text>
          <Text style={s.joinCopy}>밝힌 별과 꾸민 우주선을 계정에 저장해요.</Text>
          <View style={s.joinAuthOptions}>
            <Pressable
              accessibilityRole="button"
              style={[s.joinAuthOption, s.joinAppleOption]}
              onPress={() => setJoinSocialNotice(true)}
            >
              <Text style={[s.joinAuthOptionText, s.joinAppleText]}>Apple로 계속하기</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={s.joinAuthOption}
              onPress={() => setJoinSocialNotice(true)}
            >
              <Text style={s.joinAuthOptionText}>Google로 계속하기</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={s.joinAuthOption}
              onPress={() => setJoinSocialNotice(true)}
            >
              <Text style={s.joinAuthOptionText}>카카오로 계속하기</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={s.joinAuthOption}
              onPress={() => {
                setJoinPromptOpen(false);
                router.push('/account');
              }}
            >
              <Text style={s.joinAuthOptionText}>이메일로 로그인하기</Text>
            </Pressable>
          </View>
          {joinSocialNotice ? <Text style={s.joinNotice}>소셜 로그인은 준비 중입니다.</Text> : null}
          <Pressable
            accessibilityRole="button"
            style={s.joinSecondary}
            onPress={() => setJoinPromptOpen(false)}
          >
            <Text style={s.joinSecondaryText}>나중에 하기</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
  if (section === 'map' && auth.authenticated)
    return (
      <>
        <ConstellationRecordView
          mode={mapTab}
          items={completedConstellations(courses, constellations, recordDates)}
          task={task}
          onToggleMode={() => setMapTab((value) => (value === 'map' ? 'record' : 'map'))}
          onHome={() => setSection('home')}
          onOpen={openCourse}
          onRetry={() => void load()}
        />
        {joinModal}
      </>
    );
  if (section === 'home' && auth.authenticated)
    return (
      <>
        <LearningHome
          task={task}
          notice={auth.notice || null}
          constellation={
            currentCourse
              ? {
                  name:
                    currentConstellation?.name ??
                    currentCourse.constellation?.name ??
                    currentCourse.title,
                  stars,
                  lit: litStars(stars),
                  image: constellationImage(constellationId, currentConstellation?.imageUrl),
                }
              : null
          }
          wallet={wallet}
          nextTitle={
            nextLesson?.title ??
            (!courses.length
              ? '별자리가 없습니다'
              : allDone
                ? '모든 레슨을 마쳤어요'
                : '다음 레슨이 아직 열리지 않았어요')
          }
          nextDisabled={!nextLesson}
          onOpenRecord={() => {
            setMapTab('record');
            setSection('map');
          }}
          onNext={openLesson}
          onReview={() => router.push('/review-start')}
          onRetry={() => void load()}
        />
        {joinModal}
      </>
    );
  // 학습 탭은 로그인한 사용자만 들어온다. 세션이 풀린 순간에만 보이는 안내다.
  return (
    <UserScreen title="학습 홈" showTitle={false}>
      <View style={s.panel}>
        <Text style={s.heading}>학습을 시작하세요</Text>
        <Text style={s.muted}>로그인하면 별자리와 레슨을 볼 수 있습니다.</Text>
        <Action title="로그인" onPress={() => router.push('/account')} />
      </View>
      {joinModal}
    </UserScreen>
  );
}

function Action({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[s.primary, disabled && { opacity: 0.5 }]}
    >
      <Text style={s.primaryText}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  heading: { color: navy, fontSize: 15, fontWeight: '700' },
  muted: { color: '#7b8795', fontSize: 12, lineHeight: 18 },
  panel: { borderWidth: 1, borderColor: '#dce2e8', borderRadius: 4, padding: 13, gap: 5 },
  primary: {
    backgroundColor: '#373044',
    borderRadius: 13,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  joinOverlay: {
    flex: 1,
    backgroundColor: '#34273c63',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  joinPanel: {
    width: '100%',
    flexGrow: 0,
    maxWidth: 354,
    maxHeight: '90%',
    borderRadius: 23,
    backgroundColor: '#fff',
  },
  joinContent: { padding: 25 },
  joinTitle: {
    color: '#282636',
    fontSize: 20,
    lineHeight: 30,
    letterSpacing: -0.7,
    fontWeight: '700',
  },
  joinCopy: { color: '#807188', fontSize: 13, lineHeight: 23, marginTop: 12 },
  joinAuthOptions: { gap: 10, marginTop: 20, marginBottom: 10 },
  joinAuthOption: {
    minHeight: 48,
    borderRadius: 13,
    backgroundColor: '#f3f0f6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  joinAuthOptionText: { color: '#282636', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  joinAppleOption: { backgroundColor: '#29262f' },
  joinAppleText: { color: '#fff' },
  joinNotice: { color: '#8c8296', fontSize: 12, textAlign: 'center' },
  joinSecondary: {
    minHeight: 45,
    borderRadius: 13,
    backgroundColor: '#f3f1f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  joinSecondaryText: { color: '#655b76', fontSize: 13, fontWeight: '600' },
});
