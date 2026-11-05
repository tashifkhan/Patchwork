import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useMemo } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { parseMarkdown, type Block, type InlineNode } from '@/lib/markdown';
import { Text, View, useCSSVariable } from '@/tw';

/**
 * 'Menlo' only exists on iOS — on Android it silently fell back to the default
 * sans-serif, so code spans and fenced blocks rendered in the body font.
 */
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Android follows the Material 3 type scale (bodyLarge 16/24 with 0.5
 * letter-spacing); iOS keeps the tighter Apple body metrics.
 */
const ANDROID = Platform.OS === 'android';

/** Fixed table column width so header and body rows stay aligned. */
const TABLE_COLUMN_WIDTH = 150;

/** Tasks.org–style smart typography (Markwon extras). */
const SMART_REPLACEMENTS: [RegExp, string][] = [
  [/<==>/g, '⇔'],
  [/<-->/g, '↔'],
  [/-->/g, '→'],
  [/<--/g, '←'],
  [/==>/g, '⇒'],
  [/<==/g, '⇐'],
  [/->/g, '→'],
  [/<-/g, '←'],
  [/=>/g, '⇒'],
  [/!=/g, '≠'],
  [/>=/g, '≥'],
  [/<=/g, '≤'],
  [/~=/g, '≈'],
  [/\+\/-/g, '±'],
  [/(?<!-)---(?!-)/g, '—'],
  [/(?<!-)--(?!-)/g, '–'],
  [/\.{3}/g, '…'],
  [/\(c\)/gi, '©'],
  [/\(r\)/gi, '®'],
  [/\(tm\)/gi, '™'],
];

function applySmartText(value: string): string {
  let out = value;
  for (const [re, sub] of SMART_REPLACEMENTS) out = out.replace(re, sub);
  return out;
}

type CompactProp = boolean | undefined;

