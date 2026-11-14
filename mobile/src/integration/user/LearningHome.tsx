import { useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  FeGaussianBlur,
  FeMerge,
  FeMergeNode,
  Filter,
  G,
  Line,
  Path,
} from 'react-native-svg';
import type { useTask } from '../hooks';
import type { ConstellationImage } from './constellationLayouts';
import { segmentStyle, type RecordStar, type StarState } from './constellationRecord';
import { EnergyIcon } from './CompletionResult';
import { DotTabsHeader, StarIcon } from './ShipStatus';
import { UserStatus } from './Screen';
import { WalletPopover, type PopoverAnchor } from './WalletPopover';

// Figma L01-01 학습 홈(757:3107). 표시할 값은 모두 CoursesScreen 이 서버 응답에서 읽어 넘긴다.
const color = { base: '#161616', fale: '#f1f1f1', yellow: '#ffde23' };

// 별자리 칸 좌표계(Figma Frame 57 기준, 폭 328). HUD 모서리 안쪽(위 61 · 높이 288)이 별을 놓는 칸이다.
const CANVAS = { width: 328, height: 370, panel: 346 };
const SKY = { x: 0, y: 61, width: 328, height: 288 };
// 별 상태별 반지름(757:3155 완료 24 · 757:3157 다음 44.25 · 757:3156 미진행 16.09)
const STAR_RADIUS: Record<StarState, number> = { done: 12, next: 22.126, todo: 7.5458 };
const nextStarSource = require('../../../assets/constellation-star-next.png');
// 다음 별 이미지(754:2746, 투명 배경 96×85)는 오른쪽 위로 번지는 그림자(31, -2, blur 10)를 포함한다.
// 그래서 이미지 왼쪽 위가 아니라 ? 원의 중심(픽셀 측정: 지름 44, 중심 (22, 44))을 별 위치에 맞춘다.
const NEXT_IMAGE = { width: 96, height: 85, centerX: 22, centerY: 44 };

const CORNER = 'M0.5 18.6513V4.5C0.5 2.29086 2.29086 0.5 4.5 0.5H18.555';
const DOTTED =
  'M0 0.5H0.977982M58.6789 0.5H57.7009M2.93394 0.5H4.88991M6.84587 0.5H8.80184M10.7578 0.5H12.7138M14.6697 0.5H16.6257M18.5817 0.5H20.5376M22.4936 0.5H24.4495M26.4055 0.5H28.3615M30.3174 0.5H32.2734M34.2294 0.5H36.1853M38.1413 0.5H40.0972M42.0532 0.5H44.0092M45.9651 0.5H47.9211M49.8771 0.5H51.833M53.789 0.5H55.745';
const RULER = [1, 27, 53, 79, 105, 131]
  .map((x) => `M${x} 0V0.6M${x} 12V11.4M${x} 3V6.6`)
  .concat(
    [14, 40, 66, 92, 118].map(
      (x) => `M${x} 0V0.444444M${x} 8V7.55556M${x} 1.77778V3.55556M${x} 4.44444V5.77778`,
    ),
  )
  .join('');
const PLAY =
  'M14.6632 5C15.433 3.66667 17.3575 3.66667 18.1273 5L28.5196 23C29.2894 24.3333 28.3272 26 26.7876 26H6.00298C4.46338 26 3.50113 24.3333 4.27093 23L14.6632 5Z';

export type LearningHomeProps = {
  task: ReturnType<typeof useTask>;
  notice: string | null;
  // 현재 별자리(코스). 없으면 별자리 칸을 그리지 않는다.
  constellation: {
    name: string;
    stars: RecordStar[];
    lit: number;
    image: ConstellationImage | null;
  } | null;
  wallet: { energy?: number; stardust: number } | null;
  nextTitle: string;
  nextDisabled: boolean;
  onOpenRecord: () => void;
  onNext: () => void;
  onReview: () => void;
  onRetry: () => void;
};

