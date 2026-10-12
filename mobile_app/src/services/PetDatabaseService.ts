import { supabase } from './supabaseClient';
import * as FileSystem from 'expo-file-system/legacy';

// ═══════════════════════════════════════════
// Interfaces (field names match DB columns)
// ═══════════════════════════════════════════

export interface PetProfile {
  user_id: string;
  name: string;
  breed: string;
  age: string;
  bio: string;
  photo_url: string | null;
  pixel_avatar_url?: string | null;
  status: string;
  updated_at?: string;
}

export interface PetActivity {
  id?: number;
  user_id: string;
  action_type: string;
  duration_seconds?: number | null;
  created_at?: string;
}

export interface HealthQuestionnaire {
  id?: string;
  user_id: string;
  symptoms: string;       // DB column: symptoms
  severity: string;
  duration: string;
  treatment_status: string;
  created_at?: string;
  updated_at?: string;
}

export interface MedicalRecord {
  id?: string;
  user_id: string;
  clinic_name: string;    // DB column: clinic_name
  diagnosis: string;
  treatment: string;
  medications: string;
  notes: string;
  visit_date?: string | null;          // YYYY-MM-DD
  report_image_paths?: string[];       // object paths in the private `medical_reports` bucket
  report_ocr_text?: string | null;     // full text extracted from the report photos
  created_at?: string;
  updated_at?: string;
}

export interface Vaccination {
  id?: string;
  user_id: string;
  vaccine_date: string;   // DB column: vaccine_date
  vaccine_name?: string | null;
  dose_number: string;
  next_due_date: string;
  reminder_notification_id?: string | null;
  created_at?: string;
}

export interface WeightRecord {
  id?: string;
  user_id: string;
  weight: number;         // DB column: weight
  created_at?: string;
}

// ═══════════════════════════════════════════
// Pet Profile
// ═══════════════════════════════════════════

