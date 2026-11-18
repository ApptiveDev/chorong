// 원격 SVG 그림을 PNG 로 바꿔 React Native Image 에 넘긴다.
//
// 휴대폰(iOS·Android)의 Image 는 SVG 를 그리지 못한다. 웹은 브라우저가 그리므로 주소를 그대로 쓴다.
// 사진형 문항(점점 선명 모자이크·타일·줌아웃)은 Image 위에서 효과를 내므로, SVG 를 그 자리에서
// 벡터로 그리는 대신 한 번 PNG(data URI)로 바꿔 같은 Image 코드를 쓴다.
//
// 변환: 주소의 SVG 를 받아 react-native-svg 로 화면 뒤(SvgRasterHost)에 그리고 toDataURL 로 PNG 를 얻는다.
// 결과는 주소·크기별로 캐시한다. 레슨 사전 로딩(prefetchLessonImages)도 같은 캐시를 채운다.
//
// iOS 는 HTTP 로 받은 그림만 디코딩 결과를 캐시해서, data URI 는 Image 마다 따로 디코딩한다.
// 같은 그림을 수백 칸에 까는 화면(점점 선명 모자이크)은 maxPx 를 작게 줘서 디코딩 비용을 줄인다.
import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { PixelRatio, Platform, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Svg, { parse } from 'react-native-svg';

// PNG 긴 변(px)의 기본 상한.
export const RASTER_MAX_PX = 1024;
// toDataURL 이 응답하지 않을 때 실패로 보는 시간.
const RASTER_TIMEOUT_MS = 10_000;
// 메모리에 남길 PNG 수. 넘으면 가장 오래된 것부터 지운다.
const CACHE_LIMIT = 40;

type Job = {
  key: string;
  children: ReactNode;
  rootProps: Record<string, unknown>;
  viewBox: string;
  // 캔버스 크기(px).
  width: number;
  height: number;
};

type Entry =
  | { status: 'loading'; promise: Promise<void> }
  | { status: 'ready'; source: ImageSourcePropType }
  | { status: 'error' };

const entries = new Map<string, Entry>();
const svgTexts = new Map<string, Promise<string>>();
const jobs = new Map<string, Job>();
const resolvers = new Map<string, (base64: string | null) => void>();
const listeners = new Set<() => void>();
let jobsSnapshot: Job[] = [];

const emit = () => {
  jobsSnapshot = [...jobs.values()];
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const keyOf = (url: string, maxPx: number) => `${maxPx}:${url}`;

/** 휴대폰에서 PNG 로 바꿔야 하는 SVG 주소인지. 쿼리·해시는 보지 않는다. */
export function needsSvgRaster(url: string | null | undefined): url is string {
  if (Platform.OS === 'web' || !url || !/^https?:\/\//i.test(url)) return false;
  return /\.svg$/i.test(url.split(/[?#]/)[0]);
}

function viewBoxSize(props: Record<string, unknown>): { width: number; height: number } | null {
  const box = typeof props.viewBox === 'string' ? props.viewBox.trim().split(/[\s,]+/) : [];
  const size =
    box.length === 4
      ? { width: Number(box[2]), height: Number(box[3]) }
      : { width: parseFloat(String(props.width)), height: parseFloat(String(props.height)) };
  return size.width > 0 && size.height > 0 ? size : null;
}

// viewBox 가 상한보다 작으면 정수 배로 키워 픽셀 그림의 경계가 번지지 않게 한다.
function canvasSize(box: { width: number; height: number }, maxPx: number) {
  const long = Math.max(box.width, box.height);
  const scale = long <= maxPx ? Math.floor(maxPx / long) : maxPx / long;
  return {
    width: Math.max(1, Math.round(box.width * scale)),
    height: Math.max(1, Math.round(box.height * scale)),
  };
}

function remember(key: string, entry: Entry) {
  entries.delete(key);
  entries.set(key, entry);
  if (entry.status !== 'ready') return;
  const ready = [...entries].filter(([, value]) => value.status === 'ready');
  ready.slice(0, Math.max(0, ready.length - CACHE_LIMIT)).forEach(([old]) => entries.delete(old));
}

// 같은 주소를 여러 크기로 바꿔도 한 번만 받는다. 실패하면 다음 요청에서 다시 받는다.
function fetchSvg(url: string) {
  let text = svgTexts.get(url);
  if (!text) {
    text = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`svg.fetch status=${response.status}`);
      return response.text();
    });
    text.catch(() => svgTexts.delete(url));
    svgTexts.set(url, text);
  }
  return text;
}

async function rasterize(url: string, maxPx: number, key: string): Promise<void> {
  try {
    const ast = parse(await fetchSvg(url));
    if (!ast) throw new Error('svg.parse empty');
    const rootProps = ast.props as Record<string, unknown>;
    const box = viewBoxSize(rootProps);
    if (!box) throw new Error('svg.size missing');
    const base64 = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => finish(null), RASTER_TIMEOUT_MS);
      const finish = (value: string | null) => {
        clearTimeout(timer);
        resolvers.delete(key);
        jobs.delete(key);
        emit();
        resolve(value);
      };
      resolvers.set(key, finish);
      jobs.set(key, {
        key,
        children: ast.children,
        rootProps,
        viewBox:
          typeof rootProps.viewBox === 'string'
            ? rootProps.viewBox
            : `0 0 ${box.width} ${box.height}`,
        ...canvasSize(box, maxPx),
      });
      emit();
    });
    if (!base64) throw new Error('svg.raster empty');
    remember(key, { status: 'ready', source: { uri: `data:image/png;base64,${base64}` } });
  } catch {
    // 화면은 실패 상태를 받아 그림 자리에 안내 문구나 빈 틀을 보인다.
    remember(key, { status: 'error' });
  }
  emit();
}