export function LearningHome({
  task,
  notice,
  constellation,
  wallet,
  nextTitle,
  nextDisabled,
  onOpenRecord,
  onNext,
  onReview,
  onRetry,
}: LearningHomeProps) {
  const { width } = useWindowDimensions();
  // 좌우 37(Figma) 여백을 두고 328 까지. 별자리 칸 안 좌표는 이 비율로 줄인다.
  const panelWidth = Math.min(CANVAS.width, width - 74);
  const k = panelWidth / CANVAS.width;
  const chipRef = useRef<View>(null);
  const [popover, setPopover] = useState<PopoverAnchor | null>(null);
  const openPopover = () =>
    chipRef.current?.measureInWindow((x, y, w, h) => setPopover({ x, y, width: w, height: h }));

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <UserStatus task={task} floatingBusy />
      <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false}>
        <DotTabsHeader
          active="learn"
          tabs={[
            { key: 'learn', label: '학습' },
            { key: 'record', label: '별자리 기록', onPress: onOpenRecord },
          ]}
        />
        {notice ? <Text style={s.error}>{notice}</Text> : null}
        <View style={[s.column, { width: panelWidth }]}>
          {constellation ? (
            <View style={[s.panel, { height: CANVAS.panel * k }]}>
              <ConstellationCanvas k={k} stars={constellation.stars} image={constellation.image} />
              <View style={s.titleRow}>
                <Text style={s.name} numberOfLines={1}>
                  {constellation.name}
                </Text>
                <Pressable
                  ref={chipRef}
                  accessibilityRole="button"
                  accessibilityLabel={`에너지 ${wallet?.energy ?? '정보 없음'}, 별가루 ${wallet?.stardust ?? '정보 없음'}. 안내 보기`}
                  onPress={openPopover}
                  hitSlop={8}
                  style={s.chip}
                >
                  <View style={s.chipEnergy}>
                    <EnergyIcon body={color.fale} />
                    <Text style={s.chipText}>{wallet?.energy ?? '—'}</Text>
                  </View>
                  <View style={s.chipStardust}>
                    <StarIcon fill={color.yellow} />
                    <Text style={[s.chipText, s.chipStardustText]}>{wallet?.stardust ?? '—'}</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          ) : null}
          {constellation ? (
            <Text style={[s.lit, { marginTop: 40 }]}>
              밝힌 별 {constellation.lit} / {constellation.stars.length}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`다음 학습 ${nextTitle}`}
            accessibilityState={{ disabled: nextDisabled }}
            disabled={nextDisabled}
            onPress={onNext}
            style={[s.nextCard, { width: panelWidth + 4 }, nextDisabled && s.disabled]}
          >
            <View style={s.nextText}>
              <Text style={s.nextLabel}>다음 학습</Text>
              <Text style={s.nextTitle} numberOfLines={1}>
                {nextTitle}
              </Text>
            </View>
            <PlayIcon />
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onReview} style={s.review}>
            <Text style={s.reviewText}>복습하기</Text>
          </Pressable>
          {task.error ? (
            <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={8}>
              <Text style={s.retryText}>다시 불러오기</Text>
            </Pressable>
          ) : null}
        </View>
        {/* 마지막 자식으로 두어 웹에서도 다른 View 아래에 깔려 가려지지 않게 한다. 터치는 받지 않는다. */}
        <ScreenDots width={width} />
      </ScrollView>
      <WalletPopover anchor={popover} onClose={() => setPopover(null)} />
    </SafeAreaView>
  );
}

// Figma 와 같은 흰 빛 번짐. 도형과 같은 색 그림자(blur)를 도형 아래에 합친다.
// 번짐 영역은 각 캔버스(viewBox) 크기에 바깥 80 씩 더해 잡는다. 영역 밖 도형은 그려지지 않는다.
function GlowFilter({
  id,
  blur,
  soften = 0,
  width,
  height,
}: {
  id: string;
  blur: number;
  soften?: number;
  width: number;
  height: number;
}) {
  return (
    <Filter
      id={id}
      x={-80}
      y={-80}
      width={width + 160}
      height={height + 160}
      filterUnits="userSpaceOnUse"
    >
      <FeGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
      <FeMerge result="glow">
        <FeMergeNode in="blur" />
        <FeMergeNode in="SourceGraphic" />
      </FeMerge>
      {soften ? <FeGaussianBlur in="glow" stdDeviation={soften} /> : null}
    </Filter>
  );
}

