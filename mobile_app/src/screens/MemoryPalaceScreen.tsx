import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Dimensions,
  FlatList, ActivityIndicator, Alert, Animated, Pressable, Image,
  KeyboardAvoidingView, Platform, ScrollView, Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../services/supabaseClient';
import {
  MemoryDiary, MemoryVideo,
  createDiary, updateDiary, getDiaries, deleteDiary,
  createVideo, updateVideoTitle, getVideos, deleteVideo,
  uploadMemoryMedia, uploadMemoryImage,
} from '../services/PetDatabaseService';
import { colors } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';

const { width: SCREEN_W } = Dimensions.get('window');
const SIDEBAR_W = SCREEN_W * 0.72;

type TabKey = 'diary' | 'video';

// ─── Toast component ───────────────────────
function Toast({ visible, message }: { visible: boolean; message: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1200),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);
  if (!visible) return null;
  return (
    <Animated.View style={[styles.toast, { opacity }]}>
      <Ionicons name="checkmark-circle" size={18} color="#fff" />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ─── Main Component ────────────────────────
export default function MemoryPalaceScreen() {
  const { themeBackground, themeTextColor, themeSecondaryText, themeCardBg, isDark } = useSettings();
  const t = useT();

  const [userId, setUserId] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('diary');
  const [loading, setLoading] = useState(true);
  const [toastMsg, setToastMsg] = useState('');
  const [toastKey, setToastKey] = useState(0);

  // Sidebar
  const sidebarAnim = useRef(new Animated.Value(-SIDEBAR_W)).current;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Diary state
  const [diaries, setDiaries] = useState<MemoryDiary[]>([]);
  const [currentDiary, setCurrentDiary] = useState<MemoryDiary | null>(null);
  const [diaryContent, setDiaryContent] = useState('');
  const [diaryImages, setDiaryImages] = useState<string[]>([]);
  const [diarySaving, setDiarySaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  // Video state
  const [videos, setVideos] = useState<MemoryVideo[]>([]);
  const [currentVideo, setCurrentVideo] = useState<MemoryVideo | null>(null);
  const [videoAge, setVideoAge] = useState('');
  const [videoUploading, setVideoUploading] = useState(false);

  // expo-video
  const [videoSource, setVideoSource] = useState<string | null>(null);
  const videoPlayer = useVideoPlayer(videoSource);

  // Sidebar title editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const showToast = (msg: string) => { setToastMsg(msg); setToastKey(k => k + 1); };

  function defaultTitle(): string {
    const d = new Date();
    return `${d.getFullYear()}${t('memory_year')}${d.getMonth() + 1}${t('memory_month')}${d.getDate()}${t('memory_day')}`;
  }

  // ── Init ──
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        await loadAll(user.id);
      }
      setLoading(false);
    })();
    return () => { stopMedia(); };
  }, []);

  const loadAll = async (uid: string) => {
    const [d, v] = await Promise.all([getDiaries(uid), getVideos(uid)]);
    setDiaries(d);
    setVideos(v);
  };

  const stopMedia = () => {
    try { videoPlayer.pause(); } catch {}
    setVideoSource(null);
  };

  // ── Sidebar animation ──
  const toggleSidebar = () => {
    const toValue = sidebarOpen ? -SIDEBAR_W : 0;
    Animated.timing(sidebarAnim, { toValue, duration: 250, useNativeDriver: true }).start();
    setSidebarOpen(!sidebarOpen);
  };

  // ── Tab switch ──
  const switchTab = (tab: TabKey) => {
    stopMedia();
    setActiveTab(tab);
    setCurrentDiary(null);
    setCurrentVideo(null);
    setDiaryContent('');
    setDiaryImages([]);
    setVideoAge('');
  };

  // ── New entry ──
  const handleNew = () => {
    stopMedia();
    if (activeTab === 'diary') {
      setCurrentDiary(null);
      setDiaryContent('');
      setDiaryImages([]);
    } else {
      setCurrentVideo(null);
      setVideoAge('');
    }
    if (sidebarOpen) toggleSidebar();
  };

  // ═══════════════════════════════════════
  // DIARY
  // ═══════════════════════════════════════
  const handleSaveDiary = async () => {
    if (!userId || !diaryContent.trim()) {
      Alert.alert('', t('memory_content_required'));
      return;
    }
    setDiarySaving(true);
    try {
      if (currentDiary?.id) {
        const updated = await updateDiary(currentDiary.id, {
          content: diaryContent, image_urls: diaryImages,
        });
        setCurrentDiary(updated);
        setDiaries(prev => prev.map(d => d.id === updated.id ? updated : d));
      } else {
        const created = await createDiary(userId, defaultTitle(), diaryContent, diaryImages);
        setCurrentDiary(created);
        setDiaries(prev => [created, ...prev]);
      }
      Keyboard.dismiss();
      showToast(t('memory_save_success'));
    } catch (e: any) {
      Alert.alert(t('memory_save_fail'), e.message);
    } finally {
      setDiarySaving(false);
    }
  };

  const handlePickDiaryImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('memory_cannot_open'), t('memory_album_permission'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setImageUploading(true);
      const url = await uploadMemoryImage(userId, result.assets[0].uri);
      setDiaryImages(prev => [...prev, url]);
      showToast(t('memory_image_added'));
    } catch (e: any) {
      Alert.alert(t('memory_cannot_open'), e.message);
    } finally {
      setImageUploading(false);
    }
  };

  const handleRemoveDiaryImage = (idx: number) => {
    setDiaryImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDeleteDiary = (id: string) => {
    Alert.alert(t('memory_delete_diary'), t('memory_delete_diary_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive', onPress: async () => {
          await deleteDiary(id);
          setDiaries(prev => prev.filter(d => d.id !== id));
          if (currentDiary?.id === id) { setCurrentDiary(null); setDiaryContent(''); setDiaryImages([]); }
        },
      },
    ]);
  };

  // ═══════════════════════════════════════
  // VIDEO
  // ═══════════════════════════════════════
  const pickVideo = async () => {
    if (!videoAge.trim()) { Alert.alert('', t('memory_pet_age_required')); return; }
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('memory_cannot_open'), t('memory_video_permission'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setVideoUploading(true);
      const url = await uploadMemoryMedia(userId, result.assets[0].uri, 'video');
      const vid = await createVideo(userId, defaultTitle(), url, videoAge.trim());
      setVideos(prev => [vid, ...prev]);
      setCurrentVideo(vid);
      setVideoAge('');
      showToast(t('memory_video_saved'));
    } catch (e: any) {
      Alert.alert(t('memory_cannot_open'), e.message);
    } finally {
      setVideoUploading(false);
    }
  };

  useEffect(() => {
    if (currentVideo) {
      setVideoSource(currentVideo.video_url);
    } else {
      setVideoSource(null);
      try { videoPlayer.pause(); } catch {}
    }
  }, [currentVideo]);

  const handleDeleteVideo = (vid: MemoryVideo) => {
    Alert.alert(t('memory_delete_memory'), t('memory_delete_memory_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive', onPress: async () => {
          stopMedia();
          await deleteVideo(vid.id!);
          setVideos(prev => prev.filter(v => v.id !== vid.id));
          if (currentVideo?.id === vid.id) setCurrentVideo(null);
        },
      },
    ]);
  };

  // ═══════════════════════════════════════
  // Sidebar title edit
  // ═══════════════════════════════════════
  const startEditTitle = (id: string, title: string) => {
    setEditingId(id);
    setEditTitle(title);
  };

  const saveTitle = async () => {
    if (!editingId || !editTitle.trim()) { setEditingId(null); return; }
    try {
      if (activeTab === 'diary') {
        await updateDiary(editingId, { title: editTitle.trim() });
        setDiaries(prev => prev.map(d => d.id === editingId ? { ...d, title: editTitle.trim() } : d));
        if (currentDiary?.id === editingId) setCurrentDiary(prev => prev ? { ...prev, title: editTitle.trim() } : prev);
      } else {
        await updateVideoTitle(editingId, editTitle.trim());
        setVideos(prev => prev.map(v => v.id === editingId ? { ...v, title: editTitle.trim() } : v));
        if (currentVideo?.id === editingId) setCurrentVideo(prev => prev ? { ...prev, title: editTitle.trim() } : prev);
      }
    } catch (e: any) {
      Alert.alert(t('memory_save_fail'), e.message);
    }
    setEditingId(null);
  };

  const handleSidebarSelect = (item: any) => {
    stopMedia();
    if (activeTab === 'diary') {
      setCurrentDiary(item);
      setDiaryContent(item.content || '');
      setDiaryImages(item.image_urls ?? []);
    } else {
      setCurrentVideo(item);
    }
    toggleSidebar();
  };

  const sidebarData: any[] = activeTab === 'diary' ? diaries : videos;
  const sidebarLabel = activeTab === 'diary' ? t('memory_diary_list') : t('memory_video_list');

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: themeBackground }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════
  return (
    <View style={[styles.root, { backgroundColor: themeBackground }]}>
      <Toast key={toastKey} visible={!!toastMsg} message={toastMsg} />

      {/* ── Top bar ── */}
      <View style={[styles.topBar, { backgroundColor: themeBackground }]}>
        <TouchableOpacity onPress={toggleSidebar} style={[styles.historyBtn, { backgroundColor: themeCardBg }]}>
          <MaterialIcons name="folder-open" size={20} color={colors.warmWood} />
          <Text style={[styles.historyBtnText, { color: themeTextColor }]}>{t('memory_history')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleNew} style={styles.newBtn}>
          <MaterialIcons name="add" size={20} color="#fff" />
          <Text style={styles.newBtnText}>{t('memory_new')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tabs ── */}
      <View style={styles.tabRow}>
        {([
          { key: 'diary' as TabKey, label: t('memory_diary_tab') },
          { key: 'video' as TabKey, label: t('memory_video_tab') },
        ]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, { backgroundColor: themeCardBg }, activeTab === tab.key && styles.tabActive]}
            onPress={() => switchTab(tab.key)}
          >
            <Text style={[styles.tabText, { color: themeTextColor }, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Main content area ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        {activeTab === 'diary' && renderDiary()}
        {activeTab === 'video' && renderVideoTab()}
      </KeyboardAvoidingView>

      {/* ── Sidebar overlay ── */}
      {sidebarOpen && (
        <Pressable style={styles.sidebarOverlay} onPress={toggleSidebar} />
      )}

      {/* ── Sidebar panel ── */}
      <Animated.View style={[styles.sidebar, { backgroundColor: themeCardBg, transform: [{ translateX: sidebarAnim }] }]}>
        <View style={styles.sidebarHeader}>
          <Text style={[styles.sidebarTitle, { color: themeTextColor }]}>{sidebarLabel}</Text>
          <TouchableOpacity onPress={toggleSidebar}>
            <MaterialIcons name="close" size={22} color={themeSecondaryText} />
          </TouchableOpacity>
        </View>

        {sidebarData.length === 0 ? (
          <View style={styles.sidebarEmpty}>
            <MaterialIcons name="inbox" size={36} color={themeSecondaryText} />
            <Text style={[styles.sidebarEmptyText, { color: themeSecondaryText }]}>{t('memory_no_record')}</Text>
          </View>
        ) : (
          <FlatList
            data={sidebarData}
            keyExtractor={(item: any) => item.id}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }: { item: any }) => {
              const isActive = activeTab === 'diary'
                ? currentDiary?.id === item.id
                : currentVideo?.id === item.id;
              return (
                <View style={[styles.sidebarItem, isActive && styles.sidebarItemActive]}>
                  {editingId === item.id ? (
                    <View style={styles.sidebarEditRow}>
                      <TextInput
                        style={[styles.sidebarEditInput, { color: themeTextColor }]}
                        value={editTitle}
                        onChangeText={setEditTitle}
                        onSubmitEditing={saveTitle}
                        onBlur={saveTitle}
                        autoFocus
                        maxLength={40}
                      />
                      <TouchableOpacity onPress={saveTitle}>
                        <MaterialIcons name="check" size={20} color={colors.primary} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.sidebarItemContent}
                      onPress={() => handleSidebarSelect(item)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.sidebarItemTitle, { color: themeTextColor }]} numberOfLines={1}>{item.title}</Text>
                        <Text style={[styles.sidebarItemDate, { color: themeSecondaryText }]}>
                          {new Date(item.created_at).toLocaleDateString('zh-CN')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => startEditTitle(item.id, item.title)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialIcons name="edit" size={16} color={themeSecondaryText} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        )}
      </Animated.View>
    </View>
  );

  // ═══════════════════════════════════════
  // Diary View
  // ═══════════════════════════════════════
  function renderDiary() {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.mainArea}>
          <View style={styles.detailHeader}>
            <Text style={[styles.detailTitle, { color: themeTextColor }]} numberOfLines={1}>
              {currentDiary?.title ?? t('memory_new_diary')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              {currentDiary && (
                <TouchableOpacity onPress={() => handleDeleteDiary(currentDiary.id!)}>
                  <MaterialIcons name="delete-outline" size={22} color={colors.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleSaveDiary}
                disabled={diarySaving}
                style={styles.saveIconBtn}
              >
                {diarySaving ? (
                  <ActivityIndicator size={18} color="#fff" />
                ) : (
                  <Ionicons name="checkmark" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <TextInput
            style={[styles.diaryInput, { color: themeTextColor, backgroundColor: themeCardBg }]}
            multiline
            placeholder={t('memory_diary_placeholder')}
            placeholderTextColor={themeSecondaryText}
            value={diaryContent}
            onChangeText={setDiaryContent}
            textAlignVertical="top"
          />

          {diaryImages.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.imageGallery}
              contentContainerStyle={{ gap: 10 }}
            >
              {diaryImages.map((uri, idx) => (
                <View key={idx} style={styles.imageCard}>
                  <Image source={{ uri }} style={styles.imageThumb} />
                  <TouchableOpacity
                    style={styles.imageRemoveBtn}
                    onPress={() => handleRemoveDiaryImage(idx)}
                  >
                    <MaterialIcons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.diaryToolbar}>
            <TouchableOpacity
              style={[styles.toolbarBtn, { backgroundColor: themeCardBg }]}
              onPress={handlePickDiaryImage}
              disabled={imageUploading}
            >
              {imageUploading ? (
                <ActivityIndicator size={16} color={colors.warmWood} />
              ) : (
                <MaterialIcons name="image" size={22} color={colors.warmWood} />
              )}
              <Text style={[styles.toolbarBtnText, { color: themeTextColor }]}>{t('memory_images')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  // ═══════════════════════════════════════
  // Video Tab
  // ═══════════════════════════════════════
  function renderVideoTab() {
    if (currentVideo) {
      return renderVideoDetail(currentVideo);
    }
    return (
      <View style={styles.mainArea}>
        <View style={styles.uploadArea}>
          <MaterialIcons name="videocam" size={48} color="#3b82f6" style={{ marginBottom: 12 }} />
          <Text style={[styles.uploadLabel, { color: themeTextColor }]}>{t('memory_pet_age')}</Text>
          <TextInput
            style={[styles.ageInput, { color: themeTextColor, backgroundColor: themeCardBg }]}
            placeholder={t('memory_pet_age_placeholder')}
            placeholderTextColor={themeSecondaryText}
            value={videoAge}
            onChangeText={setVideoAge}
            maxLength={20}
          />
          {videoUploading ? (
            <View style={styles.uploadBtn}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.uploadBtnText}>{t('memory_uploading')}</Text>
            </View>
          ) : (
            <TouchableOpacity style={styles.uploadBtn} onPress={pickVideo}>
              <MaterialIcons name="video-library" size={24} color="#fff" />
              <Text style={styles.uploadBtnText}>{t('memory_select_video')}</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.uploadHint, { color: themeSecondaryText }]}>{t('memory_video_format')}</Text>
        </View>
      </View>
    );
  }

  function renderVideoDetail(vid: MemoryVideo) {
    return (
      <ScrollView style={styles.mainArea} contentContainerStyle={styles.mediaDetail}>
        <View style={styles.mediaTypeTag}>
          <MaterialIcons name="videocam" size={14} color="#3b82f6" />
          <Text style={[styles.mediaTypeTagText, { color: '#3b82f6' }]}>{t('memory_label')}</Text>
        </View>
        <Text style={[styles.detailTitle, { color: themeTextColor }]}>{vid.title}</Text>
        <Text style={[styles.mediaAge, { color: themeSecondaryText }]}>{t('memory_pet_age_prefix')}{vid.pet_age}</Text>

        <View style={styles.videoContainer}>
          <VideoView
            player={videoPlayer}
            style={styles.videoPlayer}
            nativeControls
            contentFit="contain"
            allowsFullscreen
          />
        </View>

        <TouchableOpacity style={[styles.deleteMediaBtn, { backgroundColor: themeCardBg }]} onPress={() => handleDeleteVideo(vid)}>
          <MaterialIcons name="delete-outline" size={20} color={colors.primary} />
          <Text style={styles.deleteMediaText}>{t('memory_delete_this')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }
}

// ═══════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════
const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  toast: {
    position: 'absolute', top: 50, alignSelf: 'center', zIndex: 200,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(34,19,16,0.85)', paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 20,
  },
  toastText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(154,89,76,0.08)',
  },
  historyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10 },
  historyBtnText: { fontSize: 14, fontWeight: '600' },
  newBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.primary },
  newBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  tabRow: {
    flexDirection: 'row', paddingHorizontal: 32, paddingTop: 10, paddingBottom: 6, gap: 12,
  },
  tab: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(154,89,76,0.08)',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  mainArea: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  detailHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  detailTitle: { fontSize: 18, fontWeight: '700', flex: 1, marginRight: 8 },

  saveIconBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  diaryInput: {
    flex: 1, fontSize: 16, lineHeight: 26,
    borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(154,89,76,0.06)',
    textAlignVertical: 'top', minHeight: 120,
  },

  diaryToolbar: {
    flexDirection: 'row', paddingVertical: 8, gap: 12,
    borderTopWidth: 1, borderTopColor: 'rgba(154,89,76,0.08)', marginTop: 4,
  },
  toolbarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10,
  },
  toolbarBtnText: { fontSize: 13, fontWeight: '600' },

  imageGallery: { marginTop: 10, maxHeight: 110 },
  imageCard: { position: 'relative', borderRadius: 10, overflow: 'hidden' },
  imageThumb: { width: 100, height: 100, borderRadius: 10 },
  imageRemoveBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },

  uploadArea: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 40,
  },
  uploadLabel: { fontSize: 15, fontWeight: '600', marginBottom: 8, alignSelf: 'stretch', textAlign: 'center' },
  ageInput: {
    width: '80%', borderWidth: 1, borderColor: colors.slate200, borderRadius: 12,
    padding: 12, fontSize: 15,
    marginBottom: 20, textAlign: 'center',
  },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 16, paddingHorizontal: 32,
    backgroundColor: colors.primary, borderRadius: 14,
  },
  uploadBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  uploadHint: { fontSize: 12, marginTop: 12, textAlign: 'center' },

  mediaTypeTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    backgroundColor: 'rgba(59,130,246,0.06)', marginBottom: 8,
  },
  mediaTypeTagText: { fontSize: 12, fontWeight: '600', color: '#3b82f6' },

  mediaDetail: { paddingBottom: 40 },
  mediaAge: { fontSize: 14, fontWeight: '600', marginTop: 4, marginBottom: 20 },

  videoContainer: {
    borderRadius: 14, overflow: 'hidden', backgroundColor: '#000',
    aspectRatio: 16 / 9,
  },
  videoPlayer: { width: '100%', height: '100%' },

  deleteMediaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 24, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(236,55,19,0.15)',
  },
  deleteMediaText: { fontSize: 15, fontWeight: '700', color: colors.primary },

  sidebarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 90,
  },
  sidebar: {
    position: 'absolute', top: 0, bottom: 0, left: 0,
    width: SIDEBAR_W,
    zIndex: 100,
    borderRightWidth: 1, borderRightColor: 'rgba(154,89,76,0.1)',
    paddingTop: 12,
  },
  sidebarHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.6)',
  },
  sidebarTitle: { fontSize: 16, fontWeight: '700' },

  sidebarEmpty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  sidebarEmptyText: { fontSize: 14 },

  sidebarItem: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.4)',
  },
  sidebarItemActive: { backgroundColor: 'rgba(236,55,19,0.05)' },
  sidebarItemContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sidebarItemTitle: { fontSize: 14, fontWeight: '600' },
  sidebarItemDate: { fontSize: 11, marginTop: 2 },

  sidebarEditRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  sidebarEditInput: {
    flex: 1, borderWidth: 1, borderColor: colors.primary, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, fontSize: 14,
  },
});
