import { TextInput, View } from 'react-native';
import { styles } from './shared';

export function FillBlankQuiz({
  texts,
  onChange,
  disabled,
}: {
  texts: string[];
  onChange: (texts: string[]) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.stack}>
      {texts.map((text, index) => (
        <TextInput
          key={index}
          accessibilityLabel={`빈칸 ${index + 1}`}
          placeholder="답 입력"
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          value={text}
          onChangeText={(value) => onChange(texts.map((t, i) => (i === index ? value : t)))}
          style={styles.input}
        />
      ))}
    </View>
  );
}
