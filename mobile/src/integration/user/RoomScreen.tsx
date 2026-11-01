import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { Button, Card, styles } from '../ui';
import { UserScreen } from './Screen';

export default function RoomScreen() {
  const { mode } = useLocalSearchParams<{ mode: string }>();
  const router = useRouter();
  return (
    <UserScreen title={mode === 'shop' ? '상점·꾸미기' : '꾸미기'}>
      <Card title="추후 구현">
        <Text style={styles.text}>하우징 꾸미기 화면은 추후 구현 예정입니다.</Text>
        <Button title="홈으로 돌아가기" onPress={() => router.replace('/')} />
      </Card>
    </UserScreen>
  );
}
