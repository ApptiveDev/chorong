import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { healthApi, notesApi, type Note } from '../../src/lib/api'

export default function Home() {
  const [health, setHealth] = useState<'loading' | 'ok' | 'error'>('loading')
  const [notes, setNotes] = useState<Note[]>([])
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setNotes(await notesApi.list())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    healthApi
      .check()
      .then((s) => setHealth(s === 'ok' ? 'ok' : 'error'))
      .catch(() => setHealth('error'))
    load()
  }, [load])

  const submit = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    try {
      await notesApi.create(title.trim(), body.trim() || undefined)
      setTitle('')
      setBody('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    await notesApi.remove(id)
    await load()
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusRow}>
        <Text style={styles.label}>API</Text>
        {health === 'loading' ? (
          <ActivityIndicator size="small" />
        ) : (
          <Text style={[styles.badge, health === 'ok' ? styles.ok : styles.bad]}>
            {health === 'ok' ? '연결됨' : '연결 실패'}
          </Text>
        )}
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="제목"
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="내용"
          value={body}
          onChangeText={setBody}
          multiline
        />
        <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={submit}>
          <Text style={styles.buttonText}>추가</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={notes}
        keyExtractor={(n) => String(n.id)}
        ListEmptyComponent={<Text style={styles.empty}>메모가 없습니다.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {item.body ? <Text style={styles.cardText}>{item.body}</Text> : null}
            </View>
            <Pressable onPress={() => remove(item.id)} hitSlop={8}>
              <Text style={styles.delete}>삭제</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, backgroundColor: '#fff' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 14, color: '#6b7280' },
  badge: { fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  ok: { backgroundColor: '#dcfce7', color: '#166534' },
  bad: { backgroundColor: '#fee2e2', color: '#991b1b' },
  form: { gap: 8 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 15 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  button: { backgroundColor: '#111827', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#b91c1c', fontSize: 13 },
  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    marginBottom: 8,
  },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardText: { fontSize: 14, color: '#4b5563' },
  delete: { color: '#b91c1c', fontSize: 13 },
})
