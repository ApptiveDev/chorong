import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { Course, CourseDetail } from '../models';
import { UserScreen, UserStatus } from './Screen';
import { LearningMap } from './LearningMap';

type Section = 'home' | 'map' | 'list';
type NextLesson = CourseDetail['lessons'][number] | null;
const navy = '#273a52';

export default function CoursesScreen() {
  const { generation } = useIntegration();
  return <Courses key={generation} />;
}

function Courses() {
  const router = useRouter();
  const auth = useIntegration();
  const task = useTask();
  const [section, setSection] = useState<Section>('home');
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentCourseId, setCurrentCourseId] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [nextLesson, setNextLesson] = useState<NextLesson>(null);
  const load = () =>
    task.run(async () => {
      const result = await api.learning.courses();
      setCourses(result.courses);
      const progress = await api.learning.progress().catch(() => null);
      const candidate =
        result.courses.find((course) => course.courseId === progress?.current?.courseId) ??
        result.courses.find((course) => course.completedLessons < course.totalLessons);
      setCurrentCourseId(candidate?.courseId ?? null);
      if (candidate) {
        try {
          const detail = await api.learning.course(candidate.courseId);
          setNextLesson(
            detail.lessons.find(
              (lesson) => lesson.status === 'IN_PROGRESS' || lesson.status === 'UNLOCKED',
            ) ?? null,
          );
        } catch {
          setNextLesson(null);
        }
      } else setNextLesson(null);
      return result;
    });
  useEffect(() => {
    if (auth.ready && auth.authenticated) void load();
  }, [auth.ready, auth.authenticated]);
  const categories = [...new Set(courses.map((course) => course.category))];
  const listed = category ? courses.filter((course) => course.category === category) : courses;
  const openCourse = (courseId: number) => router.push(`/learn/course/${courseId}`);
  const openLesson = () => {
    if (nextLesson)
      router.push({
        pathname: '/learn/lesson/[lessonId]',
        params: { lessonId: String(nextLesson.lessonId), status: nextLesson.status },
      });
  };
  return (
    <UserScreen
      title={
        section === 'home' ? '학습 홈' : section === 'map' ? '전체 별자리 지도' : '별자리 목록'
      }
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
          {section !== 'home' ? (
            <Pressable
              accessibilityRole="button"
              style={s.back}
              onPress={() => setSection(section === 'list' ? 'map' : 'home')}
            >
              <Ionicons name="chevron-back" size={18} color={navy} />
              <Text style={s.muted}>뒤로</Text>
            </Pressable>
          ) : null}
          {section === 'home' ? (
            <>
              <View style={s.topRow}>
                <View>
                  <Text style={s.muted}>현재 별자리</Text>
                  <Text style={s.heading}>
                    {courses.find((course) => course.courseId === currentCourseId)?.constellation
                      ?.name ?? '학습을 시작하세요'}
                  </Text>
                </View>
                <Outline title="별자리 지도" onPress={() => setSection('map')} />
              </View>
              <LearningMap courses={courses} compact onSelect={openCourse} />
              <View style={s.panel}>
                <Text style={s.muted}>다음 학습</Text>
                <Text style={s.heading}>
                  {nextLesson?.title ??
                    (courses.length ? '학습할 레슨을 선택하세요' : '별자리가 없습니다')}
                </Text>
                <Text style={s.muted}>
                  {nextLesson
                    ? '이어 학습할 레슨을 확인하세요.'
                    : '별자리 목록에서 레슨을 선택하세요.'}
                </Text>
              </View>
              <Action
                title="학습 시작"
                disabled={!courses.length}
                onPress={nextLesson ? openLesson : () => setSection('list')}
              />
              <Outline title="별자리 목록 보기" onPress={() => setSection('list')} />
            </>
          ) : null}
          {section === 'map' ? (
            <>
              <Text style={s.muted}>별자리를 선택하면 레슨 목록으로 이동합니다.</Text>
              <LearningMap courses={courses} onSelect={openCourse} />
              <Outline title="목록 보기" onPress={() => setSection('list')} />
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
function Outline({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={s.outline}>
      <Text style={s.outlineText}>{title}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heading: { color: navy, fontSize: 15, fontWeight: '700' },
  muted: { color: '#7b8795', fontSize: 12, lineHeight: 18 },
  panel: { borderWidth: 1, borderColor: '#dce2e8', borderRadius: 4, padding: 13, gap: 5 },
  primary: {
    backgroundColor: navy,
    borderRadius: 4,
    minHeight: 45,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  outline: {
    borderWidth: 1,
    borderColor: '#dce2e8',
    borderRadius: 4,
    minHeight: 39,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  outlineText: { color: navy, fontSize: 12, fontWeight: '600' },
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
});