function ConstellationCanvas({
  k,
  stars,
  image,
}: {
  k: number;
  stars: RecordStar[];
  image: ConstellationImage | null;
}) {
  const at = (star: RecordStar) => ({
    x: SKY.x + star.point.x * SKY.width,
    y: SKY.y + star.point.y * SKY.height,
  });
  const segments = stars.slice(1).map((to, index) => {
    const from = stars[index];
    const a = at(from);
    const b = at(to);
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    const startTrim = STAR_RADIUS[from.state];
    const endTrim = STAR_RADIUS[to.state];
    return {
      key: `${from.lessonId}-${to.lessonId}`,
      style: segmentStyle(from.state),
      x1: a.x + ux * startTrim,
      y1: a.y + uy * startTrim,
      x2: b.x - ux * endTrim,
      y2: b.y - uy * endTrim,
      visible: length > startTrim + endTrim,
    };
  });
  return (
    <>
      {image ? (
        <Image
          source={image}
          resizeMode="contain"
          style={[
            s.layer,
            { left: SKY.x * k, top: SKY.y * k, width: SKY.width * k, height: SKY.height * k },
          ]}
        />
      ) : null}
      <Svg
        style={s.layer}
        width={CANVAS.width * k}
        height={CANVAS.height * k}
        viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
        pointerEvents="none"
      >
        <Defs>
          <GlowFilter id="dot" blur={12} soften={2} {...CANVAS} />
          <GlowFilter id="glow12" blur={12} {...CANVAS} />
          <GlowFilter id="glow4" blur={4} {...CANVAS} />
          <GlowFilter id="glow2" blur={2} {...CANVAS} />
        </Defs>
        {/* 배경 별(757:3160 · 757:3161 · 757:3162) */}
        <Circle cx={30} cy={119} r={2} fill={color.fale} filter="url(#dot)" />
        <Circle cx={280} cy={176} r={4} fill={color.fale} filter="url(#dot)" />
        <Circle cx={163} cy={301} r={1} fill={color.fale} filter="url(#dot)" />
        {/* HUD(757:3131): 네 모서리, 위 점선, 아래 눈금 */}
        <G stroke={color.fale} fill="none">
          <Path d={CORNER} transform="translate(-0.5 42.5587)" />
          <Path d={CORNER} transform="translate(328.5 42.5587) scale(-1 1)" />
          <Path d={CORNER} transform="translate(-0.5 367.6513) scale(1 -1)" />
          <Path d={CORNER} transform="translate(328.5 367.6513) scale(-1 -1)" />
          <Path d={DOTTED} transform="translate(45.1376 42.5587)" />
          <Path d={DOTTED} transform="translate(224.6851 42.5587)" />
          <Path d={RULER} strokeWidth={2} transform="translate(228.4954 367.0502) rotate(180)" />
        </G>
        {segments.map((segment) =>
          segment.visible ? (
            <Line
              key={segment.key}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={color.fale}
              strokeWidth={1}
              {...(segment.style === 'solid'
                ? { filter: 'url(#glow2)' }
                : { strokeDasharray: '3 3' })}
            />
          ) : null,
        )}
        {stars.map((star) => {
          const { x, y } = at(star);
          if (star.state === 'done')
            return (
              <G key={star.lessonId}>
                <Circle cx={x} cy={y} r={12.0687} fill={color.fale} filter="url(#glow4)" />
                <Circle
                  cx={x}
                  cy={y}
                  r={STAR_RADIUS.done}
                  fill={color.fale}
                  filter="url(#glow12)"
                />
              </G>
            );
          if (star.state === 'todo')
            return (
              <Circle
                key={star.lessonId}
                cx={x}
                cy={y}
                r={STAR_RADIUS.todo}
                stroke={color.fale}
                fill="none"
              />
            );
          return null;
        })}
      </Svg>
      {stars
        .filter((star) => star.state === 'next')
        .map((star) => {
          const { x, y } = at(star);
          return (
            <Image
              key={star.lessonId}
              source={nextStarSource}
              style={[
                s.layer,
                {
                  left: (x - NEXT_IMAGE.centerX) * k,
                  top: (y - NEXT_IMAGE.centerY) * k,
                  width: NEXT_IMAGE.width * k,
                  height: NEXT_IMAGE.height * k,
                },
              ]}
            />
          );
        })}
      {/* 757:3132 HUD 시계 문구(Figma 고정 문구) */}
      <Text style={[s.timer, { left: 137.42 * k, top: 36 * k, fontSize: 12 * k }]}>
        00 :00 :00 :00
      </Text>
    </>
  );
}

