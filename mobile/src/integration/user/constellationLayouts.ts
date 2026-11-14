// 학습 홈 '별자리 기록' 그림 설정. 서버가 주지 않는 정보(별 위치·순서, 임시 그림)만 둔다.
// - 별자리 이름: 서버 값(API-906 name → 코스 constellation.name → 코스 title)을 쓴다. 여기에 두지 않는다.
// - 별 개수·상태: 코스 레슨 목록(API-402)에서 정한다. 여기에 두지 않는다.
// - 그림: 서버 Constellation.imageUrl 이 있으면 그것을 먼저 쓰고, 없으면 아래 image 를 쓴다.
//   그림은 별 아래에 깔리고, 별(완료·다음·미진행)은 항상 그 위에 그린다.

// 0~1 비율 좌표. 별자리 칸(HUD 모서리 안쪽) 왼쪽 위가 (0, 0), 오른쪽 아래가 (1, 1).
// 배열 순서 = 레슨 순서(order 오름차순).
export type StarPoint = { x: number; y: number };

// require('../../../assets/...') 결과(number) 또는 원격 주소.
export type ConstellationImage = number | { uri: string };

export type ConstellationLayout = {
  stars: StarPoint[];
  image?: ConstellationImage;
};

// 별자리별 설정(constellationId 기준). 별자리가 정해지면 여기에 추가한다.
// 예) 7: { stars: [{ x: 0.2, y: 0.7 }, ...], image: require('../../../assets/constellations/cat.png') },
export const constellationLayouts: Record<number, ConstellationLayout> = {};

// 별자리별 설정이 없을 때 별 개수로 고르는 기본 배치.
// 3개: Figma L01-01 학습 홈(757:3151) '목욕하기 싫어하는 고양이자리' 임시 배치.
export const layoutsByStarCount: Record<number, ConstellationLayout> = {
  3: {
    stars: [
      { x: 0.1799, y: 0.6771 },
      { x: 0.5046, y: 0.4909 },
      { x: 0.8104, y: 0.2388 },
    ],
  },
};
