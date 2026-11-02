import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useTask } from '../hooks';
import type { Lesson } from '../models';
import { positiveId } from '../ui';
import { UserScreen, UserStatus } from './Screen';

export default function LessonScreen() {
  const { lessonId, status } = useLocalSearchParams<{ lessonId: string; status?: string }>(),
    router = useRouter(),
    task = useTask();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const load = () =>
    task.run(async () => {
      const data = await api.learning.lesson(positiveId(String(lessonId)));
      setLesson(data);
      return data;
    });
  useEffect(() => {
    void load();
  }, [lessonId]);
  return (
    <UserScreen title={lesson?.title ?? '레슨'}>
      <UserStatus task={task} />
      <Pressable accessibilityRole="button" style={s.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={18} color="#273a52" />
        <Text style={s.body}>레슨 목록</Text>
      </Pressable>
      {lesson ? (
        <>
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
            {status === 'LOCKED' ? <Text style={s.body}>아직 열리지 않은 레슨입니다.</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: task.busy || status === 'LOCKED' }}
            style={[s.primary, (task.busy || status === 'LOCKED') && s.disabled]}
            disabled={task.busy || status === 'LOCKED'}
            onPress={() =>
              router.push({
                pathname: '/learn/study/[lessonId]',
                params: { lessonId: String(lesson.lessonId), title: lesson.title },
              })
            }
          >
            <Text style={s.primaryText}>{status === 'IN_PROGRESS' ? '이어하기' : '학습 시작'}</Text>
          </Pressable>
          {status === 'COMPLETED' ? (
            <Pressable
              accessibilityRole="button"
              style={s.secondary}
              onPress={() =>
                router.push({
                  pathname: '/learn/study/[lessonId]',
                  params: {
                    lessonId: String(lesson.lessonId),
                    replay: 'true',
                    title: lesson.title,
                  },
                })
              }
            >
              <Text style={s.secondaryText}>다시 학습하기</Text>
            </Pressable>
          ) : null}
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
