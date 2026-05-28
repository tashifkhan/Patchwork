import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable } from 'react-native';

import { useTheme } from '@/components/theme/context';
import { formatDateTime } from '@/lib/format';
import { Text, View } from '@/tw';

interface DateFieldProps {
  label: string;
  iconName: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  value: string | null;
  onChange: (iso: string | null) => void;
}

type AndroidStage = 'date' | 'time' | null;

export function DateField({ label, iconName, value, onChange }: DateFieldProps) {
  const { colors } = useTheme();
  const [showIos, setShowIos] = useState(false);
  const [stage, setStage] = useState<AndroidStage>(null);
  const [draft, setDraft] = useState<Date | null>(null);
  const date = value ? new Date(value) : null;

  function openPicker() {
    if (Platform.OS === 'ios') {
      setShowIos((prev) => !prev);
      return;
    }
    // Android: native Material 3 dialogs, date first then time.
    setDraft(date ?? new Date());
    setStage('date');
  }

  function handleAndroidDate(_event: unknown, selected: Date) {
    const base = draft ?? new Date();
    const next = new Date(base);
    next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    setDraft(next);
    setStage('time');
  }

  function handleAndroidTime(_event: unknown, selected: Date) {
    const base = draft ?? new Date();
    const next = new Date(base);
    next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setStage(null);
    onChange(next.toISOString());
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={openPicker}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flex: 1 })}>
          <View className="flex-row items-center gap-3 py-1">
            <MaterialCommunityIcons name={iconName} size={20} color={colors.accent} />
            <View>
              <Text className="text-sf-text text-base">{label}</Text>
              {date ? <Text className="text-sf-text-2 text-sm">{formatDateTime(value)}</Text> : null}
            </View>
          </View>
        </Pressable>

        {date ? (
          <Pressable
            onPress={() => onChange(null)}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <MaterialCommunityIcons name="close-circle" size={20} color={colors.red} />
          </Pressable>
        ) : null}
      </View>

      {Platform.OS === 'ios' && showIos ? (
        <DateTimePicker
          mode="datetime"
          display="inline"
          accentColor={colors.accent}
          value={date ?? new Date()}
          onValueChange={(_event, selected) => onChange(selected.toISOString())}
        />
      ) : null}

      {Platform.OS === 'android' && stage === 'date' ? (
        <DateTimePicker
          mode="date"
          presentation="dialog"
          accentColor={colors.accent}
          value={draft ?? new Date()}
          onValueChange={handleAndroidDate}
          onDismiss={() => setStage(null)}
        />
      ) : null}

      {Platform.OS === 'android' && stage === 'time' ? (
        <DateTimePicker
          mode="time"
          presentation="dialog"
          accentColor={colors.accent}
          value={draft ?? new Date()}
          onValueChange={handleAndroidTime}
          onDismiss={() => setStage(null)}
        />
      ) : null}
    </View>
  );
}
