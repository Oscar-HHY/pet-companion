import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PetAvatar from '../components/PetAvatar';
import { generatePixelPet } from '../services/SeedreamAPI';
import { getPetProfile, updatePixelAvatarUrl } from '../services/PetDatabaseService';
import { supabase } from '../services/supabaseClient';
import { colors } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';
import type { ActivityType } from '../services/liveActivity';

// ── 常量 ──────────────────────────────────────────────────
const AVATAR_STORAGE_KEY = 'companion_avatar_map';
const AVATAR_DIR = 'companion_avatars/';

const ACTIVITY_SLOTS: Array<{
  type: ActivityType; label: string; emoji: string; color: string;
}> = [
  { type: 'walk', label: '散步', emoji: '🦮', color: '#4CAF50' },
  { type: 'bath', label: '洗澡', emoji: '🛁', color: '#2196F3' },
  { type: 'play', label: '陪玩', emoji: '🎾', color: '#FF9800' },
];

type AvatarMap = Record<string, string | null>;

// ── 工具函数 ──────────────────────────────────────────────
// 头像缓存按 userId 隔离：AsyncStorage key 和本地文件目录都带上 userId，
// 否则同一台设备上切换账号时会读到上一个账号缓存的像素形象（数据串号）。
function avatarStorageKey(userId: string): string {
  return `${AVATAR_STORAGE_KEY}_${userId}`;
}

