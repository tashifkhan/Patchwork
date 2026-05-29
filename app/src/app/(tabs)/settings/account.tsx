import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { ServerTypeMenu } from '@/components/settings/server-type-menu';
import { useTheme } from '@/components/theme/context';
import { NativeAlert } from '@/components/ui/native-alert';
import {
  deleteAccount,
  getAccount,
  saveAccount,
  type ServerType,
} from '@/lib/credentials';
import { ScrollView, Text, TextInput, View } from '@/tw';

export default function AccountEditor() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [serverType, setServerType] = useState<ServerType>('nextcloud');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [removeVisible, setRemoveVisible] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    getAccount(id).then((account) => {
      if (!active || !account) return;
      setDisplayName(account.displayName);
      setUsername(account.username);
      setPassword(account.appPassword);
      setBaseUrl(account.baseUrl);
      setServerType(account.serverType);
    });
    return () => {
      active = false;
    };
  }, [id]);

  async function handleSave() {
    try {
      await saveAccount({ id, displayName, baseUrl, username, appPassword: password, serverType });
      queryClient.invalidateQueries();
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Try again.');
    }
  }

  function handleDelete() {
    if (!id) return;
    setRemoveVisible(true);
  }

  async function confirmRemove() {
    if (!id) return;
    setRemoveVisible(false);
    await deleteAccount(id);
    queryClient.invalidateQueries();
    router.back();
  }

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: colors.bg }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 26 }}>
      <Stack.Screen
        options={{
          title: isNew ? 'Add account' : displayName || 'Account',
          headerRight: () => (
            <View className="flex-row items-center gap-5">
              <Pressable onPress={handleSave} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <MaterialCommunityIcons name="content-save-outline" size={24} color={colors.accent} />
              </Pressable>
              {!isNew ? (
                <Pressable onPress={handleDelete} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                  <MaterialCommunityIcons name="trash-can-outline" size={24} color={colors.red} />
                </Pressable>
              ) : null}
            </View>
          ),
        }}
      />

      <Field label="Display name">
        <Underlined value={displayName} onChangeText={setDisplayName} placeholder="My calendar" />
      </Field>

      <Field label="User">
        <Underlined value={username} onChangeText={setUsername} placeholder="username" />
      </Field>

      <Field label="Password">
        <View className="flex-row items-center">
          <Underlined
            value={password}
            onChangeText={setPassword}
            placeholder="App password"
            secureTextEntry={!showPassword}
            flex
          />
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
            <MaterialCommunityIcons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={colors.text2}
            />
          </Pressable>
        </View>
      </Field>

      <Field label="URL">
        <Underlined
          value={baseUrl}
          onChangeText={setBaseUrl}
          placeholder="https://cloud.example.com"
          keyboardType="url"
        />
      </Field>

      <Field label="Server type">
        <ServerTypeMenu value={serverType} onChange={setServerType} />
      </Field>

      <NativeAlert
        visible={removeVisible}
        title="Remove account"
        message="Remove this account and its sync from this device?"
        confirmLabel="Remove"
        dismissLabel="Cancel"
        onDismiss={() => setRemoveVisible(false)}
        onConfirm={confirmRemove}
      />
      <NativeAlert
        visible={errorMessage != null}
        title="Could not save account"
        message={errorMessage ?? ''}
        onDismiss={() => setErrorMessage(null)}
      />
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-sf-text-2 text-sm">{label}</Text>
      {children}
    </View>
  );
}

function Underlined({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
  flex,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'url';
  secureTextEntry?: boolean;
  flex?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType={keyboardType}
      secureTextEntry={secureTextEntry}
      placeholder={placeholder}
      placeholderTextColor={colors.text3}
      className={`text-sf-text pb-2 text-lg ${flex ? 'flex-1' : ''}`}
      style={{ borderBottomWidth: 1, borderColor: colors.separator }}
    />
  );
}
