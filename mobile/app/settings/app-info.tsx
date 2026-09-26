import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';

export default function AppInfo() {
  const version = Constants.expoConfig?.version ?? '-';
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';
  return (
    <View style={styles.container}>
      <Row label="앱 이름" value="chorong" />
      <Row label="버전" value={version} />
      <Row label="API" value={apiUrl} />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', flex: 1 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  label: { fontSize: 14, color: '#6b7280' },
  value: { fontSize: 14, color: '#111827' },
});
