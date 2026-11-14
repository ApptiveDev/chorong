import { useEffect, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { shipColor as color } from './ShipStatus';

// 구경하기 신고·차단 확인 모달. Figma M04_2(293:7121) · Frame 46(293:7085).
// 틀: 배경 #F1F1F1, 테두리 1 #000, 모서리 8, 좌우 20 · 위아래 22, 오른쪽 위에 경고 삼각형(72×64)이 걸친다.
export const REPORT_DETAIL_MAX = 255; // API-805 detail maxLength

function Frame({
  visible,
  busy,
  triangleTop,
  onRequestClose,
  children,
}: {
  visible: boolean;
  busy: boolean;
  triangleTop: number;
  onRequestClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => !busy && onRequestClose()}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.overlay}
      >
        <View style={s.box}>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {/* Figma: 가운데에서 오른쪽으로 97 (삼각형 중심) */}
          <View pointerEvents="none" style={[s.triangle, { top: triangleTop }]}>
            <WarningTriangle />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Heading({ title, rightPadding }: { title: string; rightPadding: number }) {
  return (
    <View style={[s.heading, { paddingRight: rightPadding }]}>
      <Text style={s.title}>{title}</Text>
    </View>
  );
}

function Prompt({ text, gap, medium }: { text: string; gap: number; medium?: boolean }) {
  return (
    <View style={[s.prompt, { gap }]}>
      <Text style={s.bullet}>{'>'}</Text>
      <Text style={[s.promptText, medium && s.promptMedium]}>{text}</Text>
    </View>
  );
}

function Actions({
  confirmLabel,
  confirmDisabled,
  busy,
  onCancel,
  onConfirm,
}: {
  confirmLabel: string;
  confirmDisabled: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const disabled = confirmDisabled || busy;
  return (
    <View style={s.actions}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onCancel}
        style={[s.button, s.cancel]}
      >
        <Text style={s.cancelText}>취소</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onConfirm}
        style={[s.button, confirmDisabled ? s.confirmDisabled : s.confirm]}
      >
        <Text style={confirmDisabled ? s.confirmDisabledText : s.confirmText}>{confirmLabel}</Text>
      </Pressable>
    </View>
  );
}

// 신고: 사유를 적어야 '신고 접수'가 활성화된다. API-805 reason 은 자유 입력이라 OTHER 로 보낸다.
export function ReportModal({
  visible,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (detail: string) => void;
}) {
  const [detail, setDetail] = useState('');
  useEffect(() => {
    if (visible) setDetail('');
  }, [visible]);
  const trimmed = detail.trim();
  return (
    <Frame visible={visible} busy={busy} triangleTop={-34} onRequestClose={onCancel}>
      <View style={s.message}>
        <Heading title="신고하기" rightPadding={10} />
        <Prompt text="신고 이유를 입력해주세요_" gap={8} />
      </View>
      <View style={s.reportBody}>
        <Text style={s.caption14} numberOfLines={1} adjustsFontSizeToFit>
          이 사용자의 우주선을 구경 목록에서 볼 수 없어요_
        </Text>
        <View style={s.group}>
          <TextInput
            accessibilityLabel="신고 사유"
            placeholder="신고 사유를 적어주세요."
            placeholderTextColor={color.tertiary}
            value={detail}
            onChangeText={setDetail}
            maxLength={REPORT_DETAIL_MAX}
            multiline
            editable={!busy}
            style={s.input}
          />
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          <Actions
            confirmLabel="신고 접수"
            confirmDisabled={!trimmed}
            busy={busy}
            onCancel={onCancel}
            onConfirm={() => onSubmit(trimmed)}
          />
        </View>
      </View>
    </Frame>
  );
}

export function BlockModal({
  visible,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Frame visible={visible} busy={busy} triangleTop={-29} onRequestClose={onCancel}>
      <View style={s.message}>
        <Heading title="차단" rightPadding={12} />
        <Prompt text="이 사용자를 차단할까요?" gap={7} medium />
      </View>
      <View style={s.group}>
        <Text style={s.caption13}>이 사용자의 우주선을 구경 목록에서 볼 수 없어요_</Text>
        {error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        ) : null}
        <Actions
          confirmLabel="차단"
          confirmDisabled={false}
          busy={busy}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </View>
    </Frame>
  );
}

