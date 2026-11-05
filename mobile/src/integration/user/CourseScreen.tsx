import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useTask } from '../hooks';
import type { CourseDetail } from '../models';
import { positiveId } from '../ui';
import { UserScreen, UserStatus } from './Screen';

export default function CourseScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>(),
    router = useRouter(),
    task = useTask();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const load = () =>
    task.run(async () => {
      const data = await api.learning.course(positiveId(String(courseId)));
      setCourse(data);
      return data;
    });
  useEffect(() => {
    void load();
  }, [courseId]);
  return (
    <UserScreen title={course?.constellation?.name ?? course?.title ?? '별자리'}>
      <UserStatus task={task} />
      <Pressable accessibilityRole="button" style={s.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={18} color="#273a52" />
        <Text style={s.small}>별자리 목록</Text>
      </Pressable>
      {course ? (
        <>
          <View style={s.summary}>
            <Text style={s.heading}>{course.title}</Text>
            <Text style={s.small}>{course.description}</Text>
            <Text style={s.small}>
              {course.completedLessons}/{course.totalLessons} 레슨 완료
            </Text>
            <View style={s.track}>
              <View
                style={[
                  s.fill,
                  {
                    width: `${course.totalLessons ? (course.completedLessons / course.totalLessons) * 100 : 0}%`,
                  },
                ]}
              />
            </View>
          </View>
          <Text style={s.heading}>레슨 목록</Text>
          {course.lessons.map((lesson) => (
            <Pressable
              key={lesson.lessonId}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/learn/lesson/[lessonId]',
                  params: { lessonId: String(lesson.lessonId), status: lesson.status },
                })
              }
              style={s.lesson}
            >
              <View style={[s.lessonIcon, lesson.status === 'COMPLETED' && s.completedIcon]}>
                <Ionicons
                  name={
                    lesson.status === 'LOCKED'
                      ? 'lock-closed-outline'
                      : lesson.status === 'COMPLETED'
                        ? 'star'
                        : 'star-outline'
                  }
                  size={17}
                  color={lesson.status === 'COMPLETED' ? '#fff' : '#273a52'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.heading}>{lesson.title}</Text>
                <Text style={s.small}>
                  {lesson.status === 'COMPLETED'
                    ? '완료'
                    : lesson.status === 'IN_PROGRESS'
                      ? '학습 중'
                      : lesson.status === 'LOCKED'
                        ? '잠김'
                        : '학습 가능'}
                  {lesson.unlocksAt ? ` · ${lesson.unlocksAt.slice(0, 10)} 열림` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#8390a0" />
            </Pressable>
          ))}
          {!course.lessons.length ? <Text style={s.small}>표시할 레슨이 없습니다.</Text> : null}
        </>
      ) : null}
      {task.error ? (
        <Pressable accessibilityRole="button" style={s.retry} onPress={() => void load()}>
          <Text style={s.heading}>다시 불러오기</Text>
        </Pressable>
      ) : null}
    </UserScreen>
  );
}

const s = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2 },
  small: { color: '#7b8795', fontSize: 12, lineHeight: 18 },
  heading: { color: '#273a52', fontSize: 14, fontWeight: '700' },
  summary: { borderWidth: 1, borderColor: '#dce2e8', borderRadius: 4, padding: 14, gap: 7 },
  track: {
    height: 5,
    backgroundColor: '#e7ebef',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  fill: { height: '100%', backgroundColor: '#586e87' },
  lesson: {
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 4,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lessonIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#edf1f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedIcon: { backgroundColor: '#273a52' },
  retry: {
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 4,
    padding: 12,
    alignItems: 'center',
  },
});
