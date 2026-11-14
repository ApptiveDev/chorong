import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { integrationApi as api } from '../runtime';
import { isConstellationReward } from '../contract';
import { useIntegration, useTask } from '../hooks';
import type { Course, CourseDetail } from '../models';
import { UserScreen, UserStatus } from './Screen';
import { LearningHome } from './LearningHome';
import { constellationImage, litStars, nextLessonOf, recordStars } from './constellationRecord';

type Section = 'home' | 'map' | 'list';
type MapTab = 'map' | 'record';
type NextLesson = CourseDetail['lessons'][number] | null;
type Wallet = Awaited<ReturnType<typeof api.benefits.wallet>>;
type ConstellationRecord = Awaited<
  ReturnType<typeof api.benefits.constellations>
>['constellations'][number];
const navy = '#4d425b';

const completionDate = (timestamp: string) => {
  const date = new Date(new Date(timestamp).getTime() + 9 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10).replaceAll('-', '.');
};

async function loadConstellationDates() {
  const dates: Record<number, string> = {};
  let cursor: string | null = null;
  do {
    const page = await api.benefits.rewards({ size: 100, ...(cursor ? { cursor } : {}) });
    for (const item of page.data.rewards) {
      const courseId = Number(item.source.courseId);
      if (isConstellationReward(item) && courseId && !dates[courseId])
        dates[courseId] = completionDate(item.grantedAt);
    }
    cursor = page.meta.nextCursor;
  } while (cursor);
  return dates;
}

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
  const [mapTab, setMapTab] = useState<MapTab>('map');
  const [courses, setCourses] = useState<Course[]>([]);
  const [constellations, setConstellations] = useState<ConstellationRecord[] | null>(null);
  const [recordDates, setRecordDates] = useState<Record<number, string>>({});
  const [joinPromptOpen, setJoinPromptOpen] = useState(false);
  const [joinSocialNotice, setJoinSocialNotice] = useState(false);
  const [currentCourseId, setCurrentCourseId] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [nextLesson, setNextLesson] = useState<NextLesson>(null);
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
      const candidate =
        result.courses.find((course) => course.courseId === progress?.current?.courseId) ??
        result.courses.find((course) => course.completedLessons < course.totalLessons) ??
        result.courses[0];
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
  const categories = [...new Set(courses.map((course) => course.category))];
  const listed = category ? courses.filter((course) => course.category === category) : courses;
  const currentCourse = courses.find((course) => course.courseId === currentCourseId);
  const completedConstellations = constellations?.filter((item) => item.badgeEarned) ?? [];
  const openCourse = (courseId: number) => router.push(`/learn/course/${courseId}`);
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
            nextLesson?.title ?? (courses.length ? '학습할 레슨을 선택하세요' : '별자리가 없습니다')
          }
          nextDisabled={!courses.length}
          onOpenRecord={() => {
            setMapTab('record');
            setSection('map');
          }}
          onNext={nextLesson ? openLesson : () => setSection('list')}
          onReview={() => router.push('/review-start')}
          onRetry={() => void load()}
        />
        {joinModal}
      </>
    );
  return (
    <UserScreen
      title={
        section === 'home' ? '학습 홈' : section === 'map' ? '전체 별자리 지도' : '별자리 목록'
      }
      showTitle={section === 'list'}
    >
      {!auth.authenticated ? (
        <View style={s.panel}>
          <Text style={s.heading}>학습을 시작하세요</Text>
          <Text style={s.muted}>로그인하면 별자리와 레슨을 볼 수 있습니다.</Text>
          <Action title="로그인" onPress={() => router.push('/account')} />
        </View>
      ) : (
        <>
          <UserStatus task={task} />
          {section === 'list' ? (
            <Pressable
              accessibilityRole="button"
              style={s.back}
              onPress={() => setSection(section === 'list' ? 'map' : 'home')}
            >
              <Ionicons name="chevron-back" size={18} color={navy} />
              <Text style={s.muted}>뒤로</Text>
            </Pressable>
          ) : null}
          {section === 'map' ? (
            <>
              <View style={s.mapHeader}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="학습으로 돌아가기"
                  style={s.mapBack}
                  onPress={() => setSection('home')}
                >
                  <Ionicons name="chevron-back" size={23} color="#282636" />
                </Pressable>
                <Text style={s.mapTitle}>내 별자리</Text>
              </View>
              <View style={s.tabbar} accessibilityRole="tablist">
                {(['map', 'record'] as const).map((tab) => (
                  <Pressable
                    key={tab}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mapTab === tab }}
                    onPress={() => setMapTab(tab)}
                    style={[s.mapTab, mapTab === tab && s.mapTabActive]}
                  >
                    <Text style={[s.mapTabText, mapTab === tab && s.mapTabTextActive]}>
                      {tab === 'map' ? '별자리 지도' : '별자리 기록'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {mapTab === 'map' ? (
                <>
                  <Text style={s.mapCaption}>지금의 탐험과 다음 여정을 확인해요.</Text>
                  <ConstellationDiagram
                    courses={courses}
                    constellations={constellations ?? []}
                    currentCourseId={currentCourseId}
                    onSelect={openCourse}
                  />
                  <Outline title="현재 별자리로" onPress={() => setSection('home')} />
                </>
              ) : completedConstellations.length ? (
                completedConstellations.map((item) => (
                  <Pressable
                    key={item.constellationId}
                    accessibilityRole="button"
                    onPress={() => openCourse(item.courseId)}
                    style={s.recordRow}
                  >
                    <View style={s.recordPicture}>
                      <HomeStars progress={1} height={95} />
                    </View>
                    <View>
                      <Text style={s.recordTitle}>{item.name}</Text>
                      <Text style={s.muted}>
                        {recordDates[item.courseId] ? recordDates[item.courseId] + ' 완성' : '완성'}
                      </Text>
                    </View>
                  </Pressable>
                ))
              ) : (
                <View style={s.recordEmpty}>
                  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"
                      stroke="#aa9ab5"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                  <Text style={s.recordEmptyText}>
                    {constellations === null
                      ? '별자리 기록을 불러올 수 없습니다.'
                      : '아직 완성한 별자리가 없어요.\n별을 연결하며 첫 기록을 남겨보세요.'}
                  </Text>
                </View>
              )}
            </>
          ) : null}
          {section === 'list' ? (
            <>
              <View style={s.filters}>
                {[null, ...categories].map((value) => (
                  <Pressable
                    key={value ?? 'all'}
                    accessibilityRole="button"
                    accessibilityState={{ selected: category === value }}
                    style={[s.filter, category === value && s.selected]}
                    onPress={() => setCategory(value)}
                  >
                    <Text style={[s.filterText, category === value && s.selectedText]}>
                      {value ?? '전체'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {listed.map((course, index) => (
                <Pressable
                  key={course.courseId}
                  accessibilityRole="button"
                  onPress={() => openCourse(course.courseId)}
                  style={s.course}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name={course.completedLessons ? 'star' : 'star-outline'}
                      size={19}
                      color={navy}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.muted}>
                      별자리 {index + 1} · {course.category}
                    </Text>
                    <Text style={s.heading}>{course.constellation?.name ?? course.title}</Text>
                    <Text style={s.muted}>
                      {course.title} · {course.completedLessons}/{course.totalLessons} 레슨 완료
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#7b8795" />
                </Pressable>
              ))}
              {!task.busy && !task.error && !listed.length ? (
                <Text style={s.muted}>표시할 별자리가 없습니다.</Text>
              ) : null}
            </>
          ) : null}
          {task.error ? <Outline title="다시 불러오기" onPress={() => void load()} /> : null}
        </>
      )}
      {joinModal}
    </UserScreen>
  );
}

const homeStarPoints = [
  { x: 51, y: 112 },
  { x: 123, y: 47 },
  { x: 216, y: 97 },
];

function ConstellationDiagram({
  courses,
  constellations,
  currentCourseId,
  onSelect,
}: {
  courses: Course[];
  constellations: ConstellationRecord[];
  currentCourseId: number | null;
  onSelect: (courseId: number) => void;
}) {
  const height = Math.max(390, 158 + (courses.length - 1) * 86);
  const trail = courses
    .map((_, index) => `${index ? 'L' : 'M'}${index % 2 ? 238 : 72} ${58 + index * 86}`)
    .join(' ');
  const currentIndex = courses.findIndex((course) => course.courseId === currentCourseId);
  return (
    <View style={[s.mapDiagram, { height }]}>
      <Svg
        width="100%"
        height={height}
        viewBox={`0 0 320 ${height}`}
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        <Path d={trail} fill="none" stroke="#ddd7e6" strokeWidth={1.5} strokeDasharray="4 7" />
      </Svg>
      {courses.map((course, index) => {
        const constellation = constellations.find((item) => item.courseId === course.courseId);
        const total = constellation?.starCount ?? course.totalLessons;
        const earned = constellation?.earnedStars ?? course.completedLessons;
        const complete = constellation?.badgeEarned ?? (total > 0 && earned >= total);
        const active = course.courseId === currentCourseId || complete;
        const lit = total ? Math.ceil((earned / total) * 5) : 0;
        const status = complete
          ? '완성'
          : course.courseId === currentCourseId
            ? `탐험 중 · ${earned}/${total}`
            : index === currentIndex + 1
              ? '다음 탐험'
              : '탐험 예정';
        return (
          <Pressable
            key={course.courseId}
            accessibilityRole="button"
            accessibilityLabel={`${course.constellation?.name ?? course.title} ${status}`}
            onPress={() => onSelect(course.courseId)}
            style={[s.mapNode, { left: index % 2 ? '56%' : '6%', top: 43 + index * 86 }]}
          >
            <MiniConstellation lit={lit} active={active} />
            <Text style={[s.mapNodeName, active && s.mapNodeNameActive]} numberOfLines={1}>
              {course.constellation?.name ?? course.title}
            </Text>
            <Text style={s.mapNodeStatus}>{status}</Text>
          </Pressable>
        );
      })}
      {!courses.length ? <Text style={s.mapEmpty}>표시할 별자리가 없습니다.</Text> : null}
    </View>
  );
}

const miniStarPoints = [
  { x: 0, y: 18 },
  { x: 20, y: 0 },
  { x: 42, y: 16 },
  { x: 70, y: 3 },
  { x: 84, y: 28 },
];

function MiniConstellation({ lit, active }: { lit: number; active: boolean }) {
  return (
    <Svg width={84} height={30} viewBox="0 0 84 30">
      <Path
        d="M0 18L20 0 42 16 70 3 84 28"
        fill="none"
        stroke={active ? '#7e6b95' : '#cfc7d9'}
        strokeWidth={1.7}
      />
      {miniStarPoints.map((point, index) => (
        <Circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={active ? 3.2 : 2.3}
          fill={active && index < lit ? '#c9a458' : '#d2cadb'}
        />
      ))}
    </Svg>
  );
}

export function HomeStars({ progress, height = 170 }: { progress: number; height?: number }) {
  const lit = Math.ceil(progress * homeStarPoints.length);
  return (
    <Svg
      width="100%"
      height={height}
      viewBox="0 0 280 165"
      accessibilityLabel={`별자리 진행 ${Math.round(progress * 100)}%`}
    >
      <Path
        d="M51 112L123 47 216 97"
        fill="none"
        stroke="#d8d1e5"
        strokeWidth={1.5}
        strokeDasharray="4 5"
      />
      {lit > 1 ? (
        <Path
          d={lit > 2 ? 'M51 112L123 47 216 97' : 'M51 112L123 47'}
          fill="none"
          stroke="#bfb0d2"
          strokeWidth={1.8}
        />
      ) : null}
      {homeStarPoints.slice(0, lit).map((point, index) => (
        <Circle
          key={`glow-${index}`}
          cx={point.x}
          cy={point.y}
          r={18}
          fill="#eaca7b"
          opacity={0.18}
        />
      ))}
      {homeStarPoints.map((point, index) => (
        <Path
          key={index}
          d="M0-13 4-4 13 0 4 4 0 13-4 4-13 0-4-4z"
          transform={`translate(${point.x} ${point.y})`}
          fill={index < lit ? '#d3ab55' : '#d3cadd'}
          stroke="#fff"
          strokeWidth={1.5}
        />
      ))}
      <Circle cx={35} cy={28} r={1} fill="#c8bed5" />
      <Circle cx={250} cy={35} r={1.5} fill="#c8bed5" />
      <Circle cx={157} cy={142} r={1} fill="#c8bed5" />
    </Svg>
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
function Outline({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={s.outline}>
      <Text style={s.outlineText}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  mapHeader: {
    marginHorizontal: 6,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapBack: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  mapTitle: { color: '#282636', fontSize: 21, fontWeight: '700' },
  tabbar: {
    marginHorizontal: 6,
    marginTop: 8,
    marginBottom: 6,
    flexDirection: 'row',
    gap: 5,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#f4f1f7',
  },
  mapTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapTabActive: { backgroundColor: '#fff' },
  mapTabText: { color: '#a094ad', fontSize: 13 },
  mapTabTextActive: { color: '#655174', fontWeight: '600' },
  mapCaption: { color: '#aaa0b5', fontSize: 12, textAlign: 'center', marginBottom: 1 },
  mapDiagram: { alignSelf: 'center', width: '100%', maxWidth: 360, position: 'relative' },
  mapNode: {
    position: 'absolute',
    width: '38%',
    minHeight: 82,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  mapNodeName: { color: '#aaa1b5', fontSize: 13, marginTop: 8, textAlign: 'center' },
  mapNodeNameActive: { color: '#4d425b' },
  mapNodeStatus: { color: '#a59bad', fontSize: 11, marginTop: 5, textAlign: 'center' },
  mapEmpty: { color: '#aaa0b5', fontSize: 12, textAlign: 'center', marginTop: 100 },
  recordRow: {
    marginHorizontal: 6,
    borderWidth: 1,
    borderColor: '#e9e3ee',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  recordPicture: { width: 120, height: 95 },
  recordTitle: { color: '#282636', fontSize: 16, fontWeight: '700', marginBottom: 10 },
  recordEmpty: { padding: 28, alignItems: 'center', justifyContent: 'center' },
  recordEmptyText: {
    color: '#aa9ab5',
    fontSize: 13,
    lineHeight: 25,
    textAlign: 'center',
    marginTop: 18,
  },
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
  outline: {
    borderRadius: 13,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: '#f3f1f6',
  },
  outlineText: { color: '#655b76', fontSize: 13, fontWeight: '600' },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  filter: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 4,
  },
  selected: { backgroundColor: navy, borderColor: navy },
  filterText: { color: navy, fontSize: 11 },
  selectedText: { color: '#fff' },
  course: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 4,
    padding: 13,
  },
  icon: {
    width: 35,
    height: 35,
    borderRadius: 18,
    backgroundColor: '#eef1f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