/** SVG 주소의 PNG 변환을 시작한다(이미 했거나 하는 중이면 그 결과를 기다린다). */
export function requestSvgRaster(url: string, maxPx = RASTER_MAX_PX): Promise<void> {
  const key = keyOf(url, maxPx);
  const entry = entries.get(key);
  if (entry?.status === 'loading') return entry.promise;
  if (entry) return Promise.resolve();
  const promise = rasterize(url, maxPx, key);
  // fetch 가 동기로 던지면 rasterize 가 첫 await 전에 실패를 기록한다. 그 결과를 덮지 않는다.
  if (!entries.has(key)) entries.set(key, { status: 'loading', promise });
  return promise;
}

/**
 * Image 에 넘길 source. SVG 가 아니면 makeSource(url) 을 바로 돌려주고,
 * SVG 면 PNG 로 바꾸는 동안 source 가 null 이다. 변환에 실패하면 failed 가 true 다.
 * maxPx 는 PNG 긴 변의 상한이다.
 */
export function useImageSource(
  url: string | null | undefined,
  makeSource: (url: string) => ImageSourcePropType,
  maxPx = RASTER_MAX_PX,
): { source: ImageSourcePropType | null; failed: boolean } {
  const svg = needsSvgRaster(url);
  const key = svg ? keyOf(url, maxPx) : null;
  const entry = useSyncExternalStore(subscribe, () => (key ? entries.get(key) : undefined));
  // 처음 보거나 캐시에서 밀려났으면 다시 변환한다.
  useEffect(() => {
    if (svg && !entry) void requestSvgRaster(url, maxPx);
  }, [svg, url, maxPx, entry]);
  // 사진을 수백 칸에 까는 화면이 있어 source 객체를 주소마다 하나로 유지한다.
  const plain = useMemo(() => (url && !svg ? makeSource(url) : null), [url, svg]);
  if (!url) return { source: null, failed: false };
  if (!svg) return { source: plain, failed: false };
  if (entry?.status === 'ready') return { source: entry.source, failed: false };
  return { source: null, failed: entry?.status === 'error' };
}

/**
 * SVG 를 PNG 로 그리는 자리. 앱 루트에서 화면보다 먼저(아래에) 한 번 둔다.
 * 거의 투명하게 그리는 이유: Android 는 뷰가 한 번 그려진 뒤에야 toDataURL 이 응답한다.
 */
export function SvgRasterHost() {
  const pending = useSyncExternalStore(subscribe, () => jobsSnapshot);
  if (Platform.OS === 'web' || !pending.length) return null;
  return (
    <View pointerEvents="none" style={s.host}>
      {pending.map((job) => (
        <RasterJob key={job.key} job={job} />
      ))}
    </View>
  );
}

function RasterJob({ job }: { job: Job }) {
  const ref = useRef<Svg>(null);
  // 뷰 크기(dp)는 캔버스(px)를 화면 배율로 나눈 값이다.
  // iOS 는 뷰 크기(pt)를 화면 배율로 그리고, Android 는 넘긴 크기(px)에 viewBox 를 맞춘다.
  const ratio = PixelRatio.get();
  const width = job.width / ratio;
  const height = job.height / ratio;
  useEffect(() => {
    const finish = resolvers.get(job.key);
    if (!ref.current || !finish) return;
    const ios = Platform.OS === 'ios';
    // iOS 는 base64 에 줄바꿈을 넣는다. data URI 에서 지운다.
    ref.current.toDataURL((base64) => finish(base64 ? base64.replace(/\s/g, '') : null), {
      width: ios ? width : job.width,
      height: ios ? height : job.height,
    });
  }, [job, width, height]);
  return (
    <Svg
      ref={ref}
      {...job.rootProps}
      viewBox={job.viewBox}
      preserveAspectRatio="xMidYMid meet"
      width={width}
      height={height}
      style={s.canvas}
    >
      {job.children}
    </Svg>
  );
}

const s = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    opacity: 0.01,
  },
  canvas: { position: 'absolute', top: 0, left: 0 },
});
