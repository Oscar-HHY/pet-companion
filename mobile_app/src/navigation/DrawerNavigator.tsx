import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Animated, Dimensions, StyleSheet,
  TouchableWithoutFeedback,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { supabase } from '../services/supabaseClient';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.75;

interface Props {
  children: React.ReactNode;
}

export const DrawerContext = React.createContext<{
  open: () => void;
  close: () => void;
}>({ open: () => {}, close: () => {} });

export default function DrawerWrapper({ children }: Props) {
  const [visible, setVisible] = useState(false);
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const navigation = useNavigation<any>();
  const { themeCardBg, themeTextColor, isDark } = useSettings();
  const t = useT();

  const open = useCallback(() => {
    setVisible(true);
    Animated.timing(translateX, {
      toValue: 0, duration: 250, useNativeDriver: true,
    }).start();
  }, [translateX]);

  const close = useCallback(() => {
    Animated.timing(translateX, {
      toValue: -DRAWER_WIDTH, duration: 200, useNativeDriver: true,
    }).start(() => setVisible(false));
  }, [translateX]);

  const handleHome = () => {
    close();
    // Navigate to the PetProfile tab within MainTabs
    navigation.dispatch(
      CommonActions.navigate({
        name: 'MainTabs',
        params: {
          screen: 'PetProfile',
          params: { targetUserId: undefined },
        },
      }),
    );
  };

  const handleSettings = () => {
    close();
    navigation.navigate('Settings');
  };

  const handleAbout = () => {
    close();
    navigation.navigate('About');
  };

  const handleLogout = () => {
    close();
    supabase.auth.signOut();
  };

  return (
    <DrawerContext.Provider value={{ open, close }}>
      <View style={{ flex: 1 }}>
        {children}

        {/* Overlay */}
        {visible && (
          <TouchableWithoutFeedback onPress={close}>
            <View style={styles.overlay} />
          </TouchableWithoutFeedback>
        )}

        {/* Drawer Panel */}
        {visible && (
          <Animated.View style={[styles.drawer, { backgroundColor: isDark ? '#1e1e1e' : colors.softCream, transform: [{ translateX }] }]}>
            <View style={styles.drawerHeader}>
              <MaterialIcons name="pets" size={32} color={colors.primary} />
              <Text style={[styles.drawerTitle, { color: isDark ? '#f1f5f9' : colors.warmWood }]}>{t('drawer_title')}</Text>
            </View>

            <View style={styles.drawerMenu}>
              <TouchableOpacity style={styles.menuItem} onPress={handleHome}>
                <MaterialIcons name="home" size={22} color={isDark ? '#f1f5f9' : colors.warmWood} />
                <Text style={[styles.menuText, { color: isDark ? '#f1f5f9' : colors.warmWood }]}>{t('drawer_home')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={handleSettings}>
                <MaterialIcons name="settings" size={22} color={isDark ? '#f1f5f9' : colors.warmWood} />
                <Text style={[styles.menuText, { color: isDark ? '#f1f5f9' : colors.warmWood }]}>{t('drawer_settings')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.menuItem} onPress={handleAbout}>
                <MaterialIcons name="info-outline" size={22} color={isDark ? '#f1f5f9' : colors.warmWood} />
                <Text style={[styles.menuText, { color: isDark ? '#f1f5f9' : colors.warmWood }]}>{t('drawer_about')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.drawerFooter}>
              <TouchableOpacity style={styles.logoutItem} onPress={handleLogout}>
                <MaterialIcons name="logout" size={22} color={colors.primary} />
                <Text style={styles.logoutText}>{t('drawer_logout')}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}
      </View>
    </DrawerContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    zIndex: 10,
  },
  drawer: {
    position: 'absolute', top: 0, bottom: 0, left: 0,
    width: DRAWER_WIDTH, backgroundColor: colors.softCream,
    zIndex: 20, paddingTop: 60, paddingHorizontal: 20,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 10,
  },
  drawerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(154,89,76,0.1)',
  },
  drawerTitle: { fontSize: 20, fontWeight: '700', color: colors.warmWood },
  drawerMenu: { marginTop: 20 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14,
  },
  menuText: { fontSize: 15, fontWeight: '600', color: colors.warmWood },
  drawerFooter: {
    position: 'absolute', bottom: 40, left: 20, right: 20,
    borderTopWidth: 1, borderTopColor: 'rgba(154,89,76,0.1)', paddingTop: 16,
  },
  logoutItem: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoutText: { fontSize: 15, fontWeight: '600', color: colors.primary },
});
