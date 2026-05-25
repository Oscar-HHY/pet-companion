import React, { useContext } from 'react';
import { TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { DrawerContext } from './DrawerNavigator';
import { BadgeContext } from '../context/BadgeContext';
import { useSettings } from '../context/SettingsContext';
import { useT } from '../i18n';
import PetProfileScreen from '../screens/PetProfileScreen';
import HealthScreen from '../screens/HealthScreen';
import CommunityScreen from '../screens/CommunityScreen';
import MemoryPalaceScreen from '../screens/MemoryPalaceScreen';
import FriendsScreen from '../screens/FriendsScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import { colors } from '../theme/colors';

export type BottomTabParamList = {
  PetProfile: { targetUserId?: string } | undefined;
  Health: undefined;
  Community: undefined;
  MemoryPalace: undefined;
  Friends: undefined;
  UserProfile: { targetUserId?: string } | undefined;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

function HamburgerButton() {
  const { open } = useContext(DrawerContext);
  const { isDark } = useSettings();
  return (
    <TouchableOpacity onPress={open} style={{ marginLeft: 16 }}>
      <Ionicons name="menu" size={26} color={isDark ? '#f1f5f9' : colors.warmWood} />
    </TouchableOpacity>
  );
}

export default function BottomTabNavigator() {
  const { unreadCount, unreadMsgCount } = useContext(BadgeContext);
  const { themeBackground, isDark, themeTextColor, themeCardBg } = useSettings();
  const t = useT();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        headerLeft: () => <HamburgerButton />,
        headerStyle: { backgroundColor: themeBackground, elevation: 0, shadowOpacity: 0 },
        headerTitleStyle: { color: isDark ? '#f1f5f9' : colors.warmWood, fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: isDark ? '#94a3b8' : colors.slate400,
        tabBarStyle: {
          backgroundColor: themeCardBg,
          borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(226,232,240,0.6)',
        },
      }}
    >
      <Tab.Screen
        name="PetProfile"
        component={PetProfileScreen}
        options={{
          title: t('tab_pet'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="pets" size={size} color={color} />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            navigation.setParams({ targetUserId: undefined });
          },
        })}
      />
      <Tab.Screen
        name="Health"
        component={HealthScreen}
        options={{
          title: t('tab_health'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="monitor-heart" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Community"
        component={CommunityScreen}
        options={{
          title: t('tab_community'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="groups" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="MemoryPalace"
        component={MemoryPalaceScreen}
        options={{
          title: t('tab_memory'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="castle" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Friends"
        component={FriendsScreen}
        options={{
          title: t('tab_friends'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="chat" size={size} color={color} />
          ),
          tabBarBadge: unreadMsgCount > 0 ? unreadMsgCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 10 },
        }}
      />
      <Tab.Screen
        name="UserProfile"
        component={UserProfileScreen}
        options={{
          title: t('tab_me'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="person" size={size} color={color} />
          ),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 10 },
        }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            navigation.setParams({ targetUserId: undefined });
          },
        })}
      />
    </Tab.Navigator>
  );
}
