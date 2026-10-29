import { createStore, del, get, set } from 'idb-keyval'

const store = createStore('stillpage', 'kv')

export const db = {
  get: <T>(key: string) => get<T>(key, store),
  set: (key: string, value: unknown) => set(key, value, store),
  del: (key: string) => del(key, store),
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}
