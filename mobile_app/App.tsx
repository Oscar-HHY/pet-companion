import { StatusBar } from 'expo-status-bar';
import { SettingsProvider } from './src/context/SettingsContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SettingsProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </SettingsProvider>
  );
}
