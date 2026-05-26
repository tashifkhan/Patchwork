import { memo, useMemo } from 'react';
import { Linking, StyleSheet } from 'react-native';

import { Text, View, useCSSVariable } from '@/tw';

type InlinePart =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; label: string; url: string };

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'hr' };

function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /(`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    const token = match[0];
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    if (link) {
      parts.push({ type: 'link', label: link[1], url: link[2] });
    } else {
      parts.push({ type: 'code', value: token.slice(1, -1) });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return parts;
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: 'code', text: code.join('\n') });
      index += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        quote.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'blockquote', text: quote.join('\n') });
      continue;
    }

    const listMatch = /^([-*]|\d+[.)])\s+(.+)$/.exec(trimmed);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = /^([-*]|\d+[.)])\s+(.+)$/.exec(lines[index].trim());
        if (!item || /\d/.test(item[1]) !== ordered) break;
        items.push(item[2]);
        index += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

export const MarkdownViewer = memo(function MarkdownViewer({ markdown }: { markdown: string }) {
  const text = useCSSVariable('--sf-text');
  const textSecondary = useCSSVariable('--sf-text-2');
  const blue = useCSSVariable('--sf-blue');
  const bg2 = useCSSVariable('--sf-bg-2');
  const separator = useCSSVariable('--sf-separator');

  const blocks = useMemo(() => parseBlocks(markdown), [markdown]);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        block: { marginBottom: 8 },
        body: { color: text, fontSize: 16, lineHeight: 24 },
        heading1: { color: text, fontSize: 24, fontWeight: '700', lineHeight: 30, marginTop: 8 },
        heading2: { color: text, fontSize: 20, fontWeight: '700', lineHeight: 26, marginTop: 8 },
        heading3: { color: text, fontSize: 18, fontWeight: '600', lineHeight: 24, marginTop: 8 },
        link: { color: blue },
        blockquote: {
          backgroundColor: bg2,
          borderColor: separator,
          borderLeftWidth: 3,
          borderRadius: 6,
          marginBottom: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
        },
        inlineCode: { backgroundColor: bg2, color: text, borderRadius: 4, fontFamily: 'Menlo', paddingHorizontal: 4 },
        codeBlock: { backgroundColor: bg2, borderRadius: 8, color: text, fontFamily: 'Menlo', fontSize: 14, lineHeight: 20, marginBottom: 8, padding: 12 },
        hr: { backgroundColor: separator, height: StyleSheet.hairlineWidth, marginVertical: 8 },
        listItem: { flexDirection: 'row', gap: 8, marginBottom: 4 },
        listMarker: { color: textSecondary, fontSize: 16, lineHeight: 24, minWidth: 20, textAlign: 'right' },
        listText: { color: text, flex: 1, fontSize: 16, lineHeight: 24 },
      }),
    [text, textSecondary, blue, bg2, separator]
  );

  if (!markdown.trim()) return null;

  function renderInline(value: string) {
    return parseInline(value).map((part, index) => {
      if (part.type === 'link') {
        return (
          <Text key={index} onPress={() => void Linking.openURL(part.url)} style={styles.link}>
            {part.label}
          </Text>
        );
      }
      if (part.type === 'code') {
        return (
          <Text key={index} style={styles.inlineCode}>
            {part.value}
          </Text>
        );
      }
      return part.value;
    });
  }

  return (
    <View>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const style = block.level === 1 ? styles.heading1 : block.level === 2 ? styles.heading2 : styles.heading3;
          return (
            <Text key={index} style={[style, styles.block]}>
              {renderInline(block.text)}
            </Text>
          );
        }
        if (block.type === 'blockquote') {
          return (
            <View key={index} style={styles.blockquote}>
              <Text style={styles.body}>{renderInline(block.text)}</Text>
            </View>
          );
        }
        if (block.type === 'code') {
          return (
            <Text key={index} style={styles.codeBlock}>
              {block.text}
            </Text>
          );
        }
        if (block.type === 'list') {
          return (
            <View key={index} style={styles.block}>
              {block.items.map((item, itemIndex) => (
                <View key={`${index}-${itemIndex}`} style={styles.listItem}>
                  <Text style={styles.listMarker}>{block.ordered ? `${itemIndex + 1}.` : '•'}</Text>
                  <Text style={styles.listText}>{renderInline(item)}</Text>
                </View>
              ))}
            </View>
          );
        }
        if (block.type === 'hr') {
          return <View key={index} style={styles.hr} />;
        }
        return (
          <Text key={index} style={[styles.body, styles.block]}>
            {renderInline(block.text)}
          </Text>
        );
      })}
    </View>
  );
});
