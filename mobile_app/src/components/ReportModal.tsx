import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, TextInput, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useT } from '../i18n';
import { submitContentReport, ReportContentType } from '../services/PetDatabaseService';
import { useSettings } from '../context/SettingsContext';

const REASON_KEYS = [
  'report_reason_spam',
  'report_reason_harassment',
  'report_reason_hate',
  'report_reason_violence',
  'report_reason_other',
] as const;

interface Props {
  visible: boolean;
  onClose: () => void;
  reporterId: string;
  contentType: ReportContentType;
  contentId: string;
}

export default function ReportModal({
  visible, onClose, reporterId, contentType, contentId,
}: Props) {
  const t = useT();
  const { themeCardBg, themeTextColor, themeSecondaryText } = useSettings();
  const [reasonKey, setReasonKey] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReasonKey(null);
    setDetails('');
    setSubmitting(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!reasonKey || !reporterId) return;
    setSubmitting(true);
    try {
      await submitContentReport(
        reporterId, contentType, contentId, reasonKey,
        details.trim() || undefined,
      );
      Alert.alert('', t('report_thanks'));
      reset();
      onClose();
    } catch (e: any) {
      Alert.alert(t('report_fail'), e.message);
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.dismiss} onPress={handleClose} />
        <View style={[styles.sheet, { backgroundColor: themeCardBg }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: themeTextColor }]}>{t('report_title')}</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={22} color={colors.warmWood} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: themeSecondaryText }]}>{t('report_select_reason')}</Text>

          {REASON_KEYS.map((k) => {
            const selected = reasonKey === k;
            return (
              <TouchableOpacity
                key={k}
                style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                onPress={() => setReasonKey(k)}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                  size={20}
                  color={selected ? colors.primary : colors.slate400}
                />
                <Text style={[styles.reasonText, { color: themeTextColor }]}>{t(k)}</Text>
              </TouchableOpacity>
            );
          })}

          <TextInput
            style={[styles.detailsInput, { color: themeTextColor }]}
            placeholder={t('report_details_placeholder')}
            placeholderTextColor={colors.slate400}
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={300}
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[
              styles.submitBtn,
              (!reasonKey || submitting) && { opacity: 0.5 },
            ]}
            onPress={handleSubmit}
            disabled={!reasonKey || submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>{t('report_submit')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  dismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate200, alignSelf: 'center', marginBottom: 12,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.warmWood },
  subtitle: { fontSize: 13, color: colors.slate500, marginBottom: 12 },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 8,
    borderRadius: 8,
  },
  reasonRowSelected: { backgroundColor: 'rgba(154,89,76,0.06)' },
  reasonText: { fontSize: 15, color: colors.slate900 },
  detailsInput: {
    borderWidth: 1, borderColor: colors.slate200, borderRadius: 12,
    padding: 12, fontSize: 14, color: colors.slate900,
    backgroundColor: colors.softCream,
    height: 80, marginTop: 12, marginBottom: 16,
  },
  submitBtn: {
    backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
