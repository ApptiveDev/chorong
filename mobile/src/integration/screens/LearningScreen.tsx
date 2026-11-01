import { useState } from 'react';
import { Image, Linking, Text } from 'react-native';
import { integrationApi as api, client } from '../runtime';
import { useIntegration, useTask } from '../hooks';
import type { Content, Course, CourseDetail, Lesson } from '../models';
import { Button, Card, Field, Json, Nav, Page, styles, TaskStatus } from '../ui';
import { QuizInput } from './QuizInput';

export default function LearningScreen() {
  const { generation } = useIntegration();
  return <LearningFlow key={generation} />;
}
function LearningFlow() {
  const auth = useIntegration(),
    task = useTask();
  const [category, setCategory] = useState(''),
    [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState<CourseDetail | null>(null),
    [lesson, setLesson] = useState<Lesson | null>(null);
  const [contents, setContents] = useState<Content[]>([]),
    [position, setPosition] = useState(0);
  const [started, setStarted] = useState(false),
    [replay, setReplay] = useState(false),
    [reviewRequired, setReviewRequired] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [answered, setAnswered] = useState<Set<number>>(new Set()),
    [completed, setCompleted] = useState<Set<number>>(new Set());
  const [lessonCompleted, setLessonCompleted] = useState(false),
    [refreshError, setRefreshError] = useState<string | null>(null);
  const [summary, setSummary] = useState<unknown>();
  const active = contents[position];
  const refresh = async () => {
    try {
      const progress = await api.learning.progress();
      const wallet = await api.benefits.wallet();
      const rewards = await api.benefits.rewards({ size: 20 });
      setSummary({ progress, wallet, rewards });
      setRefreshError(null);
    } catch (error) {
      setRefreshError(
        `완료 요청은 성공했습니다. 후속 조회 실패: ${error instanceof Error ? error.message : '연결 실패'}`,
      );
    }
  };
  const resetLesson = () => {
    setStarted(false);
    setLesson(null);
    setContents([]);
    setPosition(0);
    setAnswered(new Set());
    setCompleted(new Set());
    setReviewRequired(false);
    setLessonCompleted(false);
    setSummary(undefined);
    setRefreshError(null);
  };
  const start = (isReplay: boolean) =>
    task.run(async () => {
      if (!lesson) throw new Error('레슨을 선택하세요.');
      const result = await api.learning.start(lesson.lessonId, isReplay);
      setAttempt((n) => n + 1);
      setReplay(isReplay);
      setReviewRequired(result.reviewRequired);
      setStarted(!result.reviewRequired);
      setContents(result.contents);
      setAnswered(new Set());
      setCompleted(new Set());
      setLessonCompleted(result.progress.status === 'COMPLETED');
      const resume = result.progress.resumeContentId;
      const index = resume === null ? 0 : result.contents.findIndex((c) => c.contentId === resume);
      if (resume !== null && index < 0) {
        setStarted(false);
        throw new Error('명세 불일치: resumeContentId가 콘텐츠 목록에 없습니다.');
      }
      setPosition(Math.max(0, index));
      return result;
    });
  return (
    <Page title="코스 → 레슨 → 콘텐츠 → 보상">
      <TaskStatus task={task} />
      <Card title="[API-401] 코스 목록">
        <Field label="카테고리 (생략 시 전체)" value={category} onChange={setCategory} />
        <Button
          title="코스 조회"
          disabled={task.busy || !auth.authenticated}
          onPress={() =>
            void task.run(async () => {
              const data = await api.learning.courses(category || undefined);
              setCourses(data.courses);
              setCourse(null);
              resetLesson();
              return data;
            })
          }
        />
        {courses.map((c) => (
          <Button
            key={c.courseId}
            title={`${c.title} · ${c.category} · ${c.completedLessons}/${c.totalLessons} · 선택`}
            disabled={task.busy}
            onPress={() =>
              void task.run(async () => {
                resetLesson();
                const data = await api.learning.course(c.courseId);
                setCourse(data);
                return data;
              })
            }
          />
        ))}
      </Card>
      {course ? (
        <Card title={`[API-402] ${course.title}`}>
          <Text style={styles.text}>{course.description}</Text>
          {course.lessons.map((l) => (
            <Card key={l.lessonId} title={l.title}>
              <Text>
                {l.status}
                {l.unlocksAt ? ` · 해금 예정 ${l.unlocksAt}` : ''}
              </Text>
              <Button
                title="레슨 상세 조회"
                disabled={task.busy}
                onPress={() =>
                  void task.run(async () => {
                    resetLesson();
                    const data = await api.learning.lesson(l.lessonId);
                    setLesson(data);
                    return data;
                  })
                }
              />
            </Card>
          ))}
        </Card>
      ) : null}
      {lesson ? (
        <Card title={`[API-403,404] ${lesson.title}`}>
          <Text style={styles.text}>{lesson.description}</Text>
          <Button
            title="레슨 시작·이어하기"
            disabled={task.busy}
            onPress={() => void start(false)}
          />
          <Button
            title="완료한 레슨 다시 하기"
            disabled={task.busy}
            onPress={() => void start(true)}
          />
          {reviewRequired ? (
            <>
              <Text style={styles.error}>
                서버가 선행 복습을 요구합니다. 복습을 완료한 뒤 레슨 시작을 다시 누르세요.
              </Text>
              <Nav
                href={{ pathname: '/integration/review', params: { lessonId: lesson.lessonId } }}
                label="선행 복습하기"
              />
            </>
          ) : null}
          <Text style={styles.text}>
            레슨 잠금·다시 하기 허용 여부는 API-404의 서버 판정을 확인합니다.
          </Text>
        </Card>
      ) : null}
      {started && active ? (
        <Card title={`[API-405,406] 콘텐츠 ${position + 1}/${contents.length}`}>
          <ContentView content={active} />
          {active.quiz ? (
            <QuizInput
              key={`${attempt}:${active.contentId}:${replay}`}
              quiz={active.quiz}
              disabled={task.busy || completed.has(active.contentId)}
              submit={(answer) => api.learning.answer(active.quiz!.quizId, answer, replay)}
              onAnswered={() => setAnswered((s) => new Set(s).add(active.contentId))}
            />
          ) : null}
          {replay ? (
            <Text style={styles.text}>
              다시 하기는 replay=true로 채점합니다. 콘텐츠 완료 API에는 replay 계약이 없어 진행·보상
              변경 요청을 보내지 않습니다.
            </Text>
          ) : (
            <Button
              title="콘텐츠 완료 보고"
              disabled={
                task.busy ||
                completed.has(active.contentId) ||
                lessonCompleted ||
                (active.contentType === 'QUIZ' && !answered.has(active.contentId))
              }
              onPress={() =>
                void task.run(async () => {
                  const result = await api.learning.completeContent(active.contentId);
                  setCompleted((s) => new Set(s).add(active.contentId));
                  setLessonCompleted(result.lessonCompleted);
                  if (result.lessonCompleted) await refresh();
                  return result;
                })
              }
            />
          )}
          <Button
            title="이전 콘텐츠 보기"
            disabled={task.busy || position === 0}
            onPress={() => setPosition((p) => p - 1)}
          />
          <Button
            title="다음 콘텐츠 보기"
            disabled={
              task.busy ||
              position >= contents.length - 1 ||
              (!replay && !completed.has(active.contentId))
            }
            onPress={() => setPosition((p) => p + 1)}
          />
        </Card>
      ) : null}
      {started && lesson ? (
        <Card title="[API-407,408,904,905] 학습 완료·보상">
          <Text style={styles.text}>
            {lessonCompleted ? '서버 레슨 완료 상태' : '레슨 완료 대기'}
          </Text>
          <Button
            title="레슨 완료 요청"
            disabled={
              task.busy ||
              replay ||
              lessonCompleted ||
              !contents.length ||
              !completed.has(contents[contents.length - 1].contentId)
            }
            onPress={() =>
              void task.run(async () => {
                const result = await api.learning.completeLesson(lesson.lessonId);
                setLessonCompleted(true);
                await refresh();
                return result;
              })
            }
          />
          <Text style={styles.text}>
            마지막 콘텐츠 응답이 lessonCompleted=true이면 API-407을 추가 호출하지 않습니다. 서버가
            완료를 거부하면 응답 사유를 확인하세요.
          </Text>
          <Button
            title="진행도·지갑·보상 다시 조회"
            disabled={task.busy}
            onPress={() => void task.run(refresh)}
          />
          {refreshError ? <Text style={styles.error}>{refreshError}</Text> : null}
          <Json value={summary} />
        </Card>
      ) : null}
    </Page>
  );
}

export function ContentView({ content }: { content: Content }) {
  const mediaTask = useTask();
  let media: string | null = null;
  if (content.mediaUrl) {
    try {
      const url = new URL(content.mediaUrl);
      if (['http:', 'https:'].includes(url.protocol)) media = url.href;
    } catch {}
  }
  return (
    <>
      <Text style={styles.text}>
        {content.contentType} · contentId={content.contentId}
      </Text>
      {content.body ? <Text style={styles.text}>{content.body}</Text> : null}
      {content.contentType === 'IMAGE' && media ? (
        <Image
          accessibilityLabel={content.body ?? '학습 이미지'}
          source={{ uri: media }}
          style={{ height: 220, width: '100%' }}
          resizeMode="contain"
          onError={() =>
            void mediaTask.run(async () => {
              throw new Error('학습 이미지를 불러오지 못했습니다. mediaUrl을 확인하세요.');
            })
          }
        />
      ) : null}
      {content.contentType === 'VIDEO' && media ? (
        <Button
          title="학습 영상 열기"
          onPress={() => void mediaTask.run(() => Linking.openURL(media!))}
        />
      ) : null}
      {content.mediaUrl && !media ? (
        <Text style={styles.error}>명세 불일치: 지원하지 않는 mediaUrl입니다.</Text>
      ) : null}
      {content.contentType === 'QUIZ' && !content.quiz ? (
        <Text style={styles.error}>명세 불일치: QUIZ 콘텐츠에 퀴즈가 없습니다.</Text>
      ) : null}
      <TaskStatus task={mediaTask} showResult={false} />
    </>
  );
}
