import { ScrollView, StyleSheet } from 'react-native';
import { MenuSection, type MenuItem } from '../../src/components/MenuSection';

const settingsItems: MenuItem[] = [
  { label: '프로필', href: '/settings/profile' },
  { label: '내 정보', href: '/settings/my-info' },
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
