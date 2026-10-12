// Edge Function: delete-account
// Wipes the caller's storage objects, public-schema rows, profile, and auth user.
//
// Auth: caller's JWT identifies the user — function then uses service_role
//       to perform the destructive ops.
//
// Deletion order (Part 4.4 audit):
//   1. Storage objects under <userId>/ in pets/avatars/memory_media/medical_reports buckets.
//   2. Public tables with NO FK back to user_profiles (would orphan otherwise):
//      pets, pet_activities, health_questionnaires, medical_records,
//      vaccinations, weight_records, ai_chat_messages, ai_conversations, ai_usage_events.
//   3. user_profiles row — ON DELETE CASCADE cleans up: community_posts,
//      post_comments, blocked_users, chat_messages, content_reports,
//      friendships, memory_diaries, memory_echos, memory_videos, profile_visits.
//   4. auth.users row.
//
// Note: user_profiles.id is text and auth.users.id is uuid, so we can't add a
// FK between them. Hence the explicit two-step (user_profiles, then auth.users).
//
// Apple App Store guideline 5.1.1(v): apps offering account creation must also
// offer in-app account deletion. This function backs that flow.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const STORAGE_BUCKETS = ['pets', 'avatars', 'memory_media', 'medical_reports'];

// Tables with no FK back to user_profiles — must be deleted explicitly.
const ORPHAN_TABLES = [
  'pets',
  'pet_activities',
  'health_questionnaires',
  'medical_records',
  'vaccinations',
  'weight_records',
  'ai_chat_messages',
  'ai_conversations',
  'ai_usage_events',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Recursively list every object key under `<userId>/` in a bucket.
// Paginates each directory so users with > LIST_PAGE files still get
// fully cleaned up (one upload of multi-frame Memory videos can blow past
// the default 100-row Supabase limit fast).
async function listAllUnder(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const LIST_PAGE = 1000;
  const out: string[] = [];
  const stack: string[] = [prefix];
  while (stack.length) {
    const dir = stack.pop()!;
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(dir, { limit: LIST_PAGE, offset });
      if (error) {
        console.warn(`[delete-account] list failed bucket=${bucket} dir=${dir} offset=${offset}: ${error.message}`);
        break;
      }
      const rows = data ?? [];
      for (const item of rows) {
        const path = `${dir}/${item.name}`;
        // Folders show up with id === null
        if (item.id === null) {
          stack.push(path);
        } else {
          out.push(path);
        }
      }
      if (rows.length < LIST_PAGE) break;
      offset += LIST_PAGE;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }

  // 1. Identify caller using their JWT.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: 'unauthorized' }, 401);
  }
  const userId = userData.user.id;

  // 2. Service-role client for the destructive ops.
  const admin = createClient(supabaseUrl, serviceKey);

  // 3. Wipe storage objects under <userId>/ in each bucket. Best-effort —
  //    if a bucket delete fails we still proceed to delete the auth user
  //    (orphaned files are recoverable from logs; an undeletable account isn't).
  const storageErrors: Record<string, string> = {};
  for (const bucket of STORAGE_BUCKETS) {
    try {
      const paths = await listAllUnder(admin, bucket, userId);
      if (paths.length === 0) continue;
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) {
        storageErrors[bucket] = error.message;
        console.warn(`[delete-account] remove failed bucket=${bucket}: ${error.message}`);
      }
    } catch (e) {
      storageErrors[bucket] = (e as Error).message;
      console.warn(`[delete-account] bucket=${bucket} threw: ${(e as Error).message}`);
    }
  }

  // 4. Delete public rows that have no FK back to user_profiles.
  //    FATAL on error: leaving orphan health / pet records means the user
  //    thinks they're gone but they're still on disk. Better to fail loudly
  //    and let the user retry than to ship half-deletes.
  for (const table of ORPHAN_TABLES) {
    const { error } = await admin.from(table).delete().eq('user_id', userId);
    if (error) {
      return json(
        {
          error: 'table_delete_failed',
          table,
          detail: error.message,
          storageErrors,
        },
        500,
      );
    }
  }

  // 5. Delete user_profiles row — cascades through the 10 FK-linked tables.
  //    FATAL on error: leaving a profile orphan means other users can still
  //    find this account (search, friend requests). Better to fail the whole
  //    delete and let the user retry than leave residue.
  const { error: profileErr } = await admin.from('user_profiles').delete().eq('id', userId);
  if (profileErr) {
    return json(
      { error: 'profile_delete_failed', detail: profileErr.message, storageErrors },
      500,
    );
  }

  // 6. Delete auth user.
  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
  if (deleteErr) {
    return json(
      { error: 'auth_delete_failed', detail: deleteErr.message, storageErrors },
      500,
    );
  }

  return json({ ok: true, userId, storageErrors });
});