// 화면 배경 별(757:3114 · 757:3169 · 757:3166). Figma 402 폭 기준 좌표.
const SCREEN = { width: 402, height: 720 };
function ScreenDots({ width }: { width: number }) {
  return (
    <View pointerEvents="none" style={[s.screenDots, { left: (width - SCREEN.width) / 2 }]}>
      <Svg width={SCREEN.width} height={SCREEN.height} viewBox="0 0 402 720">
        <Defs>
          <GlowFilter id="screenDot" blur={12} soften={2} {...SCREEN} />
        </Defs>
        <Circle cx={346} cy={81} r={2} fill={color.fale} filter="url(#screenDot)" />
        <Circle cx={306} cy={38} r={6} fill={color.fale} filter="url(#screenDot)" />
        <Circle cx={57} cy={668} r={4} fill={color.fale} filter="url(#screenDot)" />
      </Svg>
    </View>
  );
}

// 757:3165 다음 학습 버튼의 재생 아이콘(Polygon 1, 위를 향한 삼각형을 90° 돌림)
function PlayIcon() {
  return (
    <View style={s.play}>
      <Svg style={s.playSvg} width={44} height={44} viewBox="-6 -6 44 44" pointerEvents="none">
        <Defs>
          <GlowFilter id="playGlow" blur={2} width={32} height={32} />
        </Defs>
        <G transform="rotate(90 16 16)">
          <Path
            d={PLAY}
            transform="translate(-0.3953 -2)"
            fill={color.fale}
            filter="url(#playGlow)"
          />
        </G>
      </Svg>
    </View>
  );
}

const textGlow = (radius: number): TextStyle =>
  Platform.OS === 'web'
    ? ({ textShadow: `0px 0px ${radius}px #f1f1f1` } as TextStyle)
    : {
        textShadowColor: '#f1f1f1',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: radius,
      };

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.base },
  // Figma: 위 32, 헤더와 별자리 묶음 사이 52
  page: { flexGrow: 1, paddingTop: 32, paddingBottom: 32, gap: 52 },
  screenDots: { position: 'absolute', top: 0, width: 402, height: 720 },
  error: { color: '#b91c1c', paddingHorizontal: 24 },
  column: { alignSelf: 'center' },
  // Frame 57 전체 불투명도 80%
  panel: { width: '100%', opacity: 0.8 },
  layer: { position: 'absolute', left: 0, top: 0 },
  titleRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: {
    flexShrink: 1,
    color: color.fale,
    fontFamily: 'PretendardBold',
    fontSize: 18,
    includeFontPadding: false,
  },
  // Frame 137: 좌우 8 · 위아래 4, 모서리 28, 묶음 간격 12
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 28,
    backgroundColor: 'rgba(241, 241, 241, 0.2)',
  },
  chipEnergy: { height: 20, flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipStardust: { height: 20, flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipText: {
    color: color.fale,
    fontFamily: 'PretendardMedium',
    fontSize: 12,
    includeFontPadding: false,
  },
  chipStardustText: { color: color.yellow },
  timer: { position: 'absolute', color: color.fale, fontFamily: 'TekoRegular' },
  // 757:3164: 왼쪽 8, Pretendard Regular 14, 2px 흰 빛
  lit: {
    marginLeft: 8,
    color: color.fale,
    fontFamily: 'PretendardRegular',
    fontSize: 14,
    includeFontPadding: false,
    ...textGlow(2),
  },
  // button_다음학습(757:3165): 폭 332(묶음보다 좌우 2 넓다), 안쪽 20, 모서리 12, 4px 흰 그림자
  nextCard: {
    marginTop: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 20,
    borderRadius: 12,
    backgroundColor: color.base,
    boxShadow: '0px 0px 4px 0px #f1f1f1',
  },
  disabled: { opacity: 0.5 },
  nextText: { flex: 1, height: 48, justifyContent: 'center', gap: 8 },
  nextLabel: {
    color: color.fale,
    fontFamily: 'PretendardRegular',
    fontSize: 14,
    includeFontPadding: false,
  },
  nextTitle: {
    color: color.fale,
    fontFamily: 'PretendardBold',
    fontSize: 20,
    includeFontPadding: false,
  },
  play: { width: 32, height: 32 },
  playSvg: { position: 'absolute', left: -6, top: -6 },
  // button_복습하기(757:3167): 높이 48, 다음 학습 버튼과 간격 10
  review: { marginTop: 10, height: 48, alignItems: 'center', justifyContent: 'center' },
  reviewText: {
    color: color.fale,
    fontFamily: 'PretendardSemiBold',
    fontSize: 16,
    includeFontPadding: false,
  },
  retryText: {
    color: color.fale,
    fontFamily: 'PretendardRegular',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
});
