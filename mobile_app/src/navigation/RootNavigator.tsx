import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import DrawerWrapper from './DrawerNavigator';
import BottomTabNavigator from './BottomTabNavigator';
import { BadgeProvider } from '../context/BadgeContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import AppStoreScreen from '../screens/AppStoreScreen';
import WidgetAssetGeneratorScreen from '../screens/WidgetAssetGeneratorScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import PetProfileScreen from '../screens/PetProfileScreen';
import ChatDetailScreen from '../screens/ChatDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AboutScreen from '../screens/AboutScreen';
import PetAssistantScreen from '../screens/PetAssistantScreen';
import { supabase } from '../services/supabaseClient';
import { colors } from '../theme/colors';
import EulaGate from '../components/EulaGate';

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  MainTabs: undefined;
  AppStore: undefined;
  WidgetAssetGenerator: undefined;
  Settings: undefined;
  About: undefined;
  PetAssistant: undefined;
  /** Stack screen for viewing OTHER users' profiles (on top of tabs) */
  UserProfileView: { targetUserId: string };
  /** Stack screen for viewing OTHER users' pets (on top of tabs) */
  PetProfileView: { targetUserId: string };
  /** Chat detail screen */
  ChatDetail: { friendId: string; friendName: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function MainWithDrawer() {
  return (
    <DrawerWrapper>
      <BottomTabNavigator />
    </DrawerWrapper>
  );
}

export default function RootNavigator() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.backgroundLight }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <BadgeProvider>
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <>
            <Stack.Screen name="MainTabs" component={MainWithDrawer} />
            <Stack.Screen
              name="AppStore"
              component={AppStoreScreen}
              options={{ headerShown: true, title: 'App Store', headerTintColor: colors.primary }}
            />
            <Stack.Screen name="WidgetAssetGenerator" component={WidgetAssetGeneratorScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="About" component={AboutScreen} />
            <Stack.Screen name="PetAssistant" component={PetAssistantScreen} />
            <Stack.Screen name="UserProfileView" component={UserProfileScreen} />
            <Stack.Screen name="PetProfileView" component={PetProfileScreen} />
            <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
      </Stack.Navigator>
      {session && <EulaGate />}
    </NavigationContainer>
    </BadgeProvider>
  );
}
