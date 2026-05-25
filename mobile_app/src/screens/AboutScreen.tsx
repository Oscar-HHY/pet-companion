import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useSettings } from '../context/SettingsContext';
import { colors } from '../theme/colors';

export const PRIVACY_POLICY_URL = 'https://oscar-hhy.github.io/pet-companion-privacy/';
export const EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

async function openExternal(url: string, label: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error(label);
    await Linking.openURL(url);
  } catch {
    Alert.alert('', `${label}: ${url}`);
  }
}

export default function AboutScreen({ navigation }: any) {
  const { themeBackground, themeTextColor, themeSecondaryText, themeCardBg, isDark, fontSizeMultiplier, language } = useSettings();
  const t = language === 'en';

  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(236,55,19,0.08)';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeBackground }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: themeCardBg, borderColor: cardBorder }]}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={22} color={themeTextColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: 20 * fontSizeMultiplier, color: themeTextColor }]}>
          {t ? 'About' : '关于'}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.centerContent}>
        <View style={styles.iconCircle}>
          <MaterialIcons name="pets" size={56} color={colors.primary} />
        </View>

        <Text style={[styles.appName, { fontSize: 26 * fontSizeMultiplier, color: themeTextColor }]}>
          {t ? 'Pet Companion' : '宠物伴侣'}
        </Text>

        <View style={styles.versionBadge}>
          <Text style={[styles.versionText, { fontSize: 14 * fontSizeMultiplier }]}>v1.0.0</Text>
        </View>

        <View style={[styles.sloganCard, { backgroundColor: themeCardBg, borderColor: cardBorder }]}>
          <Text style={[styles.slogan, { fontSize: 20 * fontSizeMultiplier }]}>
            {t ? 'Guard with heart 💌, Connect with love 💞' : '用心守护💌，用爱连接💞'}
          </Text>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <MaterialIcons name="favorite" size={18} color={colors.primary} />
            <Text style={[styles.infoText, { fontSize: 13 * fontSizeMultiplier, color: themeSecondaryText }]}>
              {t ? 'Made with love for every furry friend' : '为每一个毛孩子倾心打造'}
            </Text>
          </View>
        </View>

        {/* Legal links (Apple compliance) */}
        <View style={styles.legalSection}>
          <TouchableOpacity
            style={[styles.legalRow, { backgroundColor: themeCardBg, borderColor: cardBorder }]}
            onPress={() => openExternal(PRIVACY_POLICY_URL, t ? 'Privacy Policy' : '隐私政策')}
            activeOpacity={0.7}
          >
            <MaterialIcons name="privacy-tip" size={18} color={themeSecondaryText} />
            <Text style={[styles.legalText, { fontSize: 14 * fontSizeMultiplier, color: themeTextColor }]}>
              {t ? 'Privacy Policy' : '隐私政策'}
            </Text>
            <MaterialIcons name="open-in-new" size={14} color={themeSecondaryText} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.legalRow, { backgroundColor: themeCardBg, borderColor: cardBorder }]}
            onPress={() => openExternal(EULA_URL, t ? 'Terms of Use (EULA)' : '使用条款 (EULA)')}
            activeOpacity={0.7}
          >
            <MaterialIcons name="description" size={18} color={themeSecondaryText} />
            <Text style={[styles.legalText, { fontSize: 14 * fontSizeMultiplier, color: themeTextColor }]}>
              {t ? 'Terms of Use (EULA)' : '使用条款 (EULA)'}
            </Text>
            <MaterialIcons name="open-in-new" size={14} color={themeSecondaryText} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16,
  },
  backButton: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(236,55,19,0.08)',
  },
  headerTitle: { fontWeight: '800', color: colors.slate900 },
  centerContent: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80,
  },
  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(236,55,19,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  appName: {
    fontWeight: '800', color: colors.slate900, marginBottom: 12,
  },
  versionBadge: {
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20,
    backgroundColor: colors.primaryLight, marginBottom: 32,
  },
  versionText: { fontWeight: '700', color: colors.primary },
  sloganCard: {
    backgroundColor: colors.white, borderRadius: 16, paddingVertical: 24, paddingHorizontal: 28,
    borderWidth: 1, borderColor: 'rgba(236,55,19,0.08)',
    marginBottom: 32, alignItems: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  slogan: {
    fontWeight: '700', color: colors.warmWood, textAlign: 'center', lineHeight: 32,
  },
  infoSection: { gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoText: { color: colors.slate500 },
  legalSection: { marginTop: 28, width: '100%', gap: 4 },
  legalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: colors.white, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(236,55,19,0.08)',
  },
  legalText: { flex: 1, color: colors.slate900, fontWeight: '600' },
});
