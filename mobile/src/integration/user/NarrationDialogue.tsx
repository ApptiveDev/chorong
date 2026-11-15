import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { NarrationMessage } from './narrationContent';

export type { NarrationMessage };

const GAP = 40;
const SOURCE_SPACE = 40;
const MOVE_DURATION = 350;
// 발화자와 상관없이 최근 대사 2개까지 쌓아 보여 준다. 더 오래된 대사는 위로 밀리며 사라진다.
const VISIBLE_LINES = 2;
const AGE_OPACITY = [1, 0.6];

function NarrationLine({
  message,
  index,
  offset,
  opacity,
  bottom,
}: {
  message: NarrationMessage;
  index: number;
  offset: number;
  opacity: number;
  bottom: number;
}) {
  const translation = useRef(new Animated.Value(index === 0 ? -offset : 20)).current;
  const fade = useRef(new Animated.Value(index === 0 ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translation, {
        toValue: -offset,
        duration: MOVE_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(fade, {
        toValue: opacity,
        duration: index > 0 && offset === 0 ? 250 : MOVE_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
    return () => {
      translation.stopAnimation();
      fade.stopAnimation();
    };
  }, [fade, index, offset, opacity, translation]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[s.linePosition, { bottom, opacity: fade, transform: [{ translateY: translation }] }]}
    >
      <NarrationCopy message={message} />
    </Animated.View>
  );
}

function NarrationCopy({ message }: { message: NarrationMessage }) {
  return (
    <View style={s.line}>
      <Text style={[s.speaker, message.speaker === '초롱이' && s.catText]}>{message.speaker}</Text>
      <Text style={[s.body, message.speaker === '초롱이' && s.catText]}>{message.text}</Text>
    </View>
  );
}

export function NarrationDialogue({
  messages,
  visibleCount,
  endCount = messages.length,
  source,
  disabled,
  onAdvance,
}: {
  messages: NarrationMessage[];
  visibleCount: number;
  // 현재 콘텐츠의 마지막 대사까지의 개수. messages 에는 이어지는 다음 콘텐츠 대사도 미리 들어 있다(높이 측정용).
  endCount?: number;
  source?: string;
  disabled: boolean;
  onAdvance: () => Promise<void>;
}) {
  const [height, setHeight] = useState(0);
  const [lineHeights, setLineHeights] = useState<Record<string, number>>({});
  const [sourceHeight, setSourceHeight] = useState(0);
  const locked = useRef(false);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (unlockTimer.current) clearTimeout(unlockTimer.current);
    },
    [],
  );

  const bottom = Math.min(370, Math.max(130, height * 0.47));
  const sourceSpace = Math.max(SOURCE_SPACE, sourceHeight + 22);
  // 사라지는 중인 대사(VISIBLE_LINES 번째 이전) 하나까지만 그린다. 그보다 오래된 대사는 이미 보이지 않는다.
  const shown = messages.slice(Math.max(0, visibleCount - VISIBLE_LINES - 1), visibleCount);
  const ready =
    height > 0 &&
    messages.every((message) => lineHeights[message.id] > 0) &&
    (!source || sourceHeight > 0);
  const handlePress = async () => {
    if (locked.current || disabled || !ready) return;
    locked.current = true;
    const isLast = visibleCount >= endCount;
    try {
      await onAdvance();
    } finally {
      if (isLast) locked.current = false;
      else unlockTimer.current = setTimeout(() => (locked.current = false), MOVE_DURATION + 40);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={visibleCount < endCount ? '다음 대화 보기' : '다음 학습 콘텐츠로 이동'}
      accessibilityState={{ disabled: disabled || !ready }}
      disabled={disabled || !ready}
      onPress={() => void handlePress()}
      onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}
      style={s.stage}
    >
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={s.measure}
      >
        {messages.map((message) => (
          <View
            key={message.id}
            onLayout={({ nativeEvent }) => {
              const measured = nativeEvent.layout.height;
              if (measured > 0)
                setLineHeights((previous) =>
                  previous[message.id] === measured
                    ? previous
                    : { ...previous, [message.id]: measured },
                );
            }}
          >
            <NarrationCopy message={message} />
          </View>
        ))}
        {source ? (
          <Text
            onLayout={({ nativeEvent }) => setSourceHeight(nativeEvent.layout.height)}
            style={s.sourceCopy}
          >
            {source}
          </Text>
        ) : null}
      </View>
      {ready &&
        shown.map((message, index) => {
          const newer = shown.slice(index + 1);
          const offset = newer.reduce((sum, next) => sum + (lineHeights[next.id] ?? 0) + GAP, 0);
          const age = shown.length - 1 - index;
          const ageOpacity = AGE_OPACITY[age] ?? 0;
          const top = height - bottom - sourceSpace - offset - (lineHeights[message.id] ?? 0);
          const topFade = Math.max(0, Math.min(1, top / 80));
          return (
            <NarrationLine
              key={message.id}
              message={message}
              index={messages.indexOf(message)}
              offset={offset}
              opacity={age === 0 ? 1 : ageOpacity * topFade}
              bottom={bottom + sourceSpace}
            />
          );
        })}
      {ready && source && visibleCount === endCount ? (
        <Text pointerEvents="none" style={[s.source, { bottom }]}>
          {source}
        </Text>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  stage: { flex: 1, overflow: 'hidden' },
  measure: { position: 'absolute', top: 0, left: 36, right: 36, opacity: 0 },
  linePosition: { position: 'absolute', left: 36, right: 36 },
  line: { gap: 16 },
  speaker: { color: '#424242', fontSize: 13, fontFamily: 'PretendardBold' },
  body: {
    color: '#6d6d6d',
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'PretendardRegular',
    maxWidth: 296,
  },
  catText: { color: '#161616' },
  source: {
    position: 'absolute',
    left: 36,
    right: 36,
    bottom: 0,
    color: '#747474',
    fontSize: 12,
    fontFamily: 'PretendardRegular',
    textAlign: 'left',
  },
  sourceCopy: {
    color: '#747474',
    fontSize: 12,
    fontFamily: 'PretendardRegular',
    textAlign: 'left',
  },
});
