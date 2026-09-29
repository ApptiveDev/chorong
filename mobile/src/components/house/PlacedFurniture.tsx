import { G, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import type { CatalogResponse, Placement } from '../../lib/housingApi';

type PlacedFurnitureProps = {
  placements: Placement[];
  catalog: CatalogResponse | null;
};

const POSITIONS = [
  { x: 76, y: 205 },
  { x: 136, y: 220 },
  { x: 190, y: 198 },
] as const;

export function PlacedFurniture({ placements, catalog }: PlacedFurnitureProps) {
  return (
    <G>
      {placements.map((placement, index) => {
        const position = POSITIONS[index % POSITIONS.length];
        const furniture = catalog?.furniture.find((item) => item.id === placement.furnitureId);

        return (
          <G key={placement.slotId}>
            <Polygon
              points={`${position.x},${position.y} ${position.x + 38},${position.y - 20} ${position.x + 68},${position.y - 4} ${position.x + 30},${position.y + 17}`}
              fill="#e2e8f0"
              stroke="#334155"
              strokeWidth="2"
            />
            <Rect
              x={position.x}
              y={position.y}
              width="30"
              height="12"
              fill="#cbd5e1"
              stroke="#334155"
              strokeWidth="2"
            />
            <SvgText
              x={position.x + 34}
              y={position.y - 3}
              fill="#0f172a"
              fontSize="8"
              textAnchor="middle"
            >
              {furniture?.name ?? placement.furnitureId}
            </SvgText>
          </G>
        );
      })}
    </G>
  );
}
