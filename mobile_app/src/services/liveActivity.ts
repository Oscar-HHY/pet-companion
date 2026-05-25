import { NativeModules, Platform } from 'react-native';

export type ActivityType = 'walk' | 'bath' | 'play';

export interface LiveActivityResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

interface CompanionActivityModuleType {
  // 所有参数打包为 JSON 字符串 → 1 个 string 参数 + Promise
  // 彻底绕过 TurboModule interop 对参数数量的限制
  startActivity(payloadJson: string): Promise<Record<string, unknown>>;
  updateActivity(): Promise<Record<string, unknown>>;
  stopActivity(): Promise<Record<string, unknown>>;
}

const { CompanionActivityModule } = NativeModules;

// Live Activities require iOS 16.2+. Older iOS 16.0 / 16.1 builds will crash if we call ActivityKit.
function isLiveActivitySupported(): boolean {
  if (Platform.OS !== 'ios') return false;
  const v = String(Platform.Version || '');
  const [major, minor] = v.split('.').map((n) => parseInt(n, 10) || 0);
  if (major > 16) return true;
  if (major === 16 && minor >= 2) return true;
  return false;
}

type ModuleStatus =
  | { ok: true; module: CompanionActivityModuleType }
  | { ok: false; reason: string };

function getModuleStatus(): ModuleStatus {
  if (Platform.OS !== 'ios') {
    return { ok: false, reason: '仅支持 iOS' };
  }
  if (!isLiveActivitySupported()) {
    return {
      ok: false,
      reason: `iOS 版本不足 (检测到 ${String(Platform.Version)}, 需要 16.2+)`,
    };
  }
  if (!CompanionActivityModule) {
    return {
      ok: false,
      reason: '原生模块 CompanionActivityModule 未注册 — 请彻底重新构建 Xcode 项目 (Cmd+Shift+K → Cmd+R)',
    };
  }
  return { ok: true, module: CompanionActivityModule as CompanionActivityModuleType };
}

/**
 * 启动灵动陪伴舱 Live Activity。
 * @param petName        宠物名称
 * @param activityType   活动类型: 'walk' | 'bath' | 'play'
 * @param pixelAvatarUrl 像素头像 URL（来自 Supabase，Swift 侧下载压缩）
 */
export async function startActivity(
  petName: string,
  activityType: ActivityType,
  pixelAvatarUrl?: string | null
): Promise<LiveActivityResult> {
  const status = getModuleStatus();
  if (!status.ok) return { success: false, error: status.reason };
  try {
    const payload = JSON.stringify({
      petName,
      activityType,
      pixelAvatarUrl: pixelAvatarUrl || '',
    });
    const data = await status.module.startActivity(payload);
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}

export async function updateActivity(): Promise<LiveActivityResult> {
  const status = getModuleStatus();
  if (!status.ok) return { success: false, error: status.reason };
  try {
    const data = await status.module.updateActivity();
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}

export async function stopActivity(): Promise<LiveActivityResult> {
  const status = getModuleStatus();
  if (!status.ok) return { success: false, error: status.reason };
  try {
    const data = await status.module.stopActivity();
    return { success: true, data };
  } catch (e: any) {
    console.warn('[LiveActivity] stopActivity:', e?.message);
    return { success: false, error: e?.message ?? String(e) };
  }
}

export const COMPANION_ACTIONS: Array<{
  type: ActivityType;
  label: string;
  emoji: string;
  color: string;
}> = [
  { type: 'walk', label: '散步', emoji: '🦮', color: '#4CAF50' },
  { type: 'bath', label: '洗澡', emoji: '🛁', color: '#2196F3' },
  { type: 'play', label: '陪玩', emoji: '🎾', color: '#FF9800' },
];

/** @deprecated 请改用 COMPANION_ACTIONS */
export const ACTIVITY_DISPLAY: Record<ActivityType, { label: string; emoji: string }> = {
  walk: { label: '散步', emoji: '🦮' },
  bath: { label: '洗澡', emoji: '🛁' },
  play: { label: '陪玩', emoji: '🎾' },
};
