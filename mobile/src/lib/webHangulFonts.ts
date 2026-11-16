import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// 웹에서 한글을 쓰는 글꼴을 한글 글자로 미리 불러 둔다.
// 글꼴은 FontDisplay.BLOCK 이라 브라우저가 글꼴을 준비하기 전에는 글자를 그리지 않는다.
// expo-font 는 라틴 글자로만 불러오고 Safari 에서는 미리 불러오기를 건너뛰어, 드물게 쓰는 굵기
// (예: 완료 화면 레슨 제목의 PretendardLight)는 그 화면에서야 준비되며 글자가 늦게 보였다.
// 한글이 없는 글꼴(Teko 등)은 넣지 않는다. 한글로 불러오면 끝나지 않고 시간 초과까지 기다린다.
const HANGUL_FONTS = [
  'PretendardLight',
  'PretendardRegular',
  'PretendardMedium',
  'PretendardSemiBold',
  'PretendardBold',
];
const SAMPLE = '가나다';
// 오래 걸려도 첫 화면을 막지 않는다.
const TIMEOUT_MS = 5000;

export function useWebHangulFonts(fontsLoaded: boolean): boolean {
  const [ready, setReady] = useState(Platform.OS !== 'web');
  useEffect(() => {
    if (ready || !fontsLoaded) return;
    const fonts = typeof document === 'undefined' ? undefined : document.fonts;
    if (!fonts?.load) {
      setReady(true);
      return;
    }
    let active = true;
    const timer = setTimeout(() => active && setReady(true), TIMEOUT_MS);
    // @font-face 는 expo-font 가 fontsLoaded 전에 넣어 두었다.
    void Promise.all(HANGUL_FONTS.map((family) => fonts.load(`16px "${family}"`, SAMPLE)))
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(timer);
        if (active) setReady(true);
      });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fontsLoaded, ready]);
  return ready;
}
