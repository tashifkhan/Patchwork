import { Image } from 'expo-image';
import qrcodeFactory from 'qrcode-generator';
import { useMemo } from 'react';

import { Text, View } from '@/tw';

// UTF-8, so titles with accents or emoji scan back unchanged. Set directly:
// Metro loads the package's ESM build, which has no `stringToBytesFuncs`,
// but both builds read `stringToBytes` when encoding.
// eslint-disable-next-line import/no-named-as-default-member -- the factory's own encoder hook
qrcodeFactory.stringToBytes = (text: string) => Array.from(new TextEncoder().encode(text));

/** About what a phone camera still reads reliably at error level L. */
export const QR_MAX_BYTES = 2_300;

export function qrFits(text: string) {
  return new TextEncoder().encode(text).length <= QR_MAX_BYTES;
}

/**
 * A QR code of `value`, drawn black on white whatever the theme (scanners
 * read inverted codes badly). Shows a message instead when the text is too
 * long for one code.
 */
export function QrCode({ value, size = 260 }: { value: string; size?: number }) {
  const uri = useMemo(() => {
    if (!qrFits(value)) return null;
    try {
      const code = qrcodeFactory(0, 'L');
      code.addData(value, 'Byte');
      code.make();
      return code.createDataURL(8, 2);
    } catch {
      return null;
    }
  }, [value]);

  if (!uri) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text className="text-sf-text-2 text-center text-sm">
          Too much for one QR code. Share it as text instead, or pick fewer to-dos.
        </Text>
      </View>
    );
  }
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="QR code"
      style={{ padding: 12, borderRadius: 20, borderCurve: 'continuous', backgroundColor: '#FFFFFF' }}>
      <Image source={{ uri }} style={{ width: size, height: size }} contentFit="contain" />
    </View>
  );
}
