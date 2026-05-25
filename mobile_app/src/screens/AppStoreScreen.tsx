import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';

const STATS = [
  { top: '4.8', topIcon: 'star' as const, bottom: '2.1K Ratings' },
  { top: '12+', bottom: 'Age' },
  { top: '#3', bottom: 'Lifestyle' },
  { top: '86 MB', bottom: 'Size' },
];

const FEATURES = [
  { icon: 'auto-awesome' as const, bg: colors.primaryLight, color: colors.primary, title: 'AI-Powered Pet Creation', desc: 'Upload any pet photo and transform it into a living 2D animated companion' },
  { icon: 'desktop-windows' as const, bg: colors.blue100, color: colors.blue600, title: 'Desktop & Dynamic Island', desc: "Your pet roams freely on your desktop or iPhone's Dynamic Island" },
  { icon: 'castle' as const, bg: colors.purple100, color: colors.purple600, title: 'Memory Palace', desc: 'Build a beautiful collection of memories and milestones with your pet' },
  { icon: 'groups' as const, bg: colors.green100, color: colors.green600, title: 'Pet Community', desc: 'Connect with other pet lovers, share stories and join fun events' },
];

const WHATS_NEW = [
  'Initial release with desktop pet companion',
  'Upload photos to create your virtual pet',
  '5 animated actions: idle, sleep, eat, walk & play',
  'Memory Palace to save precious moments',
];

const INFO_ROWS = [
  { label: 'Provider', value: 'Pet Companionship Studio' },
  { label: 'Size', value: '86 MB' },
  { label: 'Category', value: 'Lifestyle', highlight: true },
  { label: 'Compatibility', value: 'iOS 16.0+, macOS 13.0+, Windows 10+' },
  { label: 'Languages', value: 'English, Chinese (Simplified)' },
  { label: 'Age Rating', value: '12+' },
  { label: 'Price', value: 'Free' },
];

const REVIEWS = [
  { name: 'PetLover2024', stars: 5, date: 'Mar 10, 2026', text: "Love watching my little pixel pet walk around on my desktop! The idle and sleeping animations are so cute. Can't wait for more actions!" },
  { name: 'DogMom_Luna', stars: 4, date: 'Mar 5, 2026', text: 'The memory palace feature is genius! I uploaded all my photos with Luna and now I have a beautiful timeline. Would love Dynamic Island support soon!' },
];

const RATING_BARS = [72, 20, 5, 2, 1];

