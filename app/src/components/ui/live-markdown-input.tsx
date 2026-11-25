import { Fragment, type ReactNode } from 'react';
import { Platform, Text, TextInput, type TextInputProps, type TextStyle } from 'react-native';

import { useTheme } from '@/components/theme/context';
import type { ThemeColors } from '@/lib/theme';

/**
 * Markdown notes field that renders as you type.
 *
 * The text is passed to `TextInput` as styled `<Text>` children instead of a
 * plain `value`, so headings grow, `**bold**` goes bold, `` `code` `` gets a
 * code face, checklist items strike through, and so on, while every character
 * stays in place. Keeping the markers (dimmed) rather than hiding them is what
 * keeps the cursor and selection exact.
 */
export function LiveMarkdownInput({
  value,
  onChangeText,
  style,
  ...rest
}: Omit<TextInputProps, 'value' | 'children'> & {
  value: string;
  onChangeText: (value: string) => void;
}) {
  const { colors } = useTheme();
  const lines = value.split('\n');

  return (
    <TextInput
      {...rest}
      multiline
      onChangeText={onChangeText}
      cursorColor={colors.accent}
      selectionColor={Platform.OS === 'ios' ? colors.accent : undefined}
      underlineColorAndroid="transparent"
      style={[
        {
          color: colors.text,
          fontSize: 17,
          lineHeight: 24,
          paddingHorizontal: 0,
          paddingVertical: 4,
          textAlignVertical: 'top',
        },
        style,
      ]}>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {renderLine(line, colors, `l${index}`)}
          {index < lines.length - 1 ? '\n' : null}
        </Fragment>
      ))}
    </TextInput>
  );
}

const HEADING_SIZE: Record<number, number> = { 1: 24, 2: 21, 3: 19 };

function renderLine(line: string, colors: ThemeColors, key: string): ReactNode {
  const dim: TextStyle = { color: colors.text3 };

  // # Heading
  const heading = /^(#{1,3})(\s+)(.*)$/.exec(line);
  if (heading) {
    const level = heading[1].length;
    const size: TextStyle = { fontSize: HEADING_SIZE[level], fontWeight: '700' };
    return (
      <Text key={key} style={size}>
        <Text style={dim}>{heading[1] + heading[2]}</Text>
        {renderInline(heading[3], colors, key)}
      </Text>
    );
  }

  // - [ ] task / - [x] done
  const task = /^(\s*[-*+]\s+)\[([ xX])\](\s+)(.*)$/.exec(line);
  if (task) {
    const done = task[2].toLowerCase() === 'x';
    return (
      <Text key={key}>
        <Text style={dim}>{task[1]}</Text>
        <Text style={{ color: colors.accent, fontWeight: '700' }}>{`[${task[2]}]`}</Text>
        {task[3]}
        <Text
          style={
            done ? { color: colors.text3, textDecorationLine: 'line-through' } : undefined
          }>
          {renderInline(task[4], colors, key)}
        </Text>
      </Text>
    );
  }

  // - bullet / 1. numbered
  const list = /^(\s*(?:[-*+]|\d+[.)])\s+)(.*)$/.exec(line);
  if (list) {
    return (
      <Text key={key}>
        <Text style={{ color: colors.accent, fontWeight: '700' }}>{list[1]}</Text>
        {renderInline(list[2], colors, key)}
      </Text>
    );
  }

  // > quote
  const quote = /^(>\s?)(.*)$/.exec(line);
  if (quote) {
    return (
      <Text key={key} style={{ color: colors.text2, fontStyle: 'italic' }}>
        <Text style={{ color: colors.accent, fontStyle: 'normal', fontWeight: '700' }}>
          {quote[1]}
        </Text>
        {renderInline(quote[2], colors, key)}
      </Text>
    );
  }

  return <Text key={key}>{renderInline(line, colors, key)}</Text>;
}

// Order matters: `**` before `*`, and code spans swallow everything inside.
const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\[[^\]\n]+\]\([^)\n]+\))|(\*[^*\n]+\*)|(_[^_\n]+_)/g;

function renderInline(text: string, colors: ThemeColors, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const dim: TextStyle = { color: colors.text3, fontWeight: '400', fontStyle: 'normal' };
  let cursor = 0;
  let index = 0;
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0;
    if (start > cursor) out.push(text.slice(cursor, start));
    const token = match[0];
    const k = `${key}-${index++}`;

    if (match[1]) {
      out.push(
        <Text
          key={k}
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
            fontSize: 15,
            color: colors.purple,
            backgroundColor: colors.bg2,
          }}>
          {token}
        </Text>
      );
    } else if (match[2] || match[3]) {
      out.push(
        <Text key={k} style={{ fontWeight: '700' }}>
          <Text style={dim}>{token.slice(0, 2)}</Text>
          {token.slice(2, -2)}
          <Text style={dim}>{token.slice(-2)}</Text>
        </Text>
      );
    } else if (match[4]) {
      out.push(
        <Text key={k}>
          <Text style={dim}>~~</Text>
          <Text style={{ textDecorationLine: 'line-through', color: colors.text2 }}>
            {token.slice(2, -2)}
          </Text>
          <Text style={dim}>~~</Text>
        </Text>
      );
    } else if (match[5]) {
      const split = token.indexOf('](');
      out.push(
        <Text key={k}>
          <Text style={dim}>[</Text>
          <Text style={{ color: colors.accent, textDecorationLine: 'underline' }}>
            {token.slice(1, split)}
          </Text>
          <Text style={dim}>{token.slice(split)}</Text>
        </Text>
      );
    } else {
      out.push(
        <Text key={k} style={{ fontStyle: 'italic' }}>
          <Text style={dim}>{token[0]}</Text>
          {token.slice(1, -1)}
          <Text style={dim}>{token.slice(-1)}</Text>
        </Text>
      );
    }
    cursor = start + token.length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}
