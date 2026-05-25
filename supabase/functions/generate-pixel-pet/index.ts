// Edge Function: generate-pixel-pet
// Proxies pixel-pet avatar generation to Seedream so SEEDREAM_API_KEY stays server-side.
//
// Request  (POST JSON):  { imageBase64: string, petBreed?: string, petFeatures?: string }
// Response (JSON):       { imageUrl: string, prompt: string }
//
// JWT verification is enforced by the Supabase Functions runtime (default behavior).
// Set the key once with:  supabase secrets set SEEDREAM_API_KEY=<key>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const SEEDREAM_API_URL = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';
const MODEL_ID = 'doubao-seedream-5-0-260128';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const apiKey = Deno.env.get('SEEDREAM_API_KEY');
  if (!apiKey) {
    return json({ error: 'server_missing_seedream_key' }, 500);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: { imageBase64?: string; petBreed?: string; petFeatures?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const imageBase64 = body.imageBase64;
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return json({ error: 'missing_image' }, 400);
  }

  // Strip newlines / quotes / control chars before interpolating into the
  // prompt — these are the primitives a prompt-injection attempt would use to
  // escape the surrounding clause and override the "ANIMAL ONLY" safety line.
  const sanitize = (s: string, max: number) =>
    s.replace(/[\r\n"'`\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const petBreed = sanitize(body.petBreed || 'pet', 100);
  const petFeatures = sanitize(body.petFeatures || 'cute and fluffy', 300);

  const dataUri = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const prompt = `A cute 2D pixel art avatar of a ${petBreed}, with features: ${petFeatures}. STRICTLY base the animal type, fur color, and markings on the provided reference image. Retro game style, flat solid background. ANIMAL ONLY, STRICTLY NO HUMANS, NO ANIME GIRLS.`;

  const upstream = await fetch(SEEDREAM_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_ID,
      prompt,
      image: [dataUri],
      response_format: 'url',
      size: '2048x2048',
    }),
  });

  const upstreamJson = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    const msg =
      upstreamJson?.error?.message ||
      upstreamJson?.message ||
      `seedream_failed_${upstream.status}`;
    return json({ error: msg }, 502);
  }

  const imageUrl = upstreamJson?.data?.[0]?.url;
  if (!imageUrl) {
    return json({ error: 'seedream_no_url' }, 502);
  }

  return json({ imageUrl, prompt });
});