export const MarkdownViewer = memo(function MarkdownViewer({
  markdown,
  compact,
  allowRemoteImages = false,
  onToggleTask,
}: {
  markdown: string;
  compact?: CompactProp;
  allowRemoteImages?: boolean;
  /** Makes `- [ ]` boxes tappable; receives the task's index in the document. */
  onToggleTask?: (taskIndex: number) => void;
}) {
  const text = useCSSVariable('--sf-text');
  const textSecondary = useCSSVariable('--sf-text-2');
  const textTertiary = useCSSVariable('--sf-text-3');
  const blue = useCSSVariable('--sf-blue');
  const accent = blue;
  const bg = useCSSVariable('--sf-bg');
  const bg2 = useCSSVariable('--sf-bg-2');
  const bg3 = useCSSVariable('--sf-bg-3');
  const separator = useCSSVariable('--sf-separator');

  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);

  // Tasks.org / Markwon feel: readable body, tight list rhythm, modest headings.
  // Android uses the M3 bodyMedium/bodyLarge metrics so notes match the rest of
  // the Material UI; iOS keeps the tighter Apple body sizing.
  const base = ANDROID ? (compact ? 14 : 16) : compact ? 14 : 15;
  const lh = ANDROID ? (compact ? 20 : 24) : compact ? 20 : 22;
  const tracking = ANDROID ? (compact ? 0.25 : 0.5) : 0;
  const gap = compact ? 8 : 10;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { gap: 0 },
        block: { marginBottom: gap },
        blockLast: { marginBottom: 0 },
        body: { color: text, fontSize: base, lineHeight: lh, letterSpacing: tracking },
        bodySecondary: {
          color: textSecondary,
          fontSize: base,
          lineHeight: lh,
          letterSpacing: tracking,
        },
        bold: { fontWeight: '600' },
        italic: { fontStyle: 'italic' },
        strike: { textDecorationLine: 'line-through', color: textTertiary },
        h1: {
          color: text,
          fontSize: compact ? 20 : 22,
          fontWeight: '700',
          lineHeight: compact ? 26 : 28,
          marginTop: compact ? 2 : 4,
        },
        h2: {
          color: text,
          fontSize: compact ? 17 : 19,
          fontWeight: '700',
          lineHeight: compact ? 23 : 25,
          marginTop: compact ? 2 : 4,
        },
        h3: {
          color: text,
          fontSize: compact ? 15 : 17,
          fontWeight: '600',
          lineHeight: compact ? 21 : 23,
          marginTop: 2,
        },
        h4: { color: text, fontSize: base + 1, fontWeight: '600', lineHeight: lh + 2 },
        h5: { color: text, fontSize: base, fontWeight: '600', lineHeight: lh },
        h6: {
          color: textSecondary,
          fontSize: base - 1,
          fontWeight: '600',
          lineHeight: lh,
          textTransform: 'uppercase',
          letterSpacing: 0.3,
        },
        link: { color: blue, textDecorationLine: 'none', fontWeight: '500' },
        blockquote: {
          borderLeftColor: accent,
          borderLeftWidth: 3,
          borderTopRightRadius: 6,
          borderBottomRightRadius: 6,
          backgroundColor: bg2,
          marginBottom: gap,
          paddingLeft: 12,
          paddingRight: 10,
          paddingVertical: 8,
          gap: 4,
        },
        blockquoteText: {
          color: textSecondary,
          fontSize: base,
          lineHeight: lh,
          letterSpacing: tracking,
        },
        inlineCode: {
          backgroundColor: bg3 || bg2,
          color: text,
          borderRadius: 4,
          fontFamily: MONO,
          fontSize: base - 1.5,
          paddingHorizontal: 5,
          paddingVertical: 1,
          overflow: 'hidden',
        },
        codeScroll: {
          backgroundColor: bg3 || bg,
          borderRadius: 10,
          borderCurve: 'continuous',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: separator,
        },
        codeScrollContent: { minWidth: '100%' },
        codeBlock: {
          color: text,
          fontFamily: MONO,
          fontSize: base - 2,
          lineHeight: lh - 2,
          paddingHorizontal: 12,
          paddingVertical: 10,
        },
        codeLang: {
          color: textTertiary,
          fontSize: 10,
          fontFamily: MONO,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          marginBottom: 6,
        },
        headingRule: {
          backgroundColor: separator,
          height: StyleSheet.hairlineWidth,
          marginTop: 6,
          opacity: 0.7,
        },
        hr: {
          backgroundColor: separator,
          height: StyleSheet.hairlineWidth,
          marginVertical: gap + 2,
        },
        list: { marginBottom: gap, gap: 2 },
        listItem: {
          flexDirection: 'row',
          gap: 8,
          alignItems: 'flex-start',
          paddingVertical: 1,
        },
        listMarker: {
          color: textSecondary,
          fontSize: base,
          lineHeight: lh,
          minWidth: 16,
          textAlign: 'center',
        },
        listOrderedMarker: {
          color: textSecondary,
          fontSize: base,
          lineHeight: lh,
          minWidth: 20,
          textAlign: 'right',
        },
        listText: { color: text, flex: 1, fontSize: base, lineHeight: lh, letterSpacing: tracking },
        checkbox: { paddingTop: compact ? 1 : 2, width: 20, alignItems: 'center' },
        nestedList: { paddingLeft: 20, marginTop: 2 },
        image: {
          width: '100%',
          height: compact ? 140 : 180,
          borderRadius: 10,
          backgroundColor: bg2,
          marginBottom: gap,
        },
        inlineImage: {
          width: 120,
          height: 90,
          borderRadius: 8,
          backgroundColor: bg2,
          marginVertical: 4,
        },
        table: {
          borderColor: separator,
          borderRadius: 10,
          borderWidth: StyleSheet.hairlineWidth,
          marginBottom: gap,
          overflow: 'hidden',
        },
        tableRow: { flexDirection: 'row' },
        tableRowAlt: { backgroundColor: bg2 },
        tableCell: {
          // Fixed column width, not flex: each row is its own flex container,
          // so flex-sized cells sized to their own text and the header stopped
          // lining up with the body rows.
          width: TABLE_COLUMN_WIDTH,
          paddingHorizontal: 10,
          paddingVertical: 7,
          borderRightWidth: StyleSheet.hairlineWidth,
          borderRightColor: separator,
        },
        tableHeader: { fontWeight: '600', color: text, fontSize: base - 1, lineHeight: lh - 2 },
        tableText: { color: text, fontSize: base - 1, lineHeight: lh - 2 },
      }),
    [text, textSecondary, textTertiary, blue, accent, bg, bg2, bg3, separator, base, lh, gap, tracking, compact]
  );

  if (!markdown.trim()) return null;

  function renderNodes(nodes: InlineNode[]): React.ReactNode {
    return nodes.map((node, idx) => {
      if (node.type === 'text') return applySmartText(node.value);
      if (node.type === 'break') return '\n';
      if (node.type === 'code') {
        return (
          <Text key={idx} style={styles.inlineCode}>
            {node.value}
          </Text>
        );
      }
      if (node.type === 'link') {
        return (
          <Text
            key={idx}
            style={styles.link}
            accessibilityRole="link"
            onPress={() => void openSafeUrl(node.url)}>
            {renderNodes(node.children)}
          </Text>
        );
      }
      if (node.type === 'bold') {
        return (
          <Text key={idx} style={styles.bold}>
            {renderNodes(node.children)}
          </Text>
        );
      }
      if (node.type === 'italic') {
        return (
          <Text key={idx} style={styles.italic}>
            {renderNodes(node.children)}
          </Text>
        );
      }
      if (node.type === 'strike') {
        return (
          <Text key={idx} style={styles.strike}>
            {renderNodes(node.children)}
          </Text>
        );
      }
      if (node.type === 'image') {
        if (!allowRemoteImages && isRemoteUrl(node.url)) {
          return (
            <Text
              key={idx}
              style={styles.link}
              accessibilityRole="link"
              onPress={() => void openSafeUrl(node.url)}>
              {node.alt || node.url}
            </Text>
          );
        }
        return (
          <Image
            key={idx}
            source={{ uri: node.url }}
            style={styles.inlineImage}
            contentFit="cover"
            transition={150}
            accessibilityLabel={node.alt}
          />
        );
      }
      return null;
    });
  }

  function renderBlocks(items: Block[], nested = false): React.ReactNode {
    return items.map((block, index) => {
      const isLast = index === items.length - 1;
      const bottom = isLast && !nested ? styles.blockLast : styles.block;

      if (block.type === 'heading') {
        const style =
          block.level === 1
            ? styles.h1
            : block.level === 2
              ? styles.h2
              : block.level === 3
                ? styles.h3
                : block.level === 4
                  ? styles.h4
                  : block.level === 5
                    ? styles.h5
                    : styles.h6;
        // h1/h2 get a hairline rule under them so long notes have visible
        // section breaks (GitHub / Markwon convention).
        if (block.level <= 2) {
          return (
            <View key={index} style={bottom}>
              <Text style={style} selectable>
                {renderNodes(block.inline)}
              </Text>
              <View style={styles.headingRule} />
            </View>
          );
        }
        return (
          <Text key={index} style={[style, bottom]} selectable>
            {renderNodes(block.inline)}
          </Text>
        );
      }
      if (block.type === 'blockquote') {
        return (
          <View key={index} style={[styles.blockquote, isLast && !nested ? styles.blockLast : null]}>
            {block.children.map((child, ci) => {
              if (child.type === 'paragraph') {
                return (
                  <Text key={ci} style={styles.blockquoteText} selectable>
                    {renderNodes(child.inline)}
                  </Text>
                );
              }
              return <View key={ci}>{renderBlocks([child], true)}</View>;
            })}
          </View>
        );
      }
      if (block.type === 'code') {
        return (
          <View key={index} style={isLast && !nested ? styles.blockLast : styles.block}>
            {block.lang ? <Text style={styles.codeLang}>{block.lang}</Text> : null}
            {/*
              Code must not wrap — long lines scroll sideways instead of being
              re-flowed, which is what makes indentation readable.
            */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.codeScroll}
              contentContainerStyle={styles.codeScrollContent}>
              <Text style={styles.codeBlock} selectable>
                {block.text}
              </Text>
            </ScrollView>
          </View>
        );
      }
      if (block.type === 'list') {
        return (
          <View key={index} style={[styles.list, isLast && !nested ? styles.blockLast : null]}>
            {block.items.map((item, ii) => (
              <View key={ii}>
                <View style={styles.listItem}>
                  {item.checked !== null ? (
                    <Pressable
                      disabled={!onToggleTask || item.taskIndex == null}
                      onPress={() => item.taskIndex != null && onToggleTask?.(item.taskIndex)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: item.checked }}
                      hitSlop={10}
                      style={styles.checkbox}>
                      <MaterialCommunityIcons
                        name={item.checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={base + 2}
                        color={item.checked ? accent : textSecondary}
                      />
                    </Pressable>
                  ) : (
                    <Text style={block.ordered ? styles.listOrderedMarker : styles.listMarker}>
                      {block.ordered ? `${block.start + ii}.` : '•'}
                    </Text>
                  )}
                  <Text
                    style={[styles.listText, item.checked ? styles.strike : null]}
                    selectable>
                    {renderNodes(item.inline)}
                  </Text>
                </View>
                {item.children.length > 0 ? (
                  <View style={styles.nestedList}>{renderBlocks(item.children, true)}</View>
                ) : null}
              </View>
            ))}
          </View>
        );
      }
      if (block.type === 'hr') {
        return <View key={index} style={styles.hr} />;
      }
      if (block.type === 'image') {
        if (!allowRemoteImages && isRemoteUrl(block.url)) {
          return (
            <Text
              key={index}
              style={[styles.link, bottom]}
              accessibilityRole="link"
              onPress={() => void openSafeUrl(block.url)}
              selectable>
              {block.alt || block.url}
            </Text>
          );
        }
        return (
          <Image
            key={index}
            source={{ uri: block.url }}
            style={styles.image}
            contentFit="cover"
            transition={150}
            accessibilityLabel={block.alt}
          />
        );
      }
      if (block.type === 'table') {
        // Columns are a fixed width and the table scrolls sideways; without
        // this a 5-column table crushed each cell to a few unreadable chars.
        const minWidth = Math.max(block.header.length, 1) * TABLE_COLUMN_WIDTH;
        return (
          <ScrollView
            key={index}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={isLast && !nested ? styles.blockLast : styles.block}>
            <View style={[styles.table, { minWidth }]}>
            <View style={[styles.tableRow, styles.tableRowAlt]}>
              {block.header.map((cell, ci) => (
                <View key={ci} style={styles.tableCell}>
                  <Text style={styles.tableHeader} selectable>
                    {renderNodes(cell)}
                  </Text>
                </View>
              ))}
            </View>
            {block.rows.map((row, ri) => (
              <View key={ri} style={[styles.tableRow, ri % 2 === 1 ? styles.tableRowAlt : null]}>
                {row.map((cell, ci) => (
                  <View key={ci} style={styles.tableCell}>
                    <Text style={styles.tableText} selectable>
                      {renderNodes(cell)}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
            </View>
          </ScrollView>
        );
      }
      return (
        <Text key={index} style={[styles.body, bottom]} selectable>
          {renderNodes(block.inline)}
        </Text>
      );
    });
  }

  return <View style={styles.root}>{renderBlocks(blocks)}</View>;
});

async function openSafeUrl(rawUrl: string) {
  let scheme: string;
  try {
    scheme = new URL(rawUrl).protocol.toLowerCase();
  } catch {
    return;
  }
  if (!['https:', 'http:', 'mailto:', 'tel:'].includes(scheme)) return;
  if (await Linking.canOpenURL(rawUrl)) await Linking.openURL(rawUrl);
}

function isRemoteUrl(rawUrl: string) {
  try {
    const scheme = new URL(rawUrl).protocol.toLowerCase();
    return scheme === 'http:' || scheme === 'https:';
  } catch {
    return false;
  }
}
