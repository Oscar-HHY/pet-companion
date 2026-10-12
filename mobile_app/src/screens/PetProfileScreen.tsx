import React, { useState, useCallback, useEffect } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, RefreshControl, KeyboardAvoidingView, Platform, Modal, FlatList, Pressable,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import PetAvatar, { PetStatus, STATUS_CONFIG, ALL_STATUSES } from '../components/PetAvatar';
import {
  savePetProfile, getPetProfile, addPetActivity, getPetActivities, deletePetActivity,
  uploadPetPhoto, PetActivity,
} from '../services/PetDatabaseService';
import { supabase } from '../services/supabaseClient';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';
import { colors } from '../theme/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  startActivity, stopActivity,
  ActivityType, COMPANION_ACTIONS,
} from '../services/liveActivity';

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PetProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const targetUserId = (route.params as any)?.targetUserId as string | undefined;
  const { themeBackground, isDark, themeTextColor, themeSecondaryText, themeCardBg } = useSettings();
  const t = useT();

  // Activity config using i18n
  const ACTIVITY_ACTIONS = [
    { type: 'feed', label: t('pet_feed'), icon: 'restaurant', color: '#f59e0b' },
    { type: 'clean', label: t('pet_clean'), icon: 'cleaning-services', color: '#10b981' },
    { type: 'walk', label: t('pet_walk'), icon: 'directions-walk', color: '#3b82f6' },
    { type: 'bath', label: t('pet_bath'), icon: 'bathtub', color: '#8b5cf6' },
    { type: 'play', label: t('pet_play'), icon: 'toys', color: '#ec4899' },
  ] as const;

  const ACTIVITY_MAP: Record<string, { label: string; icon: string; color: string }> = {};
  for (const a of ACTIVITY_ACTIONS) {
    ACTIVITY_MAP[a.type] = { label: a.label, icon: a.icon, color: a.color };
  }

  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const profileUserId = targetUserId || currentUserId;
  const isOwnPet = !targetUserId || targetUserId === currentUserId;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id);
    });
  }, []);

  const handleGoBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else (navigation as any).navigate('Community');
  };

  const [petName, setPetName] = useState('');
  const [petBreed, setPetBreed] = useState('');
  const [petAge, setPetAge] = useState('');
  const [petBio, setPetBio] = useState('');
  const [originalPhoto, setOriginalPhoto] = useState<string | null>(null);
  const [pixelAvatarUrl, setPixelAvatarUrl] = useState<string | null>(null);
  const [localAvatarPath, setLocalAvatarPath] = useState<string | null>(null);
  const [petStatus, setPetStatus] = useState<PetStatus>('idle');
  const [isStatusModalVisible, setIsStatusModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftBreed, setDraftBreed] = useState('');
  const [draftAge, setDraftAge] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [activities, setActivities] = useState<PetActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState<string | null>(null);

  // ── 灵动陪伴舱状态 ──
  const [activeCompanionType, setActiveCompanionType] = useState<ActivityType | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [avatarMap, setAvatarMap] = useState<Record<string, string | null>>({});

  const loadProfile = useCallback(async () => {
    if (!profileUserId) return;
    try {
      const profile = await getPetProfile(profileUserId);
      if (profile) {
        setPetName(profile.name || '');
        setPetBreed(profile.breed || '');
        setPetAge(profile.age || '');
        setPetBio(profile.bio || '');
        setOriginalPhoto(profile.photo_url || null);
        setPixelAvatarUrl(profile.pixel_avatar_url || null);
        setPetStatus((profile.status as PetStatus) || 'idle');
      } else {
        setPetName(''); setPetBreed(''); setPetAge(''); setPetBio('');
        setOriginalPhoto(null); setPetStatus('idle');
      }
    } catch (e: any) {
      console.warn('[PetProfile]', e.message);
    }
  }, [profileUserId]);

  const loadActivities = useCallback(async () => {
    if (!profileUserId) return;
    try {
      const list = await getPetActivities(profileUserId);
      setActivities(list);
    } catch (e: any) {
      console.warn('[PetProfile]', e.message);
    }
  }, [profileUserId]);

  useEffect(() => { loadProfile(); loadActivities(); }, [loadProfile, loadActivities]);

  // 从 WidgetAssetGenerator 返回时刷新 profile + 像素图映射
  useFocusEffect(useCallback(() => {
    loadProfile();
    // 头像缓存按 userId 隔离，避免同设备切换账号时读到上一个账号的像素形象
    if (!currentUserId) { setAvatarMap({}); return; }
    AsyncStorage.getItem(`companion_avatar_map_${currentUserId}`)
      .then(raw => setAvatarMap(raw ? JSON.parse(raw) : {}))
      .catch(() => {});
  }, [loadProfile, currentUserId]));

  // pixel_avatar_url 是 OpenAI 临时 URL（1小时过期）
  // 拿到后立刻下载到本地缓存，保证 Live Activity 调用时不会因 URL 过期而失败
  useEffect(() => {
    if (!pixelAvatarUrl) { setLocalAvatarPath(null); return; }
    const localUri = (FileSystem.cacheDirectory ?? '') + 'companion_pixel_avatar.jpg';
    FileSystem.downloadAsync(pixelAvatarUrl, localUri)
      .then(({ uri }) => setLocalAvatarPath(uri))
      .catch(() => {
        console.warn('[PetProfile] 像素头像缓存失败，Live Activity 将使用 emoji');
        setLocalAvatarPath(null);
      });
  }, [pixelAvatarUrl]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(), loadActivities()]);
    setRefreshing(false);
  }, [loadProfile, loadActivities]);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permission_denied'), t('pet_album_permission'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      if (!currentUserId) return;
      setUploadingPhoto(true);
      try {
        const remoteUrl = await uploadPetPhoto(currentUserId, result.assets[0].uri);
        setOriginalPhoto(remoteUrl);
      } catch (e: any) {
        Alert.alert(t('pet_photo_upload_fail'), e.message);
      } finally {
        setUploadingPhoto(false);
      }
    }
  };

  const startEditing = () => {
    setDraftName(petName); setDraftBreed(petBreed); setDraftAge(petAge); setDraftBio(petBio);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!draftName.trim()) { Alert.alert(t('tip'), t('pet_name_required')); return; }
    const name = draftName.trim(), breed = draftBreed.trim(), age = draftAge.trim(), bio = draftBio.trim();
    setPetName(name); setPetBreed(breed); setPetAge(age); setPetBio(bio); setIsEditing(false);
    if (!currentUserId) return;
    try {
      await savePetProfile(currentUserId, { name, breed, age, bio, photo_url: originalPhoto, status: petStatus });
    } catch (e: any) {
      console.warn('[PetProfile]', e.message);
    }
  };

  const handleCancel = () => setIsEditing(false);

  const handleLogout = () => {
    Alert.alert(t('pet_logout'), t('pet_logout_confirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('pet_logout_btn'), style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  const handleSelectStatus = async (s: PetStatus) => {
    setPetStatus(s); setIsStatusModalVisible(false);
    if (currentUserId) {
      try {
        await supabase.from('pets').update({ status: s, updated_at: new Date().toISOString() }).eq('user_id', currentUserId);
      } catch (e: any) { console.warn('[PetProfile]', e.message); }
    }
  };

  const openStatusPicker = () => setIsStatusModalVisible(true);

  // ── 灵动陪伴舱：计时器 ──
  useEffect(() => {
    if (!activeCompanionType) { setElapsedSeconds(0); return; }
    const id = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [activeCompanionType]);

  const formatElapsed = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  const handleStartCompanion = async (type: ActivityType) => {
    // 优先：使用该活动类型专属的像素图（用户在形象管理页设置的）
    let avatar = avatarMap[type] || null;

    // 备选：通用像素图（本地缓存 / 即时下载）
    if (!avatar) avatar = localAvatarPath;
    if (!avatar && pixelAvatarUrl) {
      try {
        const localUri = (FileSystem.cacheDirectory ?? '') + 'companion_avatar_fallback.jpg';
        const res = await FileSystem.downloadAsync(pixelAvatarUrl, localUri);
        avatar = res.uri;
      } catch {}
    }

    const result = await startActivity(petName || t('companion_fallback_pet_name'), type, avatar);
    if (result.success) {
      setActiveCompanionType(type);
      setElapsedSeconds(0);
    } else {
      Alert.alert(t('companion_start_failed'), result.error ?? t('companion_unknown_error'));
    }
  };

  const handleStopCompanion = async () => {
    const finishedType = activeCompanionType;
    const finishedDuration = elapsedSeconds;
    await stopActivity(); // 静默处理，无论成功与否都清除本地状态
    setActiveCompanionType(null);
    setElapsedSeconds(0);
    // Record the session into pet_activities only if it ran for at least one second
    if (currentUserId && isOwnPet && finishedType && finishedDuration > 0) {
      try {
        await addPetActivity(currentUserId, finishedType, finishedDuration);
        await loadActivities();
      } catch (e: any) {
        console.warn('addCompanionActivity:', e.message);
      }
    }
  };

  const handleActivity = async (actionType: string) => {
    if (!currentUserId || !isOwnPet) return;
    setActivityLoading(actionType);
    try {
      await addPetActivity(currentUserId, actionType);
      await loadActivities();
    } catch (e: any) {
      Alert.alert(t('failed'), e.message);
    } finally { setActivityLoading(null); }
  };

  const handleDeleteActivity = (activity: PetActivity) => {
    if (!isOwnPet || activity.id == null) return;
    Alert.alert(
      t('pet_delete_activity_title'),
      t('pet_delete_activity_body'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'), style: 'destructive', onPress: async () => {
            try {
              await deletePetActivity(activity.id as number);
              setActivities(prev => prev.filter(a => a.id !== activity.id));
            } catch (e: any) {
              Alert.alert(t('failed'), e.message);
            }
          },
        },
      ],
    );
  };

  const hasProfile = !!petName;

  const statusModal = (
    <Modal visible={isStatusModalVisible} transparent animationType="slide" onRequestClose={() => setIsStatusModalVisible(false)}>
      <Pressable style={styles.modalOverlay} onPress={() => setIsStatusModalVisible(false)}>
        <Pressable style={[styles.modalSheet, { backgroundColor: themeCardBg }]}>
          <View style={styles.modalHandle} />
          <Text style={[styles.modalTitle, { color: themeTextColor }]}>{t('pet_select_status')}</Text>
          <FlatList
            data={ALL_STATUSES}
            keyExtractor={(item) => item}
            scrollEnabled={false}
            renderItem={({ item }) => {
              const cfg = STATUS_CONFIG[item];
              const isActive = item === petStatus;
              return (
                <TouchableOpacity
                  style={[styles.modalOption, isActive && styles.modalOptionActive]}
                  activeOpacity={0.7}
                  onPress={() => handleSelectStatus(item)}
                >
                  <View style={[styles.modalOptionIcon, { backgroundColor: cfg.color }]}>
                    <MaterialIcons name={cfg.icon as any} size={18} color="#fff" />
                  </View>
                  <Text style={[styles.modalOptionText, { color: themeTextColor }, isActive && styles.modalOptionTextActive]}>
                    {t(`status_${item}`)}
                  </Text>
                  {isActive && <MaterialIcons name="check-circle" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ─── Empty State ───
  if (!hasProfile && !isEditing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeBackground }]}>
        {statusModal}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.emptyContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {!isOwnPet && (
            <TouchableOpacity style={styles.backBarEmpty} onPress={handleGoBack} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={22} color={isDark ? '#f1f5f9' : colors.warmWood} />
              <Text style={[styles.backText, { color: isDark ? '#f1f5f9' : colors.warmWood }]}>{t('back')}</Text>
            </TouchableOpacity>
          )}
          <View style={styles.emptyIconCircle}>
            <MaterialIcons name="pets" size={56} color="rgba(236,55,19,0.3)" />
          </View>
          <Text style={[styles.emptyTitle, { color: themeTextColor }]}>
            {isOwnPet ? t('pet_no_profile_own') : t('pet_no_profile_other')}
          </Text>
          <Text style={[styles.emptyDesc, { color: themeSecondaryText }]}>
            {isOwnPet ? t('pet_no_profile_desc_own') : t('pet_no_profile_desc_other')}
          </Text>
          {isOwnPet && (
            <>
              <TouchableOpacity style={styles.createButton} activeOpacity={0.85} onPress={startEditing}>
                <MaterialIcons name="add-circle-outline" size={22} color="#fff" />
                <Text style={styles.createButtonText}>{t('pet_create_profile')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutButtonEmpty} activeOpacity={0.85} onPress={handleLogout}>
                <MaterialIcons name="logout" size={18} color={colors.primary} />
                <Text style={styles.logoutButtonText}>{t('pet_logout')}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Edit / Create Form ───
  if (isEditing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeBackground }]}>
        {statusModal}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={styles.formHeader}>
              <TouchableOpacity onPress={handleCancel}>
                <Text style={[styles.formCancel, { color: themeSecondaryText }]}>{t('cancel')}</Text>
              </TouchableOpacity>
              <Text style={[styles.formTitle, { color: themeTextColor }]}>
                {hasProfile ? t('pet_edit_profile') : t('pet_create_profile')}
              </Text>
              <TouchableOpacity onPress={handleSave}>
                <Text style={styles.formSave}>{t('save')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formPhotoSection}>
              <TouchableOpacity onPress={pickImage} activeOpacity={0.8} disabled={uploadingPhoto}>
                <PetAvatar imageUrl={originalPhoto} status={petStatus} size={120} onStatusPress={openStatusPicker} />
                {uploadingPhoto && (
                  <View style={[styles.photoOverlay, { width: 120, height: 120, borderRadius: 60 }]}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.uploadButton} onPress={pickImage} disabled={uploadingPhoto}>
                <MaterialIcons name="photo-camera" size={16} color={colors.primary} />
                <Text style={styles.uploadButtonText}>
                  {uploadingPhoto ? t('pet_uploading') : originalPhoto ? t('pet_change_photo') : t('pet_upload_photo')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.formCard, { backgroundColor: themeCardBg }]}>
              <Text style={[styles.fieldLabel, { color: themeSecondaryText }]}>{t('pet_name_label')}</Text>
              <TextInput style={[styles.fieldInput, { color: themeTextColor }]} placeholder={t('pet_name_placeholder')} placeholderTextColor={colors.slate400} value={draftName} onChangeText={setDraftName} />
              <Text style={[styles.fieldLabel, { color: themeSecondaryText }]}>{t('pet_breed_label')}</Text>
              <TextInput style={[styles.fieldInput, { color: themeTextColor }]} placeholder={t('pet_breed_placeholder')} placeholderTextColor={colors.slate400} value={draftBreed} onChangeText={setDraftBreed} />
              <Text style={[styles.fieldLabel, { color: themeSecondaryText }]}>{t('pet_age_label')}</Text>
              <TextInput style={[styles.fieldInput, { color: themeTextColor }]} placeholder={t('pet_age_placeholder')} placeholderTextColor={colors.slate400} value={draftAge} onChangeText={setDraftAge} />
              <Text style={[styles.fieldLabel, { color: themeSecondaryText }]}>{t('pet_bio_label')}</Text>
              <TextInput style={[styles.fieldInput, styles.fieldTextArea, { color: themeTextColor }]} placeholder={t('pet_bio_placeholder')} placeholderTextColor={colors.slate400} value={draftBio} onChangeText={setDraftBio} multiline numberOfLines={4} textAlignVertical="top" />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─── Profile View ───
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeBackground }]}>
    {isOwnPet && statusModal}
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {!isOwnPet && (
        <TouchableOpacity style={styles.backBar} onPress={handleGoBack} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={isDark ? '#f1f5f9' : colors.warmWood} />
          <Text style={[styles.backText, { color: isDark ? '#f1f5f9' : colors.warmWood }]}>{t('back')}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.hero}>
        {isOwnPet ? (
          <TouchableOpacity onPress={pickImage} activeOpacity={0.8} disabled={uploadingPhoto}>
            <PetAvatar imageUrl={originalPhoto} status={petStatus} size={140} onStatusPress={openStatusPicker} />
            {uploadingPhoto && (
              <View style={styles.photoOverlay}><ActivityIndicator color="#fff" /></View>
            )}
          </TouchableOpacity>
        ) : (
          <PetAvatar imageUrl={originalPhoto} status={petStatus} size={140} isVisitor />
        )}
        <Text style={[styles.petName, { color: themeTextColor }]}>{petName}</Text>
        {(petBreed || petAge) && (
          <Text style={styles.petBreed}>{[petBreed, petAge].filter(Boolean).join(' · ')}</Text>
        )}
        {isOwnPet && (
          <TouchableOpacity style={styles.editProfileButton} onPress={startEditing}>
            <MaterialIcons name="edit" size={14} color={colors.primary} />
            <Text style={styles.editProfileText}>{t('pet_edit_profile')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {isOwnPet && (
        <TouchableOpacity style={[styles.widgetEntry, { backgroundColor: themeCardBg }]} activeOpacity={0.85} onPress={() => (navigation as any).navigate('WidgetAssetGenerator')}>
          <View style={styles.widgetEntryIcon}>
            <MaterialIcons name="auto-awesome" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.widgetEntryTitle, { color: themeTextColor }]}>{t('pet_widget_title')}</Text>
            <Text style={[styles.widgetEntryDesc, { color: themeSecondaryText }]}>{t('pet_widget_desc')}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={themeSecondaryText} />
        </TouchableOpacity>
      )}

      {/* ── 灵动陪伴舱 ── */}
      {isOwnPet && (
        <View style={[styles.companionDock, { backgroundColor: themeCardBg }]}>
          <View style={styles.companionDockHeader}>
            <Text style={styles.companionDockPaw}>🐾</Text>
            <Text style={[styles.companionDockTitle, { color: themeTextColor }]}>{t('companion_dock_title')}</Text>
            {activeCompanionType && (
              <View style={styles.companionLiveBadge}>
                <View style={styles.companionLiveDot} />
                <Text style={styles.companionLiveText}>LIVE</Text>
              </View>
            )}
          </View>

          {activeCompanionType ? (
            /* 活动中：红框停止按钮 */
            <TouchableOpacity
              style={styles.companionStopBtn}
              onPress={handleStopCompanion}
              activeOpacity={0.82}
            >
              <Text style={styles.companionStopEmoji}>🛑</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.companionStopTitle}>{t('companion_stop_title')}</Text>
                <Text style={styles.companionStopSub}>
                  {COMPANION_ACTIONS.find(a => a.type === activeCompanionType)?.emoji}{' '}
                  {t('companion_doing_prefix')}{t(`companion_${activeCompanionType}`)}
                  {'  ·  '}
                  <Text style={styles.companionTimer}>{formatElapsed(elapsedSeconds)}</Text>
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            /* 待机：三个像素风格按钮 */
            <View style={styles.companionGrid}>
              {COMPANION_ACTIONS.map(action => (
                <TouchableOpacity
                  key={action.type}
                  style={[
                    styles.companionActionBtn,
                    {
                      backgroundColor: action.color + '14',
                      borderColor: action.color + '55',
                      shadowColor: action.color,
                    },
                  ]}
                  activeOpacity={0.75}
                  onPress={() => handleStartCompanion(action.type)}
                >
                  <Text style={styles.companionActionEmoji}>{action.emoji}</Text>
                  <Text style={[styles.companionActionLabel, { color: action.color }]}>{t(`companion_${action.type}`)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      <View style={[styles.infoCard, { backgroundColor: themeCardBg }]}>
        <Text style={[styles.sectionTitle, { color: themeTextColor }]}>{t('pet_basic_info')}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>STATUS</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: STATUS_CONFIG[petStatus].color }]} />
            <Text style={[styles.infoValue, { color: themeTextColor }]}>{t(`status_${petStatus}`)}</Text>
          </View>
        </View>
        {petBreed ? <View style={styles.infoRow}><Text style={styles.infoLabel}>{t('pet_breed_label')}</Text><Text style={[styles.infoValue, { color: themeTextColor }]}>{petBreed}</Text></View> : null}
        {petAge ? <View style={styles.infoRow}><Text style={styles.infoLabel}>{t('pet_age_label')}</Text><Text style={[styles.infoValue, { color: themeTextColor }]}>{petAge}</Text></View> : null}
        {petBio ? <><Text style={[styles.infoLabel, { marginTop: 8 }]}>{t('pet_bio_label')}</Text><Text style={[styles.infoValue, { lineHeight: 20, color: themeTextColor }]}>{petBio}</Text></> : null}
        {!petBreed && !petAge && !petBio && isOwnPet && (
          <TouchableOpacity style={styles.emptyModule} onPress={startEditing}>
            <MaterialIcons name="edit-note" size={20} color={themeSecondaryText} />
            <Text style={[styles.emptyModuleText, { color: themeSecondaryText }]}>{t('pet_edit_hint')}</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeTextColor }]}>
          {isOwnPet ? t('pet_daily_interaction') : t('pet_activity_log')}
        </Text>
        {isOwnPet && (
          <View style={styles.activityGrid}>
            {ACTIVITY_ACTIONS.map((action) => (
              <TouchableOpacity key={action.type} style={styles.activityBtn} activeOpacity={0.75} onPress={() => handleActivity(action.type)} disabled={activityLoading !== null}>
                <View style={[styles.activityIconCircle, { backgroundColor: action.color + '18' }]}>
                  {activityLoading === action.type ? <ActivityIndicator size="small" color={action.color} /> : <MaterialIcons name={action.icon as any} size={26} color={action.color} />}
                </View>
                <Text style={[styles.activityLabel, { color: themeSecondaryText }]}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {activities.length > 0 ? (
          <View style={[styles.timelineCard, { backgroundColor: themeCardBg }]}>
            <Text style={[styles.timelineTitle, { color: themeSecondaryText }]}>{t('pet_recent_log')}</Text>
            {activities.map((item, index) => {
              const cfg = ACTIVITY_MAP[item.action_type] || { label: item.action_type, icon: 'event', color: colors.slate400 };
              const durationLabel = item.duration_seconds && item.duration_seconds > 0
                ? `  ·  ${formatElapsed(item.duration_seconds)}`
                : '';
              return (
                <View key={item.id ?? index} style={styles.timelineRow}>
                  <View style={styles.timelineDotCol}>
                    <View style={[styles.timelineDot, { backgroundColor: cfg.color }]}>
                      <MaterialIcons name={cfg.icon as any} size={14} color="#fff" />
                    </View>
                    {index < activities.length - 1 && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={[styles.timelineAction, { color: themeTextColor }]}>
                      {cfg.label}{durationLabel}
                    </Text>
                    <Text style={styles.timelineTime}>{item.created_at ? formatTime(item.created_at) : ''}</Text>
                  </View>
                  {isOwnPet && (
                    <TouchableOpacity
                      onPress={() => handleDeleteActivity(item)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.timelineDeleteBtn}
                    >
                      <MaterialIcons name="delete-outline" size={20} color={colors.slate400} />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[styles.emptyActivityCard, { backgroundColor: themeCardBg }]}>
            <MaterialIcons name="history" size={24} color={colors.slate300} />
            <Text style={[styles.emptyActivityText, { color: themeSecondaryText }]}>
              {isOwnPet ? t('pet_no_activity_hint') : t('pet_no_activity')}
            </Text>
          </View>
        )}
      </View>

      {isOwnPet && (
        <>
          <TouchableOpacity style={[styles.logoutButton, { backgroundColor: themeCardBg }]} activeOpacity={0.85} onPress={handleLogout}>
            <MaterialIcons name="logout" size={20} color={colors.primary} />
            <Text style={styles.logoutButtonText}>{t('pet_logout')}</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.backgroundLight },
  backBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  backBarEmpty: { flexDirection: 'row', alignItems: 'center', gap: 4, position: 'absolute', top: 8, left: 16, zIndex: 1 },
  backText: { fontSize: 15, fontWeight: '600', color: colors.warmWood },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyIconCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(236,55,19,0.06)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.slate900, textAlign: 'center' },
  emptyDesc: { fontSize: 14, color: colors.slate500, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  createButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, height: 52, paddingHorizontal: 32, borderRadius: 14, backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 },
  createButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  logoutButtonEmpty: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 40, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  formCancel: { fontSize: 15, color: colors.slate500 },
  formTitle: { fontSize: 17, fontWeight: '700', color: colors.slate900 },
  formSave: { fontSize: 15, fontWeight: '700', color: colors.primary },
  formPhotoSection: { alignItems: 'center', marginBottom: 20 },
  formCard: { marginHorizontal: 20, backgroundColor: colors.white, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(236,55,19,0.05)' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.slate700, marginBottom: 6, marginTop: 14 },
  fieldInput: { height: 48, backgroundColor: 'rgba(128,128,128,0.06)', borderWidth: 1, borderColor: 'rgba(236,55,19,0.1)', borderRadius: 12, paddingHorizontal: 14, fontSize: 14, color: colors.slate900 },
  fieldTextArea: { height: 100, paddingTop: 12 },
  hero: { alignItems: 'center', paddingVertical: 28 },
  uploadButton: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.primaryLight },
  uploadButtonText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  photoOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 70, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  petName: { fontSize: 28, fontWeight: '800', color: colors.slate900, marginTop: 12 },
  petBreed: { fontSize: 14, fontWeight: '500', color: colors.primary, marginTop: 2 },
  editProfileButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.primaryLight },
  editProfileText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  widgetEntry: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginBottom: 20, padding: 16, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(236,55,19,0.08)' },
  widgetEntryIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  widgetEntryTitle: { fontSize: 14, fontWeight: '700', color: colors.slate900 },
  widgetEntryDesc: { fontSize: 11, color: colors.slate500, marginTop: 2 },
  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.slate900, marginBottom: 12 },
  infoCard: { marginHorizontal: 20, marginBottom: 16, backgroundColor: colors.white, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(236,55,19,0.05)' },
  infoRow: { marginBottom: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  infoLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1, color: colors.slate400, textTransform: 'uppercase' },
  infoValue: { fontSize: 14, fontWeight: '500', color: colors.slate900, marginTop: 2 },
  emptyModule: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  emptyModuleText: { fontSize: 13, color: colors.slate400 },
  activityGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  activityBtn: { alignItems: 'center', flex: 1 },
  activityIconCircle: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  activityLabel: { fontSize: 12, fontWeight: '600', color: colors.slate700 },
  timelineCard: { backgroundColor: colors.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(236,55,19,0.05)' },
  timelineTitle: { fontSize: 14, fontWeight: '700', color: colors.slate700, marginBottom: 12 },
  timelineRow: { flexDirection: 'row', minHeight: 48 },
  timelineDotCol: { alignItems: 'center', width: 32, marginRight: 10 },
  timelineDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.slate200, marginVertical: 4 },
  timelineContent: { flex: 1, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.4)' },
  timelineAction: { fontSize: 14, fontWeight: '600', color: colors.slate900 },
  timelineTime: { fontSize: 12, color: colors.slate400, marginTop: 2 },
  timelineDeleteBtn: { paddingHorizontal: 6, paddingTop: 4, alignSelf: 'flex-start' },
  emptyActivityCard: { alignItems: 'center', paddingVertical: 24, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(236,55,19,0.05)', gap: 8 },
  emptyActivityText: { fontSize: 13, color: colors.slate400 },
  shareButton: { marginHorizontal: 20, height: 52, backgroundColor: colors.primary, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  shareButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  logoutButton: { marginHorizontal: 20, height: 52, backgroundColor: colors.white, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, borderWidth: 1, borderColor: 'rgba(236,55,19,0.15)' },
  logoutButtonText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24, paddingTop: 12 },
  modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.slate200, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.slate900, marginBottom: 16 },
  modalOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(226,232,240,0.5)' },
  modalOptionActive: { backgroundColor: 'rgba(236,55,19,0.04)', borderRadius: 12, marginHorizontal: -4, paddingHorizontal: 8 },
  modalOptionIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  modalOptionText: { fontSize: 15, fontWeight: '500', color: colors.slate900, flex: 1 },
  modalOptionTextActive: { fontWeight: '700', color: colors.primary },

  // ── 灵动陪伴舱 ──────────────────────────────────────────────
  companionDock: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(236,55,19,0.08)',
  },
  companionDockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  companionDockPaw: { fontSize: 18 },
  companionDockTitle: {
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  companionLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239,68,68,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  companionLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  companionLiveText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ef4444',
    letterSpacing: 0.5,
  },
  // 三个待机按钮（像素风：sharp shadow + 粗边框）
  companionGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  companionActionBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 2,
    shadowOffset: { width: 3, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 0,   // 0 blur → 硬边阴影，像素感
    elevation: 4,
  },
  companionActionEmoji: { fontSize: 30, marginBottom: 5 },
  companionActionLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  // 停止按钮
  companionStopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(239,68,68,0.07)',
    borderWidth: 2,
    borderColor: '#ef4444',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#ef4444',
    shadowOffset: { width: 3, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 0,
    elevation: 4,
  },
  companionStopEmoji: { fontSize: 30 },
  companionStopTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ef4444',
    marginBottom: 3,
  },
  companionStopSub: {
    fontSize: 13,
    color: '#ef4444',
    opacity: 0.75,
  },
  companionTimer: {
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    opacity: 1,
  },
});
