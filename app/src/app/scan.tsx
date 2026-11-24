import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useImportConfirm } from '@/components/tasks/import-confirm';
import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { planFromText } from '@/lib/backup';
import { FrameCollector, planFromKarui } from '@/lib/karui-qr';
import { haptics } from '@/lib/haptics';
import { Text, View } from '@/tw';

/**
 * Scans a QR code from Patchwork's Share or from Karui (same format, one or
 * several codes), or any code holding a Markdown checklist, and imports it.
 */
export default function ScanScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const handled = useRef(false);
  const frames = useRef(new FrameCollector());
  const [progress, setProgress] = useState<{ have: number; total: number } | null>(null);
  const importer = useImportConfirm(() => router.back());

  function onScan(data: string) {
    if (handled.current) return;
    // Karui splits long lists over several codes; keep scanning until all are in.
    const { complete, progress: next } = frames.current.add(data);
    if (next) setProgress(next);
    if (!complete) return;
    try {
      const plan = planFromKarui(complete) ?? planFromText(complete, 'Scanned');
      if (plan.total === 0) {
        setMessage("That code doesn't hold any to-dos.");
        return;
      }
      handled.current = true;
      haptics.success();
      importer.confirm(plan);
    } catch {
      setMessage("That code doesn't hold any to-dos.");
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Stack.Screen options={{ headerShown: true, title: 'Scan QR code', headerTransparent: true, headerTintColor: '#fff' }} />
      {permission?.granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(result) => onScan(result.data)}
        />
      ) : (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text style={{ color: '#fff', fontSize: 17, textAlign: 'center' }}>
            Patchwork needs the camera to read QR codes. Nothing is recorded or uploaded.
          </Text>
          <Button label="Allow camera" icon="camera-outline" onPress={() => void requestPermission()} />
        </View>
      )}
      {permission?.granted ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={{ width: 240, height: 240, borderRadius: 32, borderWidth: 3, borderColor: colors.accent }} />
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 24, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 15, textAlign: 'center' }}>
          {message ??
            (progress && progress.have < progress.total
              ? `Got ${progress.have} of ${progress.total} codes. Keep pointing at the screen.`
              : 'Point at a Patchwork or Karui QR code')}
        </Text>
      </View>
      {importer.element}
    </View>
  );
}
