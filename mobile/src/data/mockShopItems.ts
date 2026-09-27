export type ShopCategory = 'wall' | 'bed' | 'floor' | 'light' | 'decoration' | 'other';

export type ShopSlot = ShopCategory;

export type ShopItem = {
  id: string;
  name: string;
  category: ShopCategory;
  slot: ShopSlot;
  color: string;
  accentColor: string;
};

export type PlacedItems = Partial<Record<ShopSlot, ShopItem>>;

export const shopCategories: { id: ShopCategory; label: string }[] = [
  { id: 'wall', label: '벽' },
  { id: 'bed', label: '침대' },
  { id: 'floor', label: '바닥' },
  { id: 'light', label: '조명' },
  { id: 'decoration', label: '장식' },
  { id: 'other', label: '기타' },
];

export const mockShopItems: ShopItem[] = [
  {
    id: 'wall-1',
    name: '기본 벽',
    category: 'wall',
    slot: 'wall',
    color: '#f1f5f9',
    accentColor: '#cbd5e1',
  },
  {
    id: 'wall-2',
    name: '별빛 벽',
    category: 'wall',
    slot: 'wall',
    color: '#dbeafe',
    accentColor: '#93c5fd',
  },
  {
    id: 'bed-1',
    name: '기본 침대',
    category: 'bed',
    slot: 'bed',
    color: '#fef3c7',
    accentColor: '#d97706',
  },
  {
    id: 'bed-2',
    name: '우주 침대',
    category: 'bed',
    slot: 'bed',
    color: '#ddd6fe',
    accentColor: '#7c3aed',
  },
  {
    id: 'floor-1',
    name: '기본 바닥',
    category: 'floor',
    slot: 'floor',
    color: '#e2e8f0',
    accentColor: '#94a3b8',
  },
  {
    id: 'floor-2',
    name: '나무 바닥',
    category: 'floor',
    slot: 'floor',
    color: '#fde68a',
    accentColor: '#b45309',
  },
  {
    id: 'light-1',
    name: '스탠드 조명',
    category: 'light',
    slot: 'light',
    color: '#fef08a',
    accentColor: '#ca8a04',
  },
  {
    id: 'light-2',
    name: '달 조명',
    category: 'light',
    slot: 'light',
    color: '#e0e7ff',
    accentColor: '#4f46e5',
  },
  {
    id: 'decoration-1',
    name: '별 장식',
    category: 'decoration',
    slot: 'decoration',
    color: '#fef08a',
    accentColor: '#eab308',
  },
  {
    id: 'decoration-2',
    name: '화분',
    category: 'decoration',
    slot: 'decoration',
    color: '#bbf7d0',
    accentColor: '#15803d',
  },
  {
    id: 'other-1',
    name: '작은 상자',
    category: 'other',
    slot: 'other',
    color: '#fed7aa',
    accentColor: '#c2410c',
  },
  {
    id: 'other-2',
    name: '러그',
    category: 'other',
    slot: 'other',
    color: '#fecdd3',
    accentColor: '#be123c',
  },
];
