// 비회원은 우주선(하우징)에 들어갈 수 없다. 우주선 탭·꾸미기 화면 주소로 들어오면 학습 홈으로 돌려보내고
// 탭 레이아웃이 로그인 유도 모달(HousingLoginModal)을 띄운다. 하단 탭을 누르는 경우는 탭 레이아웃이 직접 막는다.
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { useIntegration } from '../hooks';

// 학습 홈 주소에 붙여 모달을 열게 하는 값. app/(tabs)/_layout.tsx 가 읽고 지운다.
export const HOUSING_LOGIN_PARAM = 'housing';

export function useIsGuest(): boolean {
  return useIntegration().user?.status === 'GUEST';
}

export function GuestHousingGuard({ children }: { children: ReactNode }) {
  const guest = useIsGuest();
  if (guest) return <Redirect href={{ pathname: '/', params: { login: HOUSING_LOGIN_PARAM } }} />;
  return <>{children}</>;
}
