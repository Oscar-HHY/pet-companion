import React, { createContext, useState, useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../services/supabaseClient';
import { getUnreadCommentsCount, getUnreadMessageCount, getPendingFriendRequestCount } from '../services/PetDatabaseService';

const LAST_SEEN_KEY = 'profile_badge_last_seen';

interface BadgeContextValue {
  unreadCount: number;
  /** Unread chat messages count (for Friends tab) */
  unreadMsgCount: number;
  /** Pending incoming friend requests count */
  pendingFriendCount: number;
  /** Call when user opens "我的" tab to clear the badge */
  clearBadge: () => void;
  /** Re-fetch latest visitor/interaction counts */
  refreshBadge: () => Promise<void>;
}

export const BadgeContext = createContext<BadgeContextValue>({
  unreadCount: 0,
  unreadMsgCount: 0,
  pendingFriendCount: 0,
  clearBadge: () => {},
  refreshBadge: async () => {},
});

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [pendingFriendCount, setPendingFriendCount] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  const refreshBadge = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setUserId(null);
        userIdRef.current = null;
        setUnreadCount(0);
        setUnreadMsgCount(0);
        setPendingFriendCount(0);
        return;
      }
      userIdRef.current = user.id;
      setUserId(user.id);

      const lastSeen = await SecureStore.getItemAsync(LAST_SEEN_KEY) || '1970-01-01T00:00:00Z';

      // Count new visitors since last seen
      const { count: visitorCount } = await supabase
        .from('profile_visits')
        .select('*', { count: 'exact', head: true })
        .eq('visited_user_id', user.id)
        .gt('visited_at', lastSeen);

      // Count unread comments on my posts
      let commentCount = 0;
      try {
        commentCount = await getUnreadCommentsCount(user.id);
      } catch {}

      // Count pending incoming friend requests
      let friendReqCount = 0;
      try {
        friendReqCount = await getPendingFriendRequestCount(user.id);
      } catch {}
      setPendingFriendCount(friendReqCount);

      // The "我的" tab badge sums visitors + comments + pending friend requests
      setUnreadCount((visitorCount ?? 0) + commentCount + friendReqCount);

      // Count unread chat messages
      try {
        const msgCount = await getUnreadMessageCount(user.id);
        setUnreadMsgCount(msgCount);
      } catch {}
    } catch (e: any) {
      console.warn('refreshBadge:', e.message);
    }
  }, []);

  const clearBadge = useCallback(async () => {
    setUnreadCount(0);
    try {
      await SecureStore.setItemAsync(LAST_SEEN_KEY, new Date().toISOString());
    } catch (e: any) {
      console.warn('clearBadge storage:', e.message);
    }
  }, []);

  // Refresh on mount and when auth changes
  useEffect(() => {
    refreshBadge();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      refreshBadge();
    });
    return () => subscription.unsubscribe();
  }, [refreshBadge]);

  // Poll every 60 seconds only while the app is in the foreground; refresh once on resume.
  // (Belt-and-suspenders alongside realtime — covers cases where the realtime channel
  //  drops without notifying us.)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      interval = setInterval(refreshBadge, 60_000);
    };
    const stop = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') { refreshBadge(); start(); } else { stop(); }
    });
    return () => { stop(); sub.remove(); };
  }, [refreshBadge]);

  // Subscribe to realtime events for the current user. Any incoming message
  // or friend-request change triggers an immediate badge refresh.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`badge-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter: `receiver_id=eq.${userId}` },
        () => { refreshBadge(); },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships', filter: `receiver_id=eq.${userId}` },
        () => { refreshBadge(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refreshBadge]);

  return (
    <BadgeContext.Provider value={{ unreadCount, unreadMsgCount, pendingFriendCount, clearBadge, refreshBadge }}>
      {children}
    </BadgeContext.Provider>
  );
}
