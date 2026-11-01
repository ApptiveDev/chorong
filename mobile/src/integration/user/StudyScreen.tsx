import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  FlatList,
  Image,
  Keyboard,
  Linking,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type {
  Content,
  LessonStartResponse,
  LessonCompleteResponse,
  QuizAnswer,
  AnswerResult,
} from '../models';
import { integrationApi as api } from '../runtime';
import { useTask, useIntegration } from '../hooks';
import { Button, Card, positiveId, styles } from '../ui';
import { UserScreen, UserStatus } from './Screen';
import { QuizCard } from './QuizCard';

export default function StudyScreen() {
  const { generation } = useIntegration();
  return <Study key={generation} />;
}
function Study() {
  const params = useLocalSearchParams<{ lessonId: string; replay?: string; title?: string }>(),
    router = useRouter(),
    task = useTask();
  const list = useRef<FlatList<Content>>(null);
  const [start, setStart] = useState<LessonStartResponse | null>(null),
    [position, setPosition] = useState(0),
    [height, setHeight] = useState(1);
  const [answered, setAnswered] = useState<Set<number>>(new Set()),
    [completed, setCompleted] = useState<Set<number>>(new Set());
  const [lessonDone, setLessonDone] = useState(false),
    [reward, setReward] = useState<LessonCompleteResponse | null>(null);
  const [refreshNotice, setRefreshNotice] = useState(''),
    [wallet, setWallet] = useState<{ star: number; stardust: number } | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const replay = params.replay === 'true';
  const lessonId = positiveId(String(params.lessonId));
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  useEffect(() => {
    let active = true;
    void task.run(async () => {
      const data = await api.learning.start(lessonId, replay);
      if (!active) return data;
      setStart(data);
      setLessonDone(data.progress.status === 'COMPLETED' && !replay);
      const index =
        data.progress.resumeContentId === null
          ? 0
          : data.contents.findIndex((c) => c.contentId === data.progress.resumeContentId);
      if (data.progress.resumeContentId !== null && index < 0)
        throw new Error('이어하기 위치가 콘텐츠 목록에 없습니다.');
      const lastIndex =
        data.progress.lastContentId === null
          ? -1
          : data.contents.findIndex((c) => c.contentId === data.progress.lastContentId);
      if (data.progress.lastContentId !== null && lastIndex < 0)
        throw new Error('완료 위치가 콘텐츠 목록에 없습니다.');
      setPosition(index);
      setCompleted(new Set(data.contents.slice(0, lastIndex + 1).map((c) => c.contentId)));
      return data;
    });
    return () => {
      active = false;
    };
  }, [lessonId, replay]);
  useEffect(() => {
    if (start && height > 1) list.current?.scrollToIndex({ index: position, animated: false });
  }, [start, height]);
  const contents = start?.contents ?? [],
    current = contents[position];
  const readyToAdvance = !current
    ? false
    : replay
      ? current.contentType !== 'QUIZ' || answered.has(current.contentId)
      : completed.has(current.contentId);
  const jump = (next: number) => {
    if (next < 0 || next >= contents.length || (next > position && !readyToAdvance)) {
      list.current?.scrollToIndex({ index: position, animated: true });
      return;
    }
    setPosition(next);
    list.current?.scrollToIndex({ index: next, animated: true });
  };
  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (height <= 1) return;
    const target = Math.round(event.nativeEvent.contentOffset.y / height);
    if (target !== position) jump(target);
  };
  const refreshAfterDone = async () => {
    try {
      await api.learning.progress();
      const balance = await api.benefits.wallet();
      setWallet(balance);
      setRefreshNotice('진행도와 잔액을 다시 조회했습니다.');
    } catch (error) {
      setRefreshNotice(
        `완료 처리됨. 후속 조회 실패: ${error instanceof Error ? error.message : '연결 실패'}`,
      );
    }
  };
  const completeContent = (content: Content) =>
    task.run(async () => {
      const result = await api.learning.completeContent(content.contentId);
      setCompleted((previous) => new Set(previous).add(content.contentId));
      if (result.lessonCompleted) {
        setLessonDone(true);
        setReward(result.completion ?? null);
        await refreshAfterDone();
      }
      return result;
    });
  const completeLesson = () =>
    task.run(async () => {
      const result = await api.learning.completeLesson(lessonId);
      setLessonDone(true);
      setReward(result);
      await refreshAfterDone();
      return result;
    });
  return (
    <UserScreen title={params.title ?? '학습'} scroll={false}>
      <Button title="뒤로가기" onPress={() => router.back()} />
      <Text style={styles.text}>
        {start?.reviewRequired
          ? '선행 복습이 필요합니다.'
          : `${position + 1}/${contents.length || 0} · ${start?.progress.status ?? '시작 중'}`}
      </Text>
      <UserStatus task={task} />
      {start?.reviewRequired ? (
        <>
          <Text style={styles.text}>복습을 마친 뒤 이 레슨을 다시 시작하세요.</Text>
          <Button
            title="복습하기"
            onPress={() =>
              router.push({ pathname: '/review', params: { lessonId: String(lessonId) } })
            }
          />
        </>
      ) : null}
      {start && !start.reviewRequired ? (
        <>
          <View style={{ flex: 1 }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
            <FlatList
              ref={list}
              data={contents}
              keyExtractor={(item) => String(item.contentId)}
              renderItem={({ item, index }) => (
                <View style={{ height, paddingVertical: 12 }}>
                  <ScrollView
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{
                      minHeight: height - 24,
                      justifyContent: 'center',
                      gap: 14,
                      paddingHorizontal: 2,
                    }}
                  >
                    <Text style={styles.text}>
                      콘텐츠 {index + 1} / {contents.length}
                    </Text>
                    {item.body ? <Text style={styles.subtitle}>{item.body}</Text> : null}
                    {item.contentType === 'IMAGE' && item.mediaUrl ? (
                      <Image
                        source={{ uri: item.mediaUrl }}
                        style={{ height: 260, width: '100%' }}
                        resizeMode="contain"
                      />
                    ) : null}
                    {item.contentType === 'VIDEO' && item.mediaUrl ? (
                      <Button
                        title="영상 열기"
                        onPress={() => void Linking.openURL(item.mediaUrl!).catch(() => {})}
                      />
                    ) : null}
                    {item.contentType === 'QUIZ' && item.quiz ? (
                      <QuizCard
                        key={item.contentId}
                        quiz={item.quiz}
                        disabled={answered.has(item.contentId)}
                        submit={(answer: QuizAnswer) =>
                          api.learning.answer(item.quiz!.quizId, answer, replay)
                        }
                        onGraded={(_result: AnswerResult) =>
                          setAnswered((previous) => new Set(previous).add(item.contentId))
                        }
                      />
                    ) : null}
                    {item.contentType === 'QUIZ' && !item.quiz ? (
                      <Text style={styles.error}>퀴즈 내용을 불러오지 못했습니다.</Text>
                    ) : null}
                    {!replay && !completed.has(item.contentId) ? (
                      <Button
                        title="학습 완료"
                        disabled={
                          task.busy ||
                          (item.contentType === 'QUIZ' && !answered.has(item.contentId))
                        }
                        onPress={() => void completeContent(item)}
                      />
                    ) : null}
                    {completed.has(item.contentId) ? (
                      <Text style={styles.text}>학습 완료됨</Text>
                    ) : null}
                    {replay ? (
                      <Text style={styles.text}>
                        다시 학습 중입니다. 진행도와 보상은 변경하지 않습니다.
                      </Text>
                    ) : null}
                  </ScrollView>
                </View>
              )}
              pagingEnabled
              snapToInterval={height}
              decelerationRate="fast"
              showsVerticalScrollIndicator={false}
              scrollEnabled={!keyboardVisible}
              getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
              onMomentumScrollEnd={onScrollEnd}
              onScrollEndDrag={onScrollEnd}
              onScrollToIndexFailed={() =>
                list.current?.scrollToOffset({ offset: position * height, animated: false })
              }
            />
          </View>
          <View style={{ gap: 8, paddingBottom: 12 }}>
            {current && !readyToAdvance && !lessonDone ? (
              <Text style={styles.text}>
                {current.contentType === 'QUIZ'
                  ? '답안을 제출하고 채점 결과를 확인하세요.'
                  : '학습 완료를 누른 뒤 위로 넘기세요.'}
              </Text>
            ) : null}
            <View style={styles.row}>
              <Button title="이전" disabled={position === 0} onPress={() => jump(position - 1)} />
              <Button
                title="다음"
                disabled={position >= contents.length - 1 || !readyToAdvance}
                onPress={() => jump(position + 1)}
              />
            </View>
            {position === contents.length - 1 &&
            completed.has(current?.contentId ?? -1) &&
            !lessonDone &&
            !replay ? (
              <Button
                title="레슨 완료"
                disabled={task.busy}
                onPress={() => void completeLesson()}
              />
            ) : null}
            {lessonDone ? (
              <Card title="레슨 완료">
                <Text style={styles.text}>
                  {reward
                    ? `보상 ${reward.rewards.length}건 · 별 ${reward.wallet.star} · 별가루 ${reward.wallet.stardust}`
                    : '레슨 완료 결과를 받았습니다.'}
                </Text>
                {wallet ? (
                  <Text style={styles.text}>
                    현재 잔액: 별 {wallet.star} · 별가루 {wallet.stardust}
                  </Text>
                ) : null}
                {refreshNotice ? <Text style={styles.text}>{refreshNotice}</Text> : null}
                <Button title="코스로 돌아가기" onPress={() => router.back()} />
              </Card>
            ) : null}
          </View>
        </>
      ) : null}
    </UserScreen>
  );
}
