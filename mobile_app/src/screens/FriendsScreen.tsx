import React, { useState, useCallback, useEffect, useContext } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { supabase } from '../services/supabaseClient';
import { getFriendsList, getUnreadCountByFriend, FriendItem, getBlockedUserIds } from '../services/PetDatabaseService';
import { BadgeContext } from '../context/BadgeContext';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function FriendsScreen() {
  const navigation = useNavigation<Nav>();
  const { refreshBadge } = useContext(BadgeContext);
  const { themeBackground, themeTextColor, themeSecondaryText, themeCardBg } = useSettings();
  const t = useT();
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [list, counts, blockedIds] = await Promise.all([
        getFriendsList(user.id),
        getUnreadCountByFriend(user.id),
        getBlockedUserIds(user.id),
      ]);
      const blockedSet = new Set(blockedIds);
      setFriends(list.filter((f) => !blockedSet.has(f.id)));
      setUnreadMap(counts);
    } catch (e: any) { console.warn('loadFriends:', e.message); }
  }, []);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => { loadData(); refreshBadge(); });
    return unsubscribe;
  }, [navigation, loadData, refreshBadge]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadData(); refreshBadge(); setRefreshing(false); }, [loadData, refreshBadge]);

  // Realtime: refresh the per-friend unread map whenever a chat_messages
  // row addressed to me changes (insert from sender, update to is_read).
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      channel = supabase
        .channel(`friends-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_messages', filter: `receiver_id=eq.${user.id}` },
          () => { loadData(); },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadData]);

  const renderItem = ({ item }: { item: FriendItem }) => {
    const unread = unreadMap[item.id] || 0;
    return (
      <TouchableOpacity style={[styles.friendRow, { backgroundColor: themeCardBg }]} activeOpacity={0.7}
        onPress={() => navigation.push('ChatDetail' as any, { friendId: item.id, friendName: item.nickname || t('tab_friends') })}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}><MaterialIcons name="person" size={24} color={colors.warmWood} /></View>
        )}
        <Text style={[styles.nickname, { color: themeTextColor }]} numberOfLines={1}>{item.nickname || t('friends_no_nickname')}</Text>
        {unread > 0 && <View style={styles.unreadBadge}><Text style={styles.unreadText}>{unread > 99 ? '99+' : unread}</Text></View>}
        <MaterialIcons name="chevron-right" size={22} color={themeSecondaryText} />
      </TouchableOpacity>
    );
  };

  if (loading) return <View style={[styles.centered, { backgroundColor: themeBackground }]}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View style={[styles.container, { backgroundColor: themeBackground }]}>
      <FlatList
        data={friends}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={friends.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="people-outline" size={48} color={colors.slate300} />
            <Text style={[styles.emptyText, { color: themeSecondaryText }]}>{t('friends_empty')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingVertical: 8 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.5)' },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.cardBeige, alignItems: 'center', justifyContent: 'center' },
  nickname: { flex: 1, fontSize: 16, fontWeight: '600' },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginRight: 4 },
  unreadText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  emptyWrap: { alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 14 },
});
