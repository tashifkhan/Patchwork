import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { formatDateTime } from '@/lib/format';
import { Text, View, useCSSVariable } from '@/tw';

interface DateFieldProps {
  label: string;
  iconName: string;
  value: string | null;
  onChange: (iso: string | null) => void;
}

export function DateField({ label, iconName, value, onChange }: DateFieldProps) {
  const [show, setShow] = useState(false);
  const red = useCSSVariable('--sf-red');
  const blue = useCSSVariable('--sf-blue');
  const date = value ? new Date(value) : null;

  function handlePickerChange(_event: unknown, selected?: Date) {
    // Android dialog dismisses itself; iOS inline picker stays open.
    if (Platform.OS !== 'ios') setShow(false);
    if (selected) onChange(selected.toISOString());
  }

  const showInlineIos = Platform.OS === 'ios' && show;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => setShow((prev) => !prev)}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flex: 1 })}>
          <View className="flex-row items-center gap-3 py-1">
            <Icon name={iconName as never} size={20} color={blue as string} />
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
            <Icon name="xmark.circle.fill" size={20} color={red as string} />
          </Pressable>
        ) : null}
      </View>

      {showInlineIos ? (
        <DateTimePicker
          mode="datetime"
          display="inline"
          value={date ?? new Date()}
          onChange={handlePickerChange}
        />
      ) : null}

      {Platform.OS === 'android' && show ? (
        <DateTimePicker
          mode="date"
          value={date ?? new Date()}
          onChange={handlePickerChange}
        />
      ) : null}
    </View>
  );
}
