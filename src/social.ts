import { supabase } from './supabase'

export type Profile = { id: string; username: string; display_name: string; avatar_url: string | null; xp_total: number; level: number; current_streak: number; best_streak: number; streak_protectors: number; last_workout_date: string | null; timezone: string }
export type RankingRow = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'xp_total' | 'current_streak' | 'level'> & { week_xp: number }
export const social = {
  me: async () => { if (!supabase) return null; const { data: { user } } = await supabase.auth.getUser(); if (!user) return null; const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single(); return data as Profile | null },
  search: async (query: string) => { if (!supabase || query.length < 2) return [] as Profile[]; const { data } = await supabase.from('profiles').select('*').ilike('username', `%${query}%`).limit(20); return (data ?? []) as Profile[] },
  friends: async () => { if (!supabase) return [] as Profile[]; const { data } = await supabase.rpc('my_friends'); return (data ?? []) as Profile[] },
  requestFriend: async (friendId: string) => { if (!supabase) return; const { error } = await supabase.from('friendships').insert({ friend_id: friendId }); if (error) throw error },
  rankings: async (metric: 'streak' | 'xp' | 'week') => { if (!supabase) return [] as RankingRow[]; const { data } = await supabase.rpc('friend_rankings', { ranking_metric: metric }); return (data ?? []) as RankingRow[] },
  recordWorkout: async (exercise: string, reps: number, durationSeconds: number) => { if (!supabase) return; const { error } = await supabase.rpc('record_workout', { p_exercise: exercise, p_reps: reps, p_duration_seconds: durationSeconds }); if (error) throw error }
}
