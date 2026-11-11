import { Pressable, StyleSheet, Text } from 'react-native';

export type AppButtonProps = {
  title: string;
  variant?: 'light' | 'dark' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
};

type Appearance = { backgroundColor: string; borderColor: string; color: string };
type Variant = NonNullable<AppButtonProps['variant']>;

const disabledAppearance: Appearance = {
  backgroundColor: '#d9d9d9',
  borderColor: '#747474',
  color: '#747474',
};

const appearances: Record<Variant, { default: Appearance; pressed: Appearance }> = {
  light: {
    default: { backgroundColor: '#f1f1f1', borderColor: '#161616', color: '#161616' },
    pressed: { backgroundColor: '#161616', borderColor: '#161616', color: '#f1f1f1' },
  },
  dark: {
    default: { backgroundColor: '#161616', borderColor: '#161616', color: '#f1f1f1' },
    pressed: { backgroundColor: '#f1f1f1', borderColor: '#161616', color: '#161616' },
  },
  danger: {
    default: { backgroundColor: '#f92669', borderColor: '#161616', color: '#f1f1f1' },
    pressed: { backgroundColor: '#ff558b', borderColor: '#d21450', color: '#d21450' },
  },
};

export function AppButton({
  title,
  variant = 'light',
  disabled = false,
  loading = false,
  onPress,
}: AppButtonProps) {
  const inactive = disabled || loading;
  const appearance = (pressed: boolean) =>
    inactive ? disabledAppearance : appearances[variant][pressed ? 'pressed' : 'default'];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => {
        const { backgroundColor, borderColor } = appearance(pressed);
        return [styles.button, { backgroundColor, borderColor }];
      }}
    >
      {({ pressed }) => (
        <Text style={[styles.text, { color: appearance(pressed).color }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    height: 48,
    borderWidth: 1.5,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: 'PretendardRegular',
    fontSize: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
});
