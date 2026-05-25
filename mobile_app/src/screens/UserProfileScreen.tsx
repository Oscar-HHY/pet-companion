import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  ScrollView, ActivityIndicator, Alert, RefreshControl,
  Modal, Pressable, FlatList,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme/colors';
import { supabase } from '../services/supabaseClient';
import {
  uploadAvatar, recordProfileVisit, getProfileVisitors,
  getUserInteractionTotals, ProfileVisit, CommentNotification,
  getUnreadCommentsCount, getUnreadComments, markCommentsAsRead,
  sendFriendRequest, acceptFriendRequest, rejectFriendRequest,
  removeFriend, getPendingFriendRequests, checkFriendshipStatus,
  deleteChatMessages, blockUser, unblockUser, isUserBlocked,
  getMyReports, getVaccinations, Vaccination,
} from '../services/PetDatabaseService';
import { BadgeContext } from '../context/BadgeContext';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ReportModal from '../components/ReportModal';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

function formatVisitTime(iso: string, t: (key: string) => string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return t('user_just_now');
  if (diffMin < 60) return `${diffMin}${t('user_min_ago')}`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}${t('user_hour_ago')}`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}${t('user_day_ago')}`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function UserProfileScreen() {
  const route = useRoute();
  const navigation = useNavigation<RootNav>();
  const { clearBadge, refreshBadge, pendingFriendCount } = useContext(BadgeContext);
  const { themeBackground, themeTextColor, themeSecondaryText, themeCardBg, isDark } = useSettings();
  const t = useT();
  // Accept targetUserId from either tab params or stack params
  const targetUserId = (route.params as any)?.targetUserId as string | undefined;

  const [currentUserId, setCurrentUserId] = useState('');
  const [nickname, setNickname] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [snapshot, setSnapshot] = useState({ nickname: '', contactInfo: '' });

  // Social data (self mode)
  const [visitors, setVisitors] = useState<ProfileVisit[]>([]);
  const [totalHugs, setTotalHugs] = useState(0);
  const [totalTissues, setTotalTissues] = useState(0);
  const [visitorsModalVisible, setVisitorsModalVisible] = useState(false);

  // Notifications (unread comments on my posts + upcoming vaccinations)
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadComments, setUnreadComments] = useState<CommentNotification[]>([]);
  const [upcomingVaccinations, setUpcomingVaccinations] = useState<Vaccination[]>([]);
  const [notifModalVisible, setNotifModalVisible] = useState(false);

  // Friend requests (self mode)
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [friendReqModalVisible, setFriendReqModalVisible] = useState(false);

  // My reports (self mode)
  const [myReports, setMyReports] = useState<import('../services/PetDatabaseService').MyReportItem[]>([]);
  const [myReportsModalVisible, setMyReportsModalVisible] = useState(false);

  // Friendship status (visitor mode)
  const [friendshipStatus, setFriendshipStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'accepted'>('none');
  const [friendshipId, setFriendshipId] = useState<string | undefined>();
  const [friendActionLoading, setFriendActionLoading] = useState(false);

  // Block + report (visitor mode)
  const [blocked, setBlocked] = useState(false);
  const [blockActionLoading, setBlockActionLoading] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);

  // Delete account (self mode)
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const isSelf = !targetUserId || targetUserId === currentUserId;

  // ── Back navigation ──
  const handleGoBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs' as any);
    }
  };

  const loadProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const profileId = targetUserId || user.id;

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', profileId)
        .maybeSingle();

      if (error) throw error;

      if (!targetUserId || targetUserId === user.id) {
        setEmail(user.email || '');
      } else {
        setEmail(data?.email || '');
      }

      if (data) {
        setNickname(data.nickname || '');
        setContactInfo(data.contact_info || '');
        setAvatarUrl(data.avatar_url || null);
      }
    } catch (e: any) {
      console.warn('loadProfile:', e.message);
    }
  }, [targetUserId]);

  // Load social stats (self mode only)
  const loadSocialData = useCallback(async (userId: string) => {
    try {
      const [visitorList, totals, unread] = await Promise.all([
        getProfileVisitors(userId),
        getUserInteractionTotals(userId),
        getUnreadCommentsCount(userId),
      ]);
      setVisitors(visitorList);
      setTotalHugs(totals.totalHugs);
      setTotalTissues(totals.totalTissues);
      setUnreadCount(unread);
    } catch (e: any) {
      console.warn('loadSocialData:', e.message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setIsEditing(false);
    loadProfile().then(async () => {
      setLoading(false);
    });
  }, [loadProfile, targetUserId]);

  // After profile loads & we know currentUserId
  useEffect(() => {
    if (!currentUserId) return;

    if (isSelf) {
      // Self mode: load social data and clear badge
      loadSocialData(currentUserId);
      clearBadge();
      // Load pending friend requests
      getPendingFriendRequests(currentUserId)
        .then(setPendingRequests)
        .catch((e) => console.warn('loadPendingRequests:', e.message));
    } else if (targetUserId) {
      // Visitor mode: record visit, check friendship, check block
      recordProfileVisit(currentUserId, targetUserId);
      checkFriendshipStatus(currentUserId, targetUserId)
        .then((result) => {
          setFriendshipStatus(result.status);
          setFriendshipId(result.status !== 'none' ? result.friendshipId : undefined);
        })
        .catch((e) => console.warn('checkFriendship:', e.message));
      isUserBlocked(currentUserId, targetUserId)
        .then(setBlocked)
        .catch((e) => console.warn('isUserBlocked:', e.message));
    }
  }, [currentUserId, isSelf, targetUserId, loadSocialData, clearBadge]);

  // Auto-refetch pending friend requests when the badge poll detects a change
  // (so the "新朋友" row updates without manually navigating away and back).
  useEffect(() => {
    if (!isSelf || !currentUserId) return;
    getPendingFriendRequests(currentUserId)
      .then(setPendingRequests)
      .catch((e) => console.warn('refetchPendingRequests:', e.message));
  }, [pendingFriendCount, isSelf, currentUserId]);

  // Refresh on screen focus — covers the case where user receives a request
  // while on another tab, then switches to "我的".
  useFocusEffect(
    useCallback(() => {
      if (isSelf && currentUserId) {
        refreshBadge();
        getPendingFriendRequests(currentUserId)
          .then(setPendingRequests)
          .catch((e) => console.warn('focusRefetchRequests:', e.message));
      }
    }, [isSelf, currentUserId, refreshBadge]),
  );

  // Lazy-load "My Reports" when the user opens the modal
  const openMyReports = useCallback(() => {
    setMyReportsModalVisible(true);
    if (currentUserId) {
      getMyReports(currentUserId)
        .then(setMyReports)
        .catch((e) => console.warn('loadMyReports:', e.message));
    }
  }, [currentUserId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    if (isSelf && currentUserId) {
      await loadSocialData(currentUserId);
      clearBadge();
      refreshBadge();
    }
    setRefreshing(false);
  }, [loadProfile, isSelf, currentUserId, loadSocialData, clearBadge, refreshBadge]);

  // ── Avatar pick & upload (self only) ──
  const handlePickAvatar = async () => {
    if (!isSelf) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploadingAvatar(true);
    try {
      const url = await uploadAvatar(currentUserId, result.assets[0].uri);
      setAvatarUrl(url);
    } catch (e: any) {
      Alert.alert(t('user_avatar_upload_fail'), e.message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ── Edit mode (self only) ──
  const enterEdit = () => {
    setSnapshot({ nickname, contactInfo });
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setNickname(snapshot.nickname);
    setContactInfo(snapshot.contactInfo);
    setIsEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { Alert.alert(t('permission_denied'), t('user_login_required')); return; }

      const { error } = await supabase
        .from('user_profiles')
        .upsert(
          {
            id: user.id,
            nickname: nickname.trim(),
            contact_info: contactInfo.trim(),
            email: user.email || '',
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );

      if (error) throw error;
      Alert.alert(t('success'), t('user_profile_saved'));
      setIsEditing(false);
    } catch (e: any) {
      Alert.alert(t('user_save_fail'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(t('user_logout'), t('user_logout_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('confirm'),
        style: 'destructive',
        onPress: async () => { await supabase.auth.signOut(); },
      },
    ]);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      Alert.alert('', t('delete_account_success'));
      await supabase.auth.signOut();
    } catch (e: any) {
      Alert.alert(t('delete_account_fail'), e.message);
    } finally {
      setDeleting(false);
      setDeleteModalVisible(false);
      setDeleteConfirmText('');
    }
  };

  const handleAddFriend = async () => {
    if (!currentUserId || !targetUserId) return;
    setFriendActionLoading(true);
    try {
      await sendFriendRequest(currentUserId, targetUserId);
      setFriendshipStatus('pending_sent');
      Alert.alert(t('user_friend_sent'), t('user_friend_sent_msg'));
    } catch (e: any) {
      Alert.alert(t('user_friend_send_fail'), e.message);
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleRemoveFriend = () => {
    if (!currentUserId || !targetUserId) return;
    Alert.alert(t('user_friend_delete'), t('user_friend_delete_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('user_friend_delete_btn'), style: 'destructive',
        onPress: async () => {
          setFriendActionLoading(true);
          try {
            await Promise.all([
              removeFriend(currentUserId, targetUserId),
              deleteChatMessages(currentUserId, targetUserId),
            ]);
            Alert.alert(t('user_friend_deleted'), t('user_friend_deleted_msg'));
            if (navigation.canGoBack()) {
              navigation.goBack();
            }
          } catch (e: any) {
            Alert.alert(t('user_friend_delete_fail'), e.message);
          } finally {
            setFriendActionLoading(false);
          }
        },
      },
    ]);
  };

  // Reload friendship status after an action (used in visitor mode)
  const refreshFriendship = async () => {
    if (!currentUserId || !targetUserId) return;
    try {
      const result = await checkFriendshipStatus(currentUserId, targetUserId);
      setFriendshipStatus(result.status);
      setFriendshipId(result.status !== 'none' ? result.friendshipId : undefined);
    } catch {}
  };

  // Accept/reject from the self-mode "新朋友" modal
  const handleAcceptRequest = async (requestId: string) => {
    try {
      await acceptFriendRequest(requestId);
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
      Alert.alert(t('user_friend_accepted'), t('user_friend_accepted_msg'));
    } catch (e: any) {
      Alert.alert(t('user_op_fail'), e.message);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    try {
      await rejectFriendRequest(requestId);
      setPendingRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (e: any) {
      Alert.alert(t('user_op_fail'), e.message);
    }
  };

  // Accept/reject from the visitor-mode inline buttons (pending_received)
  const handleAcceptInline = async () => {
    if (!friendshipId) return;
    setFriendActionLoading(true);
    try {
      await acceptFriendRequest(friendshipId);
      Alert.alert(t('user_friend_accepted'), t('user_friend_accepted_msg'));
      await refreshFriendship();
    } catch (e: any) {
      Alert.alert(t('user_op_fail'), e.message);
    } finally {
      setFriendActionLoading(false);
    }
  };

  const handleToggleBlock = () => {
    if (!currentUserId || !targetUserId) return;
    if (blocked) {
      // Unblock immediately
      setBlockActionLoading(true);
      unblockUser(currentUserId, targetUserId)
        .then(() => {
          setBlocked(false);
          Alert.alert('', t('unblock_success'));
        })
        .catch((e: any) => Alert.alert(t('block_fail'), e.message))
        .finally(() => setBlockActionLoading(false));
      return;
    }
    // Block with confirmation
    Alert.alert(t('block_confirm_title'), t('block_confirm_msg'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('block_action'),
        style: 'destructive',
        onPress: async () => {
          setBlockActionLoading(true);
          try {
            await blockUser(currentUserId, targetUserId);
            setBlocked(true);
            Alert.alert('', t('block_success'));
          } catch (e: any) {
            Alert.alert(t('block_fail'), e.message);
          } finally {
            setBlockActionLoading(false);
          }
        },
      },
    ]);
  };

  const handleRejectInline = async () => {
    if (!friendshipId) return;
    setFriendActionLoading(true);
    try {
      await rejectFriendRequest(friendshipId);
      await refreshFriendship();
    } catch (e: any) {
      Alert.alert(t('user_op_fail'), e.message);
    } finally {
      setFriendActionLoading(false);
    }
  };

  const navigateToVisitor = (visitorId: string) => {
    setVisitorsModalVisible(false);
    navigation.push('UserProfileView', { targetUserId: visitorId });
  };

  const openNotifications = async () => {
    setNotifModalVisible(true);
    try {
      const [comments, vaccs] = await Promise.all([
        getUnreadComments(currentUserId),
        getVaccinations(currentUserId).catch(() => [] as Vaccination[]),
      ]);
      setUnreadComments(comments);

      // Surface vaccinations whose next_due_date is within 14 days (or past),
      // sorted overdue → due today → upcoming.
      const now = Date.now();
      const horizonMs = 14 * 24 * 60 * 60 * 1000;
      const upcoming = vaccs
        .filter((v) => {
          if (!v.next_due_date) return false;
          const due = new Date(v.next_due_date).getTime();
          return Number.isFinite(due) && due - now <= horizonMs;
        })
        .sort((a, b) => new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime());
      setUpcomingVaccinations(upcoming);

      await markCommentsAsRead(currentUserId);
      setUnreadCount(0);
    } catch (e: any) {
      console.warn('openNotifications:', e.message);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: themeBackground }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ── Visitors Modal ──
  const visitorsModal = (
    <Modal
      visible={visitorsModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setVisitorsModalVisible(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setVisitorsModalVisible(false)}>
        <Pressable style={[styles.modalSheet, { backgroundColor: themeCardBg }]} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: themeTextColor }]}>{t('user_recent_visitors')}</Text>
          {visitors.length === 0 ? (
            <View style={styles.emptyVisitors}>
              <MaterialIcons name="visibility-off" size={32} color={colors.slate300} />
              <Text style={[styles.emptyVisitorsText, { color: themeSecondaryText }]}>{t('user_no_visitors')}</Text>
            </View>
          ) : (
            <FlatList
              data={visitors}
              keyExtractor={(item) => item.visitor_id}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.visitorRow}
                  activeOpacity={0.7}
                  onPress={() => navigateToVisitor(item.visitor_id)}
                >
                  {item.visitor_profile?.avatar_url ? (
                    <Image
                      source={{ uri: item.visitor_profile.avatar_url }}
                      style={styles.visitorAvatar}
                    />
                  ) : (
                    <View style={styles.visitorAvatarPlaceholder}>
                      <MaterialIcons name="person" size={20} color={colors.warmWood} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.visitorName, { color: themeTextColor }]}>
                      {item.visitor_profile?.nickname || t('user_mystery')}
                    </Text>
                    <Text style={[styles.visitorTime, { color: themeSecondaryText }]}>
                      {formatVisitTime(item.visited_at, t)}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.slate300} />
                </TouchableOpacity>
              )}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeBackground }]}
      contentContainerStyle={isSelf ? styles.scrollContent : styles.scrollContentVisitor}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {visitorsModal}

      {/* Notifications Modal */}
      <Modal
        visible={notifModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setNotifModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setNotifModalVisible(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: themeCardBg }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: themeTextColor }]}>{t('user_notifications')}</Text>
            {upcomingVaccinations.length > 0 && (
              <View style={{ marginBottom: 12 }}>
                {upcomingVaccinations.map((v) => {
                  const due = new Date(v.next_due_date);
                  const diffDays = Math.floor((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const label =
                    diffDays < 0 ? t('health_vaccine_overdue_label')
                    : diffDays === 0 ? t('health_vaccine_due_today_label')
                    : t('health_vaccine_upcoming_label');
                  const due_color = diffDays <= 0 ? '#dc2626' : colors.primary;
                  return (
                    <View key={v.id} style={styles.visitorRow}>
                      <View style={[styles.visitorAvatarPlaceholder, { backgroundColor: due_color + '22' }]}>
                        <MaterialIcons name="vaccines" size={20} color={due_color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.visitorName, { color: themeTextColor }]}>
                          {label} · {t('health_vaccine_dose_prefix')}{v.dose_number || '?'}{t('health_vaccine_dose_suffix')}
                        </Text>
                        <Text style={[styles.visitorTime, { color: themeSecondaryText }]}>
                          {t('health_vaccine_next_prefix')}{v.next_due_date}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            {unreadComments.length === 0 && upcomingVaccinations.length === 0 ? (
              <View style={styles.emptyVisitors}>
                <MaterialIcons name="notifications-none" size={32} color={colors.slate300} />
                <Text style={[styles.emptyVisitorsText, { color: themeSecondaryText }]}>{t('user_no_notifications')}</Text>
              </View>
            ) : unreadComments.length === 0 ? null : (
              <FlatList
                data={unreadComments}
                keyExtractor={(item) => item.id!}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => {
                  const name = item.commenter_profile?.nickname || t('user_mystery');
                  const reasonText = item.reason === 'reply'
                    ? t('user_reply_comment')
                    : t('user_comment_post');
                  return (
                    <TouchableOpacity
                      style={styles.visitorRow}
                      activeOpacity={0.7}
                      onPress={() => {
                        setNotifModalVisible(false);
                        navigation.push('UserProfileView', { targetUserId: item.user_id });
                      }}
                    >
                      {item.commenter_profile?.avatar_url ? (
                        <Image
                          source={{ uri: item.commenter_profile.avatar_url }}
                          style={styles.visitorAvatar}
                        />
                      ) : (
                        <View style={styles.visitorAvatarPlaceholder}>
                          <MaterialIcons name="person" size={20} color={colors.warmWood} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.visitorName, { color: themeTextColor }]}>{name}</Text>
                        <Text style={styles.notifReason}>{reasonText}</Text>
                        <Text style={[styles.notifPreview, { color: themeSecondaryText }]} numberOfLines={2}>
                          {item.content}
                        </Text>
                        <Text style={[styles.visitorTime, { color: themeSecondaryText }]}>
                          {formatVisitTime(item.created_at || '', t)}
                        </Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={18} color={colors.slate300} />
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Back Button (other user mode) ── */}
      {!isSelf && (
        <TouchableOpacity style={styles.backBar} onPress={handleGoBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={colors.warmWood} />
          <Text style={styles.backText}>{t('back')}</Text>
        </TouchableOpacity>
      )}

      {/* Avatar */}
      <View style={styles.avatarSection}>
        <TouchableOpacity
          onPress={isSelf ? handlePickAvatar : undefined}
          activeOpacity={isSelf ? 0.7 : 1}
          disabled={!isSelf || uploadingAvatar}
        >
          <View style={styles.avatarWrapper}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <MaterialIcons name="person" size={48} color={colors.warmWood} />
              </View>
            )}
            {uploadingAvatar && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
            {isSelf && !uploadingAvatar && (
              <View style={styles.cameraBadge}>
                <MaterialIcons name="camera-alt" size={14} color="#fff" />
              </View>
            )}
          </View>
        </TouchableOpacity>
        <Text style={[styles.avatarLabel, { color: themeTextColor }]}>{nickname || t('user_no_nickname')}</Text>
        {isSelf && <Text style={[styles.emailLabel, { color: themeSecondaryText }]}>{email}</Text>}
      </View>

      {/* ── Notification Bell (self mode) ── */}
      {isSelf && (
        <TouchableOpacity
          style={[styles.notifEntry, { backgroundColor: themeCardBg }]}
          activeOpacity={0.7}
          onPress={openNotifications}
        >
          <View style={styles.notifIconWrap}>
            <MaterialIcons name="notifications" size={20} color={colors.warmWood} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.notifLabel, { color: themeTextColor }]}>{t('user_notifications')}</Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.slate300} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      )}

      {/* ── New Friends Entry (self mode) ── */}
      {isSelf && (
        <TouchableOpacity
          style={[styles.notifEntry, { backgroundColor: themeCardBg }]}
          activeOpacity={0.7}
          onPress={() => setFriendReqModalVisible(true)}
        >
          <View style={styles.notifIconWrap}>
            <MaterialIcons name="person-add" size={20} color={colors.warmWood} />
            {pendingRequests.length > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {pendingRequests.length > 99 ? '99+' : pendingRequests.length}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.notifLabel, { color: themeTextColor }]}>{t('user_new_friends')}</Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.slate300} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      )}

      {/* Friend Requests Modal */}
      <Modal
        visible={friendReqModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFriendReqModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setFriendReqModalVisible(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: themeCardBg }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: themeTextColor }]}>{t('user_friend_requests')}</Text>
            {pendingRequests.length === 0 ? (
              <View style={styles.emptyVisitors}>
                <MaterialIcons name="person-add-disabled" size={32} color={colors.slate300} />
                <Text style={[styles.emptyVisitorsText, { color: themeSecondaryText }]}>{t('user_no_requests')}</Text>
              </View>
            ) : (
              <FlatList
                data={pendingRequests}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => (
                  <View style={styles.visitorRow}>
                    {item.requester_profile?.avatar_url ? (
                      <Image
                        source={{ uri: item.requester_profile.avatar_url }}
                        style={styles.visitorAvatar}
                      />
                    ) : (
                      <View style={styles.visitorAvatarPlaceholder}>
                        <MaterialIcons name="person" size={20} color={colors.warmWood} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.visitorName, { color: themeTextColor }]}>
                        {item.requester_profile?.nickname || t('user_mystery')}
                      </Text>
                      <Text style={[styles.visitorTime, { color: themeSecondaryText }]}>{t('user_request_add')}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => handleAcceptRequest(item.id)}
                    >
                      <Text style={styles.acceptBtnText}>{t('user_accept')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleRejectRequest(item.id)}
                    >
                      <Text style={styles.rejectBtnText}>{t('user_reject')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── My Reports Entry (self mode) ── */}
      {isSelf && (
        <TouchableOpacity
          style={[styles.notifEntry, { backgroundColor: themeCardBg }]}
          activeOpacity={0.7}
          onPress={openMyReports}
        >
          <View style={styles.notifIconWrap}>
            <MaterialIcons name="flag" size={20} color={colors.warmWood} />
          </View>
          <Text style={[styles.notifLabel, { color: themeTextColor }]}>{t('user_my_reports')}</Text>
          <MaterialIcons name="chevron-right" size={20} color={colors.slate300} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>
      )}

      {/* My Reports Modal */}
      <Modal
        visible={myReportsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMyReportsModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMyReportsModalVisible(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: themeCardBg }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: themeTextColor }]}>{t('user_my_reports')}</Text>
            {myReports.length === 0 ? (
              <View style={styles.emptyVisitors}>
                <MaterialIcons name="outlined-flag" size={32} color={colors.slate300} />
                <Text style={[styles.emptyVisitorsText, { color: themeSecondaryText }]}>{t('user_no_reports')}</Text>
              </View>
            ) : (
              <FlatList
                data={myReports}
                keyExtractor={(item) => String(item.id)}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => (
                  <View style={styles.visitorRow}>
                    <View style={styles.visitorAvatarPlaceholder}>
                      <MaterialIcons name="flag" size={18} color={colors.warmWood} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.visitorName, { color: themeTextColor }]}>
                        {t(`report_type_${item.content_type}`)} · {t(item.reason)}
                      </Text>
                      <Text style={[styles.visitorTime, { color: themeSecondaryText }]} numberOfLines={2}>
                        {new Date(item.created_at).toLocaleDateString()} · {t(`report_status_${item.status}`)}
                        {item.details ? ` · ${item.details}` : ''}
                      </Text>
                    </View>
                  </View>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Social Stats Bar (self mode) ── */}
      {isSelf && (
        <View style={[styles.statsBar, { backgroundColor: themeCardBg }]}>
          <TouchableOpacity
            style={styles.statItem}
            activeOpacity={0.7}
            onPress={() => setVisitorsModalVisible(true)}
          >
            <View style={styles.statIconWrap}>
              <MaterialIcons name="visibility" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.statNumber, { color: themeTextColor }]}>{visitors.length}</Text>
            <Text style={[styles.statLabel, { color: themeSecondaryText }]}>{t('user_visitors_label')}</Text>
          </TouchableOpacity>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={[styles.statIconWrap, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
              <MaterialIcons name="favorite" size={18} color="#ef4444" />
            </View>
            <Text style={[styles.statNumber, { color: themeTextColor }]}>{totalHugs}</Text>
            <Text style={[styles.statLabel, { color: themeSecondaryText }]}>{t('user_hugs_label')}</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statItem}>
            <View style={[styles.statIconWrap, { backgroundColor: 'rgba(59,130,246,0.1)' }]}>
              <Ionicons name="water" size={18} color="#3b82f6" />
            </View>
            <Text style={[styles.statNumber, { color: themeTextColor }]}>{totalTissues}</Text>
            <Text style={[styles.statLabel, { color: themeSecondaryText }]}>{t('user_tissues_label')}</Text>
          </View>
        </View>
      )}

      {/* Info Card */}
      <View style={[styles.formCard, { backgroundColor: themeCardBg }]}>
        <Text style={[styles.sectionTitle, { color: themeTextColor }]}>{isSelf ? t('user_personal_info') : t('user_their_info')}</Text>

        {isSelf && isEditing ? (
          <>
            <Text style={styles.label}>{t('user_nickname')}</Text>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder={t('user_nickname_placeholder')}
              placeholderTextColor={colors.slate400}
              maxLength={20}
            />

            <Text style={styles.label}>{t('user_contact')}</Text>
            <TextInput
              style={styles.input}
              value={contactInfo}
              onChangeText={setContactInfo}
              placeholder={t('user_contact_placeholder')}
              placeholderTextColor={colors.slate400}
              keyboardType="phone-pad"
              maxLength={30}
            />

            <Text style={styles.label}>{t('user_email_readonly')}</Text>
            <TextInput
              style={[styles.input, styles.inputReadonly]}
              value={email}
              editable={false}
            />

            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>{t('save')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeTextColor }]}>{t('user_nickname')}</Text>
              <Text style={[styles.infoValue, { color: themeSecondaryText }]}>{nickname || t('user_not_set')}</Text>
            </View>
            {isSelf && (
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: themeTextColor }]}>{t('user_contact')}</Text>
                <Text style={[styles.infoValue, { color: themeSecondaryText }]}>{contactInfo || t('user_not_set')}</Text>
              </View>
            )}
            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <Text style={[styles.infoLabel, { color: themeTextColor }]}>{t('user_email')}</Text>
              <Text style={[styles.infoValue, { color: themeSecondaryText }]}>{email || t('user_not_public')}</Text>
            </View>

            {isSelf && (
              <TouchableOpacity style={styles.editBtn} onPress={enterEdit} activeOpacity={0.8}>
                <MaterialIcons name="edit" size={18} color="#fff" />
                <Text style={styles.editBtnText}>{t('user_edit_profile')}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* ── Self: logout + delete account ── */}
      {isSelf && (
        <>
          <TouchableOpacity style={[styles.logoutBtn, { backgroundColor: themeCardBg }]} onPress={handleLogout} activeOpacity={0.7}>
            <MaterialIcons name="logout" size={20} color={colors.primary} />
            <Text style={styles.logoutText}>{t('user_logout')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteAccountBtn}
            onPress={() => setDeleteModalVisible(true)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="delete-forever" size={18} color="#ef4444" />
            <Text style={styles.deleteAccountText}>{t('delete_account_title')}</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Other: view pet + friendship actions ── */}
      {!isSelf && (
        <View style={styles.visitorActions}>
          <TouchableOpacity
            style={[styles.petBtn, { backgroundColor: themeCardBg }]}
            onPress={() => navigation.push('PetProfileView', { targetUserId: targetUserId! })}
            activeOpacity={0.8}
          >
            <MaterialIcons name="pets" size={20} color={colors.warmWood} />
            <Text style={[styles.petBtnText, { color: themeTextColor }]}>{t('user_view_pet')}</Text>
          </TouchableOpacity>

          {friendshipStatus === 'none' && (
            <TouchableOpacity
              style={[styles.addFriendBtn, friendActionLoading && { opacity: 0.6 }]}
              onPress={handleAddFriend}
              disabled={friendActionLoading}
              activeOpacity={0.8}
            >
              <MaterialIcons name="person-add" size={20} color="#fff" />
              <Text style={styles.addFriendText}>{t('user_add_friend')}</Text>
            </TouchableOpacity>
          )}

          {friendshipStatus === 'pending_sent' && (
            <View style={[styles.addFriendBtn, { backgroundColor: colors.slate300 }]}>
              <MaterialIcons name="hourglass-top" size={20} color={colors.white} />
              <Text style={styles.addFriendText}>{t('user_pending')}</Text>
            </View>
          )}

          {friendshipStatus === 'pending_received' && (
            <View style={styles.inlineActions}>
              <TouchableOpacity
                style={[styles.inlineActionBtn, { backgroundColor: colors.green600 }]}
                onPress={handleAcceptInline}
                disabled={friendActionLoading}
                activeOpacity={0.8}
              >
                <MaterialIcons name="check" size={20} color="#fff" />
                <Text style={styles.addFriendText}>{t('user_verify')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeFriendBtn}
                onPress={handleRejectInline}
                disabled={friendActionLoading}
                activeOpacity={0.8}
              >
                <MaterialIcons name="close" size={18} color="#ef4444" />
                <Text style={styles.removeFriendText}>{t('user_reject')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {friendshipStatus === 'accepted' && (
            <>
              <TouchableOpacity
                style={[styles.addFriendBtn, { backgroundColor: colors.green600 }]}
                onPress={() => navigation.push('ChatDetail' as any, { friendId: targetUserId, friendName: nickname })}
                activeOpacity={0.8}
              >
                <MaterialIcons name="chat" size={20} color="#fff" />
                <Text style={styles.addFriendText}>{t('user_send_message')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.removeFriendBtn}
                onPress={handleRemoveFriend}
                disabled={friendActionLoading}
                activeOpacity={0.8}
              >
                <MaterialIcons name="person-remove" size={18} color="#ef4444" />
                <Text style={styles.removeFriendText}>{t('user_remove_friend')}</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Block + Report (Apple compliance) */}
          <View style={styles.modActions}>
            <TouchableOpacity
              style={styles.modBtn}
              onPress={handleToggleBlock}
              disabled={blockActionLoading}
              activeOpacity={0.7}
            >
              <MaterialIcons
                name={blocked ? 'check-circle-outline' : 'block'}
                size={16}
                color={colors.slate500}
              />
              <Text style={styles.modBtnText}>
                {blocked ? t('unblock_action') : t('block_action')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modBtn}
              onPress={() => setReportVisible(true)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="flag" size={16} color={colors.slate500} />
              <Text style={styles.modBtnText}>{t('report_action')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Report Modal (visitor mode only) ── */}
      {!isSelf && targetUserId && (
        <ReportModal
          visible={reportVisible}
          onClose={() => setReportVisible(false)}
          reporterId={currentUserId}
          contentType="user"
          contentId={targetUserId}
        />
      )}

      {/* ── Delete Account Modal (self mode only) ── */}
      {isSelf && (
        <Modal
          visible={deleteModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => !deleting && setDeleteModalVisible(false)}
        >
          <Pressable
            style={styles.deleteOverlay}
            onPress={() => !deleting && setDeleteModalVisible(false)}
          >
            <Pressable
              style={[styles.deleteSheet, { backgroundColor: themeCardBg }]}
              onPress={() => {}}
            >
              <View style={styles.deleteIconWrap}>
                <MaterialIcons name="warning" size={32} color="#ef4444" />
              </View>
              <Text style={[styles.deleteTitle, { color: themeTextColor }]}>
                {t('delete_account_title')}
              </Text>
              <Text style={[styles.deleteWarning, { color: themeSecondaryText }]}>
                {t('delete_account_warning')}
              </Text>
              <Text style={[styles.deleteTypeLabel, { color: themeSecondaryText }]}>
                {t('delete_account_type_to_confirm')}
              </Text>
              <TextInput
                style={[styles.deleteInput, { color: themeTextColor }]}
                value={deleteConfirmText}
                onChangeText={setDeleteConfirmText}
                placeholder="DELETE"
                placeholderTextColor={colors.slate400}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!deleting}
              />
              <TouchableOpacity
                style={[
                  styles.deleteConfirmBtn,
                  (deleteConfirmText !== 'DELETE' || deleting) && { opacity: 0.4 },
                ]}
                onPress={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || deleting}
                activeOpacity={0.8}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.deleteConfirmText}>{t('delete_account_confirm_btn')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteCancelBtn}
                onPress={() => { if (!deleting) { setDeleteModalVisible(false); setDeleteConfirmText(''); } }}
                activeOpacity={0.7}
                disabled={deleting}
              >
                <Text style={[styles.deleteCancelText, { color: themeSecondaryText }]}>
                  {t('cancel')}
                </Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  scrollContentVisitor: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 40, paddingHorizontal: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Back bar
  backBar: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
  },
  backText: { fontSize: 15, fontWeight: '600', color: colors.warmWood },

  // Avatar
  avatarSection: { alignItems: 'center', paddingTop: 16, paddingBottom: 20 },
  avatarWrapper: { position: 'relative', width: 88, height: 88, marginBottom: 12 },
  avatarImage: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: colors.cardBeige,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.backgroundLight,
  },
  avatarLabel: { fontSize: 18, fontWeight: '700', color: colors.warmWood },
  emailLabel: { fontSize: 12, color: colors.slate500, marginTop: 4 },

  // ── Notification entry ──
  notifEntry: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: colors.softCream, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(154,89,76,0.05)',
  },
  notifIconWrap: { position: 'relative' },
  notifBadge: {
    position: 'absolute', top: -6, right: -8,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  notifLabel: { fontSize: 15, fontWeight: '600', color: colors.slate900 },
  notifReason: { fontSize: 12, fontWeight: '600', color: colors.primary, marginTop: 2 },
  notifPreview: { fontSize: 12, color: colors.slate500, lineHeight: 16, marginTop: 2 },

  // ── Social Stats Bar ──
  statsBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly',
    marginHorizontal: 16, marginBottom: 16, paddingVertical: 16,
    backgroundColor: colors.softCream, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(154,89,76,0.05)',
  },
  statItem: { alignItems: 'center', flex: 1 },
  statIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(236,55,19,0.1)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  statNumber: { fontSize: 18, fontWeight: '800', color: colors.slate900 },
  statLabel: { fontSize: 11, fontWeight: '500', color: colors.slate500, marginTop: 2 },
  statDivider: { width: 1, height: 40, backgroundColor: 'rgba(154,89,76,0.1)' },

  // Form Card
  formCard: {
    alignSelf: 'stretch',
    marginHorizontal: 16, backgroundColor: colors.softCream, borderRadius: 14,
    padding: 20, borderWidth: 1, borderColor: 'rgba(154,89,76,0.05)',
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.warmWood, marginBottom: 16 },

  // Display mode
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(154,89,76,0.08)',
  },
  infoLabel: { fontSize: 14, fontWeight: '600', color: colors.warmWood },
  infoValue: { fontSize: 14, color: colors.slate600, maxWidth: '60%', textAlign: 'right' },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14, marginTop: 20,
  },
  editBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Edit mode
  label: { fontSize: 13, fontWeight: '600', color: colors.warmWood, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: colors.slate200, borderRadius: 12, padding: 12,
    fontSize: 15, color: colors.slate900, marginBottom: 16, backgroundColor: colors.white,
  },
  inputReadonly: { backgroundColor: colors.slate100, color: colors.slate500 },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: {
    alignItems: 'center', paddingVertical: 14, marginTop: 8,
    borderRadius: 14, borderWidth: 1, borderColor: colors.slate200,
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: colors.slate600 },

  // Pet button (other mode)
  petBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 20, marginHorizontal: 16, paddingVertical: 14,
    backgroundColor: colors.cardBeige, borderRadius: 14,
  },
  petBtnText: { fontSize: 15, fontWeight: '700', color: colors.warmWood },

  // Visitor actions wrapper
  visitorActions: { width: '100%', marginTop: 8 },

  // Add friend
  addFriendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, marginHorizontal: 16, paddingVertical: 16,
    backgroundColor: colors.primary, borderRadius: 14,
  },
  addFriendText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Logout
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 24, marginHorizontal: 16, paddingVertical: 14,
    backgroundColor: colors.softCream, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(236,55,19,0.15)',
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: colors.primary },

  // ── Visitors Modal ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12,
    maxHeight: '70%',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate200, alignSelf: 'center', marginBottom: 16,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.slate900, marginBottom: 16 },
  emptyVisitors: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyVisitorsText: { fontSize: 14, color: colors.slate400 },
  visitorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.5)',
  },
  visitorAvatar: { width: 40, height: 40, borderRadius: 20 },
  visitorAvatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cardBeige,
    alignItems: 'center', justifyContent: 'center',
  },
  visitorName: { fontSize: 14, fontWeight: '600', color: colors.slate900 },
  visitorTime: { fontSize: 12, color: colors.slate400, marginTop: 2 },

  // Inline accept/reject actions (pending_received)
  inlineActions: { gap: 10, marginTop: 12, marginHorizontal: 16 },
  inlineActionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 14,
  },

  // Remove friend (red outline style)
  removeFriendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, marginHorizontal: 16, paddingVertical: 14,
    backgroundColor: 'rgba(239,68,68,0.06)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
  },
  removeFriendText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },

  // Friend request accept/reject
  acceptBtn: {
    backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, marginLeft: 8,
  },
  acceptBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rejectBtn: {
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, marginLeft: 6,
    borderWidth: 1, borderColor: colors.slate300,
  },
  rejectBtnText: { fontSize: 13, fontWeight: '600', color: colors.slate600 },

  // Block + Report row
  modActions: {
    flexDirection: 'row', justifyContent: 'center', gap: 24,
    marginTop: 16, paddingVertical: 8,
  },
  modBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  modBtnText: { fontSize: 12, color: colors.slate500, fontWeight: '600' },

  // Delete Account
  deleteAccountBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, marginHorizontal: 16, paddingVertical: 12,
  },
  deleteAccountText: { color: '#ef4444', fontSize: 13, fontWeight: '600' },
  deleteOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  deleteSheet: {
    width: '100%', maxWidth: 400, borderRadius: 18, padding: 24, alignItems: 'center',
  },
  deleteIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(239,68,68,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  deleteTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  deleteWarning: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginBottom: 18 },
  deleteTypeLabel: { fontSize: 12, marginBottom: 8, alignSelf: 'flex-start' },
  deleteInput: {
    borderWidth: 1, borderColor: colors.slate200, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
    width: '100%', marginBottom: 16, letterSpacing: 1,
  },
  deleteConfirmBtn: {
    backgroundColor: '#ef4444', borderRadius: 12, paddingVertical: 14,
    width: '100%', alignItems: 'center',
  },
  deleteConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  deleteCancelBtn: { marginTop: 12, paddingVertical: 8 },
  deleteCancelText: { fontSize: 14, fontWeight: '500' },
});
