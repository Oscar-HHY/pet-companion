import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Linking,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { supabase } from '../services/supabaseClient';
import { useT } from '../i18n';
import { useSettings } from '../context/SettingsContext';
import { PRIVACY_POLICY_URL, EULA_URL } from '../screens/AboutScreen';

const KEY_PREFIX = 'eula_accepted_';

async function openExternal(url: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error(url);
    await Linking.openURL(url);
  } catch {
    Alert.alert('', url);
  }
}

export default function EulaGate() {
  const t = useT();
  const { themeCardBg, themeTextColor, themeSecondaryText } = useSettings();
  const [userId, setUserId] = useState<string | null>(null);
  const [needsAccept, setNeedsAccept] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) { setChecking(false); return; }
        setUserId(user.id);
        const accepted = await AsyncStorage.getItem(KEY_PREFIX + user.id);
        if (!cancelled) setNeedsAccept(accepted !== '1');
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleAgree = async () => {
    if (!userId) return;
    await AsyncStorage.setItem(KEY_PREFIX + userId, '1');
    setNeedsAccept(false);
  };

  if (checking || !needsAccept) return null;

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: themeCardBg }]}>
          <View style={styles.iconWrap}>
            <MaterialIcons name="verified-user" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: themeTextColor }]}>{t('eula_gate_title')}</Text>
          <ScrollView style={styles.bodyScroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.body, { color: themeSecondaryText }]}>{t('eula_gate_body')}</Text>
          </ScrollView>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => openExternal(EULA_URL)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="description" size={16} color={colors.primary} />
            <Text style={styles.linkText}>{t('eula_gate_view_terms')}</Text>
            <MaterialIcons name="open-in-new" size={12} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => openExternal(PRIVACY_POLICY_URL)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="privacy-tip" size={16} color={colors.primary} />
            <Text style={styles.linkText}>{t('eula_gate_view_privacy')}</Text>
            <MaterialIcons name="open-in-new" size={12} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.agreeBtn} onPress={handleAgree} activeOpacity={0.8}>
            <Text style={styles.agreeText}>{t('eula_gate_agree')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  sheet: {
    width: '100%', maxWidth: 400, borderRadius: 18, padding: 24, alignItems: 'center',
  },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(236,55,19,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  bodyScroll: { maxHeight: 140, width: '100%' },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 10,
  },
  linkText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  agreeBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14,
    width: '100%', alignItems: 'center', marginTop: 12,
  },
  agreeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
