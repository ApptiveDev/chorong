import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { CourseDetail } from '../models';
import { positiveId } from '../ui';
import { UserStatus } from './Screen';
import { artColor as color, SparkStar } from './constellationArt';
import { constellationCompletedOn, formatDotDate, nextLessonOf } from './constellationRecord';
import { loadConstellationDates } from './constellationDates';

type Lesson = CourseDetail['lessons'][number];

// Figma L03_1 별자리 상세 / 완료한 별 목록(342:577).
// 별자리(코스)의 레슨을 순서대로 보여 주고, 누르면 기존 학습 진입을 그대로 쓴다.
// 완료한 레슨은 다시 하기(replay), 그 밖은 레슨 화면(/learn/lesson)으로 간다.
export default function CourseScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>(),
    router = useRouter(),
    session = useIntegration(),
    task = useTask();
  const { width } = useWindowDimensions();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  // 별자리 완성일. 레슨 completedAt 이 없으면 보상 내역(API-905)의 별자리 뱃지 지급일을 쓴다.
  const [completedOn, setCompletedOn] = useState<string | null>(null);
  const load = () =>
    task.run(async () => {
      const data = await api.learning.course(positiveId(String(courseId)));
      setCourse(data);
      const fromLessons = constellationCompletedOn(data.lessons);
      const complete =
        data.lessons.length > 0 && data.lessons.every((lesson) => lesson.status === 'COMPLETED');
      setCompletedOn(
        fromLessons ??
          (complete
            ? ((await loadConstellationDates().catch((): Record<number, string> => ({})))[
                data.courseId
              ] ?? null)
            : null),
      );
      return data;
    });
  // 다시 학습하고 돌아오면 진행 상태를 새로 읽는다.
  useFocusEffect(
    useCallback(() => {
      if (session.ready && session.authenticated) void load();
    }, [courseId, session.ready, session.authenticated]),
  );
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/quiz');
  };
  const openLesson = (lesson: Lesson) =>
    lesson.status === 'COMPLETED'
      ? router.push({
          pathname: '/learn/study/[lessonId]',
          params: { lessonId: String(lesson.lessonId), title: lesson.title, replay: 'true' },
        })
      : router.push({
          pathname: '/learn/lesson/[lessonId]',
          params: { lessonId: String(lesson.lessonId), status: lesson.status },
        });
  const next = course ? nextLessonOf(course.lessons) : null;
  const rowWidth = Math.min(332, width - 70);
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
      <UserStatus task={task} floatingBusy />
      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="뒤로"
          onPress={goBack}
          hitSlop={8}
          style={s.header}
        >
          <Ionicons name="chevron-back" size={24} color={color.fale} style={s.headerIcon} />
          <Text style={s.title} numberOfLines={1}>
            {course?.constellation?.name ?? course?.title ?? '별자리'}
          </Text>
        </Pressable>
        {completedOn ? <Text style={s.completedOn}>완성일 {completedOn}</Text> : null}
        {course ? (
          <View style={[s.lessons, { width: rowWidth }]}>
            {course.lessons.map((lesson) => {
              const locked = lesson.status === 'LOCKED';
              const status =
                lesson.status === 'COMPLETED'
                  ? '완료, 다시 학습'
                  : lesson.lessonId === next?.lessonId
                    ? '다음 학습'
                    : locked
                      ? '잠김'
                      : '학습 가능';
              return (
                <Pressable
                  key={lesson.lessonId}
                  accessibilityRole="button"
                  accessibilityLabel={`${lesson.title} ${status}`}
                  onPress={() => openLesson(lesson)}
                  style={[s.row, locked && s.rowLocked]}
                >
                  <View style={s.rowTitle}>
                    <SparkStar filled={lesson.status === 'COMPLETED'} />
                    <Text style={s.lessonTitle} numberOfLines={1}>
                      {lesson.title}
                    </Text>
                  </View>
                  {locked && lesson.unlocksAt ? (
                    <Text style={s.unlock}>{formatDotDate(lesson.unlocksAt).slice(6)} 열림</Text>
                  ) : null}
                  <Text style={s.chevron}>›</Text>
                </Pressable>
              );
            })}
            {!course.lessons.length ? <Text style={s.empty}>표시할 레슨이 없습니다.</Text> : null}
          </View>
        ) : null}
        {task.error ? (
          <Pressable accessibilityRole="button" onPress={() => void load()} hitSlop={8}>
            <Text style={s.retry}>다시 불러오기</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const glow = (radius: number): TextStyle =>
  Platform.OS === 'web'
    ? ({ textShadow: `0px 0px ${radius}px #f1f1f1` } as TextStyle)
    : {
        textShadowColor: '#f1f1f1',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: radius,
      };

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.base },
  // 342:577: 위 32 · 아래 20, 묶음 간격 40
  page: { paddingTop: 32, paddingBottom: 20, gap: 40 },
  // 743:2153: 좌우 32, '<' 와 제목 간격 12, Pretendard Bold 24
  header: {
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 29,
  },
  headerIcon: glow(2),
  title: {
    flexShrink: 1,
    color: color.fale,
    fontFamily: 'PretendardBold',
    fontSize: 24,
    includeFontPadding: false,
  },
  // 743:2159: Pretendard SemiBold 16 #d9d9d9
  completedOn: {
    paddingHorizontal: 32,
    color: '#d9d9d9',
    fontFamily: 'PretendardSemiBold',
    fontSize: 16,
    includeFontPadding: false,
  },
  lessons: { alignSelf: 'center', gap: 12 },
  // Frame 146(749:249): 높이 48, 배경 #d9d9d9, 모서리 8, 왼쪽 18 · 오른쪽 17
  row: {
    height: 48,
    paddingLeft: 18,
    paddingRight: 17,
    borderRadius: 8,
    backgroundColor: '#d9d9d9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowLocked: { opacity: 0.5 },
  rowTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  lessonTitle: {
    flexShrink: 1,
    color: '#202335',
    fontFamily: 'PretendardRegular',
    fontSize: 16,
    includeFontPadding: false,
  },
  unlock: { color: '#202335', fontFamily: 'PretendardRegular', fontSize: 12 },
  chevron: { color: '#202335', fontFamily: 'KkakdugiRegular', fontSize: 20 },
  empty: { color: '#d9d9d9', fontFamily: 'PretendardRegular', fontSize: 14 },
  retry: {
    color: color.fale,
    fontFamily: 'PretendardRegular',
    fontSize: 14,
    textAlign: 'center',
  },
});
