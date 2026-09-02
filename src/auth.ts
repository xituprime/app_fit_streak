import { supabase } from './supabase'

export const auth = {
  signUp: async (email: string, password: string, username: string, displayName: string) => {
    if (!supabase) throw new Error('Supabase no está configurado')
    return supabase.auth.signUp({ email, password, options: { data: { username, display_name: displayName } } })
  },
  signIn: async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase no está configurado')
    return supabase.auth.signInWithPassword({ email, password })
  },
  signOut: async () => { if (supabase) await supabase.auth.signOut() },
  resetPassword: async (email: string) => {
    if (!supabase) throw new Error('Supabase no está configurado')
    return supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` })
  }
}
