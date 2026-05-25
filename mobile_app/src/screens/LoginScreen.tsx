import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, StyleSheet,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Checkbox from 'expo-checkbox';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../services/supabaseClient';
import { colors } from '../theme/colors';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';

const STORE_KEY_EMAIL = 'login_saved_email';
const STORE_KEY_PASSWORD = 'login_saved_password';
const STORE_KEY_REMEMBER = 'login_remember_me';

export default function LoginScreen({ navigation }: any) {
  const { themeBackground, themeTextColor, themeSecondaryText, themeCardBg, isDark } = useSettings();
  const t = useT();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isRememberMe, setIsRememberMe] = useState(false);

  // Reset password modal states
  const [isResetModalVisible, setIsResetModalVisible] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const savedEmail = await SecureStore.getItemAsync(STORE_KEY_EMAIL);
        const rememberStatus = await SecureStore.getItemAsync(STORE_KEY_REMEMBER);

        if (savedEmail) {
          setEmail(savedEmail);
        }

        if (rememberStatus === 'true') {
          setIsRememberMe(true);
          const savedPassword = await SecureStore.getItemAsync(STORE_KEY_PASSWORD);
          if (savedPassword) {
            setPassword(savedPassword);
          }
        }
      } catch (e) {
        // Silently fail — first launch or store cleared
      }
    };
    loadSavedCredentials();
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert(t('tip'), t('login_email_password_required'));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert(t('login_fail'), error.message);
      return;
    }

    // Login succeeded — persist credentials
    try {
      await SecureStore.setItemAsync(STORE_KEY_EMAIL, email.trim());

      if (isRememberMe) {
        await SecureStore.setItemAsync(STORE_KEY_PASSWORD, password);
        await SecureStore.setItemAsync(STORE_KEY_REMEMBER, 'true');
      } else {
        await SecureStore.deleteItemAsync(STORE_KEY_PASSWORD);
        await SecureStore.setItemAsync(STORE_KEY_REMEMBER, 'false');
      }
    } catch (e) {
      // Storage failure is non-critical
    }
  };

  // ── Reset Password Flow ──

  const openResetModal = () => {
    setResetEmail(email.trim());
    setResetCode('');
    setNewPassword('');
    setResetStep(1);
    setIsResetModalVisible(true);
  };

  const closeResetModal = () => {
    setIsResetModalVisible(false);
    setResetEmail('');
    setResetCode('');
    setNewPassword('');
    setResetStep(1);
    setResetLoading(false);
  };

  const handleSendResetCode = async () => {
    if (!resetEmail.trim()) {
      Alert.alert(t('tip'), t('login_email_required'));
      return;
    }
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim());
    setResetLoading(false);

    if (error) {
      Alert.alert(t('login_send_fail'), error.message);
    } else {
      Alert.alert(t('login_code_sent'), t('login_code_sent_msg'));
      setResetStep(2);
    }
  };

  const handleConfirmReset = async () => {
    if (!resetCode.trim()) {
      Alert.alert(t('tip'), t('login_code_required'));
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert(t('tip'), t('login_password_min'));
      return;
    }

    setResetLoading(true);

    // Step 1: Verify OTP
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: resetEmail.trim(),
      token: resetCode.trim(),
      type: 'recovery',
    });

    if (verifyError) {
      setResetLoading(false);
      Alert.alert(t('login_verify_fail'), verifyError.message);
      return;
    }

    // Step 2: Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setResetLoading(false);

    if (updateError) {
      Alert.alert(t('login_reset_fail'), updateError.message);
      return;
    }

    // Sign out so user can log in with new password from login screen
    await supabase.auth.signOut();

    Alert.alert(t('login_reset_success'), t('login_reset_success_msg'), [
      { text: t('ok'), onPress: closeResetModal },
    ]);
  };

  // ── Render ──

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
      {/* Hero Banner */}
      <View style={styles.heroBanner}>
        <Image
          source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB9yETfaGbrbAFfdrO-J6X301aQe34am0CCEFq2eu1sFi-fXjrjlKCIOOf-NQqhcDrkMQbUIaCMLfIil59zP6ZMZnaA5FHwjYhFOQCnRtJGmRk8wQBlhJzwEzg6aXpS9Bz34ElUhBO8ViXDGGshzrKHLMukJOK2eKHG0nX6few1WyvZ1XGvYivbJD7h4pOP1SmKWRwNjbE96mxakAOdr4NCMvODeASWO-cf78EvPPykczQ9teJSpMRrJu50nMEC9yXP6muhUeJ10H8' }}
          style={styles.heroImage}
        />
        <View style={styles.heroOverlay}>
          <Text style={[styles.heroTitle, { color: themeTextColor }]}>{t('login_welcome')}</Text>
          <Text style={[styles.heroSubtitle, { color: themeSecondaryText }]}>{t('login_subtitle')}</Text>
        </View>
      </View>

      {/* Login Form */}
      <View style={styles.formSection}>
        <Text style={[styles.label, { color: themeTextColor }]}>{t('login_email_label')}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: themeCardBg, color: themeTextColor }]}
          placeholder={t('login_email_placeholder')}
          placeholderTextColor={colors.slate400}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />

        <Text style={[styles.label, { marginTop: 16, color: themeTextColor }]}>{t('login_password_label')}</Text>
        <View style={styles.passwordContainer}>
          <TextInput
            style={[styles.input, { flex: 1, backgroundColor: themeCardBg, color: themeTextColor }]}
            placeholder={t('login_password_placeholder')}
            placeholderTextColor={colors.slate400}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />
          <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
            <MaterialIcons name={showPassword ? 'visibility-off' : 'visibility'} size={22} color={colors.slate400} />
          </TouchableOpacity>
        </View>

        {/* Remember Me + Forgot Password Row */}
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.rememberRow}
            activeOpacity={0.7}
            onPress={() => setIsRememberMe(!isRememberMe)}
          >
            <Checkbox
              value={isRememberMe}
              onValueChange={setIsRememberMe}
              color={isRememberMe ? colors.primary : undefined}
              style={styles.checkbox}
            />
            <Text style={[styles.rememberText, { color: themeTextColor }]}>{t('login_remember')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openResetModal} disabled={loading}>
            <Text style={styles.forgotText}>{t('login_forgot')}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.loginButton} activeOpacity={0.85} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.loginButtonText}>{t('login_btn')}</Text>
              <MaterialIcons name="arrow-forward" size={20} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: themeSecondaryText }]}>{t('login_no_account')} </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.footerLink}>{t('login_register')}</Text>
        </TouchableOpacity>
      </View>

      {/* Decorative Footer */}
      <View style={styles.decorFooter}>
        <View style={styles.decorIcons}>
          <MaterialIcons name="favorite" size={18} color="rgba(236,55,19,0.3)" />
          <MaterialIcons name="cloud" size={18} color="rgba(236,55,19,0.3)" />
          <MaterialIcons name="auto-awesome" size={18} color="rgba(236,55,19,0.3)" />
        </View>
        <Text style={styles.decorText}>{t('login_slogan')}</Text>
      </View>
    </ScrollView>

    {/* ── Reset Password Modal ── */}
    <Modal
      visible={isResetModalVisible}
      transparent
      animationType="fade"
      onRequestClose={closeResetModal}
    >
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalKeyboard}
        >
          <View style={[styles.modalCard, { backgroundColor: themeCardBg }]}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalIconCircle}>
                <MaterialIcons name="lock-reset" size={26} color={colors.primary} />
              </View>
              <Text style={[styles.modalTitle, { color: themeTextColor }]}>
                {resetStep === 1 ? t('login_find_password') : t('login_reset_password')}
              </Text>
              <Text style={[styles.modalSubtitle, { color: themeSecondaryText }]}>
                {resetStep === 1
                  ? t('login_find_desc')
                  : `${t('login_code_sent_to')} ${resetEmail}`}
              </Text>
            </View>

            {resetStep === 1 ? (
              /* ── Step 1: Enter email ── */
              <>
                <Text style={[styles.modalLabel, { color: themeTextColor }]}>{t('login_email_input_label')}</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: themeCardBg, color: themeTextColor }]}
                  placeholder={t('login_email_input_placeholder')}
                  placeholderTextColor={colors.slate400}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  editable={!resetLoading}
                />
                <TouchableOpacity
                  style={styles.modalPrimaryBtn}
                  activeOpacity={0.85}
                  onPress={handleSendResetCode}
                  disabled={resetLoading}
                >
                  {resetLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalPrimaryText}>{t('login_send_code')}</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              /* ── Step 2: Enter code + new password ── */
              <>
                <Text style={[styles.modalLabel, { color: themeTextColor }]}>{t('login_code_label')}</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: themeCardBg, color: themeTextColor }]}
                  placeholder={t('login_code_placeholder')}
                  placeholderTextColor={colors.slate400}
                  keyboardType="number-pad"
                  maxLength={8}
                  value={resetCode}
                  onChangeText={setResetCode}
                  editable={!resetLoading}
                />
                <Text style={[styles.modalLabel, { marginTop: 14, color: themeTextColor }]}>{t('login_new_password')}</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: themeCardBg, color: themeTextColor }]}
                  placeholder={t('login_new_password_placeholder')}
                  placeholderTextColor={colors.slate400}
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  editable={!resetLoading}
                />
                <TouchableOpacity
                  style={styles.modalPrimaryBtn}
                  activeOpacity={0.85}
                  onPress={handleConfirmReset}
                  disabled={resetLoading}
                >
                  {resetLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalPrimaryText}>{t('login_confirm_reset')}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Cancel */}
            <TouchableOpacity
              style={styles.modalCancelBtn}
              onPress={closeResetModal}
              disabled={resetLoading}
            >
              <Text style={[styles.modalCancelText, { color: themeSecondaryText }]}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 40 },
  heroBanner: {
    width: '100%', aspectRatio: 21 / 9, borderRadius: 16, overflow: 'hidden',
    marginTop: 24, position: 'relative',
  },
  heroImage: { width: '100%', height: '100%', position: 'absolute' },
  heroOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20,
    backgroundColor: 'rgba(248,246,246,0.7)',
  },
  heroTitle: { fontSize: 28, fontWeight: '800', color: colors.slate900 },
  heroSubtitle: { fontSize: 14, fontWeight: '500', color: 'rgba(236,55,19,0.8)', marginTop: 2 },
  formSection: { marginTop: 28 },
  label: { fontSize: 13, fontWeight: '600', color: colors.slate700, marginBottom: 6, marginLeft: 2 },
  input: {
    height: 52, backgroundColor: colors.white, borderWidth: 1, borderColor: 'rgba(236,55,19,0.1)',
    borderRadius: 14, paddingHorizontal: 16, fontSize: 15, color: colors.slate900,
  },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', position: 'relative' },
  eyeIcon: { position: 'absolute', right: 14 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, paddingHorizontal: 2,
  },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: { width: 18, height: 18, borderRadius: 4 },
  rememberText: { fontSize: 13, fontWeight: '500', color: colors.slate700 },
  forgotText: { fontSize: 13, fontWeight: '500', color: colors.primary },
  loginButton: {
    height: 52, backgroundColor: colors.primary, borderRadius: 14, marginTop: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  loginButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  footerText: { fontSize: 14, color: colors.slate600 },
  footerLink: { fontSize: 14, fontWeight: '700', color: colors.primary },
  decorFooter: { alignItems: 'center', marginTop: 40, opacity: 0.4 },
  decorIcons: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  decorText: { fontSize: 9, letterSpacing: 3, textTransform: 'uppercase', color: colors.primary, fontWeight: '500' },

  // ── Modal Styles ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', padding: 24,
  },
  modalKeyboard: { width: '100%', alignItems: 'center' },
  modalCard: {
    width: '100%', maxWidth: 400, backgroundColor: colors.white, borderRadius: 20,
    padding: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
  },
  modalHeader: { alignItems: 'center', marginBottom: 24 },
  modalIconCircle: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(236,55,19,0.08)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: colors.slate900 },
  modalSubtitle: { fontSize: 13, color: colors.slate600, marginTop: 4, textAlign: 'center' },
  modalLabel: { fontSize: 13, fontWeight: '600', color: colors.slate900, marginBottom: 6, marginLeft: 2 },
  modalInput: {
    height: 50, backgroundColor: colors.backgroundLight, borderWidth: 1,
    borderColor: 'rgba(236,55,19,0.1)', borderRadius: 14,
    paddingHorizontal: 16, fontSize: 15, color: colors.slate900,
  },
  modalPrimaryBtn: {
    height: 50, backgroundColor: colors.primary, borderRadius: 14, marginTop: 20,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 4,
  },
  modalPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalCancelBtn: {
    height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 12,
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: colors.slate600 },
});
