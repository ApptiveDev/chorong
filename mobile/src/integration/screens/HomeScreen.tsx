import { Text } from 'react-native';
import { Card, Nav, Page, styles } from '../ui';

export default function HomeScreen() {
  return (
    <Page title="초롱 기능 검증">
      <Text style={styles.text}>
        10/30 명세 기반 테스트입니다. 서버 검증 대기 상태이며, 기존 개발자 도구와 인증 세션을
        공유하지 않습니다.
      </Text>
      <Nav href="/integration/account" label="로그인·계정 관리 열기" />
      <Nav href="/integration/onboarding" label="온보딩 시작" />
      <Nav href="/integration/learning" label="학습하기" />
      <Nav href="/integration/review" label="복습하기" />
      <Nav href="/integration/social" label="다른 우주 탐색" />
      <Nav href="/integration/profile" label="마이페이지 열기" />
      <Nav href="/integration/housing" label="내 우주·상점 화면 보기" />
      <Card title="개발 테스트">
        <Nav href="/integration/diagnostics" label="API 요청 기록 확인" />
        <Nav href="/settings/dev-tools" label="기존 개발자 도구 열기" />
      </Card>
    </Page>
  );
}
