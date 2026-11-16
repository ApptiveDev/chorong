import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { studyImageSource } from './lessonImagePreload';
import type { NarrationMessage } from './narrationContent';
import { NarrationCopy } from './NarrationDialogue';

// 개념(IMAGE) 화면. 그림 아래에 키워드와 대사(dialogue)를 차례로 놓는다.
// 대사는 나레이션처럼 탭할 때마다 하나씩 드러나고 최근 2개까지 남긴다(이전 대사는 흐리게).
// 대사를 모두 본 뒤 탭하면 다음 콘텐츠로 넘어간다. 대사 대신 body 만 오는 이전 형식도 그대로 그린다.
const VISIBLE_LINES = 2;
const OLDER_OPACITY = 0.6;
const FADE_MS = 300;

function ConceptLine({ message, opacity }: { message: NarrationMessage; opacity: number }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.timing(fade, {
      toValue: opacity,
      duration: FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [fade, opacity]);
  return (
    <Animated.View style={{ opacity: fade }}>
      <NarrationCopy message={message} />
    </Animated.View>
  );
}

export function ConceptIllustration({
  mediaUrl,
  keyword,
  body,
  messages = [],
  visibleCount = 0,
  source,
  scale,
  disabled,
  onAdvance,
}: {
  mediaUrl: string | null;
  keyword?: string | null;
  body: string | null;
  messages?: NarrationMessage[];
  visibleCount?: number;
  source?: string;
  scale: number;
  disabled: boolean;
  onAdvance: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const width = 348 * scale;
  const height = 269 * scale;
  const shown = messages.slice(Math.max(0, visibleCount - VISIBLE_LINES), visibleCount);
  const allShown = visibleCount >= messages.length;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={allShown ? '다음 학습 콘텐츠로 이동' : '다음 대화 보기'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onAdvance}
      style={[s.stage, { paddingTop: 144 * scale }]}
    >
      <View style={[s.group, { width, gap: 28 * scale }]}>
        <View style={[s.imageFrame, { width, height }]}>
          {mediaUrl && !failed ? (
            <Image
              source={studyImageSource(mediaUrl)}
              style={s.image}
              resizeMode="contain"
              fadeDuration={0}
              onError={() => setFailed(true)}
            />
          ) : (
            <Text style={s.imageError}>이미지를 불러오지 못했습니다.</Text>
          )}
        </View>
        {keyword ? <Text style={s.keyword}>{keyword}</Text> : null}
        {body && !messages.length ? (
          <View style={s.copyWrap}>
            <Text style={s.copy}>{body}</Text>
          </View>
        ) : null}
        {shown.length ? (
          <View style={[s.lines, { gap: 28 * scale }]}>
            {shown.map((message, index) => (
              <ConceptLine
                key={message.id}
                message={message}
                opacity={index === shown.length - 1 ? 1 : OLDER_OPACITY}
              />
            ))}
          </View>
        ) : null}
        {source && allShown ? <Text style={s.source}>{source}</Text> : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center', overflow: 'hidden' },
  group: { alignItems: 'flex-start' },
  imageFrame: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#d9d9d9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  imageError: { color: '#747474', fontSize: 12, fontFamily: 'PretendardRegular' },
  keyword: {
    paddingHorizontal: 8,
    color: '#161616',
    fontSize: 20,
    lineHeight: 24,
    fontFamily: 'PretendardBold',
  },
  copyWrap: { width: '100%', paddingHorizontal: 8, paddingVertical: 12 },
  copy: { color: '#161616', fontSize: 16, lineHeight: 20, fontFamily: 'PretendardMedium' },
  lines: { width: '100%', paddingHorizontal: 8 },
  source: {
    paddingHorizontal: 8,
    color: '#747474',
    fontSize: 12,
    fontFamily: 'PretendardRegular',
  },
});
