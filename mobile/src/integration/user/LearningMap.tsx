import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import type { Course } from '../models';

const points = [
  { x: 23, y: 20 },
  { x: 70, y: 42 },
  { x: 31, y: 73 },
  { x: 75, y: 81 },
  { x: 50, y: 12 },
  { x: 15, y: 50 },
];

export function LearningMap({
  courses,
  compact = false,
  onSelect,
}: {
  courses: Course[];
  compact?: boolean;
  onSelect: (courseId: number) => void;
}) {
  const visible = courses.slice(0, points.length);
  return (
    <View style={[s.map, { height: compact ? 265 : 390 }]}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
      >
        {visible.slice(1).map((_, index) => (
          <Line
            key={index}
            x1={points[index].x}
            y1={points[index].y}
            x2={points[index + 1].x}
            y2={points[index + 1].y}
            stroke="#aab8c8"
            strokeWidth="0.45"
            strokeDasharray="1.2 1.2"
          />
        ))}
      </Svg>
      {visible.map((course, index) => (
        <Pressable
          key={course.courseId}
          accessibilityRole="button"
          accessibilityLabel={`${course.constellation?.name ?? course.title} 레슨 목록`}
          onPress={() => onSelect(course.courseId)}
          style={[s.node, { left: `${points[index].x}%`, top: `${points[index].y}%` }]}
        >
          <View style={[s.star, course.completedLessons > 0 && s.done]}>
            <Ionicons
              name={course.completedLessons > 0 ? 'star' : 'star-outline'}
              size={18}
              color={course.completedLessons > 0 ? '#fff' : '#273a52'}
            />
          </View>
          <Text style={s.name} numberOfLines={1}>
            {course.constellation?.name ?? course.title}
          </Text>
          {!compact ? (
            <Text style={s.progress}>
              {course.completedLessons}/{course.totalLessons} 완료
            </Text>
          ) : null}
        </Pressable>
      ))}
      {!visible.length ? <Text style={s.empty}>표시할 별자리가 없습니다.</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  map: {
    borderWidth: 1,
    borderColor: '#dce2e8',
    backgroundColor: '#f2f4f7',
    borderRadius: 4,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  node: {
    position: 'absolute',
    width: 112,
    alignItems: 'center',
    transform: [{ translateX: -56 }, { translateY: -23 }],
  },
  star: {
    width: 43,
    height: 43,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#273a52',
    alignItems: 'center',
    justifyContent: 'center',
  },
  done: { backgroundColor: '#273a52' },
  name: { marginTop: 5, color: '#273a52', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  progress: { color: '#7b8795', fontSize: 10, marginTop: 2 },
  empty: { textAlign: 'center', color: '#7b8795', fontSize: 12 },
});
