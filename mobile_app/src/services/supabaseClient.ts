import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Where Supabase sends users after they click the email confirmation link.
// MUST match Supabase Dashboard → Authentication → URL Configuration → Site URL
// (or be in the Additional Redirect URLs allow-list).
// TODO(launch): replace with a real hosted landing page before App Store submission.
export const EMAIL_CONFIRM_REDIRECT_URL =
  process.env.EXPO_PUBLIC_EMAIL_CONFIRM_URL ||
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] 未配置 EXPO_PUBLIC_SUPABASE_URL 或 EXPO_PUBLIC_SUPABASE_ANON_KEY');
}

// SecureStore has a 2048-byte limit per key.
// Supabase session JWTs can exceed this, so we chunk large values.
const CHUNK_SIZE = 1800;

const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    const countStr = await SecureStore.getItemAsync(`${key}_count`);
    if (countStr !== null) {
      // Chunked value
      const count = parseInt(countStr, 10);
      const chunks: string[] = [];
      for (let i = 0; i < count; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_${i}`);
        if (chunk === null) return null;
        chunks.push(chunk);
      }
      return chunks.join('');
    }
    // Try as a single value (backward compat)
    return SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= CHUNK_SIZE) {
      // Small enough — store directly and clean up any old chunks
      await SecureStore.setItemAsync(key, value);
      await this._removeChunks(key);
      return;
    }
    // Chunk the value
    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${key}_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(`${key}_count`, String(count));
    // Remove direct key if it existed
    try { await SecureStore.deleteItemAsync(key); } catch {}
  },

  async removeItem(key: string): Promise<void> {
    // Remove direct key
    try { await SecureStore.deleteItemAsync(key); } catch {}
    // Remove chunks
    await this._removeChunks(key);
  },

  async _removeChunks(key: string): Promise<void> {
    const countStr = await SecureStore.getItemAsync(`${key}_count`);
    if (countStr !== null) {
      const count = parseInt(countStr, 10);
      for (let i = 0; i < count; i++) {
        try { await SecureStore.deleteItemAsync(`${key}_${i}`); } catch {}
      }
      try { await SecureStore.deleteItemAsync(`${key}_count`); } catch {}
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ChunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
