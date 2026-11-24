import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useImportConfirm } from '@/components/tasks/import-confirm';
import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { GlassIconButton } from '@/components/ui/glass-button';
import { planFromText } from '@/lib/backup';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { EXPRESSIVE } from '@/lib/motion';
import { FrameCollector, planFromSharePayload } from '@/lib/qr-share';
import { haptics } from '@/lib/haptics';
import { Text, View } from '@/tw';

const IOS = Platform.OS === 'ios';

/**
 * Scans a QR code from Patchwork's Share (one code, or several for a long
 * list), or any code holding a Markdown checklist, and imports it.
 */
/** The scan frame. It gives a springy bump each time another code is read. */
function Viewfinder({ pulse, color }: { pulse: number; color: string }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (pulse === 0) return;
    scale.set(withSequence(withTiming(1.06, { duration: 90 }), withSpring(1, EXPRESSIVE.pressRelease)));
  }, [pulse, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View style={[{ width: 240, height: 240, borderRadius: 32, borderWidth: 3, borderColor: color }, style]} />
  );
}

export default function ScanScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const handled = useRef(false);
  const frames = useRef(new FrameCollector());
  const [progress, setProgress] = useState<{ have: number; total: number } | null>(null);
  const importer = useImportConfirm(
    () => router.back(),
    // Backed out or failed: scan again.
    () => {
      handled.current = false;
    }
  );

  function onScan(data: string) {
    if (handled.current) return;
    // Long lists come as several codes; keep scanning until all are in.
    const { complete, progress: next } = frames.current.add(data);
    if (next) {
      haptics.tap();
      setProgress(next);
    }
    if (!complete) return;
    try {
      const plan = planFromSharePayload(complete) ?? planFromText(complete, 'Scanned');
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
      <Stack.Screen
        options={{ headerShown: !IOS, title: 'Scan QR code', headerTransparent: true, headerTintColor: '#fff' }}
      />
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
          <Viewfinder pulse={progress?.have ?? 0} color={colors.accent} />
        </View>
      ) : null}
      {IOS ? (
        // iOS: a full-screen camera modal closes with a round glass button,
        // the same control as the app's other bar buttons.
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, height: 44, justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center' }}>Scan QR code</Text>
          <GlassIconButton
            sf="xmark"
            icon="close"
            label="Close"
            symbolColor="#fff"
            onPress={() => router.back()}
            style={{ position: 'absolute', left: 0 }}
          />
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 24, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 15, textAlign: 'center' }}>
          {message ??
            (progress && progress.have < progress.total
              ? `Got ${progress.have} of ${progress.total} codes. Keep pointing at the screen.`
              : 'Point at a Patchwork QR code')}
        </Text>
      </View>
      {importer.element}
    </View>
  );
}
