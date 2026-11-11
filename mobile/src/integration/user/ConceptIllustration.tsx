import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { studyImageSource } from './lessonImagePreload';

export function ConceptIllustration({
  mediaUrl,
  body,
  scale,
  disabled,
  onAdvance,
}: {
  mediaUrl: string | null;
  body: string | null;
  scale: number;
  disabled: boolean;
  onAdvance: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const width = 348 * scale;
  const height = 269 * scale;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="다음 학습 콘텐츠로 이동"
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
        {body ? (
          <View style={s.copyWrap}>
            <Text style={s.copy}>{body}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  stage: { flex: 1, alignItems: 'center' },
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
  copyWrap: { width: '100%', paddingHorizontal: 8, paddingVertical: 12 },
  copy: { color: '#161616', fontSize: 16, lineHeight: 20, fontFamily: 'PretendardMedium' },
});