async function getAvatarDir(userId: string): Promise<string> {
  const dir = (FileSystem.documentDirectory ?? '') + AVATAR_DIR + userId + '/';
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

async function loadAvatarMap(userId: string): Promise<AvatarMap> {
  try {
    const raw = await AsyncStorage.getItem(avatarStorageKey(userId));
    if (!raw) return {};
    const map: AvatarMap = JSON.parse(raw);
    // 验证文件是否仍存在
    for (const key of Object.keys(map)) {
      if (map[key]) {
        const info = await FileSystem.getInfoAsync(map[key]!);
        if (!info.exists) map[key] = null;
      }
    }
    return map;
  } catch { return {}; }
}

async function saveAvatarMap(userId: string, map: AvatarMap): Promise<void> {
  await AsyncStorage.setItem(avatarStorageKey(userId), JSON.stringify(map));
}

// ============================================================
// WidgetAssetGeneratorScreen
// ============================================================

export default function WidgetAssetGeneratorScreen({ navigation }: any) {
  const { themeBackground, themeTextColor, themeSecondaryText, themeCardBg, isDark } = useSettings();
  const t = useT();

  const [userId, setUserId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<ActivityType>('walk');
  const [avatarMap, setAvatarMap] = useState<AvatarMap>({});
  const [sourcePhoto, setSourcePhoto] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // 当前选中类型的像素图
  const currentAvatar = avatarMap[selectedType] ?? null;

  // ── 初始化 ──
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const map = await loadAvatarMap(user.id);
      setAvatarMap(map);
    })();
  }, []);

  // ── 选择照片 ──
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('permission_denied'), t('widget_permission_album'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setSourcePhoto(result.assets[0].uri);
    }
  };

  // ── AI 生成 + 保存到对应活动类型 ──
  const handleGenerate = async () => {
    if (!sourcePhoto || !userId) return;
    setGenerating(true);
    try {
      const result = await generatePixelPet(sourcePhoto);

      // 下载到永久本地存储（documentDirectory，不会被系统清理；按 userId 隔离目录）
      const dir = await getAvatarDir(userId);
      const localPath = dir + `${selectedType}.jpg`;
      await FileSystem.downloadAsync(result.imageUrl, localPath);

      // 更新映射
      const newMap = { ...avatarMap, [selectedType]: localPath };
      setAvatarMap(newMap);
      await saveAvatarMap(userId, newMap);

      // 同时更新 Supabase（兼容旧逻辑）
      await updatePixelAvatarUrl(userId, result.imageUrl).catch(() => {});

      Alert.alert(
        t('widget_manager_generate_success'),
        t('widget_manager_generate_body').replace('{label}', t(`companion_${selectedType}`)),
      );
    } catch (e: any) {
      Alert.alert(t('widget_generate_fail'), e.message || t('widget_retry'));
    } finally {
      setGenerating(false);
    }
  };

  // ── 下载到相册 ──
  const handleDownload = async () => {
    if (!currentAvatar) return;
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('permission_denied'), t('widget_permission_save'));
        return;
      }
      await MediaLibrary.saveToLibraryAsync(currentAvatar);
      Alert.alert(t('widget_save_success'), t('widget_save_success_msg'));
    } catch (e: any) {
      Alert.alert(t('widget_save_fail'), e.message || t('widget_retry'));
    } finally {
      setSaving(false);
    }
  };

  // ── 删除当前类型头像 ──
  const handleRemove = async () => {
    if (!currentAvatar) return;
    Alert.alert(t('widget_manager_remove_title'), t('widget_manager_remove_body').replace('{label}', t(`companion_${selectedType}`)), [
      { text: t('widget_manager_cancel'), style: 'cancel' },
      {
        text: t('widget_manager_action_remove'), style: 'destructive', onPress: async () => {
          if (!userId) return;
          try { await FileSystem.deleteAsync(currentAvatar, { idempotent: true }); } catch {}
          const newMap = { ...avatarMap, [selectedType]: null };
          setAvatarMap(newMap);
          await saveAvatarMap(userId, newMap);
        },
      },
    ]);
  };

  // ── 已设置的数量 ──
  const configuredCount = ACTIVITY_SLOTS.filter(s => avatarMap[s.type]).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeBackground }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={22} color={themeTextColor} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: themeTextColor }]}>{t('widget_manager_title')}</Text>
        </View>
        <Text style={[styles.subtitle, { color: themeSecondaryText }]}>
          {t('widget_manager_subtitle')}
        </Text>

        {/* ── 活动类型选择器（三个卡片） ── */}
        <View style={styles.slotRow}>
          {ACTIVITY_SLOTS.map(slot => {
            const isSelected = slot.type === selectedType;
            const hasAvatar = !!avatarMap[slot.type];
            return (
              <TouchableOpacity
                key={slot.type}
                style={[
                  styles.slotCard,
                  { backgroundColor: themeCardBg, borderColor: isSelected ? slot.color : 'transparent' },
                ]}
                activeOpacity={0.8}
                onPress={() => setSelectedType(slot.type)}
              >
                {hasAvatar ? (
                  <Image source={{ uri: avatarMap[slot.type]! }} style={styles.slotThumb} />
                ) : (
                  <View style={[styles.slotEmpty, { backgroundColor: slot.color + '18' }]}>
                    <Text style={{ fontSize: 22 }}>{slot.emoji}</Text>
                  </View>
                )}
                <Text style={[
                  styles.slotLabel,
                  { color: isSelected ? slot.color : themeSecondaryText, fontWeight: isSelected ? '800' : '600' },
                ]}>
                  {t(`companion_${slot.type}`)}
                </Text>
                {hasAvatar && (
                  <View style={[styles.slotBadge, { backgroundColor: slot.color }]}>
                    <MaterialIcons name="check" size={10} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* 进度指示 */}
        <Text style={[styles.progressText, { color: themeSecondaryText }]}>
          {t('widget_manager_progress').replace('{n}', String(configuredCount))}
        </Text>

        {/* ── 预览区 ── */}
        <View style={[styles.previewCard, { backgroundColor: themeCardBg }]}>
          <Text style={[styles.previewLabel, { color: themeSecondaryText }]}>
            {ACTIVITY_SLOTS.find(s => s.type === selectedType)?.emoji}{' '}
            {t('widget_manager_preview_label').replace('{label}', t(`companion_${selectedType}`))}
          </Text>
          <View style={styles.previewCircle}>
            {generating ? (
              <View style={styles.placeholder}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.placeholderTitle, { color: themeTextColor }]}>{t('widget_generating')}</Text>
                <Text style={[styles.placeholderDesc, { color: themeSecondaryText }]}>{t('widget_generating_desc')}</Text>
              </View>
            ) : currentAvatar ? (
              <PetAvatar imageUrl={currentAvatar} status="happy" size={180} />
            ) : (
              <View style={styles.placeholder}>
                <MaterialIcons name="auto-awesome" size={48} color="rgba(236,55,19,0.25)" />
                <Text style={[styles.placeholderTitle, { color: themeTextColor }]}>{t('widget_manager_no_avatar_title')}</Text>
                <Text style={[styles.placeholderDesc, { color: themeSecondaryText }]}>{t('widget_manager_no_avatar_desc')}</Text>
              </View>
            )}
          </View>
        </View>

        {/* 原图缩略 */}
        {sourcePhoto && (
          <View style={[styles.sourcePreview, { backgroundColor: themeCardBg }]}>
            <Image source={{ uri: sourcePhoto }} style={styles.sourceThumbnail} />
            <View>
              <View style={styles.sourceRow}>
                <MaterialIcons name="check-circle" size={16} color={colors.green600} />
                <Text style={styles.sourceText}>{t('widget_source_ready')}</Text>
              </View>
              <TouchableOpacity onPress={pickImage}>
                <Text style={styles.sourceChange}>{t('widget_source_change')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── 操作按钮 ── */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.uploadButton} activeOpacity={0.85} onPress={pickImage} disabled={generating}>
            <MaterialIcons name="photo-library" size={20} color={colors.primary} />
            <Text style={styles.uploadButtonText}>{sourcePhoto ? t('widget_reupload') : t('widget_upload')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.generateButton, (!sourcePhoto || generating) && styles.disabledButton]}
            activeOpacity={0.85}
            onPress={handleGenerate}
            disabled={!sourcePhoto || generating}
          >
            <MaterialIcons name="auto-awesome" size={20} color="#fff" />
            <Text style={styles.generateButtonText}>
              {generating ? t('widget_generating_btn') : currentAvatar ? t('widget_manager_regenerate_btn') : t('widget_generate')}
            </Text>
          </TouchableOpacity>

          {currentAvatar && !generating && (
            <>
              <TouchableOpacity
                style={[styles.downloadButton, saving && styles.disabledButton]}
                activeOpacity={0.85} onPress={handleDownload} disabled={saving}
              >
                <MaterialIcons name="save-alt" size={20} color={colors.green600} />
                <Text style={styles.downloadButtonText}>{saving ? t('widget_saving') : t('widget_download')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.removeButton} activeOpacity={0.85} onPress={handleRemove}>
                <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
                <Text style={styles.removeButtonText}>{t('widget_manager_remove_btn')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Tips */}
        <View style={[styles.tipsCard, { backgroundColor: themeCardBg }]}>
          <Text style={[styles.tipsTitle, { color: themeTextColor }]}>{t('widget_tips_title')}</Text>
          {[
            t('widget_tip1'),
            t('widget_manager_tip_modes'),
            t('widget_manager_tip_dynamic_island'),
          ].map((tip, i) => (
            <View key={i} style={styles.tipRow}>
              <MaterialIcons name="lightbulb" size={14} color={colors.primary} />
              <Text style={[styles.tipText, { color: themeSecondaryText }]}>{tip}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  backButton: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(236,55,19,0.08)',
  },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 13, lineHeight: 20, marginBottom: 20 },

  // ── 活动类型卡片 ──
  slotRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  slotCard: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14,
    borderWidth: 2.5, position: 'relative',
  },
  slotThumb: { width: 48, height: 48, borderRadius: 12, marginBottom: 6 },
  slotEmpty: { width: 48, height: 48, borderRadius: 12, marginBottom: 6, alignItems: 'center', justifyContent: 'center' },
  slotLabel: { fontSize: 12, fontWeight: '600' },
  slotBadge: {
    position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  progressText: { fontSize: 11, textAlign: 'center', marginBottom: 16 },

  // ── 预览区 ──
  previewCard: {
    width: '100%', alignItems: 'center', borderRadius: 20,
    paddingVertical: 28, paddingHorizontal: 20, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(236,55,19,0.08)',
  },
  previewLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 20 },
  previewCircle: { alignItems: 'center', justifyContent: 'center' },
  placeholder: {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(236,55,19,0.04)', borderWidth: 2,
    borderColor: 'rgba(236,55,19,0.12)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  placeholderTitle: { fontSize: 15, fontWeight: '700', marginTop: 8 },
  placeholderDesc: { fontSize: 11, marginTop: 4 },

  // ── 原图 ──
  sourcePreview: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16,
    borderRadius: 12, padding: 10, borderWidth: 1, borderColor: 'rgba(236,55,19,0.08)',
  },
  sourceThumbnail: { width: 48, height: 48, borderRadius: 10 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sourceText: { fontSize: 13, fontWeight: '500', color: colors.green600 },
  sourceChange: { fontSize: 11, color: colors.primary, fontWeight: '600', marginTop: 2 },

  // ── 按钮 ──
  actions: { gap: 12, marginBottom: 28 },
  uploadButton: {
    height: 52, borderRadius: 14, backgroundColor: colors.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: 'rgba(236,55,19,0.2)',
  },
  uploadButtonText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  generateButton: {
    height: 52, borderRadius: 14, backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  disabledButton: { opacity: 0.5 },
  generateButtonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  downloadButton: {
    height: 52, borderRadius: 14, backgroundColor: colors.white,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: 'rgba(22,163,74,0.3)',
  },
  downloadButtonText: { fontSize: 15, fontWeight: '700', color: colors.green600 },
  removeButton: {
    height: 44, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  removeButtonText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },

  // ── Tips ──
  tipsCard: {
    borderRadius: 14, padding: 18, borderWidth: 1, borderColor: 'rgba(236,55,19,0.05)',
  },
  tipsTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  tipText: { fontSize: 12, flex: 1, lineHeight: 18 },
});
