// True when the public Supabase env vars needed by the browser/server clients are present.
// Pages check this before calling createClient() so a misconfigured deployment renders a clear
// notice instead of throwing an opaque 500.
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
