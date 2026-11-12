import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

type Props = {
  visible: boolean;
  title: string;
  notice: string;
  confirmLabel: string;
  noticeWeight?: 'regular' | 'medium';
  scrollable?: boolean;
  error?: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SessionConfirmModal({
  visible,
  title,
  notice,
  confirmLabel,
  noticeWeight = 'regular',
  scrollable = false,
  error,
  busy,
  onCancel,
  onConfirm,
}: Props) {
  const { height } = useWindowDimensions();
  const content = (
    <>
      <View style={s.message}>
        <View style={s.heading}>
          <Text style={s.title}>{title}</Text>
        </View>
        <View style={s.notice}>
          <Text style={s.bullet}>›</Text>
          <Text style={[s.copy, noticeWeight === 'medium' && s.copyMedium]}>{notice}</Text>
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        ) : null}
      </View>
      <View style={s.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onCancel}
          style={s.cancel}
        >
          <Text style={s.cancelText}>취소</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onConfirm}
          style={s.confirm}
        >
          <Text style={s.confirmText}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.overlay}>
        <View style={[s.modal, scrollable && { maxHeight: Math.max(0, height - 32) }]}>
          {scrollable ? (
            <ScrollView
              style={s.scroll}
              contentContainerStyle={s.content}
              showsVerticalScrollIndicator={false}
            >
              {content}
            </ScrollView>
          ) : (
            <View style={s.content}>{content}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#16161680',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modal: {
    width: '100%',
    maxWidth: 358,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 8,
    backgroundColor: '#f1f1f1',
    padding: 28,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { gap: 20 },
  message: { gap: 16 },
  heading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  title: {
    color: '#161616',
    fontFamily: 'PretendardSemiBold',
    fontSize: 24,
    textAlign: 'center',
  },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12 },
  bullet: {
    width: 8,
    color: '#000000',
    fontFamily: 'PretendardRegular',
    fontSize: 15,
    lineHeight: 21,
    includeFontPadding: false,
    textAlign: 'center',
  },
  copy: {
    flex: 1,
    color: '#161616',
    fontFamily: 'PretendardRegular',
    fontSize: 15,
    lineHeight: 21,
    includeFontPadding: false,
  },
  copyMedium: { fontFamily: 'PretendardMedium' },
  error: { color: '#b42342', fontFamily: 'PretendardRegular', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 12 },
  cancel: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#161616',
    borderRadius: 4,
    backgroundColor: '#f1f1f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: '#161616', fontFamily: 'PretendardRegular', fontSize: 16 },
  confirm: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#161616',
    borderRadius: 4,
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { color: '#f1f1f1', fontFamily: 'PretendardRegular', fontSize: 16 },
});
