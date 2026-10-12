import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  Alert, RefreshControl, Modal, ActivityIndicator, Platform,
  KeyboardAvoidingView, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { supabase } from '../services/supabaseClient';
import {
  getPetProfile,
  addHealthQuestionnaire, getHealthQuestionnaires, deleteHealthQuestionnaire, HealthQuestionnaire,
  addMedicalRecord, updateMedicalRecord, getMedicalRecords, deleteMedicalRecord, MedicalRecord,
  addVaccination, getVaccinations, deleteVaccination, setVaccinationReminderId, Vaccination,
  addWeightRecord, getWeightRecords, deleteWeightRecord, WeightRecord,
  uploadMedicalReportImage, getMedicalReportImageUrl, deleteMedicalReportImages,
} from '../services/PetDatabaseService';
import { extractMedicalReport, AssistantError } from '../services/PetAssistantService';
import { scheduleVaccinationReminder, cancelReminder, scheduleTestReminder } from '../services/notifications';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';
import { colors } from '../theme/colors';

const pad2 = (n: number) => String(n).padStart(2, '0');
const MAX_REPORT_IMAGES = 6;
const consentKey = (userId: string) => `ai_ocr_consent_${userId}`;

function fmtTime(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch { return iso; }
}

function fmtDate(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  } catch { return iso; }
}