export async function savePetProfile(
  userId: string,
  profileData: Omit<PetProfile, 'user_id' | 'updated_at'>,
): Promise<PetProfile> {
  const { data, error } = await supabase
    .from('pets')
    .upsert(
      { user_id: userId, ...profileData, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
    .select()
    .single();
  if (error) throw new Error(`保存失败: ${error.message}`);
  return data as PetProfile;
}

export async function getPetProfile(userId: string): Promise<PetProfile | null> {
  const { data, error } = await supabase
    .from('pets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`读取失败: ${error.message}`);
  return data as PetProfile | null;
}

// ═══════════════════════════════════════════
// Pet Photo Upload
// ═══════════════════════════════════════════

export async function uploadPetPhoto(
  userId: string,
  imageUri: string,
): Promise<string> {
  const ext = imageUri.split('.').pop() || 'jpg';
  const fileName = `${userId}/pet_${Date.now()}.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic',
  };
  const contentType = mimeMap[ext.toLowerCase()] || 'image/jpeg';

  const { error: uploadError } = await supabase.storage
    .from('pets')
    .upload(fileName, bytes.buffer, { contentType, upsert: true });
  if (uploadError) throw new Error(`宠物照片上传失败: ${uploadError.message}`);

  const { data: urlData } = supabase.storage
    .from('pets')
    .getPublicUrl(fileName);

  // Update photo_url in pets table
  await supabase
    .from('pets')
    .update({ photo_url: urlData.publicUrl, updated_at: new Date().toISOString() })
    .eq('user_id', userId);

  return urlData.publicUrl;
}

// ═══════════════════════════════════════════
// Pixel Avatar URL
// ═══════════════════════════════════════════

export async function updatePixelAvatarUrl(
  userId: string,
  pixelAvatarUrl: string,
): Promise<void> {
  const { error } = await supabase
    .from('pets')
    .update({ pixel_avatar_url: pixelAvatarUrl, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw new Error(`保存像素头像失败: ${error.message}`);
}

// ═══════════════════════════════════════════
// Pet Activities
// ═══════════════════════════════════════════

export async function addPetActivity(
  userId: string,
  actionType: string,
  durationSeconds?: number,
): Promise<PetActivity> {
  const row: Record<string, unknown> = { user_id: userId, action_type: actionType };
  if (typeof durationSeconds === 'number' && durationSeconds > 0) {
    row.duration_seconds = durationSeconds;
  }
  const { data, error } = await supabase
    .from('pet_activities')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(`记录活动失败: ${error.message}`);
  return data as PetActivity;
}

export async function getPetActivities(userId: string, limit = 20): Promise<PetActivity[]> {
  const { data, error } = await supabase
    .from('pet_activities')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`读取活动记录失败: ${error.message}`);
  return (data ?? []) as PetActivity[];
}

export async function deletePetActivity(activityId: number): Promise<void> {
  const { error } = await supabase
    .from('pet_activities')
    .delete()
    .eq('id', activityId);
  if (error) throw new Error(`删除活动失败: ${error.message}`);
}

// ═══════════════════════════════════════════
// Health Questionnaires
// ═══════════════════════════════════════════

export async function addHealthQuestionnaire(
  userId: string,
  data_: Omit<HealthQuestionnaire, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
): Promise<HealthQuestionnaire> {
  const { data, error } = await supabase
    .from('health_questionnaires')
    .insert({ user_id: userId, ...data_ })
    .select()
    .single();
  if (error) throw new Error(`保存健康概况失败: ${error.message}`);
  return data as HealthQuestionnaire;
}

export async function getHealthQuestionnaires(userId: string): Promise<HealthQuestionnaire[]> {
  const { data, error } = await supabase
    .from('health_questionnaires')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`读取健康概况失败: ${error.message}`);
  return (data ?? []) as HealthQuestionnaire[];
}

// ═══════════════════════════════════════════
// Medical Records
// ═══════════════════════════════════════════

export async function addMedicalRecord(
  userId: string,
  record: Omit<MedicalRecord, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
): Promise<MedicalRecord> {
  const { data, error } = await supabase
    .from('medical_records')
    .insert({ user_id: userId, ...record })
    .select()
    .single();
  if (error) throw new Error(`保存医疗记录失败: ${error.message}`);
  return data as MedicalRecord;
}

export async function updateMedicalRecord(
  recordId: string,
  updates: Partial<Omit<MedicalRecord, 'id' | 'user_id' | 'created_at'>>,
): Promise<MedicalRecord> {
  const { data, error } = await supabase
    .from('medical_records')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', recordId)
    .select()
    .single();
  if (error) throw new Error(`更新医疗记录失败: ${error.message}`);
  return data as MedicalRecord;
}

/**
 * Uploads a vet report / lab-sheet photo to the private `medical_reports` bucket.
 * Returns the object PATH (not a signed URL — those expire); use
 * getMedicalReportImageUrl() to display it.
 */
export async function uploadMedicalReportImage(userId: string, imageUri: string): Promise<string> {
  const ext = (imageUri.split('.').pop() || 'jpg').toLowerCase();
  const fileName = `${userId}/report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic',
  };
  const { error } = await supabase.storage
    .from('medical_reports')
    .upload(fileName, bytes.buffer, { contentType: mimeMap[ext] || 'image/jpeg' });
  if (error) throw new Error(`病历图片上传失败: ${error.message}`);
  return fileName;
}

export async function getMedicalReportImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('medical_reports')
    .createSignedUrl(path, 60 * 60);
  if (error) throw new Error(`获取病历图片失败: ${error.message}`);
  return data.signedUrl;
}

export async function deleteMedicalReportImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from('medical_reports').remove(paths);
  if (error) throw new Error(`删除病历图片失败: ${error.message}`);
}

export async function getMedicalRecords(userId: string): Promise<MedicalRecord[]> {
  const { data, error } = await supabase
    .from('medical_records')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`读取医疗记录失败: ${error.message}`);
  return (data ?? []) as MedicalRecord[];
}

// ═══════════════════════════════════════════
// Vaccinations
// ═══════════════════════════════════════════

export async function addVaccination(
  userId: string,
  record: Omit<Vaccination, 'id' | 'user_id' | 'created_at'>,
): Promise<Vaccination> {
  const { data, error } = await supabase
    .from('vaccinations')
    .insert({ user_id: userId, ...record })
    .select()
    .single();
  if (error) throw new Error(`保存疫苗记录失败: ${error.message}`);
  return data as Vaccination;
}

export async function getVaccinations(userId: string): Promise<Vaccination[]> {
  const { data, error } = await supabase
    .from('vaccinations')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`读取疫苗记录失败: ${error.message}`);
  return (data ?? []) as Vaccination[];
}

export async function setVaccinationReminderId(id: string, reminderId: string | null): Promise<void> {
  const { error } = await supabase
    .from('vaccinations')
    .update({ reminder_notification_id: reminderId })
    .eq('id', id);
  if (error) throw new Error(`保存提醒标识失败: ${error.message}`);
}

// ═══════════════════════════════════════════
// Weight Records
// ═══════════════════════════════════════════

export async function addWeightRecord(userId: string, weight: number): Promise<WeightRecord> {
  const { data, error } = await supabase
    .from('weight_records')
    .insert({ user_id: userId, weight })
    .select()
    .single();
  if (error) throw new Error(`保存体重记录失败: ${error.message}`);
  return data as WeightRecord;
}

