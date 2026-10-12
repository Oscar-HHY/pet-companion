import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// Per-user rolling-24h quota on AI calls, backed by public.ai_usage_events.
// That table has RLS on and no policies, so only this service-role client can
// touch it — users can't reset their own quota.

export type UsageKind = 'chat' | 'ocr';

function admin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

export async function usedInLast24h(userId: string, kind: UsageKind): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error } = await admin()
    .from('ai_usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('kind', kind).gte('created_at', since);
  if (error) throw new Error(`usage_count_failed: ${error.message}`);
  return count ?? 0;
}

export async function recordUsage(userId: string, kind: UsageKind): Promise<void> {
  const { error } = await admin().from('ai_usage_events').insert({ user_id: userId, kind });
  if (error) console.warn(`[usage] record failed: ${error.message}`);
}
