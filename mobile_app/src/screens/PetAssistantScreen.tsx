import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Animated, Keyboard, TouchableWithoutFeedback, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabaseClient';
import {
  AssistantMessage, AssistantConversation, AssistantError,
  listConversations, getConversationMessages, sendAssistantMessage, deleteConversation,
} from '../services/PetAssistantService';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';
import { colors } from '../theme/colors';

// Consent is per user, like the per-user avatar cache — switching accounts on
// the same device must ask again.
const consentKey = (userId: string) => `ai_assistant_consent_${userId}`;

const SUGGESTIONS = ['ai_suggest_vaccine', 'ai_suggest_weight', 'ai_suggest_medical', 'ai_suggest_memory'];

export default function PetAssistantScreen({ navigation }: any) {
  const { themeBackground, themeTextColor, themeSecondaryText, themeCardBg, isDark, language } = useSettings();
  const t = useT();
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(236,55,19,0.08)';

  const [userId, setUserId] = useState<string | null>(null);
  const [consent, setConsent] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<AssistantConversation | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const panelWidth = useWindowDimensions().width * 0.8;
  const translateX = useRef(new Animated.Value(-panelWidth)).current;
  const sendingRef = useRef(false);
  const deletingRef = useRef<string | null>(null);
  const currentConversationRef = useRef<AssistantConversation | null>(null);
  const historyRequest = useRef(0);
  // Preserve local sends/deletes if the initial list request returns late.
  const changedConversationIds = useRef(new Set<string>());
  const tRef = useRef(t);
  tRef.current = t;
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const listRef = useRef<FlatList<AssistantMessage>>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id); });
  }, []);

  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(consentKey(userId))
      .then((v) => setConsent(v === 'yes'))
      .catch(() => setConsent(false));
  }, [userId]);

  useEffect(() => {
    if (!userId || !consent) return;
    let cancelled = false;
    setLoadingConversations(true);
    listConversations(userId)
      .then((rows) => {
        if (cancelled) return;
        setConversations((prev) => [
          ...prev.filter((c) => changedConversationIds.current.has(c.id)),
          ...rows.filter((c) => !changedConversationIds.current.has(c.id)),
        ].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
      })
      .catch(() => { if (!cancelled) Alert.alert(tRef.current('tip'), tRef.current('ai_load_fail')); })
      .finally(() => { if (!cancelled) setLoadingConversations(false); });
    return () => { cancelled = true; };
  }, [userId, consent]);

  useEffect(() => () => { historyRequest.current++; }, []);

  const closePanel = () => {
    Animated.timing(translateX, {
      toValue: -panelWidth, duration: 200, useNativeDriver: true,
    }).start(({ finished }) => { if (finished) setPanelVisible(false); });
  };

  const openPanel = () => {
    if (!consent || sendingRef.current) return;
    Keyboard.dismiss();
    setPanelVisible(true);
    translateX.setValue(-panelWidth);
    Animated.timing(translateX, {
      toValue: 0, duration: 250, useNativeDriver: true,
    }).start();
  };

  const resetChat = () => {
    historyRequest.current++;
    currentConversationRef.current = null;
    setCurrentConversation(null);
    setMessages([]);
    setInput('');
    setLoadingHistory(false);
  };

  const newChat = () => {
    if (sendingRef.current || deletingRef.current) return;
    resetChat();
    closePanel();
  };

  const selectConversation = async (conversation: AssistantConversation) => {
    if (sendingRef.current || deletingRef.current) return;
    closePanel();
    const request = ++historyRequest.current;
    currentConversationRef.current = conversation;
    setCurrentConversation(conversation);
    setMessages([]);
    setInput('');
    setLoadingHistory(true);
    try {
      const rows = await getConversationMessages(conversation.id);
      if (request === historyRequest.current) setMessages(rows);
    } catch {
      if (request === historyRequest.current) {
        resetChat();
        Alert.alert(t('tip'), t('ai_load_fail'));
      }
    } finally {
      if (request === historyRequest.current) setLoadingHistory(false);
    }
  };

  const acceptConsent = async () => {
    if (!userId) return;
    await AsyncStorage.setItem(consentKey(userId), 'yes').catch(() => {});
    setConsent(true);
  };

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || sendingRef.current || loadingHistory || deletingRef.current) return;
    sendingRef.current = true;
    const optimistic: AssistantMessage = {
      id: `local-${Date.now()}`, role: 'user', content: message, created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    setSending(true);
    try {
      const { reply, remaining: left, conversation_id, title } = await sendAssistantMessage(message, currentConversation?.id);
      const now = new Date().toISOString();
      const conversation: AssistantConversation = {
        id: conversation_id, title,
        created_at: currentConversation?.created_at ?? now, updated_at: now,
      };
      currentConversationRef.current = conversation;
      setCurrentConversation(conversation);
      changedConversationIds.current.add(conversation_id);
      setConversations((prev) => [conversation, ...prev.filter((c) => c.id !== conversation_id)]);
      setRemaining(left);
      setMessages((prev) => [...prev, {
        id: `local-${Date.now()}-a`, role: 'assistant', content: reply, created_at: new Date().toISOString(),
      }]);
    } catch (e: any) {
      // Roll back so the user can retry without retyping.
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(message);
      const limit = e instanceof AssistantError && e.code === 'daily_limit_reached';
      if (limit) setRemaining(0);
      Alert.alert(t('tip'), limit ? t('ai_limit_reached') : t('ai_send_fail'));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [loadingHistory, currentConversation, t]);

  const confirmDelete = (conversation: AssistantConversation) => {
    if (sendingRef.current || deletingRef.current) return;
    Alert.alert(t('ai_delete_conversation_title'), t('ai_delete_conversation_body'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('ai_delete_btn'), style: 'destructive', onPress: async () => {
          if (sendingRef.current || deletingRef.current) return;
          deletingRef.current = conversation.id;
          setDeletingId(conversation.id);
          try {
            await deleteConversation(conversation.id);
            changedConversationIds.current.add(conversation.id);
            setConversations((prev) => prev.filter((c) => c.id !== conversation.id));
            if (currentConversationRef.current?.id === conversation.id) resetChat();
          } catch {
            Alert.alert(t('tip'), t('ai_delete_fail'));
          } finally {
            deletingRef.current = null;
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity style={[styles.iconButton, { backgroundColor: themeCardBg, borderColor: cardBorder }]} onPress={() => navigation.goBack()}>
        <MaterialIcons name="arrow-back" size={22} color={themeTextColor} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.iconButton, { backgroundColor: themeCardBg, borderColor: cardBorder, opacity: consent && !sending ? 1 : 0.4 }]}
        onPress={openPanel} disabled={!consent || sending} accessibilityLabel={t('ai_conversations')}
      >
        <MaterialIcons name="menu" size={22} color={themeTextColor} />
      </TouchableOpacity>
      <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.headerTitle, { color: themeTextColor }]}>
        {currentConversation?.title ?? t('ai_title')}
      </Text>
      <TouchableOpacity
        style={[styles.iconButton, { backgroundColor: themeCardBg, borderColor: cardBorder, opacity: consent && !sending && !deletingId ? 1 : 0.4 }]}
        onPress={newChat} disabled={!consent || sending || !!deletingId} accessibilityLabel={t('ai_new_chat')}
      >
        <MaterialIcons name="add-comment" size={20} color={themeTextColor} />
      </TouchableOpacity>
    </View>
  );

  if (consent === null) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeBackground }]}>
        {header}
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!consent) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeBackground }]}>
        {header}
        <View style={[styles.consentCard, { backgroundColor: themeCardBg, borderColor: cardBorder }]}>
          <MaterialIcons name="privacy-tip" size={36} color={colors.primary} />
          <Text style={[styles.consentTitle, { color: themeTextColor }]}>{t('ai_consent_title')}</Text>
          <Text style={[styles.consentBody, { color: themeSecondaryText }]}>{t('ai_consent_body')}</Text>
          <TouchableOpacity style={styles.consentAgree} onPress={acceptConsent}>
            <Text style={styles.consentAgreeText}>{t('ai_consent_agree')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.consentDecline} onPress={() => navigation.goBack()}>
            <Text style={[styles.consentDeclineText, { color: themeSecondaryText }]}>{t('ai_consent_decline')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: AssistantMessage }) => {
    const mine = item.role === 'user';
    return (
      <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : null]}>
        {!mine && (
          <View style={styles.avatar}><MaterialIcons name="pets" size={16} color={colors.primary} /></View>
        )}
        <View style={[styles.bubble, mine ? styles.bubbleMine : [styles.bubbleBot, { backgroundColor: themeCardBg, borderColor: cardBorder }]]}>
          <Text selectable style={[styles.bubbleText, { color: mine ? '#fff' : themeTextColor }]}>{item.content}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeBackground }]} edges={['top', 'left', 'right']}>
      {header}
      <View style={styles.disclaimer}>
        <MaterialIcons name="info-outline" size={14} color={colors.amber700} />
        <Text style={styles.disclaimerText}>{t('ai_disclaimer')}</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {loadingHistory ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}><MaterialIcons name="pets" size={32} color={colors.primary} /></View>
                <Text style={[styles.emptyTitle, { color: themeTextColor }]}>{t('ai_empty_title')}</Text>
                <Text style={[styles.emptyBody, { color: themeSecondaryText }]}>{t('ai_empty_body')}</Text>
                <View style={styles.chips}>
                  {SUGGESTIONS.map((key) => (
                    <TouchableOpacity key={key} style={styles.chip} onPress={() => send(t(key))} disabled={sending}>
                      <Text style={styles.chipText}>{t(key)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            }
            ListFooterComponent={sending ? (
              <View style={styles.bubbleRow}>
                <View style={styles.avatar}><MaterialIcons name="pets" size={16} color={colors.primary} /></View>
                <View style={[styles.bubble, styles.bubbleBot, styles.typing, { backgroundColor: themeCardBg, borderColor: cardBorder }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.typingText, { color: themeSecondaryText }]}>{t('ai_thinking')}</Text>
                </View>
              </View>
            ) : null}
          />
        )}
        {remaining !== null && remaining <= 5 && (
          <Text style={[styles.remaining, { color: themeSecondaryText }]}>{t('ai_remaining').replace('{n}', String(remaining))}</Text>
        )}
        <SafeAreaView edges={['bottom']} style={[styles.inputBar, { backgroundColor: themeCardBg, borderTopColor: cardBorder }]}>
          <TextInput
            style={[styles.input, { color: themeTextColor }]}
            placeholder={t('ai_input_placeholder')}
            placeholderTextColor={colors.slate400}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
            editable={!sending && !loadingHistory && !deletingId}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending || loadingHistory || !!deletingId) && { opacity: 0.4 }]}
            onPress={() => send(input)}
            disabled={!input.trim() || sending || loadingHistory || !!deletingId}
          >
            <MaterialIcons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </SafeAreaView>
      </KeyboardAvoidingView>
      {panelVisible && (
        <>
          <TouchableWithoutFeedback onPress={closePanel} accessibilityLabel={t('cancel')}>
            <View style={styles.overlay} />
          </TouchableWithoutFeedback>
          <Animated.View style={[styles.panel, { width: panelWidth, backgroundColor: themeBackground, transform: [{ translateX }] }]}>
            <SafeAreaView style={styles.panelContent} edges={['top', 'bottom']}>
              <Text style={[styles.panelTitle, { color: themeTextColor }]}>{t('ai_conversations')}</Text>
              <TouchableOpacity style={[styles.newChatButton, (sending || !!deletingId) && { opacity: 0.4 }]} onPress={newChat} disabled={sending || !!deletingId}>
                <MaterialIcons name="add-comment" size={22} color="#fff" />
                <Text style={styles.newChatText}>{t('ai_new_chat')}</Text>
              </TouchableOpacity>
              {loadingConversations && <ActivityIndicator style={styles.panelLoading} color={colors.primary} />}
              <FlatList
                data={conversations}
                keyExtractor={(c) => c.id}
                extraData={`${currentConversation?.id}|${deletingId}|${sending}`}
                contentContainerStyle={styles.conversationList}
                ListEmptyComponent={!loadingConversations ? <Text style={[styles.noConversations, { color: themeSecondaryText }]}>{t('ai_no_conversations')}</Text> : null}
                renderItem={({ item }) => (
                  <View style={[styles.conversationRow, {
                    backgroundColor: themeCardBg,
                    borderColor: item.id === currentConversation?.id ? colors.primary : cardBorder,
                  }]}>
                    <TouchableOpacity style={styles.conversationSelect} onPress={() => selectConversation(item)} disabled={sending || !!deletingId}>
                      <Text numberOfLines={1} style={[styles.conversationTitle, { color: themeTextColor }]}>{item.title}</Text>
                      <Text style={[styles.conversationDate, { color: themeSecondaryText }]}>
                        {new Date(item.updated_at).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item)} disabled={sending || !!deletingId} accessibilityLabel={t('ai_delete_btn')}>
                      {deletingId === item.id ? <ActivityIndicator size="small" color={colors.primary} /> : <MaterialIcons name="delete-outline" size={20} color={themeSecondaryText} />}
                    </TouchableOpacity>
                  </View>
                )}
              />
            </SafeAreaView>
          </Animated.View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', zIndex: 10 },
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 20, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 10 },
  panelContent: { flex: 1, paddingHorizontal: 16 },
  panelTitle: { fontSize: 20, fontWeight: '800', marginTop: 16, marginBottom: 20 },
  newChatButton: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primary, padding: 14, borderRadius: 14, marginBottom: 16 },
  newChatText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  panelLoading: { marginBottom: 12 },
  conversationList: { paddingBottom: 16 },
  conversationRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, marginBottom: 8 },
  conversationSelect: { flex: 1, padding: 12 },
  conversationTitle: { fontSize: 15, fontWeight: '600' },
  conversationDate: { fontSize: 12, marginTop: 4 },
  deleteButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  noConversations: { textAlign: 'center', fontSize: 14, paddingVertical: 24 },
  disclaimer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#fffbeb' },
  disclaimerText: { flex: 1, fontSize: 12, color: colors.amber700 },
  listContent: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 12 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleBot: { borderWidth: 1, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 32 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyBody: { fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 24, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 20 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: colors.primaryLight },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  remaining: { fontSize: 11, textAlign: 'center', paddingBottom: 4 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 40, maxHeight: 120, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, borderRadius: 20, backgroundColor: 'rgba(128,128,128,0.08)', fontSize: 15 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  consentCard: { margin: 20, padding: 24, borderRadius: 20, borderWidth: 1, alignItems: 'center' },
  consentTitle: { fontSize: 18, fontWeight: '800', marginTop: 12 },
  consentBody: { fontSize: 14, lineHeight: 22, marginTop: 12 },
  consentAgree: { alignSelf: 'stretch', height: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  consentAgreeText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  consentDecline: { alignSelf: 'stretch', height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  consentDeclineText: { fontSize: 14, fontWeight: '600' },
});
