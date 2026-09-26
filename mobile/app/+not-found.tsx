import { Link } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

export default function NotFound() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>페이지가 없습니다.</Text>
      <Link href="/" style={styles.link}>
        홈으로
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 18, fontWeight: '600' },
  link: { marginTop: 16, color: '#2563eb' },
})