function diffDays(dateStr: string, now: Date): number {
  const target = new Date(dateStr);
  return Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function HealthScreen() {
  const { themeBackground, themeTextColor, themeSecondaryText, themeCardBg } = useSettings();
  const t = useT();

  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [petName, setPetName] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({ health: true, medical: false, vaccine: false, weight: false });
  const [healthList, setHealthList] = useState<HealthQuestionnaire[]>([]);
  const [medicalList, setMedicalList] = useState<MedicalRecord[]>([]);
  const [vaccineList, setVaccineList] = useState<Vaccination[]>([]);
  const [weightList, setWeightList] = useState<WeightRecord[]>([]);
  const [healthModalVisible, setHealthModalVisible] = useState(false);
  const [medicalModalVisible, setMedicalModalVisible] = useState(false);
  const [vaccineModalVisible, setVaccineModalVisible] = useState(false);
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hSymptom, setHSymptom] = useState('');
  const [hSeverity, setHSeverity] = useState('');
  const [hDuration, setHDuration] = useState('');
  const [hTreatment, setHTreatment] = useState('');
  const [mClinic, setMClinic] = useState('');
  const [mDiagnosis, setMDiagnosis] = useState('');
  const [mTreatmentPlan, setMTreatmentPlan] = useState('');
  const [mMedication, setMMedication] = useState('');
  const [mNotes, setMNotes] = useState('');
  const [mEditingId, setMEditingId] = useState<string | null>(null);
  const [mVisitDate, setMVisitDate] = useState('');
  const [mImagePaths, setMImagePaths] = useState<string[]>([]);
  // path → displayable uri (local file for fresh picks, signed URL for saved ones)
  const [mImageUris, setMImageUris] = useState<Record<string, string>>({});
  // uploaded during this modal session — deleted again if the user cancels
  const [mUploadedPaths, setMUploadedPaths] = useState<string[]>([]);
  const [mOriginalPaths, setMOriginalPaths] = useState<string[]>([]);
  const [mOcrText, setMOcrText] = useState('');
  const [mExtracting, setMExtracting] = useState(false);
  const [vName, setVName] = useState('');
  const [vDate, setVDate] = useState('');
  const [vDoseNumber, setVDoseNumber] = useState('');
  const [vNextDate, setVNextDate] = useState('');
  const [wValue, setWValue] = useState('');

  useEffect(() => { supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id); }); }, []);

  const loadAll = useCallback(async () => {
    if (!userId) return;
    try {
      const [profile, h, m, v, w] = await Promise.all([getPetProfile(userId), getHealthQuestionnaires(userId), getMedicalRecords(userId), getVaccinations(userId), getWeightRecords(userId)]);
      if (profile) setPetName(profile.name || '');
      setHealthList(h); setMedicalList(m); setVaccineList(v); setWeightList(w);
    } catch (e: any) { console.warn('[Health]', e.message); }
  }, [userId]);

  useEffect(() => { loadAll(); }, [loadAll]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await loadAll(); setRefreshing(false); }, [loadAll]);
  const toggleSection = (key: string) => setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const openHealthModal = () => { setHSymptom(''); setHSeverity(''); setHDuration(''); setHTreatment(''); setHealthModalVisible(true); };
  const saveHealth = async () => {
    if (!userId) return;
    if (!hSymptom.trim()) { Alert.alert(t('tip'), t('health_symptom_required')); return; }
    setSaving(true);
    try { await addHealthQuestionnaire(userId, { symptoms: hSymptom.trim(), severity: hSeverity.trim(), duration: hDuration.trim(), treatment_status: hTreatment.trim() }); setHealthModalVisible(false); await loadAll(); }
    catch (e: any) { Alert.alert(t('health_save_fail'), e.message); } finally { setSaving(false); }
  };

  const openMedicalModal = (existing?: MedicalRecord) => {
    if (existing) { setMEditingId(existing.id || null); setMClinic(existing.clinic_name || ''); setMDiagnosis(existing.diagnosis || ''); setMTreatmentPlan(existing.treatment || ''); setMMedication(existing.medications || ''); setMNotes(existing.notes || ''); }
    else { setMEditingId(null); setMClinic(''); setMDiagnosis(''); setMTreatmentPlan(''); setMMedication(''); setMNotes(''); }
    const paths = existing?.report_image_paths ?? [];
    setMVisitDate(existing?.visit_date || ''); setMOcrText(existing?.report_ocr_text || '');
    setMImagePaths(paths); setMOriginalPaths(paths); setMUploadedPaths([]); setMImageUris({});
    setMedicalModalVisible(true);
    paths.forEach((path) => {
      getMedicalReportImageUrl(path)
        .then((url) => setMImageUris((prev) => ({ ...prev, [path]: url })))
        .catch((e) => console.warn('[Health] report image url:', e.message));
    });
  };
  const closeMedicalModal = () => {
    // Drop photos uploaded in this session that never got saved to a record.
    deleteMedicalReportImages(mUploadedPaths).catch((e) => console.warn('[Health] cleanup:', e.message));
    setMedicalModalVisible(false);
  };
  const pickReportImages = async () => {
    if (!userId) return;
    const room = MAX_REPORT_IMAGES - mImagePaths.length;
    if (room <= 0) { Alert.alert(t('tip'), t('health_report_max').replace('{n}', String(MAX_REPORT_IMAGES))); return; }
    const consent = await AsyncStorage.getItem(consentKey(userId)).catch(() => null);
    if (consent !== 'yes') {
      const agreed = await new Promise<boolean>((resolve) => {
        Alert.alert(t('health_report_consent_title'), t('health_report_consent_body'), [
          { text: t('cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('ai_consent_agree'), onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) });
      });
      if (!agreed) return;
      await AsyncStorage.setItem(consentKey(userId), 'yes').catch(() => {});
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t('memory_cannot_open'), t('memory_album_permission')); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: room, quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;

    setMExtracting(true);
    const newPaths: string[] = [];
    try {
      for (const asset of result.assets.slice(0, room)) {
        const path = await uploadMedicalReportImage(userId, asset.uri);
        newPaths.push(path);
        // Track each file as soon as it's stored so a later failure can't orphan it.
        setMImageUris((prev) => ({ ...prev, [path]: asset.uri }));
        setMImagePaths((prev) => [...prev, path]);
        setMUploadedPaths((prev) => [...prev, path]);
      }
    } catch (e: any) {
      setMExtracting(false);
      Alert.alert(t('health_save_fail'), e.message);
      return;
    }

    try {
      const r = await extractMedicalReport(newPaths);
      // Only fill fields the user hasn't typed into; never overwrite their input.
      if (r.clinic_name) setMClinic((v) => v || r.clinic_name);
      if (r.visit_date) setMVisitDate((v) => v || r.visit_date);
      if (r.diagnosis) setMDiagnosis((v) => v || r.diagnosis);
      if (r.treatment) setMTreatmentPlan((v) => v || r.treatment);
      if (r.medications) setMMedication((v) => v || r.medications);
      if (r.notes) setMNotes((v) => (v ? `${v}\n${r.notes}` : r.notes));
      if (r.raw_text) setMOcrText((v) => (v ? `${v}\n\n${r.raw_text}` : r.raw_text));
      Alert.alert(t('health_report_extracted_title'), t('health_report_extracted_body'));
    } catch (e: any) {
      const msg = e instanceof AssistantError && e.code === 'daily_limit_reached' ? t('health_report_limit') : t('health_report_extract_fail');
      // Images that did upload stay attached; the user can fill fields by hand.
      Alert.alert(t('tip'), msg);
    } finally {
      setMExtracting(false);
    }
  };
  const removeReportImage = (path: string) => setMImagePaths((prev) => {
    const next = prev.filter((p) => p !== path);
    if (next.length === 0) setMOcrText('');
    return next;
  });
  const saveMedical = async () => {
    if (!userId) return;
    if (mVisitDate && mVisitDate.length !== 10) { Alert.alert(t('tip'), t('health_visit_date_format_err')); return; }
    setSaving(true);
    const payload = {
      clinic_name: mClinic.trim(), diagnosis: mDiagnosis.trim(), treatment: mTreatmentPlan.trim(), medications: mMedication.trim(), notes: mNotes.trim(),
      visit_date: mVisitDate || null, report_image_paths: mImagePaths, report_ocr_text: mOcrText.trim() || null,
    };
    try {
      if (mEditingId) await updateMedicalRecord(mEditingId, payload); else await addMedicalRecord(userId, payload);
      // Photos removed in the editor (previously saved or uploaded just now) are no longer referenced.
      const orphaned = [...mOriginalPaths, ...mUploadedPaths].filter((p) => !mImagePaths.includes(p));
      deleteMedicalReportImages(orphaned).catch((e) => console.warn('[Health] cleanup:', e.message));
      setMUploadedPaths([]);
      setMedicalModalVisible(false); await loadAll();
    }
    catch (e: any) { Alert.alert(t('health_save_fail'), e.message); } finally { setSaving(false); }
  };
  const deleteMedicalWithImages = async (item: MedicalRecord) => {
    await deleteMedicalRecord(item.id!);
    deleteMedicalReportImages(item.report_image_paths ?? []).catch((e) => console.warn('[Health] cleanup:', e.message));
  };

  const formatDateInput = (text: string): string => {
    const digits = text.replace(/\D/g, '').slice(0, 8);
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
  };
  const openVaccineModal = () => { setVName(''); setVDate(''); setVDoseNumber(''); setVNextDate(''); setVaccineModalVisible(true); };
  const saveVaccine = async () => {
    if (!userId) return;
    if (vDate.length !== 10) { Alert.alert(t('tip'), t('health_vaccine_date_hint')); return; }
    if (vNextDate && vNextDate.length !== 10) { Alert.alert(t('tip'), t('health_vaccine_date_format_err')); return; }
    setSaving(true);
    try {
      const saved = await addVaccination(userId, { vaccine_name: vName.trim() || null, vaccine_date: vDate, dose_number: vDoseNumber.trim(), next_due_date: vNextDate || '' });
      if (vNextDate && saved.id) {
        const reminderId = await scheduleVaccinationReminder({
          petName: petName,
          doseNumber: vDoseNumber.trim(),
          nextDueDate: vNextDate,
          titleTemplate: t('health_vaccine_reminder_title'),
          bodyTemplate: t('health_vaccine_reminder_body'),
        });
        if (reminderId) {
          try {
            await setVaccinationReminderId(saved.id, reminderId);
          } catch (e: any) {
            // DB persist failed — cancel the scheduled notification so we don't
            // leave an orphan reminder that the user can never dismiss from
            // inside the app.
            console.warn('persist reminder id:', e.message);
            await cancelReminder(reminderId);
          }
        }
      }
      setVaccineModalVisible(false);
      await loadAll();
    }
    catch (e: any) { Alert.alert(t('health_save_fail'), e.message); } finally { setSaving(false); }
  };
  const deleteVaccineWithReminder = async (item: Vaccination) => {
    await cancelReminder(item.reminder_notification_id);
    if (item.id) await deleteVaccination(item.id);
  };
  const isVaccineDue = (nextDate: string): boolean => { if (!nextDate) return false; try { return diffDays(nextDate, new Date()) <= 3; } catch { return false; } };

  const openWeightModal = () => { setWValue(''); setWeightModalVisible(true); };
  const saveWeight = async () => {
    if (!userId) return; const num = parseFloat(wValue);
    if (isNaN(num) || num <= 0) { Alert.alert(t('tip'), t('health_weight_invalid')); return; }
    setSaving(true);
    try { await addWeightRecord(userId, parseFloat(num.toFixed(2))); setWeightModalVisible(false); await loadAll(); }
    catch (e: any) { Alert.alert(t('health_save_fail'), e.message); } finally { setSaving(false); }
  };

  const confirmDelete = (title: string, onConfirm: () => Promise<void>) => {
    Alert.alert(t('health_confirm_delete'), t('health_confirm_delete_msg') + title + t('health_confirm_delete_suffix'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: async () => { try { await onConfirm(); await loadAll(); } catch (e: any) { Alert.alert(t('health_delete_fail'), e.message); } } },
    ]);
  };

  const SectionHeader = ({ title, icon, sectionKey, onAdd }: { title: string; icon: string; sectionKey: string; onAdd: () => void }) => (
    <TouchableOpacity style={styles.sectionHeader} activeOpacity={0.7} onPress={() => toggleSection(sectionKey)}>
      <View style={styles.sectionHeaderLeft}>
        <MaterialIcons name={icon as any} size={22} color={colors.primary} />
        <Text style={[styles.sectionTitle, { color: themeTextColor }]}>{title}</Text>
      </View>
      <View style={styles.sectionHeaderRight}>
        <TouchableOpacity style={styles.addBtnSmall} onPress={onAdd} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="add" size={18} color={colors.primary} />
        </TouchableOpacity>
        <MaterialIcons name={expandedSections[sectionKey] ? 'expand-less' : 'expand-more'} size={24} color={themeSecondaryText} />
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeBackground }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: themeTextColor }]}>{t('health_title')}</Text>
          <Text style={[styles.headerSubtitle, { color: themeSecondaryText }]}>{t('health_subtitle')}</Text>
        </View>

        {/* 1. Health Overview */}
        <View style={[styles.sectionCard, { backgroundColor: themeCardBg }]}>
          <SectionHeader title={t('health_overview')} icon="monitor-heart" sectionKey="health" onAdd={openHealthModal} />
          {expandedSections.health && (
            <View style={styles.sectionBody}>
              {healthList.length === 0 ? (
                <EmptyCard icon="monitor-heart" text={t('health_no_data')} btnText={t('health_add_click')} onPress={openHealthModal} />
              ) : healthList.map((item) => (
                <View key={item.id} style={styles.recordCard}>
                  <View style={styles.recordHeader}>
                    <Text style={[styles.recordSymptom, { flex: 1, color: themeTextColor }]}>{item.symptoms}</Text>
                    {item.severity ? <View style={styles.severityBadge}><Text style={styles.severityText}>{item.severity}</Text></View> : null}
                    <TouchableOpacity style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => confirmDelete(t('health_record_name'), () => deleteHealthQuestionnaire(item.id!))}>
                      <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                  {item.duration ? <Text style={[styles.recordDetail, { color: themeSecondaryText }]}>{t('health_duration_prefix')}{item.duration}</Text> : null}
                  {item.treatment_status ? <Text style={[styles.recordDetail, { color: themeSecondaryText }]}>{t('health_treatment_prefix')}{item.treatment_status}</Text> : null}
                  <Text style={styles.recordTime}>{fmtTime(item.created_at)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 2. Medical Records */}
        <View style={[styles.sectionCard, { backgroundColor: themeCardBg }]}>
          <SectionHeader title={t('health_medical')} icon="medical-services" sectionKey="medical" onAdd={() => openMedicalModal()} />
          {expandedSections.medical && (
            <View style={styles.sectionBody}>
              {medicalList.length === 0 ? (
                <EmptyCard icon="medical-services" text={t('health_no_record')} btnText={t('health_add_medical')} onPress={() => openMedicalModal()} />
              ) : medicalList.map((item) => (
                <View key={item.id} style={styles.recordCard}>
                  <View style={styles.recordHeader}>
                    {item.clinic_name ? <Text style={[styles.recordSymptom, { flex: 1, color: themeTextColor }]}>{item.clinic_name}</Text> : <View style={{ flex: 1 }} />}
                    <TouchableOpacity style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => confirmDelete(t('health_medical_name'), () => deleteMedicalWithImages(item))}>
                      <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                  {item.visit_date ? <Text style={[styles.recordDetail, { color: themeSecondaryText }]}>{t('health_visit_date_prefix')}{item.visit_date}</Text> : null}
                  {item.diagnosis ? <Text style={[styles.recordDetail, { color: themeSecondaryText }]}>{t('health_diagnosis_prefix')}{item.diagnosis}</Text> : null}
                  {item.treatment ? <Text style={[styles.recordDetail, { color: themeSecondaryText }]}>{t('health_treatment_prefix2')}{item.treatment}</Text> : null}
                  {item.medications ? <Text style={[styles.recordDetail, { color: themeSecondaryText }]}>{t('health_medication_prefix')}{item.medications}</Text> : null}
                  {item.notes ? <Text style={[styles.recordDetail, { color: themeSecondaryText }]}>{t('health_notes_prefix')}{item.notes}</Text> : null}
                  {item.report_image_paths?.length ? (
                    <View style={styles.attachBadge}>
                      <MaterialIcons name="attach-file" size={13} color={colors.primary} />
                      <Text style={styles.attachBadgeText}>{t('health_report_attached').replace('{n}', String(item.report_image_paths.length))}</Text>
                    </View>
                  ) : null}
                  <View style={styles.recordFooter}>
                    <Text style={styles.recordTime}>{fmtTime(item.updated_at || item.created_at)}{item.updated_at && item.updated_at !== item.created_at ? t('health_updated') : ''}</Text>
                    <TouchableOpacity style={styles.updateBtn} onPress={() => openMedicalModal(item)}>
                      <MaterialIcons name="edit" size={14} color={colors.primary} />
                      <Text style={styles.updateBtnText}>{t('health_update_btn')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 3. Vaccinations */}
        <View style={[styles.sectionCard, { backgroundColor: themeCardBg }]}>
          <SectionHeader title={t('health_vaccine')} icon="vaccines" sectionKey="vaccine" onAdd={openVaccineModal} />
          {expandedSections.vaccine && (
            <View style={styles.sectionBody}>
              {__DEV__ && (
                <TouchableOpacity
                  onPress={async () => {
                    const ok = await scheduleTestReminder(
                      t('health_vaccine_reminder_title'),
                      t('health_vaccine_reminder_body').replace('{pet}', petName || 'pet').replace('{dose}', 'TEST'),
                    );
                    Alert.alert(ok ? 'Scheduled' : 'Permission denied', ok ? 'Notification will fire in ~15 seconds. Lock or background the app to see the banner.' : 'Open Settings → Pet Companion → Notifications to enable.');
                  }}
                  style={{ alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8 }}
                >
                  <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '600' }}>🛠 Test reminder (15s)</Text>
                </TouchableOpacity>
              )}
              {vaccineList.length === 0 ? (
                <EmptyCard icon="vaccines" text={t('health_no_record')} btnText={t('health_add_vaccine')} onPress={openVaccineModal} />
              ) : vaccineList.map((item) => (
                <View key={item.id}>
                  {item.next_due_date && isVaccineDue(item.next_due_date) && (
                    <View style={styles.alertBanner}>
                      <MaterialIcons name="warning" size={18} color="#dc2626" />
                      <Text style={styles.alertText}>{t('health_vaccine_due_alert')}{petName || t('health_pet')}{t('health_vaccine_due_alert2')}</Text>
                    </View>
                  )}
                  <View style={styles.recordCard}>
                    <View style={styles.recordHeader}>
                      <Text style={[styles.recordSymptom, { flex: 1, color: themeTextColor }]}>{item.vaccine_name ? `${item.vaccine_name} · ` : ''}{t('health_vaccine_dose_prefix')}{item.dose_number || '?'}{t('health_vaccine_dose_suffix')}</Text>
                      <TouchableOpacity style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => confirmDelete(t('health_vaccine_name'), () => deleteVaccineWithReminder(item))}>
                        <Ionicons name="trash-outline" size={18} color="#dc2626" />
                      </TouchableOpacity>
                    </View>
                    <Text style={[styles.recordDetail, { color: themeSecondaryText }]}>{t('health_vaccine_date_prefix')}{fmtDate(item.vaccine_date)}</Text>
                    {item.next_due_date ? (
                      <Text style={[styles.recordDetail, { color: themeSecondaryText }, isVaccineDue(item.next_due_date) && { color: '#dc2626', fontWeight: '700' }]}>
                        {t('health_vaccine_next_prefix')}{fmtDate(item.next_due_date)}
                      </Text>
                    ) : null}
                    <Text style={styles.recordTime}>{fmtTime(item.created_at)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 4. Weight */}
        <View style={[styles.sectionCard, { backgroundColor: themeCardBg }]}>
          <SectionHeader title={t('health_weight')} icon="trending-up" sectionKey="weight" onAdd={openWeightModal} />
          {expandedSections.weight && (
            <View style={styles.sectionBody}>
              {weightList.length === 0 ? (
                <EmptyCard icon="trending-up" text={t('health_no_data')} btnText={t('health_record_weight')} onPress={openWeightModal} />
              ) : weightList.map((item) => (
                <View key={item.id} style={styles.weightRow}>
                  <View style={styles.weightValueWrap}>
                    <Text style={[styles.weightValue, { color: themeTextColor }]}>{Number(item.weight).toFixed(2)}</Text>
                    <Text style={[styles.weightUnit, { color: themeSecondaryText }]}>kg</Text>
                  </View>
                  <View style={styles.weightRight}>
                    <Text style={styles.recordTime}>{fmtTime(item.created_at)}</Text>
                    <TouchableOpacity style={styles.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => confirmDelete(t('health_weight_name'), () => deleteWeightRecord(item.id!))}>
                      <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Health Modal */}
      <Modal visible={healthModalVisible} transparent animationType="fade" onRequestClose={() => setHealthModalVisible(false)}>
        <View style={styles.modalOverlay}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboard}><View style={[styles.modalCard, { backgroundColor: themeCardBg }]}>
          <Text style={[styles.modalTitle, { color: themeTextColor }]}>{t('health_add_overview')}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 400 }}>
            <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_symptom_label')}</Text>
            <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder={t('health_symptom_placeholder')} placeholderTextColor={colors.slate400} value={hSymptom} onChangeText={setHSymptom} editable={!saving} />
            <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_severity_label')}</Text>
            <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder={t('health_severity_placeholder')} placeholderTextColor={colors.slate400} value={hSeverity} onChangeText={setHSeverity} editable={!saving} />
            <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_duration_label')}</Text>
            <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder={t('health_duration_placeholder')} placeholderTextColor={colors.slate400} value={hDuration} onChangeText={setHDuration} editable={!saving} />
            <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_treatment_label')}</Text>
            <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder={t('health_treatment_placeholder')} placeholderTextColor={colors.slate400} value={hTreatment} onChangeText={setHTreatment} editable={!saving} />
          </ScrollView>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setHealthModalVisible(false)} disabled={saving}><Text style={styles.modalCancelText}>{t('cancel')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={saveHealth} disabled={saving}>{saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>{t('save')}</Text>}</TouchableOpacity>
          </View>
        </View></KeyboardAvoidingView></View>
      </Modal>

      {/* Medical Modal */}
      <Modal visible={medicalModalVisible} transparent animationType="fade" onRequestClose={closeMedicalModal}>
        <View style={styles.modalOverlay}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboard}><View style={[styles.modalCard, { backgroundColor: themeCardBg }]}>
          <Text style={[styles.modalTitle, { color: themeTextColor }]}>{mEditingId ? t('health_update_medical') : t('health_add_medical')}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 460 }}>
            <TouchableOpacity style={styles.reportUploadBtn} onPress={pickReportImages} disabled={saving || mExtracting}>
              {mExtracting ? <ActivityIndicator color={colors.primary} size="small" /> : <MaterialIcons name="document-scanner" size={20} color={colors.primary} />}
              <Text style={styles.reportUploadText}>{mExtracting ? t('health_report_extracting') : t('health_report_upload')}</Text>
            </TouchableOpacity>
            <Text style={[styles.reportHint, { color: themeSecondaryText }]}>{t('health_report_hint')}</Text>
            {mImagePaths.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                {mImagePaths.map((path) => (
                  <View key={path} style={styles.reportThumbWrap}>
                    {mImageUris[path] ? <Image source={{ uri: mImageUris[path] }} style={styles.reportThumb} /> : <View style={[styles.reportThumb, styles.reportThumbPlaceholder]}><ActivityIndicator size="small" color={colors.slate400} /></View>}
                    <TouchableOpacity style={styles.reportThumbRemove} onPress={() => removeReportImage(path)} disabled={saving || mExtracting} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <MaterialIcons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_visit_date_label')}</Text>
            <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder={t('health_vaccine_next_placeholder')} placeholderTextColor={colors.slate400} value={mVisitDate} onChangeText={(txt) => setMVisitDate(formatDateInput(txt))} keyboardType="numeric" maxLength={10} editable={!saving} />
            <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_clinic_label')}</Text>
            <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder={t('health_clinic_placeholder')} placeholderTextColor={colors.slate400} value={mClinic} onChangeText={setMClinic} editable={!saving} />
            <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_diagnosis_label')}</Text>
            <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder={t('health_diagnosis_placeholder')} placeholderTextColor={colors.slate400} value={mDiagnosis} onChangeText={setMDiagnosis} editable={!saving} />
            <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_treatment_plan_label')}</Text>
            <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder={t('health_treatment_plan_placeholder')} placeholderTextColor={colors.slate400} value={mTreatmentPlan} onChangeText={setMTreatmentPlan} editable={!saving} />
            <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_medication_label')}</Text>
            <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder={t('health_medication_placeholder')} placeholderTextColor={colors.slate400} value={mMedication} onChangeText={setMMedication} editable={!saving} />
            <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_notes_label')}</Text>
            <TextInput style={[styles.modalInput, { height: 72, textAlignVertical: 'top', color: themeTextColor }]} placeholder={t('health_notes_placeholder')} placeholderTextColor={colors.slate400} value={mNotes} onChangeText={setMNotes} editable={!saving} multiline numberOfLines={3} />
          </ScrollView>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={closeMedicalModal} disabled={saving || mExtracting}><Text style={styles.modalCancelText}>{t('cancel')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={saveMedical} disabled={saving || mExtracting}>{saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>{mEditingId ? t('health_update_btn') : t('save')}</Text>}</TouchableOpacity>
          </View>
        </View></KeyboardAvoidingView></View>
      </Modal>

      {/* Vaccine Modal */}
      <Modal visible={vaccineModalVisible} transparent animationType="fade" onRequestClose={() => setVaccineModalVisible(false)}>
        <View style={styles.modalOverlay}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboard}><View style={[styles.modalCard, { backgroundColor: themeCardBg }]}>
          <Text style={[styles.modalTitle, { color: themeTextColor }]}>{t('health_add_vaccine')}</Text>
          <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_vaccine_type_label')}</Text>
          <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder={t('health_vaccine_type_placeholder')} placeholderTextColor={colors.slate400} value={vName} onChangeText={setVName} editable={!saving} />
          <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_vaccine_date_label')}</Text>
          <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.slate400} value={vDate} onChangeText={(txt) => setVDate(formatDateInput(txt))} keyboardType="numeric" maxLength={10} editable={!saving} />
          <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_vaccine_dose_label')}</Text>
          <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder={t('health_vaccine_dose_placeholder')} placeholderTextColor={colors.slate400} value={vDoseNumber} onChangeText={setVDoseNumber} keyboardType="number-pad" editable={!saving} />
          <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_vaccine_next_label')}</Text>
          <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder={t('health_vaccine_next_placeholder')} placeholderTextColor={colors.slate400} value={vNextDate} onChangeText={(txt) => setVNextDate(formatDateInput(txt))} keyboardType="numeric" maxLength={10} editable={!saving} />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setVaccineModalVisible(false)} disabled={saving}><Text style={styles.modalCancelText}>{t('cancel')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={saveVaccine} disabled={saving}>{saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>{t('save')}</Text>}</TouchableOpacity>
          </View>
        </View></KeyboardAvoidingView></View>
      </Modal>

      {/* Weight Modal */}
      <Modal visible={weightModalVisible} transparent animationType="fade" onRequestClose={() => setWeightModalVisible(false)}>
        <View style={styles.modalOverlay}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboard}><View style={[styles.modalCard, { backgroundColor: themeCardBg }]}>
          <Text style={[styles.modalTitle, { color: themeTextColor }]}>{t('health_record_weight')}</Text>
          <Text style={[styles.modalLabel, { color: themeSecondaryText }]}>{t('health_weight_label')}</Text>
          <TextInput style={[styles.modalInput, { color: themeTextColor }]} placeholder={t('health_weight_placeholder')} placeholderTextColor={colors.slate400} value={wValue} onChangeText={setWValue} keyboardType="decimal-pad" editable={!saving} />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setWeightModalVisible(false)} disabled={saving}><Text style={styles.modalCancelText}>{t('cancel')}</Text></TouchableOpacity>
            <TouchableOpacity style={styles.modalSaveBtn} onPress={saveWeight} disabled={saving}>{saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>{t('save')}</Text>}</TouchableOpacity>
          </View>
        </View></KeyboardAvoidingView></View>
      </Modal>
    </SafeAreaView>
  );
}

function EmptyCard({ icon, text, btnText, onPress }: { icon: string; text: string; btnText: string; onPress: () => void }) {
  return (
    <View style={styles.emptyModuleCard}>
      <MaterialIcons name={icon as any} size={28} color="rgba(236,55,19,0.2)" />
      <Text style={styles.emptyModuleTitle}>{text}</Text>
      <TouchableOpacity style={styles.emptyModuleButton} onPress={onPress}>
        <MaterialIcons name="add" size={14} color={colors.primary} />
        <Text style={styles.emptyModuleButtonText}>{btnText}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSubtitle: { fontSize: 14, marginTop: 4 },
  sectionCard: { marginHorizontal: 16, marginTop: 16, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(236,55,19,0.05)', overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  addBtnSmall: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  sectionBody: { paddingHorizontal: 16, paddingBottom: 16 },
  emptyModuleCard: { alignItems: 'center', paddingVertical: 24, borderRadius: 12 },
  emptyModuleTitle: { fontSize: 14, color: colors.slate400, marginTop: 8, marginBottom: 12 },
  emptyModuleButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: colors.primaryLight },
  emptyModuleButtonText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  recordCard: { borderRadius: 12, padding: 14, marginBottom: 10, backgroundColor: 'rgba(128,128,128,0.06)' },
  recordHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  recordSymptom: { fontSize: 15, fontWeight: '700' },
  severityBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(236,55,19,0.1)' },
  severityText: { fontSize: 11, fontWeight: '600', color: colors.primary },
  recordDetail: { fontSize: 13, marginTop: 3 },
  recordTime: { fontSize: 11, color: colors.slate400, marginTop: 8 },
  recordFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  updateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.primaryLight },
  updateBtnText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  deleteBtn: { marginLeft: 10, padding: 4 },
  attachBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.primaryLight },
  attachBadgeText: { fontSize: 11, fontWeight: '600', color: colors.primary },
  reportUploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, backgroundColor: colors.primaryLight },
  reportUploadText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  reportHint: { fontSize: 11, marginTop: 6, textAlign: 'center' },
  reportThumbWrap: { marginRight: 4, paddingTop: 6, paddingRight: 6 },
  reportThumb: { width: 64, height: 64, borderRadius: 8 },
  reportThumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(128,128,128,0.1)' },
  reportThumbRemove: { position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef2f2', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#fecaca' },
  alertText: { fontSize: 13, fontWeight: '600', color: '#dc2626', flex: 1 },
  weightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, padding: 14, marginBottom: 10, backgroundColor: 'rgba(128,128,128,0.06)' },
  weightValueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  weightValue: { fontSize: 22, fontWeight: '800' },
  weightUnit: { fontSize: 14, fontWeight: '600' },
  weightRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalKeyboard: { width: '100%', alignItems: 'center' },
  modalCard: { width: '100%', maxWidth: 420, borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  modalLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  modalInput: { height: 48, backgroundColor: 'rgba(128,128,128,0.06)', borderWidth: 1, borderColor: 'rgba(236,55,19,0.1)', borderRadius: 12, paddingHorizontal: 14, fontSize: 14 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancelBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(128,128,128,0.08)' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: colors.slate600 },
  modalSaveBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  modalSaveText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
