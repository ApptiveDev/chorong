import type { ReactNode } from 'react'
import { Platform, StyleSheet, View } from 'react-native'

/** 웹에서만 480px 모바일 컬럼으로 중앙 정렬한다 (jimba-service `#root` 패턴). 네이티브는 그대로 통과. */
export const FRAME_MAX_WIDTH = 480

export function WebFrame({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>
  return (
    <View style={styles.outer}>
      <View style={styles.frame}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  outer: { flex: 1, alignItems: 'center', backgroundColor: '#f4f4f4' },
  frame: { flex: 1, width: '100%', maxWidth: FRAME_MAX_WIDTH, backgroundColor: '#fff' },
})
