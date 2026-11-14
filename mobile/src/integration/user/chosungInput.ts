// CHOSUNG 입력 판정. 정답 판정은 서버가 하고, 여기서는 "자동 제출해도 되는 입력인지"만 정한다.
//
// API 계약(ChosungConfig)에는 정답 길이 필드가 없고 hint 만 있다. hint 는 정답 낱말의 초성이므로
// 공백을 뺀 hint 글자 수를 입력 칸 수로 쓴다. 서버는 공백을 빼고 비교하므로(QuizGrader.compact)
// 입력에서도 공백을 빼고 센다.

// 한글 IME 가 조합 중에 남기는 낱자(자모). 이 글자가 있으면 마지막 글자가 아직 완성되지 않았다.
const JAMO = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿ힰ-퟿]/;

// 마지막 음절이 완성 글자여도 받침이 더 붙을 수 있다(하 → 합). IME 조합 종료 신호를
// React Native 가 주지 않으므로 마지막 입력 뒤 이 시간 동안 변화가 없으면 조합이 끝난 것으로 본다.
// 키보드 완료 키·입력창 포커스 해제는 조합을 확정하므로 기다리지 않는다.
export const CHOSUNG_SETTLE_MS = 1000;

export const compactChosung = (value: string) => value.replace(/\s/g, '');

// hint 를 낱말 단위로 나눠 화면에 표시한다. Figma 처럼 초성 사이를 한 칸 띄운다.
export function chosungHintLabel(hint: string): string {
  return hint
    .trim()
    .split(/\s+/)
    .map((word) => Array.from(word).join(' '))
    .join('   ');
}

export function chosungSlotCount(hint: string): number {
  return Array.from(compactChosung(hint)).length;
}

// 칸 수를 모두 채웠고 조합 중인 낱자가 없을 때만 true.
export function isChosungInputFilled(text: string, slotCount: number): boolean {
  const chars = Array.from(compactChosung(text));
  return slotCount > 0 && chars.length === slotCount && !chars.some((char) => JAMO.test(char));
}
