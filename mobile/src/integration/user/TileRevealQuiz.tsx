// 타일 벗기기. SINGLE + config.presentation.type === 'TILE'.
// Figma 타일 벗기기(740:1438)·정답(740:1452)을 따른다. 화면 틀은 PresentedChoiceQuiz 가 맡는다.
// 사진이 다 뜬 뒤부터 tileReveal.ts 규칙대로 칸을 열고, 채점 결과가 나오면 남은 칸을 모두 연다.
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { studyImageSource } from './lessonImagePreload';
import { PresentedChoiceQuiz, type PresentedChoiceProps } from './PresentedChoiceQuiz';
import {
  TILE_COLUMNS,
  TILE_COUNT,
  TILE_FADE_MS,
  TILE_INITIAL_REVEAL,
  TILE_ROWS,
  TILE_STEP_INTERVAL_MS,
  TILE_STEP_REVEAL,
  pickHiddenTiles,
  randomCount,
} from './tileReveal';
import { presentationImageUrl } from './presentationImage';

export function TileRevealQuiz(props: PresentedChoiceProps) {
  const url = presentationImageUrl(props.quiz, 'TILE');
  return (
    <PresentedChoiceQuiz
      {...props}
      topSpace={80}
      gap={20}
      media={({ locked, graded }) =>
        url ? <TileBoard url={url} scale={props.scale} paused={locked} revealAll={graded} /> : null
      }
    />
  );
}

// Figma 740:1615: 320×240 사진 위에 8×6 타일(40×40, #F1F1F1, 0.4 #D9D9D9 테두리).
function TileBoard({
  url,
  scale,
  paused,
  revealAll,
}: {
  url: string;
  scale: number;
  // 보기를 고른 뒤(채점 중)에는 더 열지 않는다.
  paused: boolean;
  // 채점 결과가 나오면 남은 칸을 모두 연다.
  revealAll: boolean;
}) {
  const opacities = useRef(Array.from({ length: TILE_COUNT }, () => new Animated.Value(1))).current;
  const revealed = useRef(new Set<number>());
  const [loaded, setLoaded] = useState(false);
  const reduceMotion = useRef(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) reduceMotion.current = value;
      })
      .catch(() => {});
    return () => {
      active = false;
      opacities.forEach((value) => value.stopAnimation());
    };
  }, [opacities]);

  const reveal = (tiles: number[]) => {
    if (!tiles.length) return;
    tiles.forEach((tile) => revealed.current.add(tile));
    if (reduceMotion.current) {
      tiles.forEach((tile) => opacities[tile].setValue(0));
      return;
    }
    Animated.parallel(
      tiles.map((tile) =>
        Animated.timing(opacities[tile], {
          toValue: 0,
          duration: TILE_FADE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ),
    ).start();
  };

  // 사진이 뜨면 처음 칸을 연다. 실패해도 보기는 고를 수 있으므로 진행은 똑같이 한다.
  useEffect(() => {
    if (!loaded || revealed.current.size) return;
    reveal(pickHiddenTiles(revealed.current, randomCount(TILE_INITIAL_REVEAL)));
  }, [loaded]);

  useEffect(() => {
    if (!loaded || paused || revealAll) return;
    const timer = setInterval(() => {
      if (revealed.current.size >= TILE_COUNT) return clearInterval(timer);
      reveal(pickHiddenTiles(revealed.current, randomCount(TILE_STEP_REVEAL)));
    }, TILE_STEP_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loaded, paused, revealAll]);

  useEffect(() => {
    if (revealAll) reveal(pickHiddenTiles(revealed.current, TILE_COUNT));
  }, [revealAll]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="타일에 가려진 사진"
      style={[s.board, { width: 320 * scale, height: 240 * scale }]}
    >
      <Image
        source={studyImageSource(url)}
        resizeMode="cover"
        onLoadEnd={() => setLoaded(true)}
        style={s.photo}
      />
      <View pointerEvents="none" style={s.grid}>
        {opacities.map((opacity, index) => (
          <Animated.View key={index} style={[s.tile, tilePosition(index), { opacity }]} />
        ))}
      </View>
    </View>
  );
}

// 줄바꿈 배치는 퍼센트 반올림으로 8번째 칸이 다음 줄로 밀릴 수 있어 칸마다 위치를 준다.
const tilePosition = (index: number) =>
  ({
    left: `${((index % TILE_COLUMNS) * 100) / TILE_COLUMNS}%`,
    top: `${(Math.floor(index / TILE_COLUMNS) * 100) / TILE_ROWS}%`,
  }) as const;

const s = StyleSheet.create({
  board: { maxWidth: '100%', backgroundColor: '#D9D9D9', overflow: 'hidden' },
  photo: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  grid: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  tile: {
    position: 'absolute',
    width: `${100 / TILE_COLUMNS}%`,
    height: `${100 / TILE_ROWS}%`,
    backgroundColor: '#F1F1F1',
    borderWidth: 0.4,
    borderColor: '#D9D9D9',
  },
});
