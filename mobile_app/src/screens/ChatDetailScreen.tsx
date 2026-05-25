import React, { useState, useEffect, useCallback, useRef, useContext } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Image, AppState,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { supabase } from '../services/supabaseClient';
import { sendMessage, getChatHistory, markMessagesAsRead, ChatMessage, isUserBlocked } from '../services/PetDatabaseService';
import { BadgeContext } from '../context/BadgeContext';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/RootNavigator';
import ReportModal from '../components/ReportModal';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ChatDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation<Nav>();
  const { refreshBadge } = useContext(BadgeContext);
  const { themeBackground, themeTextColor, themeSecondaryText, themeCardBg, isDark } = useSettings();
  const t = useT();
  const { friendId, friendName } = route.params as { friendId: string; friendName: string };

  const [currentUserId, setCurrentUserId] = useState('');
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const [friendAvatarUrl, setFriendAvatarUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const goToFriendProfile = useCallback(() => {
    navigation.push('UserProfileView', { targetUserId: friendId });
  }, [navigation, friendId]);

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: friendName,
      headerTintColor: isDark ? '#f1f5f9' : colors.warmWood,
      headerStyle: { backgroundColor: themeBackground },
      headerTitleStyle: { color: isDark ? '#f1f5f9' : colors.warmWood, fontWeight: '700' as const },
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 4 }}>
          <Ionicons name="chevron-back" size={24} color={isDark ? '#f1f5f9' : colors.warmWood} />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
          <TouchableOpacity onPress={() => setReportVisible(true)} style={{ padding: 8 }} activeOpacity={0.7}>
            <MaterialIcons name="flag" size={20} color={isDark ? '#f1f5f9' : colors.warmWood} />
          </TouchableOpacity>
          <TouchableOpacity onPress={goToFriendProfile} style={{ padding: 8 }} activeOpacity={0.7}>
            <Ionicons name="person-circle-outline" size={26} color={isDark ? '#f1f5f9' : colors.warmWood} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, friendName, goToFriendProfile, themeBackground, isDark]);

  useEffect(() => {
    if (!currentUserId || !friendId) return;
    isUserBlocked(currentUserId, friendId).then(setBlocked).catch(() => {});
  }, [currentUserId, friendId]);

  const loadAvatars = useCallback(async (myId: string) => {
    try {
      const { data } = await supabase.from('user_profiles').select('id, avatar_url').in('id', [myId, friendId]);
      for (const row of data || []) {
        if (row.id === myId) setMyAvatarUrl(row.avatar_url);
        else setFriendAvatarUrl(row.avatar_url);
      }
    } catch {}
  }, [friendId]);

  const loadMessages = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);
      const history = await getChatHistory(user.id, friendId);
      setMessages(history);
    } catch (e: any) { console.warn('loadMessages:', e.message); }
  }, [friendId]);

  useEffect(() => { loadMessages().then(() => setLoading(false)); }, [loadMessages]);
  useEffect(() => { if (currentUserId) loadAvatars(currentUserId); }, [currentUserId, loadAvatars]);
  useEffect(() => {
    if (!currentUserId || !friendId) return;
    markMessagesAsRead(currentUserId, friendId).then(() => refreshBadge()).catch((e) => console.warn('markRead:', e.message));
  }, [currentUserId, friendId, messages, refreshBadge]);

  // Realtime: append new messages from this friend as they arrive. Also
  // re-load on app resume in case we missed events while backgrounded.
  useEffect(() => {
    if (!currentUserId || !friendId) return;
    const channel = supabase
      .channel(`chat-${currentUserId}-${friendId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `receiver_id=eq.${currentUserId}` },
        (payload) => {
          const msg = payload.new as ChatMessage;
          if (msg.sender_id !== friendId) return;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        },
      )
      .subscribe();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') loadMessages();
    });
    return () => {
      supabase.removeChannel(channel);
      sub.remove();
    };
  }, [currentUserId, friendId, loadMessages]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !currentUserId || sending) return;
    setSending(true); setInputText('');
    try {
      const msg = await sendMessage(currentUserId, friendId, text);
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) { console.warn('sendMessage:', e.message); setInputText(text); }
    finally { setSending(false); }
  };

  const formatTime = (iso: string) => { const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, '0'); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const AvatarView = ({ uri, onPress }: { uri: string | null; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {uri ? <Image source={{ uri }} style={styles.msgAvatar} /> : (
        <View style={styles.msgAvatarPlaceholder}><MaterialIcons name="person" size={18} color={colors.warmWood} /></View>
      )}
    </TouchableOpacity>
  );

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isMe = item.sender_id === currentUserId;
    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowRight : styles.msgRowLeft]}>
        {!isMe && <AvatarView uri={friendAvatarUrl} onPress={goToFriendProfile} />}
        <View style={styles.msgContent}>
          <View style={[styles.bubble, isMe ? styles.bubbleMe : [styles.bubbleOther, { backgroundColor: themeCardBg }]]}>
            <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : { color: themeTextColor }]}>{item.content}</Text>
          </View>
          <Text style={[styles.timeText, isMe ? styles.timeRight : styles.timeLeft]}>{formatTime(item.created_at)}</Text>
        </View>
        {isMe && <AvatarView uri={myAvatarUrl} onPress={() => navigation.navigate('MainTabs' as any, { screen: 'UserProfile', params: { targetUserId: undefined } })} />}
      </View>
    );
  };

  if (loading) return <View style={[styles.centered, { backgroundColor: themeBackground }]}><ActivityIndicator size="large" color={colors.primary} /></View>;

  const visibleMessages = blocked
    ? messages.filter((m) => m.sender_id === currentUserId)
    : messages;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: themeBackground }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      {blocked && (
        <View style={styles.blockedBanner}>
          <MaterialIcons name="block" size={16} color={colors.slate500} />
          <Text style={styles.blockedBannerText}>
            {t('block_action')} · {t('block_confirm_msg')}
          </Text>
        </View>
      )}
      <FlatList
        ref={flatListRef} data={visibleMessages} keyExtractor={(item) => item.id} renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialIcons name="chat-bubble-outline" size={40} color={colors.slate300} />
            <Text style={[styles.emptyText, { color: themeSecondaryText }]}>{t('chat_empty')}</Text>
          </View>
        }
      />
      <View style={[styles.inputBar, { backgroundColor: themeCardBg, borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(226,232,240,0.6)' }]}>
        <TextInput
          style={[styles.textInput, { color: themeTextColor }]}
          value={inputText}
          onChangeText={setInputText}
          placeholder={t('chat_input_placeholder')}
          placeholderTextColor={colors.slate400}
          multiline
          maxLength={1000}
          editable={!blocked}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!inputText.trim() || sending || blocked) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || sending || blocked}
          activeOpacity={0.7}
        >
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <MaterialIcons name="send" size={20} color="#fff" />}
        </TouchableOpacity>
      </View>

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        reporterId={currentUserId}
        contentType="user"
        contentId={friendId}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  messageList: { flexGrow: 1, paddingHorizontal: 12, paddingVertical: 12 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, gap: 8 },
  msgRowLeft: { alignSelf: 'flex-start', maxWidth: '82%' },
  msgRowRight: { alignSelf: 'flex-end', maxWidth: '82%' },
  msgContent: { flexShrink: 1 },
  msgAvatar: { width: 36, height: 36, borderRadius: 18 },
  msgAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cardBeige, alignItems: 'center', justifyContent: 'center' },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4, borderWidth: 1, borderColor: 'rgba(226,232,240,0.6)' },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  bubbleTextMe: { color: '#fff' },
  timeText: { fontSize: 11, color: colors.slate400, marginTop: 4 },
  timeLeft: { textAlign: 'left' },
  timeRight: { textAlign: 'right' },
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyText: { fontSize: 14 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
  textInput: { flex: 1, maxHeight: 100, backgroundColor: 'rgba(128,128,128,0.08)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: colors.slate300 },
  blockedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: 'rgba(154,89,76,0.06)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.6)',
  },
  blockedBannerText: { fontSize: 12, color: colors.slate500, flex: 1, lineHeight: 16 },
});
