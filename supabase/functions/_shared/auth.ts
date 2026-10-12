import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// Builds a Supabase client that acts AS the caller (their JWT), so every query
// is still filtered by RLS, and resolves the caller's user id.
// Returns null when the request isn't from a signed-in user.
export async function getCaller(
  req: Request,
): Promise<{ client: SupabaseClient; userId: string } | null> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) return null;
  return { client, userId: data.user.id };
}
