import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useTask } from '../hooks';
import type { CourseDetail, Lesson } from '../models';
import { positiveId } from '../ui';
import { UserScreen, UserStatus } from './Screen';

export default function LessonScreen() {
  const { lessonId, status } = useLocalSearchParams<{ lessonId: string; status?: string }>(),
    router = useRouter(),
    task = useTask();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const load = () =>
    task.run(async () => {
      const data = await api.learning.lesson(positiveId(String(lessonId)));
      const parent = await api.learning.course(data.courseId);
      setLesson(data);
      setCourse(parent);
      return data;
    });
  useEffect(() => {
    setLesson(null);
    setCourse(null);
    void load();
  }, [lessonId]);
  const siblings = course?.lessons ?? [];
  const index = siblings.findIndex((item) => item.lessonId === lesson?.lessonId);
  const previous = index > 0 ? siblings[index - 1] : null;
  const next = index >= 0 ? (siblings[index + 1] ?? null) : null;
  const currentStatus = siblings[index]?.status ?? status;
  const openSibling = (target: (typeof siblings)[number] | null) => {
    if (!target || task.busy) return;
    router.replace({
      pathname: '/learn/lesson/[lessonId]',
      params: { lessonId: String(target.lessonId), status: target.status },
    });
  };
  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -60) openSibling(next);
          else if (gesture.dx > 60) openSibling(previous);
        },
      }),
    [next, previous, task.busy],
  );
  return (
    <UserScreen title={lesson?.title ?? '레슨'}>
      <UserStatus task={task} />
      <Pressable accessibilityRole="button" style={s.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={18} color="#273a52" />
        <Text style={s.body}>레슨 목록</Text>
      </Pressable>
      {lesson ? (
        <>
          <View {...swipe.panHandlers} style={s.swipeArea}>
            <View style={s.preview}>
              <Ionicons name="star-outline" size={44} color="#536b86" />
              <Text style={s.previewText}>{lesson.title}</Text>
            </View>
            <View style={s.info}>
              <Text style={s.heading}>{lesson.title}</Text>
              <Text style={s.body}>{lesson.description}</Text>
              <Text style={s.body}>
                콘텐츠 {lesson.contents.length}개 · 퀴즈{' '}
                {lesson.contents.filter((content) => content.quiz).length}개
              </Text>
              {currentStatus === 'LOCKED' ? (
                <Text style={s.body}>아직 열리지 않은 레슨입니다.</Text>
              ) : null}
            </View>
          </View>
          <View style={s.siblingRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !previous || task.busy }}
              disabled={!previous || task.busy}
              onPress={() => openSibling(previous)}
            >
              <Text style={[s.siblingText, !previous && s.disabled]}>‹ 이전 레슨</Text>
            </Pressable>
            <Text style={s.body}>{index >= 0 ? `${index + 1} / ${siblings.length}` : ''}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !next || task.busy }}
              disabled={!next || task.busy}
              onPress={() => openSibling(next)}
            >
              <Text style={[s.siblingText, !next && s.disabled]}>다음 레슨 ›</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: task.busy || currentStatus === 'LOCKED' }}
            style={[s.primary, (task.busy || currentStatus === 'LOCKED') && s.disabled]}
            disabled={task.busy || currentStatus === 'LOCKED'}
            onPress={() =>
              router.push({
                pathname: '/learn/study/[lessonId]',
                params: {
                  lessonId: String(lesson.lessonId),
                  title: lesson.title,
                  resume: currentStatus === 'IN_PROGRESS' ? 'true' : 'false',
                  replay: currentStatus === 'COMPLETED' ? 'true' : 'false',
                },
              })
            }
          >
            <Text style={s.primaryText}>
              {currentStatus === 'COMPLETED'
                ? '다시 학습하기'
                : currentStatus === 'IN_PROGRESS'
                  ? '이어하기'
                  : '학습 시작'}
            </Text>
          </Pressable>
        </>
      ) : null}
      {task.error ? (
        <Pressable accessibilityRole="button" style={s.secondary} onPress={() => void load()}>
          <Text style={s.secondaryText}>다시 불러오기</Text>
        </Pressable>
      ) : null}
    </UserScreen>
  );
}

const s = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2 },
  swipeArea: { gap: 14, ...(Platform.OS === 'web' ? { touchAction: 'pan-y' as const } : {}) },
  preview: {
    height: 230,
    borderWidth: 1,
    borderColor: '#dce2e8',
    backgroundColor: '#f2f4f7',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  previewText: { color: '#536b86', fontSize: 13, fontWeight: '600' },
  info: { borderWidth: 1, borderColor: '#dce2e8', borderRadius: 4, padding: 14, gap: 8 },
  heading: { color: '#273a52', fontSize: 16, fontWeight: '700' },
  body: { color: '#7b8795', fontSize: 12, lineHeight: 19 },
  siblingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  siblingText: { color: '#273a52', fontSize: 12, fontWeight: '600' },
  primary: {
    minHeight: 45,
    borderRadius: 4,
    backgroundColor: '#273a52',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  secondary: {
    minHeight: 42,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#dce2e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#273a52', fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.45 },
});
