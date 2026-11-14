// 점점 선명해지는 사진. SINGLE + config.presentation.type === 'SHARPEN'.
// Figma 점점 선명(740:1335)·정답(740:1365)을 따른다. 화면 틀은 PresentedChoiceQuiz 가 맡는다.
//
// 서버 stages(흐림 반경, 예: [24, 12, 4, 0])를 앞에서 뒤로 아주 천천히 지나 원본(0)이 된다.
// 단계마다 그 반경으로 흐린 사본을 원본 위에 겹쳐 두고, 가장 흐린 것부터 차례로 투명하게 만든다.
// 흐림은 사본마다 한 번만 계산하고 움직이는 것은 투명도뿐이라 네이티브 드라이버로 부드럽게 돈다.
// 정답이면 해설 시트에 'n단계에서 맞췄어요.'를 덧붙인다(n: 보기를 고른 순간의 단계, 1부터).
import { useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { studyImageSource } from './lessonImagePreload';
import { PresentedChoiceQuiz, type PresentedChoiceProps } from './PresentedChoiceQuiz';
import { presentationImageUrl, presentationStages } from './presentationImage';
import { useSlowReveal } from './slowReveal';

// stages 가 없거나 규칙에 맞지 않을 때 쓰는 흐림 반경.
export const SHARPEN_DEFAULT_STAGES = [24, 14, 8, 4, 2, 0] as const;
// 첫 단계에서 원본이 될 때까지 걸리는 시간(단계 수와 관계없이 같다). 채점 뒤 마무리는 slowReveal 이 정한다.
export const SHARPEN_DURATION_MS = 36000;

/**
 * 진행 값(0~1)이 가리키는 단계(1부터). 단계 사이 칸을 같은 시간으로 나누고,
 * 다음 단계에 닿기 전까지는 앞 단계로 센다. 끝(1)이면 마지막 단계(원본)다.
 */
export function sharpenStageAt(progress: number, stageCount: number) {
  const spans = stageCount - 1;
  if (spans <= 0) return 1;
  return Math.min(stageCount, Math.floor(Math.max(0, progress) * spans + 1e-6) + 1);
}

export function SharpenQuiz(props: PresentedChoiceProps) {
  const url = presentationImageUrl(props.quiz, 'SHARPEN');
  const stages = presentationStages(props.quiz, 'SHARPEN') ?? [...SHARPEN_DEFAULT_STAGES];
  const [answeredStage, setAnsweredStage] = useState<number | null>(null);
  return (
    <PresentedChoiceQuiz
      {...props}
      topSpace={80}
      gap={20}
      centered
      correctNote={answeredStage ? `${answeredStage}단계에서 맞췄어요.` : null}
      media={({ locked, graded }) =>
        url ? (
          <SharpenImage
            url={url}
            stages={stages}
            scale={props.scale}
            paused={locked}
            finish={graded}
            onAnswerStage={setAnsweredStage}
          />
        ) : null
      }
    />
  );
}

// Figma 740:1364: 330×260, 모서리 12, 사진 뒤 #D9D9D9.
function SharpenImage({
  url,
  stages,
  scale,
  paused,
  finish,
  onAnswerStage,
}: {
  url: string;
  // 흐림 반경. 마지막은 0(원본).
  stages: number[];
  scale: number;
  // 보기를 고른 뒤(채점 중)에는 멈춘다.
  paused: boolean;
  // 채점 결과가 나오면 원본까지 빠르게 마저 선명하게 한다.
  finish: boolean;
  onAnswerStage: (stage: number) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const source = studyImageSource(url);
  const progress = useSlowReveal({
    started: loaded,
    paused,
    finish,
    durationMs: SHARPEN_DURATION_MS,
    onPause: (value) => onAnswerStage(sharpenStageAt(value, stages.length)),
  });

  // 마지막(0)은 원본 사진 자체라 사본을 만들지 않는다. 사본 i 는 i 단계 → i+1 단계 칸에서 사라진다.
  const layers = stages.slice(0, -1);
  const spans = stages.length - 1;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="점점 선명해지는 사진"
      style={[s.frame, { width: 330 * scale, height: 260 * scale }]}
    >
      <Image source={source} resizeMode="cover" onLoadEnd={() => setLoaded(true)} style={s.photo} />
      {/* 아래 칸부터 그려 맨 위가 가장 흐리다. 맨 위 사본이 가장 먼저 사라진다. */}
      {layers
        .map((blur, layer) => ({ blur, layer }))
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
                  inputRange: [layer / spans, (layer + 1) / spans],
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
