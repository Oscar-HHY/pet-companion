import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface AssistantConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ExtractedMedicalReport {
  clinic_name: string;
  visit_date: string;   // YYYY-MM-DD or ''
  diagnosis: string;
  treatment: string;
  medications: string;
  notes: string;
  raw_text: string;
}

/** Error carrying the Edge Function's `error` code (e.g. 'daily_limit_reached'). */
export class AssistantError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // Non-2xx: the function's JSON body is on error.context, not in `data`.
    let code = error.message || 'request_failed';
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      if (payload?.error) code = payload.error;
    }
    throw new AssistantError(code);
  }
  return data as T;
}

export function extractMedicalReport(paths: string[]): Promise<ExtractedMedicalReport> {
  return invoke<ExtractedMedicalReport>('extract-medical-report', { paths });
}

export function sendAssistantMessage(message: string, conversationId?: string | null): Promise<{
  reply: string; remaining: number; conversation_id: string; title: string;
}> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return invoke('pet-assistant-chat', { message, tz, ...(conversationId ? { conversation_id: conversationId } : {}) });
}

export async function listConversations(userId: string): Promise<AssistantConversation[]> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`读取对话记录失败: ${error.message}`);
  return (data ?? []) as AssistantConversation[];
}

export async function getConversationMessages(conversationId: string, limit = 200): Promise<AssistantMessage[]> {
  const { data, error } = await supabase
    .from('ai_chat_messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`读取聊天记录失败: ${error.message}`);
  return ((data ?? []) as AssistantMessage[]).reverse();
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const { error } = await supabase.from('ai_conversations').delete().eq('id', conversationId);
  if (error) throw new Error(`删除对话失败: ${error.message}`);
}
