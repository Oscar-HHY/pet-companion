import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase, EMAIL_CONFIRM_REDIRECT_URL } from '../services/supabaseClient';
import { colors } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';

export default function RegisterScreen({ navigation }: any) {
  const { themeBackground, themeTextColor, themeSecondaryText, themeCardBg, isDark } = useSettings();
  const t = useT();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!displayName.trim()) {
      Alert.alert(t('tip'), t('register_nickname_required'));
      return;
    }
    if (!email.trim()) {
      Alert.alert(t('tip'), t('register_email_required'));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t('tip'), t('register_password_min'));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('tip'), t('register_password_mismatch'));
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName.trim() },
        emailRedirectTo: EMAIL_CONFIRM_REDIRECT_URL,
      },
    });
    setLoading(false);

    if (error) {
      Alert.alert(t('register_fail'), error.message);
    } else {
      Alert.alert(
        t('register_success'),
        t('register_success_msg'),
        [{ text: t('ok') }],
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
    <ScrollView
      style={[styles.container, { backgroundColor: themeBackground }]}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.card, { backgroundColor: themeCardBg }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="auto-awesome" size={28} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: themeTextColor }]}>{t('register_title')}</Text>
          <Text style={[styles.subtitle, { color: themeSecondaryText }]}>{t('register_subtitle')}</Text>
        </View>

        {/* Name */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: themeTextColor }]}>{t('register_nickname')}</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="person" size={20} color={colors.slate400} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { backgroundColor: themeCardBg, color: themeTextColor }]}
              placeholder={t('register_nickname_placeholder')}
              placeholderTextColor={colors.slate400}
              value={displayName}
              onChangeText={setDisplayName}
              editable={!loading}
            />
          </View>
        </View>

        {/* Email */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: themeTextColor }]}>{t('register_email')}</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="mail" size={20} color={colors.slate400} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { backgroundColor: themeCardBg, color: themeTextColor }]}
              placeholder={t('register_email_placeholder')}
              placeholderTextColor={colors.slate400}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              editable={!loading}
            />
          </View>
        </View>

        {/* Password */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: themeTextColor }]}>{t('register_password')}</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="lock" size={20} color={colors.slate400} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { backgroundColor: themeCardBg, color: themeTextColor }]}
              placeholder={t('register_password_placeholder')}
              placeholderTextColor={colors.slate400}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              editable={!loading}
            />
          </View>
        </View>

        {/* Confirm Password */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: themeTextColor }]}>{t('register_confirm_password')}</Text>
          <View style={styles.inputWrapper}>
            <MaterialIcons name="lock-reset" size={20} color={colors.slate400} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { backgroundColor: themeCardBg, color: themeTextColor }]}
              placeholder={t('register_confirm_placeholder')}
              placeholderTextColor={colors.slate400}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              editable={!loading}
            />
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={styles.submitButton}
          activeOpacity={0.85}
          onPress={handleSignUp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.submitText}>{t('register_btn')}</Text>
              <MaterialIcons name="arrow-forward" size={22} color="#fff" />
            </>
          )}
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footerDivider} />
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: themeSecondaryText }]}>{t('register_has_account') + ' '}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.footerLink}>{t('register_login')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Decorative Footer */}
      <View style={styles.decorFooter}>
        <View style={styles.decorRow}>
          <MaterialIcons name="local-florist" size={14} color="rgba(236,55,19,0.3)" />
          <Text style={styles.decorLabel}>{t('register_memory')}</Text>
          <MaterialIcons name="favorite" size={14} color="rgba(236,55,19,0.3)" />
          <Text style={styles.decorLabel}>{t('register_eternal')}</Text>
          <MaterialIcons name="stars" size={14} color="rgba(236,55,19,0.3)" />
          <Text style={styles.decorLabel}>{t('register_guard')}</Text>
        </View>
        <Text style={[styles.decorCopy, { color: themeSecondaryText }]}>{t('register_footer')}</Text>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { padding: 24, alignItems: 'center' },
  card: {
    width: '100%', maxWidth: 480, backgroundColor: colors.white, borderRadius: 16,
    padding: 28, borderWidth: 1, borderColor: 'rgba(236,55,19,0.05)',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 20, elevation: 4,
  },
  header: { alignItems: 'center', marginBottom: 28 },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(236,55,19,0.05)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  title: { fontSize: 26, fontWeight: '800', color: colors.slate900 },
  subtitle: { fontSize: 13, color: colors.slate600, marginTop: 6, textAlign: 'center' },
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.slate900, marginBottom: 6, marginLeft: 2 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  inputIcon: { position: 'absolute', left: 14, zIndex: 1 },
  input: {
    flex: 1, height: 50, backgroundColor: colors.backgroundLight, borderWidth: 1,
    borderColor: 'rgba(236,55,19,0.1)', borderRadius: 14, paddingLeft: 42, paddingRight: 16,
    fontSize: 14, color: colors.slate900,
  },
  submitButton: {
    height: 52, backgroundColor: colors.primary, borderRadius: 14, marginTop: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footerDivider: { height: 1, backgroundColor: 'rgba(236,55,19,0.1)', marginTop: 28 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { fontSize: 13, color: colors.slate600 },
  footerLink: { fontSize: 13, fontWeight: '600', color: colors.primary },
  decorFooter: { alignItems: 'center', marginTop: 32, paddingBottom: 20 },
  decorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  decorLabel: { fontSize: 11, color: 'rgba(236,55,19,0.3)' },
  decorCopy: { fontSize: 11, color: colors.slate400 },
});
