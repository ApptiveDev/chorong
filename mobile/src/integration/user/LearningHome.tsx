import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Animated,
  Easing,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  type LineProps,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import type { useTask } from '../hooks';
import type { ConstellationImage, StarLine } from './constellationLayouts';
import { segmentStyle, type RecordStar, type StarState } from './constellationRecord';
import { EnergyIcon } from './CompletionResult';
import { DotTabsHeader, StarIcon } from './ShipStatus';
import { UserStatus } from './Screen';
import { WalletPopover, type PopoverAnchor } from './WalletPopover';
import { GlowFilter, HUD_CORNER, HUD_DOTTED, HUD_RULER } from './constellationArt';
import { useDrift, useReduceMotion, useTwinkle } from './twinkle';

// Figma L01-01 학습 홈(757:3107). 표시할 값은 모두 CoursesScreen 이 서버 응답에서 읽어 넘긴다.
type ViewRef = ComponentRef<typeof View>;

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

const PLAY =
  'M14.6632 5C15.433 3.66667 17.3575 3.66667 18.1273 5L28.5196 23C29.2894 24.3333 28.3272 26 26.7876 26H6.00298C4.46338 26 3.50113 24.3333 4.27093 23L14.6632 5Z';

export type LearningHomeProps = {
  task: ReturnType<typeof useTask>;
  notice: string | null;
  // 현재 별자리(코스). 없으면 별자리 칸을 그리지 않는다.
  constellation: {
    name: string;
    stars: RecordStar[];
    // 이을 별 쌍(stars 배열 위치)
    lines: readonly StarLine[];
    lit: number;
    image: ConstellationImage | null;
  } | null;
  wallet: { energy?: number; stardust: number } | null;
  nextTitle: string;
  // 시작했지만 다 마치지 않은 레슨(IN_PROGRESS)이면 '이어하기', 아니면 '다음 학습'.
  nextResume: boolean;
  nextDisabled: boolean;
  onOpenRecord: () => void;
  onNext: () => void;
  // 별을 누른 경우. 밝힌 별(done)은 다시 학습, ? 별(next)은 다음 학습과 같다. 빈 별(todo)은 누를 수 없다.
  onStar: (star: RecordStar) => void;
  onReview: () => void;
  onRetry: () => void;
};

export function LearningHome({
  task,
  notice,
  constellation,
  wallet,
  nextTitle,
  nextResume,
  onStar,
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
  const reduceMotion = useReduceMotion();
  const chipRef = useRef<ViewRef>(null);
  const [popover, setPopover] = useState<PopoverAnchor | null>(null);
  const openPopover = () =>
    chipRef.current?.measureInWindow((x, y, w, h) => setPopover({ x, y, width: w, height: h }));

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {/* 화면 전체에 깔리는 배경 별·먼지. 맨 앞 자식이라 내용 뒤에 그려지고, 스크롤해도 움직이지 않는다. */}
      <ScreenBackground reduceMotion={reduceMotion} />
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
              <ConstellationCanvas
                k={k}
                stars={constellation.stars}
                lines={constellation.lines}
                image={constellation.image}
                nextResume={nextResume}
                reduceMotion={reduceMotion}
                onStar={onStar}
              />
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
            accessibilityLabel={`${nextResume ? '이어하기' : '다음 학습'} ${nextTitle}`}
            accessibilityState={{ disabled: nextDisabled }}
            disabled={nextDisabled}
            onPress={onNext}
            style={[s.nextCard, { width: panelWidth + 4 }, nextDisabled && s.disabled]}
          >
            <View style={s.nextText}>
              <Text style={s.nextLabel}>{nextResume ? '이어하기' : '다음 학습'}</Text>
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
      </ScrollView>
      <WalletPopover anchor={popover} onClose={() => setPopover(null)} />
    </SafeAreaView>
  );
}

// 별 터치 영역 한 변(캔버스 단위). 빈 별 사이가 좁아도 누르기 쉽게 별 그림보다 넉넉히 둔다.
const STAR_HIT = 44;

