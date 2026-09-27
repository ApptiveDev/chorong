import { api } from './api';

export type Placement = {
  slotId: string;
  furnitureId: string;
};

export type Layout = {
  backgroundId: string;
  surfaceSkins: Record<string, string>;
  avatarId: string;
  placements: Placement[];
  updatedAt?: string;
};

export type OwnedFurniture = {
  furnitureId: string;
  category: string;
};

export type Owned = {
  backgroundIds: string[];
  wallIds: string[];
  floorIds: string[];
  roomIds: string[];
  avatarIds: string[];
  furniture: OwnedFurniture[];
};

export type MeResponse = {
  wallet: { coin: number };
  owned: Owned;
  activeRoomId?: string;
  layouts: Record<string, Layout>;
};

export type CatalogItem = {
  id: string;
  name: string;
};

export type Furniture = CatalogItem & {
  category: string;
  compatibleRoomIds?: string[];
};

export type Room = CatalogItem & {
  surfaces: { id: string; kind: string }[];
  slots: { id: string; allowedCategories: string[] }[];
};

export type CatalogResponse = {
  version: number;
  backgrounds: CatalogItem[];
  walls: CatalogItem[];
  floors: CatalogItem[];
  avatars: CatalogItem[];
  furniture: Furniture[];
  rooms: Room[];
};

export type ShopItem = {
  id: string;
  type: string;
  targetId: string;
  price: { coin: number };
  owned: boolean;
};

export type ShopResponse = {
  items: ShopItem[];
};

export type LayoutRequest = Pick<
  Layout,
  'backgroundId' | 'surfaceSkins' | 'avatarId' | 'placements'
>;

export const housingApi = {
  getCatalog: () =>
    api.get<CatalogResponse>('/api/housing/catalog').then((response) => response.data),
  getMe: () => api.get<MeResponse>('/api/housing/me').then((response) => response.data),
  getShop: () => api.get<ShopResponse>('/api/housing/shop').then((response) => response.data),
  saveLayout: (roomId: string, layout: LayoutRequest) =>
    api
      .put<Layout>(`/api/housing/me/rooms/${encodeURIComponent(roomId)}/layout`, layout)
      .then((response) => response.data),
};

export function getCatalogItemName(catalog: CatalogResponse, targetId: string) {
  const items = [
    ...catalog.backgrounds,
    ...catalog.walls,
    ...catalog.floors,
    ...catalog.avatars,
    ...catalog.furniture,
    ...catalog.rooms,
  ];

  return items.find((item) => item.id === targetId)?.name;
}