export default function AppStoreScreen() {
  const { themeBackground, themeTextColor, themeSecondaryText, themeCardBg, isDark } = useSettings();
  const t = useT();

  return (
    <ScrollView style={[{ flex: 1 }, { backgroundColor: themeBackground }]} contentContainerStyle={styles.contentContainer}>
      {/* App Header */}
      <View style={styles.appHeader}>
        <View style={styles.appIcon}>
          <MaterialIcons name="pets" size={44} color="#fff" />
        </View>
        <View style={styles.appInfo}>
          <Text style={[styles.appName, { color: themeTextColor }]}>Pet Companionship</Text>
          <Text style={[styles.appDev, { color: themeSecondaryText }]}>Virtual Pet Studio</Text>
          <View style={styles.appActions}>
            <TouchableOpacity style={styles.getButton}>
              <Text style={styles.getButtonText}>GET</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareCircle}>
              <MaterialIcons name="share" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        {STATS.map((stat, i) => (
          <React.Fragment key={i}>
            {i > 0 && <View style={styles.statsDivider} />}
            <View style={styles.statItem}>
              <View style={styles.statTopRow}>
                <Text style={[styles.statValue, { color: themeTextColor }]}>{stat.top}</Text>
                {stat.topIcon && <MaterialIcons name={stat.topIcon} size={14} color={colors.primary} />}
              </View>
              <Text style={[styles.statLabel, { color: themeSecondaryText }]}>{stat.bottom}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Description */}
      <View style={styles.sectionPadded}>
        <Text style={[styles.descText, { color: themeSecondaryText }]}>
          Pet Companionship brings your beloved pet to life as an adorable 2D animated companion that lives right on your device. Upload a photo of your pet and watch it come alive with charming animations.
        </Text>
        <TouchableOpacity><Text style={styles.moreLink}>more</Text></TouchableOpacity>
      </View>

      {/* What's New */}
      <View style={styles.sectionBorder}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: themeTextColor }]}>What's New</Text>
          <TouchableOpacity><Text style={styles.linkText}>Version History</Text></TouchableOpacity>
        </View>
        <Text style={[styles.versionText, { color: themeSecondaryText }]}>Version 1.0.0 • 1 week ago</Text>
        {WHATS_NEW.map((item, i) => (
          <View key={i} style={styles.bulletRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={[styles.bulletText, { color: themeSecondaryText }]}>{item}</Text>
          </View>
        ))}
      </View>

      {/* Features */}
      <View style={styles.sectionBorder}>
        <Text style={[styles.sectionTitle, { color: themeTextColor }]}>Features</Text>
        {FEATURES.map((feat, i) => (
          <View key={i} style={styles.featureRow}>
            <View style={[styles.featureIcon, { backgroundColor: feat.bg }]}>
              <MaterialIcons name={feat.icon} size={22} color={feat.color} />
            </View>
            <View style={styles.featureText}>
              <Text style={[styles.featureTitle, { color: themeTextColor }]}>{feat.title}</Text>
              <Text style={[styles.featureDesc, { color: themeSecondaryText }]}>{feat.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Ratings */}
      <View style={styles.sectionBorder}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: themeTextColor }]}>Ratings & Reviews</Text>
          <TouchableOpacity><Text style={styles.linkText}>See All</Text></TouchableOpacity>
        </View>
        <View style={styles.ratingOverview}>
          <View style={styles.ratingBig}>
            <Text style={[styles.ratingNumber, { color: themeTextColor }]}>4.8</Text>
            <Text style={[styles.ratingOutOf, { color: themeSecondaryText }]}>out of 5</Text>
          </View>
          <View style={styles.ratingBars}>
            {RATING_BARS.map((pct, i) => (
              <View key={i} style={styles.ratingBarRow}>
                <Text style={styles.ratingBarLabel}>{5 - i}</Text>
                <View style={styles.ratingBarTrack}>
                  <View style={[styles.ratingBarFill, { width: `${pct}%` }]} />
                </View>
              </View>
            ))}
          </View>
        </View>

        {REVIEWS.map((rev, i) => (
          <View key={i} style={[styles.reviewCard, { backgroundColor: themeCardBg }]}>
            <View style={styles.reviewHeader}>
              <View>
                <Text style={[styles.reviewName, { color: themeTextColor }]}>{rev.name}</Text>
                <View style={styles.starsRow}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <MaterialIcons key={j} name="star" size={14} color={j < rev.stars ? colors.primary : colors.slate300} />
                  ))}
                </View>
              </View>
              <Text style={[styles.reviewDate, { color: themeSecondaryText }]}>{rev.date}</Text>
            </View>
            <Text style={[styles.reviewText, { color: themeSecondaryText }]}>{rev.text}</Text>
          </View>
        ))}
      </View>

      {/* Information */}
      <View style={[styles.sectionBorder, { marginBottom: 40 }]}>
        <Text style={[styles.sectionTitle, { color: themeTextColor }]}>Information</Text>
        {INFO_ROWS.map((row, i) => (
          <View key={i} style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: themeSecondaryText }]}>{row.label}</Text>
            <Text style={[styles.infoValue, { color: themeTextColor }, row.highlight && { color: colors.primary }]}>{row.value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contentContainer: {},
  appHeader: { flexDirection: 'row', padding: 20, gap: 14 },
  appIcon: {
    width: 90, height: 90, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
  },
  appInfo: { flex: 1, justifyContent: 'center' },
  appName: { fontSize: 19, fontWeight: '800' },
  appDev: { fontSize: 13, marginTop: 2 },
  appActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  getButton: {
    paddingHorizontal: 22, paddingVertical: 6, borderRadius: 20,
    backgroundColor: colors.primary,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
  },
  getButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  shareCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  statsBar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(226,232,240,0.6)',
    paddingVertical: 10, marginHorizontal: 20,
  },
  statsDivider: { width: 1, height: 28, backgroundColor: colors.slate200 },
  statItem: { alignItems: 'center' },
  statTopRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  statValue: { fontSize: 13, fontWeight: '700' },
  statLabel: { fontSize: 9, marginTop: 2 },
  sectionPadded: { paddingHorizontal: 20, paddingVertical: 14 },
  descText: { fontSize: 13, lineHeight: 20 },
  moreLink: { fontSize: 13, fontWeight: '700', color: colors.primary, marginTop: 4 },
  sectionBorder: { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: 'rgba(226,232,240,0.6)' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  linkText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  versionText: { fontSize: 11, marginBottom: 8 },
  bulletRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  bullet: { color: colors.primary, marginTop: 1 },
  bulletText: { fontSize: 13, flex: 1 },
  featureRow: { flexDirection: 'row', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  featureIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 13, fontWeight: '700' },
  featureDesc: { fontSize: 11, marginTop: 2 },
  ratingOverview: { flexDirection: 'row', gap: 20, marginBottom: 16 },
  ratingBig: { alignItems: 'center' },
  ratingNumber: { fontSize: 42, fontWeight: '800' },
  ratingOutOf: { fontSize: 11 },
  ratingBars: { flex: 1, justifyContent: 'center', gap: 4 },
  ratingBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingBarLabel: { fontSize: 11, color: colors.slate400, width: 10, textAlign: 'right' },
  ratingBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.slate200, overflow: 'hidden' },
  ratingBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  reviewCard: {
    borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(236,55,19,0.05)',
  },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  reviewName: { fontSize: 13, fontWeight: '700' },
  starsRow: { flexDirection: 'row', gap: 1, marginTop: 3 },
  reviewDate: { fontSize: 11 },
  reviewText: { fontSize: 13, lineHeight: 19 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: '500' },
});