// Figma 293:7134 Vector (72×64, #161616 · 느낌표 흰색)
function WarningTriangle() {
  return (
    <Svg width={72} height={64} viewBox="0 0 72 64" fill="none">
      <Path
        d="M32.0683 2.28572C33.8157 -0.761904 38.1843 -0.761906 39.9317 2.28571L71.385 57.1429C73.1324 60.1905 70.9482 64 67.4533 64H4.54667C1.05186 64 -1.1324 60.1905 0.615004 57.1429L32.0683 2.28572Z"
        fill={color.base}
      />
      <Path
        d="M34.2294 47.1314C34.7742 46.5829 35.4552 46.3086 36.2724 46.3086C37.0896 46.3086 37.7706 46.5829 38.3153 47.1314C38.8601 47.6571 39.1325 48.3429 39.1325 49.1886C39.1325 50.0343 38.8601 50.7314 38.3153 51.28C37.7706 51.8286 37.0896 52.1029 36.2724 52.1029C35.4552 52.1029 34.7742 51.8286 34.2294 51.28C33.6847 50.7314 33.4123 50.0343 33.4123 49.1886C33.4123 48.3429 33.6847 47.6571 34.2294 47.1314ZM37.1577 42.6743C37.0896 43.2229 36.7945 43.4971 36.2724 43.4971C35.7503 43.4971 35.4552 43.2229 35.3871 42.6743C35.1147 40.7543 34.7742 38.7086 34.3656 36.5371C33.9797 34.3429 33.6733 32.6057 33.4463 31.3257C33.242 30.0229 33.1399 28.9714 33.1399 28.1714C33.1399 27.1657 33.435 26.3543 34.0251 25.7371C34.6153 25.12 35.3644 24.8114 36.2724 24.8114C37.1804 24.8114 37.9295 25.12 38.5196 25.7371C39.1098 26.3543 39.4049 27.1657 39.4049 28.1714C39.4049 28.9714 39.2914 30.0229 39.0644 31.3257C38.8601 32.6057 38.5537 34.3429 38.1451 36.5371C37.7592 38.7086 37.4301 40.7543 37.1577 42.6743Z"
        fill="#ffffff"
      />
    </Svg>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#16161680',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
  },
  box: {
    width: '100%',
    maxWidth: 342,
    maxHeight: '100%',
    backgroundColor: color.fale,
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { width: '100%', maxWidth: 300, alignSelf: 'center' },
  triangle: { position: 'absolute', left: '50%', marginLeft: 97 - 36, width: 72, height: 64 },
  message: { gap: 16 },
  // Figma 제목 칸: 왼쪽 24 · 위아래 8, 글자 SemiBold 32 #000
  heading: { paddingLeft: 24, paddingVertical: 8 },
  title: { color: '#000000', fontFamily: 'PretendardSemiBold', fontSize: 32 },
  // Figma 안내 줄: 높이 40, 왼쪽 36
  prompt: { minHeight: 40, flexDirection: 'row', alignItems: 'flex-start', paddingLeft: 36 },
  // Figma 는 학교안심 우주 R. 앱에 없는 폰트라 다른 모달과 같은 깍두기체로 대체한다.
  bullet: { color: '#000000', fontFamily: 'KkakdugiRegular', fontSize: 14, lineHeight: 18 },
  promptText: {
    flexShrink: 1,
    color: '#000000',
    fontFamily: 'PretendardRegular',
    fontSize: 15,
    lineHeight: 18,
  },
  promptMedium: { fontFamily: 'PretendardMedium' },
  reportBody: { gap: 8 },
  group: { gap: 24 },
  caption14: {
    width: '100%',
    color: color.tertiary,
    fontFamily: 'PretendardRegular',
    fontSize: 14,
    lineHeight: 17,
    includeFontPadding: false,
  },
  caption13: { color: color.tertiary, fontFamily: 'PretendardRegular', fontSize: 13 },
  // Figma 293:7139 입력_01: 최소 높이 64, 안쪽 12, 테두리 #AAAAAA, 모서리 8
  input: {
    minHeight: 64,
    maxHeight: 140,
    padding: 12,
    paddingTop: 12,
    backgroundColor: color.fale,
    borderWidth: 1,
    borderColor: color.lght,
    borderRadius: 8,
    color: color.base,
    fontFamily: 'PretendardMedium',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  error: { marginTop: -12, color: '#b42342', fontFamily: 'PretendardRegular', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 12 },
  button: {
    flex: 1,
    maxWidth: 144,
    height: 48,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancel: { backgroundColor: color.fale, borderColor: color.base },
  cancelText: { color: color.base, fontFamily: 'PretendardRegular', fontSize: 16 },
  confirm: { backgroundColor: color.base, borderColor: color.base },
  confirmText: { color: color.fale, fontFamily: 'PretendardRegular', fontSize: 16 },
  // Figma 293:7133 신고 접수 비활성: 배경 #D9D9D9, 테두리·글자 #747474
  confirmDisabled: { backgroundColor: color.mist, borderColor: color.tertiary },
  confirmDisabledText: { color: color.tertiary, fontFamily: 'PretendardRegular', fontSize: 16 },
});
