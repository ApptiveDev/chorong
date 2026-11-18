import { Image, type ImageSourcePropType } from 'react-native';
import type { Content } from '../models';
import { needsSvgRaster, requestSvgRaster, useImageSource } from '../../lib/svgRaster';
import { presentationImageUrl } from './presentationImage';

export const localStudyImages: Record<string, ImageSourcePropType> = {
  'mock-study-fusion': require('../../../assets/study-fusion-figma.png'),
  'mock-study-mass': require('../../../assets/study-mass.png'),
  'mock-study-star': require('../../../assets/study-star.png'),
};

export function studyImageSource(mediaUrl: string): ImageSourcePropType {
  return localStudyImages[mediaUrl] ?? { uri: mediaUrl, cache: 'force-cache' };
}

// 점점 선명 모자이크에 쓰는 SVG PNG 의 긴 변(px). 칸마다 한 색만 보여 작아도 된다(svgRaster 주석 참고).
export const SHARPEN_MOSAIC_RASTER_PX = 128;

/** 학습·문항 사진의 Image source. SVG 는 휴대폰에서 PNG 로 바꾸는 동안 null 이다(svgRaster). */
export function useStudyImageSource(mediaUrl: string | null | undefined, maxPx?: number) {
  return useImageSource(mediaUrl, studyImageSource, maxPx);
}

// IMAGE 콘텐츠와 사진형 SINGLE 문항(TILE·ZOOM_OUT·SHARPEN)의 사진을 함께 미리 받는다.
export function lessonImageUrls(contents: Content[]): string[] {
  return [
    ...new Set(
      contents
        .map((content) =>
          content.contentType === 'IMAGE' ? content.mediaUrl : presentationImageUrl(content.quiz),
        )
        .filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url))),
    ),
  ];
}

export async function prefetchLessonImages(contents: Content[], isCurrent: () => boolean) {
  const all = lessonImageUrls(contents);
  if (!all.length || !isCurrent()) return;
  // SVG 는 휴대폰 Image 가 그리지 못해 PNG 로 바꿔 둔다. 점점 선명은 첫 화면인 모자이크용도 만든다.
  all.filter(needsSvgRaster).forEach((url) => void requestSvgRaster(url));
  contents
    .map((content) => presentationImageUrl(content.quiz, 'SHARPEN'))
    .filter(needsSvgRaster)
    .forEach((url) => void requestSvgRaster(url, SHARPEN_MOSAIC_RASTER_PX));
  const urls = all.filter((url) => !needsSvgRaster(url));
  if (!urls.length) return;

  let cache: Awaited<ReturnType<NonNullable<typeof Image.queryCache>>> = {};
  try {
    cache = (await Image.queryCache?.(urls)) ?? {};
  } catch {
    // 캐시 조회가 실패해도 사전 로딩을 계속한다.
  }
  if (!isCurrent()) return;

  const pending = urls.filter((url) => !cache[url]);
  let cursor = 0;
  const worker = async () => {
    while (isCurrent() && cursor < pending.length) {
      const url = pending[cursor++];
      try {
        await Image.prefetch(url);
      } catch {
        // 사전 로딩 실패는 실제 이미지 화면의 로딩을 막지 않는다.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
}
