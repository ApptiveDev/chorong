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
import { SessionConfirmModal } from './SessionConfirmModal';
import { artColor as color, SparkStar } from './constellationArt';
import { constellationCompletedOn, nextLessonOf } from './constellationRecord';
import { loadConstellationDates } from './constellationDates';

type Lesson = CourseDetail['lessons'][number];

// Figma L03_1 별자리 상세 / 완료한 별 목록(342:577).
// 별자리(코스)의 레슨을 순서대로 보여 주고, 누르면 기존 학습 진입을 그대로 쓴다.
// 완료한 레슨은 확인 모달 뒤 다시 하기(replay), 열린 레슨은 바로 학습 화면으로 간다.
export default function CourseScreen() {
  const { courseId, completedOn: passedCompletedOn } = useLocalSearchParams<{
      courseId: string;
      completedOn?: string;
    }>(),
    router = useRouter(),
    session = useIntegration(),
    task = useTask();
  const { width } = useWindowDimensions();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  // 별자리 완성일. 레슨 completedAt → 별자리 기록에서 넘긴 값 → 보상 내역(API-905) 뱃지 지급일 순으로 쓴다.
  // 별자리 기록에서 들어오면 넘긴 값을 첫 화면부터 보여 준다.
  const [completedOn, setCompletedOn] = useState<string | null>(passedCompletedOn || null);
  const load = () =>
    task.run(async () => {
      const data = await api.learning.course(positiveId(String(courseId)));
      const complete =
        data.lessons.length > 0 && data.lessons.every((lesson) => lesson.status === 'COMPLETED');
      // 완성일을 다 구한 뒤 코스와 함께 반영한다. 코스를 먼저 그리면 완성일만 한 박자 늦게 나타난다.
      const date = !complete
        ? null
        : (constellationCompletedOn(data.lessons) ??
          (passedCompletedOn ||
            ((await loadConstellationDates().catch((): Record<number, string> => ({})))[
              data.courseId
            ] ??
              null)));
      setCourse(data);
      setCompletedOn(date);
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
  // 완료한 레슨은 확인 모달을 거쳐 기존 다시 학습하기(replay)로 들어간다. 진행 중 레슨의 이어서 모달은 학습 화면이 띄운다.
  const [replayTarget, setReplayTarget] = useState<Lesson | null>(null);
  const startReplay = () => {
    if (!replayTarget) return;
    const lesson = replayTarget;
    setReplayTarget(null);
    router.push({
      pathname: '/learn/study/[lessonId]',
      params: { lessonId: String(lesson.lessonId), title: lesson.title, replay: 'true' },
    });
  };
  // 잠긴 레슨은 누를 수 없다. 열린 레슨은 레슨 소개 화면 없이 바로 학습을 시작한다(홈 '다음 학습'과 같은 진입).
  const openLesson = (lesson: Lesson) => {
    if (lesson.status === 'COMPLETED') setReplayTarget(lesson);
    else if (lesson.status !== 'LOCKED')
      router.push({
        pathname: '/learn/study/[lessonId]',
        params: {
          lessonId: String(lesson.lessonId),
          title: lesson.title,
          resume: lesson.status === 'IN_PROGRESS' ? 'true' : 'false',
        },
      });
  };
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
                  accessibilityState={{ disabled: locked }}
                  disabled={locked}
                  onPress={() => openLesson(lesson)}
                  style={[s.row, locked && s.rowLocked]}
                >
                  <View style={s.rowTitle}>
                    <SparkStar filled={lesson.status === 'COMPLETED'} />
                    <Text style={s.lessonTitle} numberOfLines={1}>
                      {lesson.title}
                    </Text>
                  </View>
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
      {/* Figma 알림창_선택지 2개_가로(656:4299) */}
      <SessionConfirmModal
        visible={!!replayTarget}
        title="다시 학습할까요?"
        notice="완료한 내용을 한 번 더 볼 수 있어요."
        arrowBullet
        cancelLabel="취소"
        confirmLabel="다시 학습하기"
        busy={false}
        onCancel={() => setReplayTarget(null)}
        onConfirm={startReplay}
      />
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
  chevron: { color: '#202335', fontFamily: 'KkakdugiRegular', fontSize: 20 },
  empty: { color: '#d9d9d9', fontFamily: 'PretendardRegular', fontSize: 14 },
  retry: {
    color: color.fale,
    fontFamily: 'PretendardRegular',
    fontSize: 14,
    textAlign: 'center',
  },
});
