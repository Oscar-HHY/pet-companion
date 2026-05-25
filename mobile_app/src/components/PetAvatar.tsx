import React from 'react';
import { View, Image, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useT } from '../i18n';

export type PetStatus = 'idle' | 'eating' | 'happy' | 'sleeping' | 'playing' | 'online';

export const STATUS_CONFIG: Record<PetStatus, { label: string; icon: string; color: string }> = {
  idle: { label: '待机中', icon: 'pets', color: colors.slate400 },
  online: { label: '在线中', icon: 'wifi', color: colors.green600 },
  eating: { label: '吃饭中', icon: 'restaurant', color: colors.orange600 },
  happy: { label: '摸鱼中', icon: 'sentiment-very-satisfied', color: colors.primary },
  sleeping: { label: '睡觉中', icon: 'bedtime', color: colors.blue600 },
  playing: { label: '玩耍中', icon: 'sports-esports', color: colors.green600 },
};

export const ALL_STATUSES: PetStatus[] = ['idle', 'online', 'happy', 'eating', 'sleeping', 'playing'];

interface PetAvatarProps {
  imageUrl: string | null;
  status?: PetStatus;
  size?: number;
  onStatusPress?: () => void;
  isVisitor?: boolean;
}

export default function PetAvatar({ imageUrl, status = 'idle', size = 160, onStatusPress, isVisitor = false }: PetAvatarProps) {
  const t = useT();
  const config = STATUS_CONFIG[status];
  const borderRadius = size / 2;

  const badge = (
    <View style={[styles.statusBadge, { backgroundColor: config.color }]}>
      <MaterialIcons name={config.icon as any} size={12} color="#fff" />
      <Text style={styles.statusText}>{t(`status_${status}`)}</Text>
    </View>
  );

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={[styles.image, { width: size, height: size, borderRadius }]}
        />
      ) : (
        <View style={[styles.placeholder, { width: size, height: size, borderRadius }]}>
          <MaterialIcons name="pets" size={size * 0.35} color="rgba(236,55,19,0.3)" />
          <Text style={styles.placeholderText}>{isVisitor ? '暂无照片' : '上传宠物照片'}</Text>
        </View>
      )}
      {onStatusPress ? (
        <TouchableOpacity activeOpacity={0.7} onPress={onStatusPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          {badge}
        </TouchableOpacity>
      ) : badge}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  image: { borderWidth: 4, borderColor: colors.white },
  placeholder: {
    backgroundColor: colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(236,55,19,0.15)', borderStyle: 'dashed',
  },
  placeholderText: { fontSize: 12, color: 'rgba(236,55,19,0.5)', marginTop: 6 },
  statusBadge: {
    position: 'absolute', bottom: 4, right: 4,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12,
    borderWidth: 2, borderColor: colors.white,
  },
  statusText: { fontSize: 10, fontWeight: '600', color: '#fff' },
});
