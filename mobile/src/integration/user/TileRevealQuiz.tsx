// 타일 벗기기. SINGLE + config.presentation.type === 'TILE'.
// Figma 타일 벗기기(740:1438)·정답(740:1452)을 따른다. 화면 틀은 PresentedChoiceQuiz 가 맡는다.
// 사진을 서버 rows×columns 칸으로 모두 덮고, 누른 칸만 벗긴다. 보기는 언제든 고를 수 있다.
// 보기를 고르면 더 벗길 수 없고, 채점 결과가 나오면 남은 칸을 모두 벗긴다.
// 정답이면 해설 시트에 '타일 n개만 벗기고 맞췄어요.'를 덧붙인다(n: 보기를 고른 순간 벗긴 칸 수).
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useStudyImageSource } from './lessonImagePreload';
import { PresentedChoiceQuiz, type PresentedChoiceProps } from './PresentedChoiceQuiz';
import { presentationGrid, presentationImageUrl } from './presentationImage';
import { TILE_DEFAULT_GRID, TILE_FADE_MS, tileCorrectNote } from './tileReveal';

export function TileRevealQuiz(props: PresentedChoiceProps) {
  const url = presentationImageUrl(props.quiz, 'TILE');
  const { rows, columns } = presentationGrid(props.quiz) ?? TILE_DEFAULT_GRID;
  // 사용자가 벗긴 칸 수. 보기를 고른 뒤에는 벗길 수 없어 이 값이 곧 답한 순간의 칸 수다.
  const [revealedCount, setRevealedCount] = useState(0);
  return (
    <PresentedChoiceQuiz
      {...props}
      topSpace={80}
      gap={20}
      correctNote={tileCorrectNote(revealedCount, rows * columns)}
      media={({ locked, graded }) =>
        url ? (
          <TileBoard
            key={`${rows}x${columns}`}
            url={url}
            rows={rows}
            columns={columns}
            scale={props.scale}
            locked={locked || props.disabled}
            revealAll={graded}
            onReveal={setRevealedCount}
          />
        ) : null
      }
    />
  );
}

// Figma 740:1615: 320×240 사진 위에 타일(#F1F1F1, 0.4 #D9D9D9 테두리). 기본 8×6 이면 40×40.
function TileBoard({
  url,
  rows,
  columns,
  scale,
  locked,
  revealAll,
  onReveal,
}: {
  url: string;
  rows: number;
  columns: number;
  scale: number;
  // 보기를 고른 뒤(채점 중 포함)에는 더 벗기지 않는다.
  locked: boolean;
  // 채점 결과가 나오면 남은 칸을 모두 벗긴다.
  revealAll: boolean;
  // 사용자가 칸을 벗길 때마다 벗긴 칸 수를 알린다(채점 뒤 모두 벗기는 것은 세지 않는다).
  onReveal: (count: number) => void;
}) {
  const count = rows * columns;
  const { source } = useStudyImageSource(url);
  const [opacities] = useState(() => Array.from({ length: count }, () => new Animated.Value(1)));
  const revealed = useRef(new Set<number>());
  // revealed 는 ref 라 칸을 벗길 때 다시 그리도록 센다.
  const [, setVersion] = useState(0);
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

  const fade = (tiles: number[]) => {
    if (reduceMotion.current) {
      tiles.forEach((tile) => opacities[tile].setValue(0));
      return;
    }
    Animated.parallel(
      tiles.map((tile) =>
        Animated.timing(opacities[tile], {
          toValue: 0,
          duration: TILE_FADE_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ),
    ).start();
  };

  const uncover = (tile: number) => {
    if (locked || revealed.current.has(tile)) return;
    revealed.current.add(tile);
    setVersion((value) => value + 1);
    onReveal(revealed.current.size);
    fade([tile]);
  };

  useEffect(() => {
    if (!revealAll) return;
    const hidden = opacities.map((_, tile) => tile).filter((tile) => !revealed.current.has(tile));
    if (hidden.length) fade(hidden);
  }, [revealAll]);

  return (
    // 보기를 고른 뒤에는 칸 버튼 대신 사진 하나로 읽는다.
    <View
      accessible={locked}
      accessibilityRole={locked ? 'image' : undefined}
      accessibilityLabel={locked ? '타일에 가려진 사진' : undefined}
      style={[s.board, { width: 320 * scale, height: 240 * scale }]}
    >
      {source ? <Image source={source} resizeMode="cover" style={s.photo} /> : null}
      {opacities.map((opacity, tile) => {
        const open = revealed.current.has(tile);
        const row = Math.floor(tile / columns);
        const column = tile % columns;
        return (
          <Pressable
            key={tile}
            accessibilityRole="button"
            accessibilityLabel={`타일 벗기기, ${row + 1}행 ${column + 1}열`}
            accessibilityState={{ disabled: locked }}
            // 벗긴 칸은 버튼에서 뺀다.
            accessibilityElementsHidden={open}
            importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}
            disabled={locked || open}
            onPress={() => uncover(tile)}
            style={[s.cell, tileFrame(row, column, rows, columns)]}
          >
            <Animated.View pointerEvents="none" style={[s.tile, { opacity }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

// 줄바꿈 배치는 퍼센트 반올림으로 마지막 칸이 다음 줄로 밀릴 수 있어 칸마다 위치를 준다.
const tileFrame = (row: number, column: number, rows: number, columns: number) =>
  ({
    left: `${(column * 100) / columns}%`,
    top: `${(row * 100) / rows}%`,
    width: `${100 / columns}%`,
    height: `${100 / rows}%`,
  }) as const;

const s = StyleSheet.create({
  board: { maxWidth: '100%', backgroundColor: '#D9D9D9', overflow: 'hidden' },
  photo: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  cell: { position: 'absolute' },
  tile: {
    flex: 1,
    backgroundColor: '#F1F1F1',
    borderWidth: 0.4,
    borderColor: '#D9D9D9',
  },
});
