import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useSettings, Language, THEME_AUTO } from '../context/SettingsContext';
import { colors } from '../theme/colors';
import { useT } from '../i18n';

const THEME_OPTIONS: { labelKey: string; value: string }[] = [
  { labelKey: 'theme_label_auto', value: THEME_AUTO },
  { labelKey: 'theme_label_cream', value: '#f8f6f6' },
  { labelKey: 'theme_label_milk_tea', value: '#f3e9e7' },
  { labelKey: 'theme_label_cream_yellow', value: '#fef9c3' },
  { labelKey: 'theme_label_baby_pink', value: '#fce7f3' },
  { labelKey: 'theme_label_lavender', value: '#ddd6fe' },
  { labelKey: 'theme_label_dark', value: '#221310' },
];

const LANGUAGE_OPTIONS: { label: string; value: Language }[] = [
  { label: '中文', value: 'zh' },
  { label: 'English', value: 'en' },
];

const FONT_SIZE_OPTIONS: { labelKey: string; value: number }[] = [
  { labelKey: 'font_size_small', value: 0.85 },
  { labelKey: 'font_size_standard', value: 1.0 },
  { labelKey: 'font_size_large', value: 1.15 },
  { labelKey: 'font_size_xlarge', value: 1.3 },
];

export default function SettingsScreen({ navigation }: any) {
  const t = useT();
  const {
    themeBackground, themeBackgroundSetting, themeTextColor, themeSecondaryText, themeCardBg, isDark,
    language, fontSizeMultiplier,
    setThemeBackground, setLanguage, setFontSizeMultiplier,
  } = useSettings();

  const en = language === 'en';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(236,55,19,0.05)';
  const toggleInactiveBg = isDark ? 'rgba(255,255,255,0.06)' : colors.backgroundLight;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeBackground }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: themeCardBg, borderColor: cardBorder }]}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={22} color={themeTextColor} />
          </TouchableOpacity>
          <Text style={[styles.title, { fontSize: 20 * fontSizeMultiplier, color: themeTextColor }]}>
            {en ? 'Settings' : '设置'}
          </Text>
        </View>

        {/* Theme Background */}
        <View style={[styles.sectionCard, { backgroundColor: themeCardBg, borderColor: cardBorder }]}>
          <Text style={[styles.sectionTitle, { fontSize: 16 * fontSizeMultiplier, color: themeTextColor }]}>
            <MaterialIcons name="palette" size={18} color={colors.primary} />
            {'  '}{en ? 'Theme Background' : '主题背景'}
          </Text>
          <View style={styles.optionGrid}>
            {THEME_OPTIONS.map((opt) => {
              const isAuto = opt.value === THEME_AUTO;
              const selected = themeBackgroundSetting === opt.value;
              return (
                <View key={opt.value} style={styles.optionItem}>
                  <TouchableOpacity
                    style={[
                      styles.colorChip,
                      { backgroundColor: isAuto ? '#cbd5e1' : opt.value },
                      selected && styles.colorChipActive,
                    ]}
                    onPress={() => setThemeBackground(opt.value)}
                  >
                    {isAuto && (
                      <MaterialIcons name="brightness-auto" size={20} color={colors.slate700} />
                    )}
                    {!isAuto && selected && (
                      <MaterialIcons name="check" size={16} color={opt.value === '#221310' ? '#fff' : colors.primary} />
                    )}
                  </TouchableOpacity>
                  <Text
                    style={[styles.colorLabel, { fontSize: 11 * fontSizeMultiplier, color: themeSecondaryText }]}
                    numberOfLines={1}
                  >
                    {t(opt.labelKey)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Language */}
        <View style={[styles.sectionCard, { backgroundColor: themeCardBg, borderColor: cardBorder }]}>
          <Text style={[styles.sectionTitle, { fontSize: 16 * fontSizeMultiplier, color: themeTextColor }]}>
            <MaterialIcons name="language" size={18} color={colors.primary} />
            {'  '}{en ? 'Language' : '语言'}
          </Text>
          <View style={styles.toggleRow}>
            {LANGUAGE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.toggleBtn,
                  { backgroundColor: toggleInactiveBg, borderColor: cardBorder },
                  language === opt.value && styles.toggleBtnActive,
                ]}
                onPress={() => setLanguage(opt.value)}
              >
                <Text style={[
                  styles.toggleBtnText,
                  { fontSize: 14 * fontSizeMultiplier, color: themeSecondaryText },
                  language === opt.value && styles.toggleBtnTextActive,
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Font Size */}
        <View style={[styles.sectionCard, { backgroundColor: themeCardBg, borderColor: cardBorder }]}>
          <Text style={[styles.sectionTitle, { fontSize: 16 * fontSizeMultiplier, color: themeTextColor }]}>
            <MaterialIcons name="format-size" size={18} color={colors.primary} />
            {'  '}{en ? 'Font Size' : '字体大小'}
          </Text>
          <View style={styles.toggleRow}>
            {FONT_SIZE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.toggleBtn,
                  { backgroundColor: toggleInactiveBg, borderColor: cardBorder },
                  fontSizeMultiplier === opt.value && styles.toggleBtnActive,
                ]}
                onPress={() => setFontSizeMultiplier(opt.value)}
              >
                <Text style={[
                  styles.toggleBtnText,
                  { fontSize: 14 * opt.value, color: themeSecondaryText },
                  fontSizeMultiplier === opt.value && styles.toggleBtnTextActive,
                ]}>
                  {t(opt.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[
            styles.previewText,
            {
              fontSize: 14 * fontSizeMultiplier,
              color: themeSecondaryText,
              backgroundColor: toggleInactiveBg,
            },
          ]}>
            {t('settings_preview_text')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  backButton: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  title: { fontWeight: '800' },
  sectionCard: {
    borderRadius: 16, padding: 18, marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: { fontWeight: '700', marginBottom: 14 },
  optionGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center',
  },
  optionItem: {
    width: 64, alignItems: 'center',
  },
  colorChip: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  colorChipActive: {
    borderColor: colors.primary, borderWidth: 2.5,
  },
  colorLabel: { textAlign: 'center', marginTop: 6 },
  toggleRow: {
    flexDirection: 'row', gap: 10, flexWrap: 'wrap',
  },
  toggleBtn: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1,
  },
  toggleBtnActive: {
    backgroundColor: colors.primary, borderColor: colors.primary,
  },
  toggleBtnText: { fontWeight: '600' },
  toggleBtnTextActive: { color: '#fff' },
  previewText: {
    marginTop: 14, lineHeight: 22,
    borderRadius: 10, padding: 12,
  },
});
