import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable } from 'react-native';

import { ocrUploadImage } from '@/api/ai';
import { ApiError } from '@/api/client';
import { Icon } from '@/components/ui/icon';
import { useHealth } from '@/hooks/use-health';
import { useTaskLists } from '@/hooks/use-tasks';
import { useAiStagingStore } from '@/stores/ai-staging-store';
import { ScrollView, Text, View, useCSSVariable } from '@/tw';

export default function AiImportScreen() {
  const blue = useCSSVariable('--sf-blue');
  const purple = useCSSVariable('--sf-purple');
  const [busy, setBusy] = useState(false);

  const healthQuery = useHealth();
  const listsQuery = useTaskLists();
  const setStaged = useAiStagingStore((s) => s.setStaged);

  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);
  const geminiReady = healthQuery.data?.gemini_configured ?? true;

  async function pickAndParse(source: 'camera' | 'library') {
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', `Allow ${source} access to import tasks from an image.`);
        return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });

      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];

      setBusy(true);
      const response = await ocrUploadImage({
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
        fileName: asset.fileName ?? undefined,
        availableLists: lists,
        availableTags: [],
      });

      if (response.tasks.length === 0) {
        Alert.alert('Nothing found', 'The AI did not detect any tasks in that image.');
        return;
      }
      setStaged(response.tasks);
      router.push('/ai/review');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Could not parse the image.';
      Alert.alert('Import failed', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      className="bg-sf-bg flex-1"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-6 px-4 py-6">
      <View className="items-center gap-3 py-6">
        <Icon name="sparkles" size={44} color={purple as string} />
        <Text className="text-sf-text text-center text-xl font-semibold">
          Import tasks from an image
        </Text>
        <Text className="text-sf-text-2 px-6 text-center text-base">
          Snap a handwritten note or screenshot. Gemini extracts tasks, and you review and edit
          everything before anything is saved.
        </Text>
      </View>

      {!geminiReady ? (
        <View
          className="bg-sf-bg-2 flex-row items-center gap-2 rounded-xl px-3 py-3"
          style={{ borderCurve: 'continuous' }}>
          <Icon name="exclamationmark.triangle" size={18} color={blue as string} />
          <Text className="text-sf-text-2 flex-1 text-sm">
            Gemini is not configured on the proxy. Importing will fail until GEMINI_API_KEY is set.
          </Text>
        </View>
      ) : null}

      {busy ? (
        <View className="items-center gap-3 py-6">
          <ActivityIndicator />
          <Text className="text-sf-text-2">Reading your image…</Text>
        </View>
      ) : (
        <View className="gap-3">
          {Platform.OS !== 'web' ? (
            <ActionButton
              icon="camera"
              label="Take a photo"
              onPress={() => pickAndParse('camera')}
            />
          ) : null}
          <ActionButton
            icon="photo"
            label="Choose from library"
            onPress={() => pickAndParse('library')}
            secondary
          />
        </View>
      )}
    </ScrollView>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  secondary,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  const white = '#ffffff';
  const blue = useCSSVariable('--sf-blue');
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View
        className={`flex-row items-center justify-center gap-2 rounded-xl py-3.5 ${secondary ? 'bg-sf-bg-2' : 'bg-sf-blue'}`}
        style={{ borderCurve: 'continuous' }}>
        <Icon name={icon as never} size={20} color={secondary ? (blue as string) : white} />
        <Text className={`text-base font-semibold ${secondary ? 'text-sf-blue' : 'text-white'}`}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
