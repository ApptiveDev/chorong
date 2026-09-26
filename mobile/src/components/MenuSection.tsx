import { Ionicons } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type MenuItem = { label: string; href: Href };

export function MenuSection({ title, items }: { title?: string; items: MenuItem[] }) {
  return (
    <View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {items.map((item) => (
        <Link key={item.label} href={item.href} asChild>
          <Pressable style={styles.row}>
            <Text style={styles.label}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  label: { fontSize: 15, color: '#1f2937' },
});
