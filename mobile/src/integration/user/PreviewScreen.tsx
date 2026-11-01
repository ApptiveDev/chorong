import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { FlatList, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LocalTestHouseCanvas } from '../../components/house/local/LocalTestHouseCanvas';
import { Button, Card, Choices, Nav, styles } from '../ui';

type Section =
  'home' | 'courses' | 'course' | 'lesson' | 'study' | 'inventory' | 'shop' | 'social' | 'visit';
type PreviewPage = { id: string; title: string; body: string; quiz?: boolean };
const pages: PreviewPage[] = [
  {
    id: 'intro',
    title: '학습 콘텐츠',
    body: '위로 넘기면 다음 콘텐츠로 이동합니다. 아래로 넘기면 이전 콘텐츠를 봅니다.',
  },
  {
    id: 'image',
    title: '이미지 콘텐츠',
    body: '서버 이미지가 표시될 위치입니다. 이 예시는 로컬 화면 확인용입니다.',
  },
  {
    id: 'quiz',
    title: '퀴즈 콘텐츠',
    body: '답을 선택하고 제출 조작을 확인하세요. 서버 채점은 하지 않습니다.',
    quiz: true,
  },
  {
    id: 'finish',
    title: '정리 콘텐츠',
    body: '마지막 콘텐츠 뒤 레슨 완료 영역이 표시됩니다. 보상은 지급하지 않습니다.',
  },
];

