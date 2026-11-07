import { StyleSheet, View } from 'react-native';

export function ControlSwitch({ value }: { value: boolean }) {
  return (
    <View style={[s.track, value && s.trackOn]}>
      <View style={[s.thumb, value && s.thumbOn]} />
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    width: 42,
    height: 25,
    borderRadius: 20,
    backgroundColor: '#e0d9e6',
    justifyContent: 'center',
  },
  trackOn: { backgroundColor: '#9b86ae' },
  thumb: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#fff', marginLeft: 3 },
  thumbOn: { marginLeft: 20 },
});
