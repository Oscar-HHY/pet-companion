import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, TextInput, StyleSheet, Image,
  RefreshControl, Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { supabase } from '../services/supabaseClient';
import {
  CommunityPost, PostComment, createCommunityPost, getCommunityPosts,
  toggleInteraction, deleteCommunityPost, getUserProfile,
  addComment, getPostComments, getBlockedUserIds,
  ReportContentType,
} from '../services/PetDatabaseService';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';
import ReportModal from '../components/ReportModal';

// Navigation helper type — we use the untyped navigation and cast for root stack push
type AnyNav = { push: (screen: string, params?: any) => void; navigate: (screen: string, params?: any) => void };

// ── Relative time ───────────────────────────────────────────
function relativeTime(dateStr: string | undefined, t: (key: string) => string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('community_just_now');
  if (mins < 60) return `${mins}${t('community_min_ago')}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}${t('community_hour_ago')}`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}${t('community_day_ago')}`;
  const months = Math.floor(days / 30);
  return `${months}${t('community_month_ago')}`;
}

// ── Post Card ───────────────────────────────────────────────
function PostCard({
  post,
  currentUserId,
  commentCount,
  onHug,
  onTissue,
  onDelete,
  onAvatarPress,
  onComment,
  onReport,
  t,
  themeCardBg,
  themeTextColor,
  themeSecondaryText,
}: {
  post: CommunityPost;
  currentUserId: string;
  commentCount: number;
  onHug: () => void;
  onTissue: () => void;
  onDelete: () => void;
  onAvatarPress: () => void;
  onComment: () => void;
  onReport: () => void;
  t: (key: string) => string;
  themeCardBg: string;
  themeTextColor: string;
  themeSecondaryText: string;
}) {
  const hugged = post.hugs_users?.includes(currentUserId);
  const tissued = post.tissues_users?.includes(currentUserId);
  const isOwner = post.user_id === currentUserId;

  const displayName = post.user_profiles?.nickname || post.author_name || t('community_anonymous');
  const displayAvatar = post.user_profiles?.avatar_url || null;

  return (
    <View style={[styles.card, { backgroundColor: themeCardBg }]}>
      <View style={styles.cardBody}>
        {/* Author Row */}
        <View style={styles.authorRow}>
          <TouchableOpacity onPress={onAvatarPress} activeOpacity={0.7}>
            {displayAvatar ? (
              <Image source={{ uri: displayAvatar }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <MaterialIcons name="person" size={18} color={colors.warmWood} />
              </View>
            )}
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.authorName, { color: themeTextColor }]}>{displayName}</Text>
            <Text style={[styles.authorTime, { color: themeSecondaryText }]}>{relativeTime(post.created_at, t)}{t('publish')}</Text>
          </View>
          {isOwner ? (
            <TouchableOpacity onPress={onDelete} activeOpacity={0.6} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="delete-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onReport} activeOpacity={0.6} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="flag" size={18} color="rgba(154,89,76,0.5)" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={[styles.cardTitle, { color: themeTextColor }]}>{post.title}</Text>
        <Text style={[styles.cardText, { color: themeSecondaryText }]}>{post.content}</Text>
        {/* Actions */}
        <View style={styles.cardActions}>
          <View style={styles.actionGroup}>
            <TouchableOpacity style={styles.actionButton} onPress={onHug} activeOpacity={0.6}>
              <MaterialIcons
                name={hugged ? 'favorite' : 'favorite-border'}
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.actionTextPrimary, hugged && styles.actionTextActive]}>
                {t('community_hug')} ({post.hugs_users?.length ?? 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={onTissue} activeOpacity={0.6}>
              <MaterialIcons
                name="water-drop"
                size={18}
                color={tissued ? colors.primary : colors.warmWood}
              />
              <Text style={[styles.actionTextMuted, tissued && styles.actionTextActive]}>
                {t('community_tissue')} ({post.tissues_users?.length ?? 0})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={onComment} activeOpacity={0.6}>
              <MaterialIcons name="chat-bubble-outline" size={16} color={colors.warmWood} />
              <Text style={styles.actionTextMuted}>
                {t('community_comment')} ({commentCount})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Comment Item ──────────────────────────────────────────
function CommentItem({
  comment,
  allComments,
  currentUserId,
  onReply,
  onReport,
  onAvatarPress,
  t,
  themeTextColor,
  themeSecondaryText,
}: {
  comment: PostComment;
  allComments: PostComment[];
  currentUserId: string;
  onReply: (comment: PostComment) => void;
  onReport: (comment: PostComment) => void;
  onAvatarPress: (userId: string) => void;
  t: (key: string) => string;
  themeTextColor: string;
  themeSecondaryText: string;
}) {
  const avatar = comment.commenter_profile?.avatar_url;
  const name = comment.commenter_profile?.nickname || t('community_anonymous');

  // Find parent comment author for reply indicator
  let replyTo: string | null = null;
  if (comment.parent_comment_id) {
    const parent = allComments.find(c => c.id === comment.parent_comment_id);
    if (parent) replyTo = parent.commenter_profile?.nickname || t('community_anonymous');
  }

  return (
    <View style={styles.commentItem}>
      <TouchableOpacity onPress={() => onAvatarPress(comment.user_id)} activeOpacity={0.7}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.commentAvatar} />
        ) : (
          <View style={styles.commentAvatarPlaceholder}>
            <MaterialIcons name="person" size={14} color={colors.warmWood} />
          </View>
        )}
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <View style={styles.commentHeader}>
          <Text style={[styles.commentName, { color: themeTextColor }]}>{name}</Text>
          <Text style={[styles.commentTime, { color: themeSecondaryText }]}>{relativeTime(comment.created_at, t)}</Text>
        </View>
        {replyTo && (
          <Text style={styles.replyIndicator}>{t('community_reply_prefix')}@{replyTo}</Text>
        )}
        <Text style={[styles.commentContent, { color: themeTextColor }]}>{comment.content}</Text>
        <View style={styles.commentActionRow}>
          <TouchableOpacity
            onPress={() => onReply(comment)}
            activeOpacity={0.6}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={styles.replyBtn}>{t('community_comment')}</Text>
          </TouchableOpacity>
          {comment.user_id !== currentUserId && (
            <TouchableOpacity
              onPress={() => onReport(comment)}
              activeOpacity={0.6}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.reportBtn}>{t('report_action')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────
export default function CommunityScreen() {
  const { themeBackground, themeTextColor, themeSecondaryText, themeCardBg, isDark } = useSettings();
  const t = useT();

  const tabNav = useNavigation();
  // Get the root stack navigator for pushing screens on top of tabs
  const navigation = (tabNav.getParent() || tabNav) as unknown as AnyNav;
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const currentUserIdRef = useRef('');
  const currentNicknameRef = useRef('');

  // Comment counts map: postId → count
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  // Comment modal state
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [replyTarget, setReplyTarget] = useState<PostComment | null>(null);
  const commentInputRef = useRef<TextInput>(null);

  // Blocked users (filters out their posts + comments)
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  // Report modal target
  const [reportTarget, setReportTarget] = useState<
    { type: ReportContentType; id: string } | null
  >(null);

  // ── Get current user ID & nickname + blocked list ──
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      currentUserIdRef.current = user.id;
      try {
        const profile = await getUserProfile(user.id);
        if (profile?.nickname) currentNicknameRef.current = profile.nickname;
      } catch {}
      try {
        const ids = await getBlockedUserIds(user.id);
        setBlockedIds(new Set(ids));
      } catch {}
    });
  }, []);

  // ── Load posts + comment counts (scoped to visible posts only) ──
  const loadPosts = useCallback(async () => {
    try {
      const data = await getCommunityPosts();
      setPosts(data);

      const ids = data.map((p) => p.id).filter(Boolean) as (string | number)[];
      if (ids.length === 0) { setCommentCounts({}); return; }

      const { data: countData } = await supabase
        .from('post_comments')
        .select('post_id')
        .in('post_id', ids);

      const counts: Record<string, number> = {};
      if (countData) {
        for (const row of countData) {
          const key = String(row.post_id);
          counts[key] = (counts[key] || 0) + 1;
        }
      }
      setCommentCounts(counts);
    } catch (e: any) {
      console.warn('loadPosts error:', e.message);
    }
  }, []);

  useEffect(() => {
    loadPosts().finally(() => setLoading(false));
  }, [loadPosts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  }, [loadPosts]);

  // ── Publish ──
  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) {
      Alert.alert('', t('community_title_content_required'));
      return;
    }
    setPublishing(true);
    try {
      const uid = currentUserIdRef.current;
      if (!uid) { Alert.alert('', t('community_login_required')); return; }
      const authorName = currentNicknameRef.current || t('community_default_author');
      const newPost = await createCommunityPost(uid, title.trim(), content.trim(), authorName);
      setPosts(prev => [newPost, ...prev]);
      setTitle('');
      setContent('');
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert(t('community_publish_fail'), e.message);
    } finally {
      setPublishing(false);
    }
  };

  // ── Optimistic toggle interaction ──
  const handleToggle = (postId: string, type: 'hugs_users' | 'tissues_users') => {
    const uid = currentUserIdRef.current;
    if (!uid) return;

    setPosts(prev =>
      prev.map(p => {
        if (p.id !== postId) return p;
        const arr = p[type] ?? [];
        const newArr = arr.includes(uid)
          ? arr.filter(id => id !== uid)
          : [...arr, uid];
        return { ...p, [type]: newArr };
      }),
    );

    toggleInteraction(postId, uid, type).catch(() => {
      setPosts(prev =>
        prev.map(p => {
          if (p.id !== postId) return p;
          const arr = p[type] ?? [];
          const newArr = arr.includes(uid)
            ? arr.filter(id => id !== uid)
            : [...arr, uid];
          return { ...p, [type]: newArr };
        }),
      );
    });
  };

  // ── Delete ──
  const handleDelete = (post: CommunityPost) => {
    Alert.alert(t('community_delete_post'), `${t('community_delete_post_confirm')}${post.title}${t('community_delete_post_confirm2')}`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => {
          try {
            await deleteCommunityPost(post.id!);
            setPosts(prev => prev.filter(p => p.id !== post.id));
          } catch (e: any) {
            Alert.alert(t('community_delete_fail'), e.message);
          }
        },
      },
    ]);
  };

  const handleAvatarPress = (userId: string) => {
    navigation.push('UserProfileView', { targetUserId: userId });
  };

  // ── Comment modal logic ──
  const openCommentModal = async (postId: string) => {
    setActivePostId(postId);
    setCommentModalVisible(true);
    setCommentsLoading(true);
    setReplyTarget(null);
    setCommentText('');
    try {
      const data = await getPostComments(postId);
      setComments(data);
    } catch (e: any) {
      console.warn('loadComments:', e.message);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleSendComment = async () => {
    const uid = currentUserIdRef.current;
    if (!uid || !activePostId || !commentText.trim()) return;

    setSendingComment(true);
    try {
      const newComment = await addComment(
        activePostId, uid, commentText.trim(),
        replyTarget?.id,
      );
      setComments(prev => [...prev, newComment]);
      setCommentText('');
      setReplyTarget(null);
      // Update count
      setCommentCounts(prev => ({
        ...prev,
        [activePostId]: (prev[activePostId] || 0) + 1,
      }));
    } catch (e: any) {
      Alert.alert(t('community_comment'), e.message);
    } finally {
      setSendingComment(false);
    }
  };

  const handleReply = (comment: PostComment) => {
    setReplyTarget(comment);
    commentInputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyTarget(null);
  };

  // ── Render ──
  const visiblePosts = posts.filter((p) => !blockedIds.has(p.user_id));
  const visibleComments = comments.filter((c) => !blockedIds.has(c.user_id));

  const renderPost = ({ item }: { item: CommunityPost }) => (
    <PostCard
      post={item}
      currentUserId={currentUserIdRef.current}
      commentCount={commentCounts[item.id!] || 0}
      onHug={() => handleToggle(item.id!, 'hugs_users')}
      onTissue={() => handleToggle(item.id!, 'tissues_users')}
      onDelete={() => handleDelete(item)}
      onAvatarPress={() => handleAvatarPress(item.user_id)}
      onComment={() => openCommentModal(item.id!)}
      onReport={() => setReportTarget({ type: 'post', id: item.id! })}
      t={t}
      themeCardBg={themeCardBg}
      themeTextColor={themeTextColor}
      themeSecondaryText={themeSecondaryText}
    />
  );

  const ListHeader = () => (
    <View style={styles.hero}>
      <Text style={[styles.heroTitle, { color: themeTextColor }]}>{t('community_slogan')}</Text>
      <Text style={[styles.heroSubtitle, { color: themeSecondaryText }]}>
        {t('community_slogan_desc')}
      </Text>
    </View>
  );

  const ListEmpty = () => (
    <View style={styles.emptyContainer}>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        <>
          <MaterialIcons name="chat-bubble-outline" size={48} color={colors.slate300} />
          <Text style={[styles.emptyText, { color: themeSecondaryText }]}>{t('community_empty')}</Text>
          <Text style={[styles.emptySubText, { color: themeSecondaryText }]}>{t('community_empty_hint')}</Text>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeBackground }]} edges={['bottom']}>
      <FlatList
        data={visiblePosts}
        keyExtractor={item => item.id!}
        renderItem={renderPost}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => setModalVisible(true)}
      >
        <MaterialIcons name="edit" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Publish Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalCard, { backgroundColor: themeCardBg }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeTextColor }]}>{t('community_write_title')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={colors.warmWood} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.modalInput, {
                color: themeTextColor,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.softCream,
                borderColor: isDark ? 'rgba(255,255,255,0.15)' : colors.slate200,
              }]}
              placeholder={t('community_title_label')}
              placeholderTextColor={colors.slate400}
              value={title}
              onChangeText={setTitle}
              maxLength={50}
            />
            <TextInput
              style={[styles.modalInput, styles.modalTextArea, {
                color: themeTextColor,
                backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.softCream,
                borderColor: isDark ? 'rgba(255,255,255,0.15)' : colors.slate200,
              }]}
              placeholder={t('community_content_placeholder')}
              placeholderTextColor={colors.slate400}
              value={content}
              onChangeText={setContent}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{content.length}/500</Text>

            <TouchableOpacity
              style={[styles.publishBtn, publishing && { opacity: 0.6 }]}
              onPress={handlePublish}
              disabled={publishing}
              activeOpacity={0.8}
            >
              {publishing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.publishBtnText}>{t('publish')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Comment Modal ── */}
      <Modal visible={commentModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.commentModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <Pressable
            style={styles.commentModalDismiss}
            onPress={() => { setCommentModalVisible(false); setReplyTarget(null); }}
          />
          <View style={[styles.commentModalSheet, { backgroundColor: themeCardBg }]}>
            <View style={styles.cmHandle} />
            <Text style={[styles.cmTitle, { color: themeTextColor }]}>{t('community_comments_title')} ({comments.length})</Text>

            {commentsLoading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : visibleComments.length === 0 ? (
              <View style={styles.emptyComments}>
                <MaterialIcons name="chat-bubble-outline" size={28} color={colors.slate300} />
                <Text style={[styles.emptyCommentsText, { color: themeSecondaryText }]}>{t('community_no_comments')}</Text>
              </View>
            ) : (
              <FlatList
                data={visibleComments}
                keyExtractor={item => item.id!}
                style={{ maxHeight: 360 }}
                renderItem={({ item }) => (
                  <CommentItem
                    comment={item}
                    allComments={visibleComments}
                    currentUserId={currentUserIdRef.current}
                    onReply={handleReply}
                    onReport={(c) => {
                      // RN can't reliably stack two Modals — dismiss this one first
                      setCommentModalVisible(false);
                      setTimeout(() => setReportTarget({ type: 'comment', id: c.id! }), 250);
                    }}
                    onAvatarPress={(userId) => {
                      setCommentModalVisible(false);
                      handleAvatarPress(userId);
                    }}
                    t={t}
                    themeTextColor={themeTextColor}
                    themeSecondaryText={themeSecondaryText}
                  />
                )}
              />
            )}

            {/* Reply indicator */}
            {replyTarget && (
              <View style={styles.replyBar}>
                <Text style={styles.replyBarText} numberOfLines={1}>
                  {t('community_reply_prefix')}@{replyTarget.commenter_profile?.nickname || t('community_anonymous')}
                </Text>
                <TouchableOpacity onPress={cancelReply} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialIcons name="close" size={16} color={colors.slate500} />
                </TouchableOpacity>
              </View>
            )}

            {/* Input area */}
            <View style={styles.commentInputRow}>
              <TextInput
                ref={commentInputRef}
                style={[styles.commentInput, {
                  color: themeTextColor,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.softCream,
                  borderColor: isDark ? 'rgba(255,255,255,0.15)' : colors.slate200,
                }]}
                placeholder={
                  replyTarget
                    ? `${t('community_reply_prefix')}@${replyTarget.commenter_profile?.nickname || t('community_anonymous')}:`
                    : t('community_input_placeholder')
                }
                placeholderTextColor={colors.slate400}
                value={commentText}
                onChangeText={setCommentText}
                maxLength={200}
                multiline
              />
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  (!commentText.trim() || sendingComment) && { opacity: 0.4 },
                ]}
                onPress={handleSendComment}
                disabled={!commentText.trim() || sendingComment}
                activeOpacity={0.7}
              >
                {sendingComment ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <MaterialIcons name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Report Modal ── */}
      <ReportModal
        visible={!!reportTarget}
        onClose={() => setReportTarget(null)}
        reporterId={currentUserIdRef.current}
        contentType={reportTarget?.type ?? 'post'}
        contentId={reportTarget?.id ?? ''}
      />
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingBottom: 100 },

  // Hero
  hero: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  heroTitle: { fontSize: 24, fontWeight: '700', color: colors.warmWood, textAlign: 'center' },
  heroSubtitle: {
    fontSize: 13, color: 'rgba(154,89,76,0.7)', textAlign: 'center',
    marginTop: 8, maxWidth: 320, lineHeight: 20,
  },

  // Card
  card: {
    marginHorizontal: 16, marginTop: 16, backgroundColor: colors.softCream, borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(154,89,76,0.05)',
  },
  cardBody: { padding: 16 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatarImg: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cardBeige,
    alignItems: 'center', justifyContent: 'center',
  },
  authorName: { fontSize: 13, fontWeight: '700', color: colors.warmWood },
  authorTime: { fontSize: 10, color: 'rgba(154,89,76,0.5)' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.warmWood, marginBottom: 6, lineHeight: 22 },
  cardText: { fontSize: 13, color: 'rgba(154,89,76,0.8)', lineHeight: 20, marginBottom: 14 },
  cardActions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: 'rgba(154,89,76,0.1)', paddingTop: 12,
  },
  actionGroup: { flexDirection: 'row', gap: 16 },
  actionButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionTextPrimary: { fontSize: 11, fontWeight: '700', color: 'rgba(236,55,19,0.8)' },
  actionTextMuted: { fontSize: 11, fontWeight: '700', color: 'rgba(154,89,76,0.6)' },
  actionTextActive: { color: colors.primary, fontWeight: '700' },

  // Empty
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 15, color: colors.slate500, marginTop: 12 },
  emptySubText: { fontSize: 12, color: colors.slate400, marginTop: 4 },

  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 8,
  },

  // Publish Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.warmWood },
  modalInput: {
    borderWidth: 1, borderColor: colors.slate200, borderRadius: 12, padding: 12,
    fontSize: 15, color: colors.slate900, marginBottom: 12, backgroundColor: colors.softCream,
  },
  modalTextArea: { height: 120, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: colors.slate400, textAlign: 'right', marginBottom: 16, marginTop: -8 },
  publishBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center',
  },
  publishBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // ── Comment Modal ──
  commentModalOverlay: {
    flex: 1, justifyContent: 'flex-end',
  },
  commentModalDismiss: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
  },
  commentModalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    maxHeight: '75%',
  },
  cmHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate200, alignSelf: 'center', marginBottom: 12,
  },
  cmTitle: { fontSize: 16, fontWeight: '700', color: colors.slate900, marginBottom: 12 },
  emptyComments: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyCommentsText: { fontSize: 13, color: colors.slate400 },

  // Comment item
  commentItem: {
    flexDirection: 'row', gap: 10, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.4)',
  },
  commentAvatar: { width: 28, height: 28, borderRadius: 14 },
  commentAvatarPlaceholder: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.cardBeige,
    alignItems: 'center', justifyContent: 'center',
  },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentName: { fontSize: 12, fontWeight: '700', color: colors.warmWood },
  commentTime: { fontSize: 10, color: colors.slate400 },
  replyIndicator: { fontSize: 11, color: colors.primary, marginTop: 2 },
  commentContent: { fontSize: 13, color: colors.slate900, lineHeight: 18, marginTop: 3 },
  replyBtn: { fontSize: 11, fontWeight: '600', color: colors.warmWood, marginTop: 4 },
  commentActionRow: { flexDirection: 'row', gap: 14, marginTop: 4 },
  reportBtn: { fontSize: 11, fontWeight: '600', color: 'rgba(154,89,76,0.5)', marginTop: 4 },

  // Reply bar
  replyBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(154,89,76,0.06)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, marginBottom: 8,
  },
  replyBarText: { fontSize: 12, color: colors.warmWood, flex: 1 },

  // Input row
  commentInputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
  },
  commentInput: {
    flex: 1, borderWidth: 1, borderColor: colors.slate200, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    fontSize: 14, color: colors.slate900, backgroundColor: colors.softCream,
    maxHeight: 80,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
});