export default function PreviewScreen() {
  const [section, setSection] = useState<Section>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [position, setPosition] = useState(0);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [answer, setAnswer] = useState<'A' | 'B' | ''>('');
  const [liked, setLiked] = useState(false);
  const list = useRef<FlatList<PreviewPage>>(null);
  const { height } = useWindowDimensions();
  const pageHeight = Math.max(280, Math.round(height * 0.52));
  const go = (next: Section) => {
    setSection(next);
    setMenuOpen(false);
    setNotice('');
  };
  const jump = (next: number) => {
    if (next < 0 || next >= pages.length || (next > position && !done.has(pages[position].id))) {
      list.current?.scrollToIndex({ index: position, animated: true });
      return;
    }
    setPosition(next);
    list.current?.scrollToIndex({ index: next, animated: true });
  };
  const page = pages[position];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 14, gap: 8 }}>
        <Text style={styles.title}>UI 미리보기</Text>
        <Text style={styles.error}>로컬 화면 시험 · 로그인·서버 요청·채점·구매·저장 없음</Text>
        <View style={styles.row}>
          <Button title="홈" onPress={() => go('home')} />
          <Button title="학습" onPress={() => go('courses')} />
          <Button title="꾸미기" onPress={() => go('inventory')} />
          <Button title="소셜" onPress={() => go('social')} />
        </View>
      </View>
      {section === 'home' ? (
        <ScrollView contentContainerStyle={styles.page}>
          <Card title="내 우주 미리보기">
            <View
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                zIndex: 2,
                alignItems: 'flex-end',
                gap: 6,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
                accessibilityState={{ expanded: menuOpen }}
                onPress={() => setMenuOpen((v) => !v)}
                style={styles.button}
              >
                <Ionicons name={menuOpen ? 'close' : 'add'} size={20} color="#fff" />
              </Pressable>
              {menuOpen ? (
                <>
                  <Button title="인벤토리" onPress={() => go('inventory')} />
                  <Button title="상점" onPress={() => go('shop')} />
                  <Button title="우주 탐험" onPress={() => go('social')} />
                </>
              ) : null}
            </View>
            <View style={{ minHeight: 300, justifyContent: 'center', alignItems: 'center' }}>
              <LocalTestHouseCanvas placedItems={{}} />
            </View>
          </Card>
          <Button title="학습하기" onPress={() => go('courses')} />
          <Nav href="/account" label="실제 로그인 화면 열기" />
        </ScrollView>
      ) : null}
      {section === 'courses' ? (
        <ScrollView contentContainerStyle={styles.page}>
          <Card title="예시 코스">
            <Text style={styles.text}>로컬 화면 데이터 · 레슨 1개</Text>
            <Button title="코스 보기" onPress={() => go('course')} />
          </Card>
        </ScrollView>
      ) : null}
      {section === 'course' ? (
        <ScrollView contentContainerStyle={styles.page}>
          <Button title="코스 목록" onPress={() => go('courses')} />
          <Card title="예시 레슨">
            <Text style={styles.text}>레슨 상세와 시작 버튼을 확인합니다.</Text>
            <Button title="레슨 보기" onPress={() => go('lesson')} />
          </Card>
        </ScrollView>
      ) : null}
      {section === 'lesson' ? (
        <ScrollView contentContainerStyle={styles.page}>
          <Button title="코스로 돌아가기" onPress={() => go('course')} />
          <Card title="예시 레슨">
            <Button
              title="시작하기"
              onPress={() => {
                setPosition(0);
                go('study');
              }}
            />
          </Card>
        </ScrollView>
      ) : null}
      {section === 'study' ? (
        <View style={{ flex: 1, paddingHorizontal: 14, gap: 8 }}>
          <Button title="레슨으로 돌아가기" onPress={() => go('lesson')} />
          <Text style={styles.subtitle}>
            {page.title} · {position + 1}/{pages.length}
          </Text>
          <FlatList
            ref={list}
            data={pages}
            keyExtractor={(item) => item.id}
            pagingEnabled
            snapToInterval={pageHeight}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1 }}
            getItemLayout={(_, index) => ({
              length: pageHeight,
              offset: index * pageHeight,
              index,
            })}
            onMomentumScrollEnd={(event) =>
              jump(Math.round(event.nativeEvent.contentOffset.y / pageHeight))
            }
            onScrollEndDrag={(event) =>
              jump(Math.round(event.nativeEvent.contentOffset.y / pageHeight))
            }
            onScrollToIndexFailed={() =>
              list.current?.scrollToOffset({ offset: position * pageHeight, animated: false })
            }
            renderItem={({ item }) => (
              <View style={{ height: pageHeight, justifyContent: 'center', gap: 12 }}>
                <Card title={item.title}>
                  <Text style={styles.text}>{item.body}</Text>
                  {item.quiz ? (
                    <>
                      <Choices values={['A', 'B'] as const} value={answer} onChange={setAnswer} />
                      <Button
                        title="답안 제출 조작"
                        disabled={!answer || done.has(item.id)}
                        onPress={() => {
                          setDone((old) => new Set(old).add(item.id));
                          setNotice('입력 조작 확인. 서버 채점 결과가 아닙니다.');
                        }}
                      />
                    </>
                  ) : (
                    <Button
                      title="콘텐츠 완료 조작"
                      disabled={done.has(item.id)}
                      onPress={() => {
                        setDone((old) => new Set(old).add(item.id));
                        setNotice('화면 조작 확인. 서버 진행도는 변경되지 않습니다.');
                      }}
                    />
                  )}
                </Card>
              </View>
            )}
          />
          {notice ? <Text style={styles.text}>{notice}</Text> : null}
          <View style={styles.row}>
            <Button title="이전" disabled={position === 0} onPress={() => jump(position - 1)} />
            <Button
              title="다음"
              disabled={position === pages.length - 1 || !done.has(page.id)}
              onPress={() => jump(position + 1)}
            />
          </View>
          {position === pages.length - 1 && done.has(page.id) ? (
            <Text style={styles.text}>레슨 완료 영역 미리보기 · 보상 지급 없음</Text>
          ) : null}
        </View>
      ) : null}
      {section === 'inventory' || section === 'shop' ? (
        <ScrollView contentContainerStyle={styles.page}>
          <Card title={section === 'shop' ? '상점·꾸미기' : '꾸미기'}>
            <Text style={styles.text}>추후 구현 예정입니다.</Text>
            <Button title="홈으로 돌아가기" onPress={() => go('home')} />
          </Card>
        </ScrollView>
      ) : null}
      {section === 'social' ? (
        <ScrollView contentContainerStyle={styles.page}>
          <Card title="우주 탐험 미리보기">
            <Text style={styles.text}>
              공개 우주 목록과 방문 버튼의 배치를 확인합니다. 실제 목록·좋아요·신고는 서버 로그인 후
              시험합니다.
            </Text>
            <Card title="예시 우주">
              <Text style={styles.text}>로컬 화면 데이터 · 좋아요 {liked ? 1 : 0}</Text>
              <Button title="방문하기" onPress={() => go('visit')} />
            </Card>
            <Button title="홈으로 돌아가기" onPress={() => go('home')} />
          </Card>
        </ScrollView>
      ) : null}
      {section === 'visit' ? (
        <ScrollView contentContainerStyle={styles.page}>
          <Button title="탐험으로 돌아가기" onPress={() => go('social')} />
          <Card title="예시 우주 방문">
            <Text style={styles.text}>로컬 화면 데이터 · 실제 사용자 우주가 아닙니다.</Text>
            <Button
              title={liked ? '좋아요 취소 조작' : '좋아요 조작'}
              onPress={() => setLiked((value) => !value)}
            />
            <Text style={styles.text}>
              좋아요 상태는 이 화면에서만 바뀝니다. 서버에는 전송하지 않습니다.
            </Text>
          </Card>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}
