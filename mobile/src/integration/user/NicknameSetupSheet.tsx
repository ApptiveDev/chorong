import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIntegration, useTask } from '../hooks';
import { nicknameRequired } from '../nicknameSetup';
import { integrationApi as api } from '../runtime';
import { NICKNAME_MAX_LENGTH, NICKNAME_RULE, nicknameLengthError } from './profileNickname';

// M04_2 첫 닉네임 설정 (M04 한 줄 입력 · 바텀시트). 앱 루트(app/_layout.tsx)에 하나만 둔다.
// 서버가 nicknameRequired=true 를 보내는 동안 모든 화면 위에 뜨고, API-202 로 저장해야 닫힌다.
// 인증 흐름은 waitForNickname() 으로 저장을 기다린 뒤 원래 목적지로 이동한다.
// 다른 RN Modal 과 겹쳐 띄우지 않도록 Modal 이 아닌 화면 위 덮개로 그린다. 열려 있는 Modal 이 있으면 그 아래에 있다가
// Modal 이 닫히면 보인다(로그인 모달·M01_3 다음에 나타난다).
export function NicknameSetupGate() {
  const session = useIntegration();
  // 앱 재시작 때는 저장된 세션을 서버(API-201)로 다시 확인한 뒤(ready) 판단한다.
  if (!session.ready || !nicknameRequired(session.user)) return null;
  return <NicknameSetupSheet key={session.generation} />;
}

function NicknameSetupSheet() {
  const { bottom } = useSafeAreaInsets();
  const task = useTask();
  const [draft, setDraft] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  // 저장 실패 문구는 다시 입력하기 전까지만 보여 준다.
  const [showServerError, setShowServerError] = useState(false);
  const serverError = showServerError
    ? task.error?.replace(/^[A-Z_]+:\s*/, '').replace(/\s*\(HTTP \d+\)$/, '')
    : null;
  const error = inputError ?? serverError ?? null;
  const empty = !draft.trim();

  // 저장 전에는 닫을 수 없다. Android 뒤로 가기로 아래 화면이 바뀌지 않게 막는다.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  const save = () => {
    if (task.busy) return;
    const nickname = draft.trim();
    const invalid = nicknameLengthError(nickname);
    if (invalid) {
      setInputError(invalid);
      return;
    }
    setInputError(null);
    setShowServerError(true);
    // 성공하면 api.account.update 가 사용자 정보를 바꾸고(nicknameRequired=false) 이 시트가 사라진다.
    // 실패하면 입력값을 그대로 두고 오류를 보여 준다.
    void task.run(async () => {
      const me = await api.account.update({ nickname });
      Keyboard.dismiss();
      return me;
    });
  };

  return (
    <View style={s.overlay}>
      <KeyboardAvoidingView style={s.avoid} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View accessibilityViewIsModal style={[s.sheet, { paddingBottom: 24 + bottom }]}>
          <View style={s.copy}>
            <Text accessibilityRole="header" style={s.title}>
              환영해요! 닉네임을 설정해 볼까요?
            </Text>
            <Text style={s.body}>{NICKNAME_RULE}</Text>
          </View>
          <View style={s.field}>
            <TextInput
              accessibilityLabel="닉네임"
              value={draft}
              onChangeText={(value) => {
                setDraft(value);
                setInputError(null);
                setShowServerError(false);
              }}
              onSubmitEditing={save}
              editable={!task.busy}
              returnKeyType="done"
              autoCorrect={false}
              autoCapitalize="none"
              maxLength={NICKNAME_MAX_LENGTH}
              style={s.input}
            />
            {error ? (
              <Text accessibilityRole="alert" style={s.error}>
                {error}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="저장"
            accessibilityState={{ disabled: empty || task.busy, busy: task.busy }}
            disabled={empty || task.busy}
            onPress={save}
            style={[s.save, (empty || task.busy) && s.saveDisabled]}
          >
            {task.busy ? (
              <ActivityIndicator color="#f1f1f1" accessibilityLabel="저장 중" />
            ) : (
              <Text style={s.saveText}>저장</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// 색·글꼴·입력칸·버튼은 M04_1 닉네임 변경(ProfileScreen)과 같은 값을 쓴다. 시트 모양은 퀴즈 피드백 시트(위 모서리 12)를 따른다.
const s = StyleSheet.create({
  // 바깥(반투명 배경)을 눌러도 닫히지 않는다. 아래 화면도 누를 수 없다.
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    backgroundColor: '#16161680',
  },
  avoid: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    gap: 20,
    paddingTop: 28,
    paddingHorizontal: 20,
    backgroundColor: '#f1f1f1',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#161616',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  copy: { gap: 8, paddingHorizontal: 4 },
  title: { color: '#161616', fontFamily: 'PretendardSemiBold', fontSize: 20, lineHeight: 26 },
  body: { color: '#747474', fontFamily: 'PretendardRegular', fontSize: 14, lineHeight: 17 },
  field: { gap: 8 },
  input: {
    height: 40,
    paddingHorizontal: 12,
    paddingVertical: 0,
    backgroundColor: '#f1f1f1',
    borderWidth: 1,
    borderColor: '#aaaaaa',
    borderRadius: 8,
    color: '#161616',
    fontFamily: 'PretendardMedium',
    fontSize: 14,
  },
  error: { color: '#b42342', fontFamily: 'PretendardRegular', fontSize: 14, lineHeight: 17 },
  save: {
    height: 48,
    borderWidth: 1,
    borderColor: '#161616',
    borderRadius: 4,
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDisabled: { opacity: 0.5 },
  saveText: { color: '#f1f1f1', fontFamily: 'PretendardRegular', fontSize: 16 },
});
