import { Image, type ImageSourcePropType } from 'react-native';
import type { Content } from '../models';

export const localStudyImages: Record<string, ImageSourcePropType> = {
  'mock-study-fusion': require('../../../assets/study-fusion-figma.png'),
  'mock-study-mass': require('../../../assets/study-mass.png'),
  'mock-study-star': require('../../../assets/study-star.png'),
};

export function studyImageSource(mediaUrl: string): ImageSourcePropType {
  return localStudyImages[mediaUrl] ?? { uri: mediaUrl, cache: 'force-cache' };
}

export function lessonImageUrls(contents: Content[]): string[] {
  return [
    ...new Set(
      contents
        .filter((content) => content.contentType === 'IMAGE')
        .map((content) => content.mediaUrl)
        .filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url))),
    ),
  ];
}

export async function prefetchLessonImages(contents: Content[], isCurrent: () => boolean) {
  const urls = lessonImageUrls(contents);
  if (!urls.length || !isCurrent()) return;

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
