import axios from 'axios';

const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

export type Note = {
  id: number;
  title: string;
  body: string | null;
  createdAt: string | null;
};

export const notesApi = {
  list: () => api.get<Note[]>('/api/notes').then((r) => r.data),
  create: (title: string, body?: string) =>
    api.post<Note>('/api/notes', { title, body }).then((r) => r.data),
  remove: (id: number) => api.delete(`/api/notes/${id}`),
};

export const healthApi = {
  check: () => api.get<{ status: string }>('/api/health').then((r) => r.data.status),
};
