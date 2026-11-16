import HomeScreen from '../../src/integration/user/HomeScreen';
import { GuestHousingGuard } from '../../src/integration/user/housingGate';

// 우주선. 비회원은 들어올 수 없다(학습 홈으로 돌려보내고 로그인 유도 모달을 띄운다).
export default function Housing() {
  return (
    <GuestHousingGuard>
      <HomeScreen />
    </GuestHousingGuard>
  );
}