function ConstellationCanvas({
  k,
  stars,
  lines,
  image,
  nextResume,
  reduceMotion,
  onStar,
}: {
  k: number;
  stars: RecordStar[];
  lines: readonly StarLine[];
  image: ConstellationImage | null;
  nextResume: boolean;
  reduceMotion: boolean;
  onStar: (star: RecordStar) => void;
}) {
  const at = (star: RecordStar) => ({
    x: SKY.x + star.point.x * SKY.width,
    y: SKY.y + star.point.y * SKY.height,
  });
  // 선 스타일은 앞 번호(먼저 배우는) 별 상태를 따른다.
  const segments = lines
    .filter(([a, b]) => stars[a] && stars[b])
    .map(([fromIndex, toIndex]) => {
      const from = stars[fromIndex];
      const to = stars[toIndex];
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
  const dashOffset = useDashFlow(reduceMotion);
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
        {/* 배경 별(757:3161). 작고 흐린 757:3160 · 757:3162 는 아래에서 먼지로 떠다닌다. */}
        <Circle cx={280} cy={176} r={4} fill={color.fale} filter="url(#dot)" />
        {/* HUD(757:3131): 네 모서리, 위 점선, 아래 눈금 */}
        <G stroke={color.fale} fill="none">
          <Path d={HUD_CORNER} transform="translate(-0.5 42.5587)" />
          <Path d={HUD_CORNER} transform="translate(328.5 42.5587) scale(-1 1)" />
          <Path d={HUD_CORNER} transform="translate(-0.5 367.6513) scale(1 -1)" />
          <Path d={HUD_CORNER} transform="translate(328.5 367.6513) scale(-1 -1)" />
          <Path d={HUD_DOTTED} transform="translate(45.1376 42.5587)" />
          <Path d={HUD_DOTTED} transform="translate(224.6851 42.5587)" />
          <Path
            d={HUD_RULER}
            strokeWidth={2}
            transform="translate(228.4954 367.0502) rotate(180)"
          />
        </G>
        {segments.map((segment) =>
          !segment.visible ? null : segment.style === 'solid' ? (
            <Line
              key={segment.key}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={color.fale}
              strokeWidth={1}
              filter="url(#glow2)"
            />
          ) : (
            // 아직 안 밝힌 구간의 점선은 앞 별 → 뒤 별 방향으로 천천히 흐른다(학습 진행 방향).
            <AnimatedLine
              key={segment.key}
              x1={segment.x1}
              y1={segment.y1}
              x2={segment.x2}
              y2={segment.y2}
              stroke={color.fale}
              strokeWidth={1}
              strokeDasharray="3 3"
              strokeDashoffset={dashOffset}
            />
          ),
        )}
        {stars.map((star) => {
          const { x, y } = at(star);
          // 밝힌 별(done)은 반짝이도록 아래에서 별도 레이어로 그린다.
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
      {canvasDust.map((dust, index) => (
        <Dust
          key={index}
          id={`canvasDust${index}`}
          {...dust}
          k={k}
          area={CANVAS}
          reduceMotion={reduceMotion}
        />
      ))}
      {stars
        .filter((star) => star.state === 'done')
        .map((star, index) => (
          <DoneStar
            key={star.lessonId}
            id={star.lessonId}
            {...at(star)}
            k={k}
            index={index}
            reduceMotion={reduceMotion}
          />
        ))}
      {stars
        .filter((star) => star.state === 'next')
        .map((star) => (
          <NextStarRipple
            key={`ripple-${star.lessonId}`}
            {...at(star)}
            k={k}
            reduceMotion={reduceMotion}
          />
        ))}
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
      {stars
        .filter((star) => star.state !== 'todo')
        .map((star) => {
          const { x, y } = at(star);
          return (
            <Pressable
              key={`hit-${star.lessonId}`}
              accessibilityRole="button"
              accessibilityLabel={
                star.state === 'done'
                  ? `${star.title} 다시 학습`
                  : `${star.title} ${nextResume ? '이어하기' : '학습 시작'}`
              }
              onPress={() => onStar(star)}
              style={[
                s.layer,
                {
                  left: (x - STAR_HIT / 2) * k,
                  top: (y - STAR_HIT / 2) * k,
                  width: STAR_HIT * k,
                  height: STAR_HIT * k,
                  borderRadius: (STAR_HIT / 2) * k,
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

// 점선 흐름. 점선 한 주기(3 + 3)만큼 offset 을 줄여 무늬가 선의 끝 쪽으로 이동하게 한다.
// SVG 속성이라 네이티브 드라이버를 쓸 수 없지만 선이 몇 개뿐이라 부담이 작다.
// Animated 는 감싼 컴포넌트에 collapsable={false} 를 넘기는데, 웹에서 svg Line 은 이를 DOM 속성으로
// 그대로 내보내 React 경고가 난다. collapsable 만 걸러서 Line 에 넘긴다.
function DashLine({ collapsable: _collapsable, ...props }: LineProps & { collapsable?: boolean }) {
  return <Line {...props} />;
}
const AnimatedLine = Animated.createAnimatedComponent(DashLine);
const DASH_PERIOD = 6;
function useDashFlow(reduceMotion: boolean) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);
  return progress.interpolate({ inputRange: [0, 1], outputRange: [0, -DASH_PERIOD] });
}

// ? 별(다음 학습) 뒤에서 얇은 고리가 바깥으로 퍼지며 사라진다. '여기를 누르세요' 신호.
// 화면이 산만하지 않게 옅고(최대 0.5) 느리게(퍼지는 1.8초 + 쉬는 1.2초) 한다.
const RIPPLE_MAX = 1.9;
function NextStarRipple({
  x,
  y,
  k,
  reduceMotion,
}: {
  x: number;
  y: number;
  k: number;
  reduceMotion: boolean;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1800,
          easing: Easing.out(Easing.quad),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.delay(1200),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reduceMotion]);
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, RIPPLE_MAX] });
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const r = STAR_RADIUS.next;
  const half = r + 1; // 고리 선 두께 여유. 크기는 scale 로 키운다.
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.layer,
        {
          left: (x - half) * k,
          top: (y - half) * k,
          width: half * 2 * k,
          height: half * 2 * k,
          opacity,
          transform: [{ scale }],
        },
      ]}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${half * 2} ${half * 2}`}>
        {/* 크게 퍼질수록 선도 같이 굵어지므로 처음엔 가늘게 둔다. */}
        <Circle cx={half} cy={half} r={r} stroke={color.fale} strokeWidth={0.7} fill="none" />
      </Svg>
    </Animated.View>
  );
}

// 밝힌 별(757:3155). 별 자체는 항상 최대 밝기로 두고, 둘레의 빛무리만 숨 쉬듯 커졌다 작아진다.
// 빛무리 주기와 시작 시점은 순서대로 엇갈려 별자리 전체가 한꺼번에 움직이지 않는다.
const DONE_HALF = 52; // 반지름 12 + 빛 번짐(blur 12) 여유. 빛무리 최대(44 × 1.15)도 이 안에 든다.
const DONE_HALO = 44;
function DoneStar({
  id,
  x,
  y,
  k,
  index,
  reduceMotion,
}: {
  id: string | number;
  x: number;
  y: number;
  k: number;
  index: number;
  reduceMotion: boolean;
}) {
  // 1 → 0 → 1 로 오가는 값. 빛무리 크기·밝기로 바꿔 쓴다(별 자체 밝기는 건드리지 않는다).
  const breath = useTwinkle({
    duration: 3000 + (index % 3) * 800,
    delay: (index * 530) % 3000,
    min: 0,
    reduceMotion,
  });
  const haloOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });
  const haloScale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });
  const half = DONE_HALF;
  const viewBox = `${x - half} ${y - half} ${half * 2} ${half * 2}`;
  const glow4 = `doneGlow4-${id}`;
  const glow12 = `doneGlow12-${id}`;
  const halo = `doneHalo-${id}`;
  return (
    <View
      pointerEvents="none"
      style={[
        s.layer,
        { left: (x - half) * k, top: (y - half) * k, width: half * 2 * k, height: half * 2 * k },
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { opacity: haloOpacity, transform: [{ scale: haloScale }] },
        ]}
      >
        <Svg width="100%" height="100%" viewBox={viewBox}>
          <Defs>
            <RadialGradient id={halo}>
              <Stop offset="0" stopColor={color.fale} stopOpacity="0.7" />
              <Stop offset="0.3" stopColor={color.fale} stopOpacity="0.35" />
              <Stop offset="0.6" stopColor={color.fale} stopOpacity="0.1" />
              <Stop offset="1" stopColor={color.fale} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={x} cy={y} r={DONE_HALO} fill={`url(#${halo})`} />
        </Svg>
      </Animated.View>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox={viewBox}>
        <Defs>
          <GlowFilter id={glow4} blur={4} {...CANVAS} />
          <GlowFilter id={glow12} blur={12} {...CANVAS} />
        </Defs>
        <Circle cx={x} cy={y} r={12.0687} fill={color.fale} filter={`url(#${glow4})`} />
        <Circle cx={x} cy={y} r={STAR_RADIUS.done} fill={color.fale} filter={`url(#${glow12})`} />
      </Svg>
    </View>
  );
}

// 먼지. 아주 작고 흐린 점은 별이 아니라 먼지로 보고 천천히 떠다니게 한다(배경이 정적이지 않게).
// 좌표는 놓이는 영역(별자리 칸 CANVAS 또는 화면 SCREEN) 기준이고, 생김새는 Figma 배경 점과 같다.
type DustSpec = {
  x: number;
  y: number;
  r: number;
  dx: number;
  dy: number;
  durationX: number;
  durationY: number;
};
const DUST_HALF = 40; // 반지름 + 빛 번짐(blur 12) 여유

// 별자리 칸의 먼지(757:3160 · 757:3162)
const canvasDust: DustSpec[] = [
  { x: 30, y: 119, r: 2, dx: 12, dy: 8, durationX: 14000, durationY: 11000 },
  { x: 163, y: 301, r: 1, dx: 10, dy: 7, durationX: 12000, durationY: 16000 },
];

function Dust({
  id,
  x,
  y,
  r,
  dx,
  dy,
  durationX,
  durationY,
  k = 1,
  area,
  reduceMotion,
}: DustSpec & {
  id: string;
  k?: number;
  area: { width: number; height: number };
  reduceMotion: boolean;
}) {
  const { translateX, translateY } = useDrift({
    dx: dx * k,
    dy: dy * k,
    durationX,
    durationY,
    reduceMotion,
  });
  const half = DUST_HALF;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.layer,
        {
          left: (x - half) * k,
          top: (y - half) * k,
          width: half * 2 * k,
          height: half * 2 * k,
          transform: [{ translateX }, { translateY }],
        },
      ]}
    >
      <Svg width="100%" height="100%" viewBox={`${x - half} ${y - half} ${half * 2} ${half * 2}`}>
        <Defs>
          <GlowFilter id={id} blur={12} soften={2} {...area} />
        </Defs>
        <Circle cx={x} cy={y} r={r} fill={color.fale} filter={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

// 화면 배경(별·먼지). 학습 홈 Figma(757:3107) 402 폭 좌표를 쓰되 실제 화면 크기에 맞춰 놓는다.
// - 가로: 402 대비 비율. 넓은 화면에서도 양옆 여백까지 고르게 퍼진다.
// - 세로: 내용(별자리 칸·버튼)과 겹치지 않게, 내용이 있는 구간(복습하기 버튼까지, ~690)은 Figma 값 그대로,
//   그 아래 빈 구간은 fy(0~1) 비율로 놓아 화면이 길어질수록 아래까지 채운다.
// 좌표 0 은 안전 영역 위쪽(Figma 의 상태 표시줄 아래)과 같다.
const FIGMA_W = 402;
const CONTENT_BOTTOM = 690;
type Place = { x: number; y: number } | { x: number; fy: number };

function placeOf(place: Place, w: number, h: number) {
  return {
    x: (place.x / FIGMA_W) * w,
    y: 'y' in place ? place.y : CONTENT_BOTTOM + place.fy * Math.max(60, h - CONTENT_BOTTOM),
  };
}

// Figma 배경 별(757:3169 · 757:3166). 반짝이지 않는다.
const figmaScreenStars: (Place & { r: number })[] = [
  { x: 306, y: 38, r: 6 },
  { x: 57, y: 668, r: 4 },
];

// Figma 에 없는 추가 배경 별. 빈 곳 위주로, 별자리 칸·글자·버튼과 겹치지 않게 둔다.
// 아주 작은 원에 흐림 필터를 걸면 다 번져서 안 보이므로, 선명한 몸체에 부드러운 빛무리를 두른다.
const extraScreenStars: (Place & { r: number; duration: number; delay: number })[] = [
  // Figma 별(오른쪽 위 · 왼쪽 아래)과 겹치지 않는 오른쪽 아래 빈 구간에 하나만 둔다.
  { x: 330, fy: 0.55, r: 1.8, duration: 3600, delay: 300 }, // 복습하기 아래 오른쪽
];
const EXTRA_STAR_GLOW = 10;

// 화면의 먼지 3개. 별자리 칸 안 먼지 2개(왼쪽 위 · 가운데)와 합쳐 모두 5개가
// 오른쪽 위 → 왼쪽 위 → 가운데 → 오른쪽 아래 → 왼쪽 맨 아래로 화면 전체에 흩어지게 둔다.
const screenDust: (Place & Omit<DustSpec, 'x' | 'y'>)[] = [
  { x: 346, y: 81, r: 2, dx: 10, dy: 8, durationX: 13000, durationY: 17000 }, // 757:3114 오른쪽 위
  { x: 388, y: 560, r: 1.5, dx: 8, dy: 12, durationX: 12000, durationY: 15000 }, // 오른쪽 여백 아래
  { x: 120, fy: 0.6, r: 1.5, dx: 12, dy: 8, durationX: 15000, durationY: 13000 }, // 복습하기 아래 왼쪽
];

function ExtraScreenStar({
  x,
  y,
  r,
  duration,
  delay,
  index,
  reduceMotion,
}: {
  x: number;
  y: number;
  r: number;
  duration: number;
  delay: number;
  index: number;
  reduceMotion: boolean;
}) {
  const opacity = useTwinkle({ duration, delay, min: 0.3, reduceMotion });
  const half = r + EXTRA_STAR_GLOW;
  const glowId = `screenExtraGlow${index}`;
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x - half,
        top: y - half,
        width: half * 2,
        height: half * 2,
        opacity,
      }}
    >
      <Svg width={half * 2} height={half * 2} viewBox={`0 0 ${half * 2} ${half * 2}`}>
        <Defs>
          <RadialGradient id={glowId}>
            <Stop offset="0" stopColor={color.fale} stopOpacity="0.6" />
            <Stop offset="0.35" stopColor={color.fale} stopOpacity="0.2" />
            <Stop offset="1" stopColor={color.fale} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={half} cy={half} r={half} fill={`url(#${glowId})`} />
        <Circle cx={half} cy={half} r={r} fill={color.fale} />
      </Svg>
    </Animated.View>
  );
}

// 안전 영역 전체를 덮는 배경 레이어. 실제 크기를 재서 별을 놓는다(창 폭이 아니라 이 화면 크기 기준).
function ScreenBackground({ reduceMotion }: { reduceMotion: boolean }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // 절대 위치는 SafeAreaView 의 안쪽 여백을 무시하므로 직접 안전 영역만큼 띄운다.
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: insets.top,
        left: insets.left,
        right: insets.right,
        bottom: 0,
      }}
      onLayout={({ nativeEvent: { layout } }) =>
        setSize((previous) =>
          previous?.w === layout.width && previous.h === layout.height
            ? previous
            : { w: layout.width, h: layout.height },
        )
      }
    >
      {size ? (
        <>
          <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
            <Defs>
              <GlowFilter id="screenDot" blur={12} soften={2} width={size.w} height={size.h} />
            </Defs>
            {figmaScreenStars.map((star, index) => {
              const { x, y } = placeOf(star, size.w, size.h);
              return (
                <Circle
                  key={index}
                  cx={x}
                  cy={y}
                  r={star.r}
                  fill={color.fale}
                  filter="url(#screenDot)"
                />
              );
            })}
          </Svg>
          {screenDust.map((dust, index) => (
            <Dust
              key={`dust-${index}`}
              id={`screenDust${index}`}
              {...dust}
              {...placeOf(dust, size.w, size.h)}
              area={{ width: size.w, height: size.h }}
              reduceMotion={reduceMotion}
            />
          ))}
          {extraScreenStars.map((star, index) => (
            <ExtraScreenStar
              key={`star-${index}`}
              {...star}
              {...placeOf(star, size.w, size.h)}
              index={index}
              reduceMotion={reduceMotion}
            />
          ))}
        </>
      ) : null}
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