export async function getWeightRecords(userId: string): Promise<WeightRecord[]> {
  const { data, error } = await supabase
    .from('weight_records')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`读取体重记录失败: ${error.message}`);
  return (data ?? []) as WeightRecord[];
}

// ═══════════════════════════════════════════
// User Profiles
// ═══════════════════════════════════════════

export interface UserProfile {
  id: string;
  nickname: string;
  contact_info: string;
  email: string;
  avatar_url: string | null;
  updated_at?: string;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(`读取用户信息失败: ${error.message}`);
  return data as UserProfile | null;
}

export async function saveUserProfile(
  userId: string,
  profile: Omit<UserProfile, 'id' | 'updated_at'>,
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(
      { id: userId, ...profile, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    )
    .select()
    .single();
  if (error) throw new Error(`保存用户信息失败: ${error.message}`);
  return data as UserProfile;
}

export async function uploadAvatar(
  userId: string,
  imageUri: string,
): Promise<string> {
  const ext = imageUri.split('.').pop() || 'jpg';
  const fileName = `${userId}/avatar_${Date.now()}.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic',
  };
  const contentType = mimeMap[ext.toLowerCase()] || 'image/jpeg';

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(fileName, bytes.buffer, { contentType, upsert: true });
  if (uploadError) throw new Error(`头像上传失败: ${uploadError.message}`);

  const { data: urlData } = supabase.storage
    .from('avatars')
    .getPublicUrl(fileName);

  // Update avatar_url in user_profiles
  await supabase
    .from('user_profiles')
    .update({ avatar_url: urlData.publicUrl, updated_at: new Date().toISOString() })
    .eq('id', userId);

  return urlData.publicUrl;
}

// ═══════════════════════════════════════════
// Community Posts (array-based interactions)
// ═══════════════════════════════════════════

export interface CommunityPost {
  id?: string;
  user_id: string;
  author_name: string;
  title: string;
  content: string;
  hugs_users: string[];
  tissues_users: string[];
  created_at?: string;
  // Joined from user_profiles
  user_profiles?: {
    nickname: string | null;
    avatar_url: string | null;
  } | null;
}

export async function createCommunityPost(
  userId: string,
  title: string,
  content: string,
  authorName: string,
): Promise<CommunityPost> {
  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      user_id: userId, title, content, author_name: authorName,
      hugs_users: [], tissues_users: [],
    })
    .select()
    .single();
  if (error) throw new Error(`发布失败: ${error.message}`);
  return data as CommunityPost;
}

export async function getCommunityPosts(limit = 30): Promise<CommunityPost[]> {
  const { data, error } = await supabase
    .from('community_posts')
    .select('*, user_profiles(nickname, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`读取社区帖子失败: ${error.message}`);
  return (data ?? []) as CommunityPost[];
}

export async function toggleInteraction(
  postId: string,
  userId: string,
  type: 'hugs_users' | 'tissues_users',
): Promise<string[]> {
  // Read current array
  const { data: post, error: readErr } = await supabase
    .from('community_posts')
    .select(type)
    .eq('id', postId)
    .single();
  if (readErr) throw new Error(`读取失败: ${readErr.message}`);

  const arr: string[] = (post as any)[type] ?? [];
  const idx = arr.indexOf(userId);
  const newArr = idx >= 0 ? arr.filter(id => id !== userId) : [...arr, userId];

  const { error } = await supabase
    .from('community_posts')
    .update({ [type]: newArr })
    .eq('id', postId);
  if (error) throw new Error(`更新互动失败: ${error.message}`);

  return newArr;
}

export async function deleteCommunityPost(id: string): Promise<void> {
  const { error } = await supabase.from('community_posts').delete().eq('id', id);
  if (error) throw new Error(`删除帖子失败: ${error.message}`);
}

// ═══════════════════════════════════════════
// Profile Visits
// ═══════════════════════════════════════════

export interface ProfileVisit {
  id?: string;
  visitor_id: string;
  visited_user_id: string;
  visited_at: string;
  // Joined from user_profiles
  visitor_profile?: {
    nickname: string | null;
    avatar_url: string | null;
  } | null;
}

export async function recordProfileVisit(
  visitorId: string,
  visitedUserId: string,
): Promise<void> {
  if (visitorId === visitedUserId) return; // Don't record self-visits
  try {
    // Ensure visitor has a user_profiles row (may not have completed profile yet)
    await supabase
      .from('user_profiles')
      .upsert(
        { id: visitorId, updated_at: new Date().toISOString() },
        { onConflict: 'id', ignoreDuplicates: true },
      );

    const { error } = await supabase
      .from('profile_visits')
      .upsert(
        {
          visitor_id: visitorId,
          visited_user_id: visitedUserId,
          visited_at: new Date().toISOString(),
        },
        { onConflict: 'visitor_id,visited_user_id' },
      );
    if (error) console.warn('recordProfileVisit:', error.message);
  } catch (e: any) {
    // Silently handle — don't crash the app for a non-critical tracking feature
    console.warn('recordProfileVisit failed:', e.message);
  }
}

export async function getProfileVisitors(
  userId: string,
  limit = 50,
): Promise<ProfileVisit[]> {
  const { data, error } = await supabase
    .from('profile_visits')
    .select('*, visitor_profile:user_profiles!profile_visits_visitor_id_fkey(nickname, avatar_url)')
    .eq('visited_user_id', userId)
    .order('visited_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`读取访客记录失败: ${error.message}`);
  return (data ?? []) as ProfileVisit[];
}

// ═══════════════════════════════════════════
// User Interaction Totals (hugs + tissues)
// ═══════════════════════════════════════════

export async function getUserInteractionTotals(
  userId: string,
): Promise<{ totalHugs: number; totalTissues: number }> {
  const { data, error } = await supabase
    .from('community_posts')
    .select('hugs_users, tissues_users')
    .eq('user_id', userId);
  if (error) throw new Error(`读取互动总数失败: ${error.message}`);

  let totalHugs = 0;
  let totalTissues = 0;
  for (const post of data ?? []) {
    totalHugs += (post.hugs_users as string[] ?? []).length;
    totalTissues += (post.tissues_users as string[] ?? []).length;
  }
  return { totalHugs, totalTissues };
}

// ═══════════════════════════════════════════
// Post Comments
// ═══════════════════════════════════════════

export interface PostComment {
  id?: string;
  post_id: string;
  user_id: string;
  content: string;
  parent_comment_id: string | null;
  is_read: boolean;
  created_at?: string;
  // Joined
  commenter_profile?: {
    nickname: string | null;
    avatar_url: string | null;
  } | null;
}

export async function addComment(
  postId: string,
  userId: string,
  content: string,
  parentCommentId?: string,
): Promise<PostComment> {
  const { data, error } = await supabase
    .from('post_comments')
    .insert({
      post_id: postId,
      user_id: userId,
      content,
      parent_comment_id: parentCommentId || null,
      is_read: false,
    })
    .select('*, commenter_profile:user_profiles!post_comments_user_id_fkey(nickname, avatar_url)')
    .single();
  if (error) throw new Error(`评论失败: ${error.message}`);
  return data as PostComment;
}

export async function getPostComments(postId: string): Promise<PostComment[]> {
  const { data, error } = await supabase
    .from('post_comments')
    .select('*, commenter_profile:user_profiles!post_comments_user_id_fkey(nickname, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`读取评论失败: ${error.message}`);
  return (data ?? []) as PostComment[];
}

export async function getPostCommentCount(postId: string): Promise<number> {
  const { count, error } = await supabase
    .from('post_comments')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId);
  if (error) return 0;
  return count ?? 0;
}

// ── Notification type combining both scenarios ──
export interface CommentNotification extends PostComment {
  /** 'post_comment' = someone commented on my post; 'reply' = someone replied to my comment */
  reason: 'post_comment' | 'reply';
}

/**
 * Count all unread notifications for currentUserId:
 *   A) Unread comments on posts I authored (excluding my own comments)
 *   B) Unread replies to comments I wrote (excluding my own replies)
 */
export async function getUnreadCommentsCount(currentUserId: string): Promise<number> {
  try {
    // Scenario A: comments on my posts
    const { data: myPosts } = await supabase
      .from('community_posts')
      .select('id')
      .eq('user_id', currentUserId);
    const postIds = (myPosts ?? []).map(p => p.id);

    let countA = 0;
    if (postIds.length > 0) {
      const { count } = await supabase
        .from('post_comments')
        .select('*', { count: 'exact', head: true })
        .in('post_id', postIds)
        .neq('user_id', currentUserId)
        .eq('is_read', false);
      countA = count ?? 0;
    }

    // Scenario B: replies to my comments
    const { data: myComments } = await supabase
      .from('post_comments')
      .select('id')
      .eq('user_id', currentUserId);
    const commentIds = (myComments ?? []).map(c => c.id);

    let countB = 0;
    if (commentIds.length > 0) {
      const { count } = await supabase
        .from('post_comments')
        .select('*', { count: 'exact', head: true })
        .in('parent_comment_id', commentIds)
        .neq('user_id', currentUserId)
        .eq('is_read', false);
      countB = count ?? 0;
    }

    // Deduplicate: a reply to my comment on my own post would be counted in both A and B.
    // For count purposes, get the union IDs.
    if (postIds.length > 0 && commentIds.length > 0) {
      // Overlap = replies to my comments that are also on my posts
      const { count: overlap } = await supabase
        .from('post_comments')
        .select('*', { count: 'exact', head: true })
        .in('post_id', postIds)
        .in('parent_comment_id', commentIds)
        .neq('user_id', currentUserId)
        .eq('is_read', false);
      return countA + countB - (overlap ?? 0);
    }

    return countA + countB;
  } catch (e: any) {
    console.warn('getUnreadCommentsCount:', e.message);
    return 0;
  }
}

/**
 * Fetch all unread notifications, merging both scenarios with dedup + reason tagging.
 */
export async function getUnreadComments(
  currentUserId: string,
  limit = 50,
): Promise<CommentNotification[]> {
  try {
    const selectFields = '*, commenter_profile:user_profiles!post_comments_user_id_fkey(nickname, avatar_url)';

    // Scenario A: comments on my posts
    const { data: myPosts } = await supabase
      .from('community_posts')
      .select('id')
      .eq('user_id', currentUserId);
    const postIds = (myPosts ?? []).map(p => p.id);

    let listA: PostComment[] = [];
    if (postIds.length > 0) {
      const { data } = await supabase
        .from('post_comments')
        .select(selectFields)
        .in('post_id', postIds)
        .neq('user_id', currentUserId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(limit);
      listA = (data ?? []) as PostComment[];
    }

    // Scenario B: replies to my comments
    const { data: myComments } = await supabase
      .from('post_comments')
      .select('id')
      .eq('user_id', currentUserId);
    const commentIds = (myComments ?? []).map(c => c.id);

    let listB: PostComment[] = [];
    if (commentIds.length > 0) {
      const { data } = await supabase
        .from('post_comments')
        .select(selectFields)
        .in('parent_comment_id', commentIds)
        .neq('user_id', currentUserId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(limit);
      listB = (data ?? []) as PostComment[];
    }

    // Merge, dedup by id, and tag reason
    const postIdSet = new Set(postIds);
    const commentIdSet = new Set(commentIds);
    const seen = new Set<string>();
    const merged: CommentNotification[] = [];

    for (const c of listA) {
      if (!c.id || seen.has(c.id)) continue;
      seen.add(c.id);
      merged.push({ ...c, reason: 'post_comment' });
    }
    for (const c of listB) {
      if (!c.id || seen.has(c.id)) continue;
      seen.add(c.id);
      merged.push({ ...c, reason: 'reply' });
    }

    // For items in both A and B, prefer 'reply' reason (more specific)
    // Already handled: B items that were also in A are skipped by seen set,
    // but if they were added from A first, update their reason
    for (const item of merged) {
      if (
        item.reason === 'post_comment' &&
        item.parent_comment_id &&
        commentIdSet.has(item.parent_comment_id)
      ) {
        item.reason = 'reply';
      }
    }

    // Sort by time descending
    merged.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    return merged.slice(0, limit);
  } catch (e: any) {
    console.warn('getUnreadComments:', e.message);
    return [];
  }
}

/**
 * Mark all notifications as read for currentUserId (both scenarios).
 */
export async function markCommentsAsRead(currentUserId: string): Promise<void> {
  try {
    // Scenario A: comments on my posts
    const { data: myPosts } = await supabase
      .from('community_posts')
      .select('id')
      .eq('user_id', currentUserId);
    const postIds = (myPosts ?? []).map(p => p.id);

    if (postIds.length > 0) {
      await supabase
        .from('post_comments')
        .update({ is_read: true })
        .in('post_id', postIds)
        .neq('user_id', currentUserId)
        .eq('is_read', false);
    }

    // Scenario B: replies to my comments
    const { data: myComments } = await supabase
      .from('post_comments')
      .select('id')
      .eq('user_id', currentUserId);
    const commentIds = (myComments ?? []).map(c => c.id);

    if (commentIds.length > 0) {
      await supabase
        .from('post_comments')
        .update({ is_read: true })
        .in('parent_comment_id', commentIds)
        .neq('user_id', currentUserId)
        .eq('is_read', false);
    }
  } catch (e: any) {
    console.warn('markCommentsAsRead:', e.message);
  }
}

// ═══════════════════════════════════════════
// Memory Palace — Diary
// ═══════════════════════════════════════════

export interface MemoryDiary {
  id?: string;
  user_id: string;
  title: string;
  content: string;
  image_urls?: string[];
  created_at?: string;
  updated_at?: string;
}

export async function createDiary(
  userId: string, title: string, content: string, imageUrls?: string[],
): Promise<MemoryDiary> {
  const { data, error } = await supabase
    .from('memory_diaries')
    .insert({ user_id: userId, title, content, image_urls: imageUrls ?? [] })
    .select()
    .single();
  if (error) throw new Error(`创建日记失败: ${error.message}`);
  return data as MemoryDiary;
}

export async function updateDiary(
  id: string, updates: { title?: string; content?: string; image_urls?: string[] },
): Promise<MemoryDiary> {
  const { data, error } = await supabase
    .from('memory_diaries')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`更新日记失败: ${error.message}`);
  return data as MemoryDiary;
}

export async function uploadMemoryImage(userId: string, imageUri: string): Promise<string> {
  const ext = imageUri.split('.').pop() || 'jpg';
  const fileName = `${userId}/img_${Date.now()}.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic',
  };
  const contentType = mimeMap[ext.toLowerCase()] || 'image/jpeg';

  const { error: uploadError } = await supabase.storage
    .from('memory_media')
    .upload(fileName, bytes.buffer, { contentType, upsert: true });
  if (uploadError) throw new Error(`图片上传失败: ${uploadError.message}`);

  const { data: signedData, error: signError } = await supabase.storage
    .from('memory_media')
    .createSignedUrl(fileName, 60 * 60 * 24 * 365);
  if (signError) throw new Error(`获取图片链接失败: ${signError.message}`);

  return signedData.signedUrl;
}

