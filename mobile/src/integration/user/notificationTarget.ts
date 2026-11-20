import { formatDotDate } from './constellationRecord';

// 알림함 항목의 문구와 누를 때 갈 곳(명세 API-303 '알림 종류와 앱 동작').

// 내 우주선 화면 주소에 붙여 '내 공개 모습' 모달(ShipInfoPopup)을 열게 하는 값. HomeScreen 이 읽고 지운다.
// 내 우주선이 비공개면 모달과 공개 안내 없이 내 우주선 화면에 머문다.
export const PUBLIC_VIEW_PARAM = 'public-view';

type NotificationItem = { type: 'HOUSING_LIKE'; actor: { nickname: string } };

export function notificationMessage(item: NotificationItem): string {
  switch (item.type) {
    case 'HOUSING_LIKE':
      return `${item.actor.nickname}님이 내 우주선에 좋아요를 눌렀어요.`;
  }
}

export function notificationTarget(item: NotificationItem) {
  switch (item.type) {
    case 'HOUSING_LIKE':
      return { pathname: '/housing', params: { open: PUBLIC_VIEW_PARAM } } as const;
  }
}

// 알림 시각. 기존 날짜 표기(formatDotDate 'YYYY. MM. DD', 한국시간)에 시:분을 붙인다.
export function formatNotificationTime(timestamp: string): string {
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return '';
  const kst = new Date(time + 9 * 60 * 60 * 1000).toISOString().slice(11, 16);
  return `${formatDotDate(timestamp)} ${kst}`;
}
