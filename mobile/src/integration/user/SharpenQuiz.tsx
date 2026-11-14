// 점점 선명해지는 사진. SINGLE + config.presentation.type === 'SHARPEN'.
// Figma 점점 선명(740:1335)·정답(740:1365)을 따른다. 화면 틀은 PresentedChoiceQuiz 가 맡는다.
//
// 저화질 → 원본을 아주 천천히 바꾼다. 흐림 정도가 다른 사본을 원본 위에 겹쳐 두고, 가장 흐린 것부터
// 차례로 투명하게 만든다. 흐림은 사본마다 한 번만 계산하고 움직이는 것은 투명도뿐이라
// 네이티브 드라이버로 부드럽게 돌고 웹·iOS·Android 가 같은 방식으로 동작한다.
// 서버의 stages(흐림 반경 목록)는 아직 쓰지 않는다(화면 규칙을 앱이 정한다).
import { useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { studyImageSource } from './lessonImagePreload';
import { PresentedChoiceQuiz, type PresentedChoiceProps } from './PresentedChoiceQuiz';
import { presentationImageUrl } from './presentationImage';
import { useSlowReveal } from './slowReveal';

// 위(가장 흐림)에서 아래(원본 바로 위) 순서의 흐림 반경.
export const SHARPEN_BLUR_LAYERS = [24, 14, 8, 4, 1.5] as const;
// 처음 흐림에서 원본이 될 때까지 걸리는 시간. 채점 뒤 마무리 시간은 slowReveal 이 정한다.
export const SHARPEN_DURATION_MS = 36000;

export function SharpenQuiz(props: PresentedChoiceProps) {
  const url = presentationImageUrl(props.quiz, 'SHARPEN');
  return (
    <PresentedChoiceQuiz
      {...props}
      topSpace={80}
      gap={20}
      centered
      media={({ locked, graded }) =>
        url ? <SharpenImage url={url} scale={props.scale} paused={locked} finish={graded} /> : null
      }
    />
  );
}

// Figma 740:1364: 330×260, 모서리 12, 사진 뒤 #D9D9D9.
function SharpenImage({
  url,
  scale,
  paused,
  finish,
}: {
  url: string;
  scale: number;
  // 보기를 고른 뒤(채점 중)에는 멈춘다.
  paused: boolean;
  // 채점 결과가 나오면 원본까지 빠르게 마저 선명하게 한다.
  finish: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const source = studyImageSource(url);
  const progress = useSlowReveal({
    started: loaded,
    paused,
    finish,
    durationMs: SHARPEN_DURATION_MS,
  });

  const count = SHARPEN_BLUR_LAYERS.length;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="점점 선명해지는 사진"
      style={[s.frame, { width: 330 * scale, height: 260 * scale }]}
    >
      <Image source={source} resizeMode="cover" onLoadEnd={() => setLoaded(true)} style={s.photo} />
      {/* 아래 칸부터 그려 맨 위가 가장 흐리다. 맨 위 사본이 가장 먼저 사라진다. */}
      {SHARPEN_BLUR_LAYERS.map((blur, layer) => ({ blur, layer }))
        .reverse()
        .map(({ blur, layer }) => (
          <Animated.Image
            key={layer}
            source={source}
            resizeMode="cover"
            blurRadius={blur}
            style={[
              s.photo,
              // 흐림 가장자리가 비쳐 보이지 않게 흐린 사본은 조금 키운다.
              s.blurred,
              {
                opacity: progress.interpolate({
                  inputRange: [layer / count, (layer + 1) / count],
                  outputRange: [1, 0],
                  extrapolate: 'clamp',
                }),
              },
            ]}
          />
        ))}
    </View>
  );
}

const s = StyleSheet.create({
  frame: {
    maxWidth: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#D9D9D9',
  },
  photo: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  blurred: { transform: [{ scale: 1.08 }] },
});
