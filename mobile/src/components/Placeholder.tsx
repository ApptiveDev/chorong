import { StyleSheet, Text, View } from 'react-native'

export function Placeholder({ text = '준비 중인 화면입니다.' }: { text?: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  box: {
    margin: 16,
    padding: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  text: { fontSize: 14, color: '#6b7280' },
})