export async function getDiaries(userId: string): Promise<MemoryDiary[]> {
  const { data, error } = await supabase
    .from('memory_diaries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`读取日记失败: ${error.message}`);
  return (data ?? []) as MemoryDiary[];
}

export async function deleteDiary(id: string): Promise<void> {
  const { error } = await supabase.from('memory_diaries').delete().eq('id', id);
  if (error) throw new Error(`删除日记失败: ${error.message}`);
}

// ═══════════════════════════════════════════
// Memory Palace — Video
// ═══════════════════════════════════════════

export interface MemoryVideo {
  id?: string;
  user_id: string;
  title: string;
  video_url: string;
  pet_age: string;
  created_at?: string;
}

export async function createVideo(userId: string, title: string, videoUrl: string, petAge: string): Promise<MemoryVideo> {
  const { data, error } = await supabase
    .from('memory_videos')
    .insert({ user_id: userId, title, video_url: videoUrl, pet_age: petAge })
    .select()
    .single();
  if (error) throw new Error(`创建记忆失败: ${error.message}`);
  return data as MemoryVideo;
}

export async function updateVideoTitle(id: string, title: string): Promise<void> {
  const { error } = await supabase.from('memory_videos').update({ title }).eq('id', id);
  if (error) throw new Error(`更新记忆标题失败: ${error.message}`);
}

export async function getVideos(userId: string): Promise<MemoryVideo[]> {
  const { data, error } = await supabase
    .from('memory_videos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`读取记忆失败: ${error.message}`);
  return (data ?? []) as MemoryVideo[];
}

export async function deleteVideo(id: string): Promise<void> {
  const { error } = await supabase.from('memory_videos').delete().eq('id', id);
  if (error) throw new Error(`删除记忆失败: ${error.message}`);
}

// ═══════════════════════════════════════════
// Memory Palace — Media Upload (private bucket)
// ═══════════════════════════════════════════

export async function uploadMemoryMedia(
  userId: string,
  fileUri: string,
  type: 'audio' | 'video',
): Promise<string> {
  const ext = fileUri.split('.').pop() || (type === 'audio' ? 'mp3' : 'mp4');
  const fileName = `${userId}/${type}_${Date.now()}.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const mimeMap: Record<string, string> = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
  };
  const contentType = mimeMap[ext.toLowerCase()] || (type === 'audio' ? 'audio/mpeg' : 'video/mp4');

  const { error: uploadError } = await supabase.storage
    .from('memory_media')
    .upload(fileName, bytes.buffer, { contentType, upsert: true });
  if (uploadError) throw new Error(`媒体上传失败: ${uploadError.message}`);

  // Private bucket — use createSignedUrl for access
  const { data: signedData, error: signError } = await supabase.storage
    .from('memory_media')
    .createSignedUrl(fileName, 60 * 60 * 24 * 365); // 1 year
  if (signError) throw new Error(`获取链接失败: ${signError.message}`);

  return signedData.signedUrl;
}

// ═══════════════════════════════════════════
// Delete Operations
// ═══════════════════════════════════════════

export async function deleteHealthQuestionnaire(id: string): Promise<void> {
  const { error } = await supabase.from('health_questionnaires').delete().eq('id', id);
  if (error) throw new Error(`删除健康记录失败: ${error.message}`);
}

export async function deleteMedicalRecord(id: string): Promise<void> {
  const { error } = await supabase.from('medical_records').delete().eq('id', id);
  if (error) throw new Error(`删除医疗记录失败: ${error.message}`);
}

export async function deleteVaccination(id: string): Promise<void> {
  const { error } = await supabase.from('vaccinations').delete().eq('id', id);
  if (error) throw new Error(`删除疫苗记录失败: ${error.message}`);
}

export async function deleteWeightRecord(id: string): Promise<void> {
  const { error } = await supabase.from('weight_records').delete().eq('id', id);
  if (error) throw new Error(`删除体重记录失败: ${error.message}`);
}

// ═══════════════════════════════════════════
// Friendships
// ═══════════════════════════════════════════

export interface Friendship {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface FriendItem {
  id: string;          // user_profiles.id of the friend
  nickname: string;
  avatar_url: string | null;
}

/** Send a friend request from current user to receiverId */
export async function sendFriendRequest(requesterId: string, receiverId: string): Promise<void> {
  const { error } = await supabase.from('friendships').insert({
    requester_id: requesterId,
    receiver_id: receiverId,
    status: 'pending',
  });
  if (error) throw new Error(`发送好友请求失败: ${error.message}`);
}

/** Accept a pending friend request */
export async function acceptFriendRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw new Error(`接受好友请求失败: ${error.message}`);
}

/** Reject a pending friend request */
export async function rejectFriendRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', requestId);
  if (error) throw new Error(`拒绝好友请求失败: ${error.message}`);
}

/** Remove a friendship (delete the row) */
export async function removeFriend(currentUserId: string, friendId: string): Promise<void> {
  // The friendship row could have either user as requester or receiver
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(
      `and(requester_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(requester_id.eq.${friendId},receiver_id.eq.${currentUserId})`,
    );
  if (error) throw new Error(`删除好友失败: ${error.message}`);
}

/** Get pending friend requests sent TO the current user (with requester profile) */
export async function getPendingFriendRequests(
  currentUserId: string,
): Promise<(Friendship & { requester_profile: { nickname: string; avatar_url: string | null } })[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('*, requester_profile:user_profiles!friendships_requester_id_fkey(nickname, avatar_url)')
    .eq('receiver_id', currentUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`查询好友请求失败: ${error.message}`);
  return data as any;
}

/** Fast count of pending friend requests received by the current user (no profile JOIN) */
export async function getPendingFriendRequestCount(currentUserId: string): Promise<number> {
  const { count, error } = await supabase
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('receiver_id', currentUserId)
    .eq('status', 'pending');
  if (error) throw new Error(`查询好友请求数失败: ${error.message}`);
  return count ?? 0;
}

/** Get accepted friends list with profile info */
export async function getFriendsList(currentUserId: string): Promise<FriendItem[]> {
  // Query where current user is requester
  const { data: asRequester, error: e1 } = await supabase
    .from('friendships')
    .select('receiver_id, friend_profile:user_profiles!friendships_receiver_id_fkey(id, nickname, avatar_url)')
    .eq('requester_id', currentUserId)
    .eq('status', 'accepted');
  if (e1) throw new Error(`查询好友列表失败: ${e1.message}`);

  // Query where current user is receiver
  const { data: asReceiver, error: e2 } = await supabase
    .from('friendships')
    .select('requester_id, friend_profile:user_profiles!friendships_requester_id_fkey(id, nickname, avatar_url)')
    .eq('receiver_id', currentUserId)
    .eq('status', 'accepted');
  if (e2) throw new Error(`查询好友列表失败: ${e2.message}`);

  const friends: FriendItem[] = [];
  for (const row of asRequester || []) {
    const p = row.friend_profile as any;
    if (p) friends.push({ id: p.id, nickname: p.nickname || '', avatar_url: p.avatar_url });
  }
  for (const row of asReceiver || []) {
    const p = row.friend_profile as any;
    if (p) friends.push({ id: p.id, nickname: p.nickname || '', avatar_url: p.avatar_url });
  }
  return friends;
}

export type FriendshipStatusResult =
  | { status: 'none' }
  | { status: 'accepted'; friendshipId: string }
  | { status: 'pending_sent'; friendshipId: string }
  | { status: 'pending_received'; friendshipId: string };

/** Check friendship status between two users with direction awareness. */
export async function checkFriendshipStatus(
  currentUserId: string,
  targetUserId: string,
): Promise<FriendshipStatusResult> {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, status, requester_id')
    .or(
      `and(requester_id.eq.${currentUserId},receiver_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},receiver_id.eq.${currentUserId})`,
    )
    .in('status', ['pending', 'accepted'])
    .maybeSingle();
  if (error) throw new Error(`查询好友状态失败: ${error.message}`);
  if (!data) return { status: 'none' };
  if (data.status === 'accepted') return { status: 'accepted', friendshipId: data.id };
  // pending — determine direction
  if (data.requester_id === currentUserId) {
    return { status: 'pending_sent', friendshipId: data.id };
  }
  return { status: 'pending_received', friendshipId: data.id };
}

// ═══════════════════════════════════════════
// Chat Messages
// ═══════════════════════════════════════════

export interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

/** Send a chat message */
export async function sendMessage(senderId: string, receiverId: string, content: string): Promise<ChatMessage> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ sender_id: senderId, receiver_id: receiverId, content })
    .select()
    .single();
  if (error) throw new Error(`发送消息失败: ${error.message}`);
  return data as ChatMessage;
}

/** Get chat history between two users, ordered by time ascending */
export async function getChatHistory(userId1: string, userId2: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .or(
      `and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`,
    )
    .order('created_at', { ascending: true });
  if (error) throw new Error(`查询聊天记录失败: ${error.message}`);
  return (data || []) as ChatMessage[];
}

/** Get total unread message count for the current user (all senders) */
export async function getUnreadMessageCount(currentUserId: string): Promise<number> {
  const { count, error } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', currentUserId)
    .eq('is_read', false);
  if (error) throw new Error(`查询未读消息失败: ${error.message}`);
  return count ?? 0;
}

/** Get unread message count per friend (from each sender to current user) */
export async function getUnreadCountByFriend(
  currentUserId: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('sender_id')
    .eq('receiver_id', currentUserId)
    .eq('is_read', false);
  if (error) throw new Error(`查询未读消息失败: ${error.message}`);

  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.sender_id] = (counts[row.sender_id] || 0) + 1;
  }
  return counts;
}

/** Mark all messages from a specific sender as read */
export async function markMessagesAsRead(currentUserId: string, senderId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .update({ is_read: true })
    .eq('receiver_id', currentUserId)
    .eq('sender_id', senderId)
    .eq('is_read', false);
  if (error) throw new Error(`标记已读失败: ${error.message}`);
}

/** Delete all chat messages between two users */
export async function deleteChatMessages(userId1: string, userId2: string): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .or(
      `and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`,
    );
  if (error) throw new Error(`删除聊天记录失败: ${error.message}`);
}

// ═══════════════════════════════════════════
// Content Reports & User Blocking (Apple compliance)
// ═══════════════════════════════════════════

export type ReportContentType = 'post' | 'comment' | 'message' | 'user';

export async function submitContentReport(
  reporterId: string,
  contentType: ReportContentType,
  contentId: string,
  reason: string,
  details?: string,
): Promise<void> {
  const { error } = await supabase.from('content_reports').insert({
    reporter_id: reporterId,
    content_type: contentType,
    content_id: contentId,
    reason,
    details: details || null,
  });
  if (error) throw new Error(`举报失败: ${error.message}`);
}

export interface MyReportItem {
  id: number;
  content_type: ReportContentType;
  content_id: string;
  reason: string;  // i18n key like 'report_reason_spam'
  details: string | null;
  status: 'pending' | 'reviewed' | 'dismissed' | string;
  created_at: string;
}

export async function getMyReports(reporterId: string): Promise<MyReportItem[]> {
  const { data, error } = await supabase
    .from('content_reports')
    .select('id, content_type, content_id, reason, details, status, created_at')
    .eq('reporter_id', reporterId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`查询我的举报失败: ${error.message}`);
  return (data ?? []) as MyReportItem[];
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  if (blockerId === blockedId) throw new Error('不能屏蔽自己');
  const { error } = await supabase
    .from('blocked_users')
    .insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error && !error.message.includes('duplicate')) {
    throw new Error(`屏蔽失败: ${error.message}`);
  }
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw new Error(`解除屏蔽失败: ${error.message}`);
}

export async function getBlockedUserIds(blockerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', blockerId);
  if (error) throw new Error(`查询屏蔽列表失败: ${error.message}`);
  return (data || []).map((r) => r.blocked_id as string);
}

export async function isUserBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
    .maybeSingle();
  if (error) throw new Error(`查询屏蔽状态失败: ${error.message}`);
  return !!data;
}
