import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { useTask } from '../hooks';
import type { CompletedConstellation } from './constellationRecord';
import {
  artColor as color,
  ConstellationFigure,
  FolderCardShape,
  HudFrame,
  MapModeIcon,
  RecordModeIcon,
} from './constellationArt';
import { DotTabsHeader } from './ShipStatus';
import { UserStatus } from './Screen';

export type RecordMode = 'record' | 'map';

// Figma L02_2 별자리 기록 / 목록(443:1972) · L02_1 지도(749:1717) · L02_3 빈 상태(749:1801).
// 두 모드는 같은 목록(items)을 쓰고 표현만 다르다. 전환해도 다시 불러오지 않는다.
export function ConstellationRecordView({
  mode,
  items,
  task,
  onToggleMode,
  onHome,
  onOpen,
  onRetry,
}: {
  mode: RecordMode;
  items: CompletedConstellation[];
  task: ReturnType<typeof useTask>;
  onToggleMode: () => void;
  onHome: () => void;
  onOpen: (courseId: number) => void;
  onRetry: () => void;
}) {
  const { width } = useWindowDimensions();
  const empty = !items.length;
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <UserStatus task={task} floatingBusy />
      <View style={s.header}>
        <View style={s.headerTabs}>
          <DotTabsHeader
            active="record"
            tabs={[
              { key: 'learn', label: '학습', onPress: onHome },
              { key: 'record', label: mode === 'map' ? '별자리 지도' : '별자리 기록' },
            ]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mode === 'map' ? '기록으로 보기' : '지도로 보기'}
          onPress={onToggleMode}
          hitSlop={8}
        >
          {mode === 'map' ? <RecordModeIcon /> : <MapModeIcon />}
        </Pressable>
      </View>
      {task.error && empty ? (
        <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8} style={s.retry}>
          <Text style={s.retryText}>다시 불러오기</Text>
        </Pressable>
      ) : empty ? (
        task.busy ? null : (
          <EmptyRecord width={width} />
        )
      ) : mode === 'record' ? (
        <RecordGrid width={width} items={items} onOpen={onOpen} />
      ) : (
        <RecordMap items={items} onOpen={onOpen} />
      )}
    </SafeAreaView>
  );
}

// 443:1972: 폭 338, 2열, 간격 16, 카드 비율 160:144, 위 20 · 아래 40
function RecordGrid({
  width,
  items,
  onOpen,
}: {
  width: number;
  items: CompletedConstellation[];
  onOpen: (courseId: number) => void;
}) {
  // 카드 폭을 정수로 맞춰 반올림 때문에 한 줄에 하나만 들어가는 일이 없게 한다.
  const cardWidth = Math.floor((Math.min(338, width - 64) - 16) / 2);
  const gridWidth = cardWidth * 2 + 16;
  const cardHeight = (cardWidth * 144) / 160;
  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.gridScroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={[s.grid, { width: gridWidth }]}>
        {items.map((item) => (
          <Pressable
            key={item.courseId}
            accessibilityRole="button"
            accessibilityLabel={`${item.name} ${item.completedOn ? `${item.completedOn} 완성` : '완성'}`}
            onPress={() => onOpen(item.courseId)}
            style={{ width: cardWidth, height: cardHeight }}
          >
            <FolderCardShape width={cardWidth} height={cardHeight} />
            <View
              style={[s.cardContent, { top: cardHeight * 0.2179, bottom: cardHeight * 0.0782 }]}
            >
              <ConstellationFigure
                points={item.points}
                image={item.image}
                width={60}
                height={60}
                starRadius={1.6}
                glow={3}
                lineWidth={0.5}
                padding={6}
              />
              <View style={s.cardText}>
                <Text style={s.cardName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={s.cardDate}>
                  {item.completedOn ? `${item.completedOn} 완성` : '완성'}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

// 749:1717: 두 줄로 엇갈려 놓는다. 열 간격 40, 위아래 간격 60, 오른쪽 줄은 60 내려 시작한다.
function RecordMap({
  items,
  onOpen,
}: {
  items: CompletedConstellation[];
  onOpen: (courseId: number) => void;
}) {
  const columns = [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];
  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.mapScroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.mapColumns}>
        {columns.map((column, columnIndex) => (
          <View key={columnIndex} style={[s.mapColumn, columnIndex === 1 && s.mapColumnOffset]}>
            {column.map((item) => (
              <Pressable
                key={item.courseId}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                onPress={() => onOpen(item.courseId)}
                style={s.mapItem}
              >
                <ConstellationFigure
                  points={item.points}
                  image={item.image}
                  width={100}
                  height={80}
                  starRadius={2.6}
                  glow={5}
                  lineWidth={0.7}
                  padding={8}
                />
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// 749:1801: HUD 틀 가운데에 안내 문구. 틀 폭 324, 높이는 남은 화면을 채운다.
function EmptyRecord({ width }: { width: number }) {
  const [height, setHeight] = useState(0);
  const frameWidth = Math.min(324, width - 78);
  return (
    <View
      style={s.empty}
      onLayout={({ nativeEvent }) => setHeight(Math.max(0, nativeEvent.layout.height - 10))}
    >
      <View style={{ width: frameWidth, height }}>
        {height ? <HudFrame width={frameWidth} height={height} /> : null}
        <View style={s.emptyMessage}>
          <Text style={s.emptyText}>아직 완성한 별자리가 없어요.</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.base },
  // 651:1384: 위 32, 왼쪽 24(머리말 자체 여백) · 오른쪽 40, 머리말과 내용 사이 60
  header: {
    marginTop: 32,
    marginBottom: 60,
    height: 36,
    paddingRight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTabs: { flexShrink: 1 },
  retry: { alignSelf: 'center', padding: 12 },
  retryText: { color: color.fale, fontFamily: 'PretendardRegular', fontSize: 14 },
  // 별자리가 많아지면 머리말 아래 남은 높이 안에서 스크롤한다.
  scroll: { flex: 1 },
  gridScroll: { alignItems: 'center', paddingTop: 20, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  cardContent: {
    position: 'absolute',
    left: 8,
    right: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cardText: { alignItems: 'center', gap: 4 },
  cardName: {
    color: color.fale,
    fontFamily: 'PretendardMedium',
    fontSize: 12,
    textAlign: 'center',
    includeFontPadding: false,
  },
  cardDate: {
    color: '#aaaaaa',
    fontFamily: 'PretendardMedium',
    fontSize: 11,
    textAlign: 'center',
    includeFontPadding: false,
  },
  mapScroll: { alignItems: 'center', paddingBottom: 60 },
  mapColumns: { flexDirection: 'row', gap: 40 },
  mapColumn: { gap: 60 },
  mapColumnOffset: { paddingTop: 60 },
  mapItem: { width: 100, height: 80 },
  empty: { flex: 1, alignItems: 'center', paddingBottom: 10, paddingTop: 8 },
  emptyMessage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    color: '#d9d9d9',
    fontFamily: 'PretendardRegular',
    fontSize: 16,
    textAlign: 'center',
  },
});
