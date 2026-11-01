import { ScrollView, StyleSheet } from 'react-native';
import { MenuSection, type MenuItem } from '../../src/components/MenuSection';

const settingsItems: MenuItem[] = [
  { label: '마이페이지', href: '/profile' },
  { label: '계정 관리', href: '/account' },
  { label: '인벤토리', href: '/room/inventory' },
  { label: '상점', href: '/room/shop' },
  { label: '복습하기', href: '/review' },
  { label: '시작 안내', href: '/onboarding' },
  { label: 'UI 미리보기', href: '/preview' },
  { label: '고객 문의', href: '/settings/contact' },
  { label: '앱 정보', href: '/settings/app-info' },
  { label: '개발자 도구', href: '/settings/dev-tools' },
];

export default function More() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <MenuSection items={settingsItems} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', flexGrow: 1 },
});
