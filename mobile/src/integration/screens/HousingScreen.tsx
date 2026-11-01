import { Text } from 'react-native';
import { Button, Card, Page, styles } from '../ui';

export default function HousingScreen() {
  return (
    <Page title="내 우주·상점·꾸미기">
      <Text style={styles.text}>
        명세 변경 예정. 이 화면은 기능 위치만 표시합니다. API 호출과 로컬 저장을 실행하지 않습니다.
      </Text>
      <Card title="[API-701,703] 내 우주">
        <Text>하우징 이름 · 공개 여부 · 보유 아이템</Text>
        <Button title="내 우주 조회" disabled onPress={() => {}} />
        <Button title="이름·공개 여부 저장" disabled onPress={() => {}} />
      </Card>
      <Card title="[API-702,704,907] 꾸미기·인벤토리">
        <Text>아이템 선택 · X/Y 좌표 · 회전 · 레이어 · 배치 제거 · 아바타 상태</Text>
        <Button title="인벤토리 조회" disabled onPress={() => {}} />
        <Button title="배치 편집" disabled onPress={() => {}} />
        <Button title="전체 배치 저장" disabled onPress={() => {}} />
      </Card>
      <Card title="[API-901~903] 상점">
        <Text>아이템 목록 · 옵션 선택 · 구매 결과</Text>
        <Button title="아이템 선택" disabled onPress={() => {}} />
        <Button title="구매" disabled onPress={() => {}} />
      </Card>
    </Page>
  );
}
