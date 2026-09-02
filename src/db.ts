import { openDB } from 'idb'

export type Workout = { id?: number; date: string; reps: number; goal: number; xp: number; exercise?: 'pushups' | 'crunches'; durationSeconds?: number }
const db = openDB('fit-streak', 2, { upgrade(database) { if (!database.objectStoreNames.contains('workouts')) database.createObjectStore('workouts', { keyPath: 'id', autoIncrement: true }) } })
export const workouts = {
  all: async () => (await db).getAll('workouts') as Promise<Workout[]>,
  add: async (workout: Workout) => (await db).add('workouts', workout)
}
