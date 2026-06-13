import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

console.log('Supabase debug (lib):', {
  VITE_SUPABASE_URL: supabaseUrl ? 'present' : 'missing',
  VITE_SUPABASE_ANON_KEY: supabaseAnonKey ? 'present' : 'missing',
  supabaseInitialized: Boolean(supabase),
});

if (!supabase) {
  console.error('Supabase client NOT initialized. Check environment variables.');
}

export default supabase;
