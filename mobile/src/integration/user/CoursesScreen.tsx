import { useEffect, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Text, View } from 'react-native';
import { integrationApi as api } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { Course } from '../models';
import { Button, Card, styles } from '../ui';
import { UserScreen, UserStatus } from './Screen';

export default function CoursesScreen() {
  const { generation } = useIntegration();
  return <Courses key={generation} />;
}
function Courses() {
  const router = useRouter(),
    auth = useIntegration(),
    task = useTask();
  const [courses, setCourses] = useState<Course[]>([]),
    [category, setCategory] = useState<string | null>(null);
  const load = () =>
    task.run(async () => {
      const result = await api.learning.courses(category ?? undefined);
      setCourses(result.courses);
      return result;
    });
  useEffect(() => {
    if (auth.ready && auth.authenticated) void load();
  }, [auth.ready, auth.authenticated, category]);
  const categories = [...new Set(courses.map((course) => course.category))];
  return (
    <UserScreen title="학습">
      {!auth.authenticated ? (
        <Text style={styles.text}>로그인한 뒤 코스를 확인하세요.</Text>
      ) : (
        <>
          <Text style={styles.text}>코스를 선택하고 레슨을 시작하세요.</Text>
          <UserStatus task={task} />
          <View style={styles.row}>
            <Button title="전체" disabled={category === null} onPress={() => setCategory(null)} />
            {categories.map((c) => (
              <Button key={c} title={c} disabled={category === c} onPress={() => setCategory(c)} />
            ))}
          </View>
          <Button title="코스 다시 조회" disabled={task.busy} onPress={() => void load()} />
          {courses.map((course) => (
            <Card key={course.courseId} title={course.title}>
              <Text style={styles.text}>
                {course.category} · {course.completedLessons}/{course.totalLessons} 레슨 완료
              </Text>
              <Button
                title="레슨 보기"
                onPress={() => router.push(`/learn/course/${course.courseId}` as Href)}
              />
            </Card>
          ))}
          {!task.busy && !task.error && courses.length === 0 ? (
            <Text style={styles.text}>표시할 코스가 없습니다.</Text>
          ) : null}
        </>
      )}
    </UserScreen>
  );
}
