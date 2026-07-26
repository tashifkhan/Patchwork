import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useMemo } from 'react';
import { Linking, Platform, ScrollView, StyleSheet } from 'react-native';

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

type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; url: string; children: InlineNode[] }
  | { type: 'image'; url: string; alt: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'strike'; children: InlineNode[] }
  | { type: 'break' };

type ListItem = {
  text: string;
  checked: boolean | null;
  children: Block[];
};

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: 'blockquote'; children: Block[] }
  | { type: 'code'; text: string; lang: string | null }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'image'; url: string; alt: string }
  | { type: 'hr' };

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

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(\?.*)?$/i;

function applySmartText(value: string): string {
  let out = value;
  for (const [re, sub] of SMART_REPLACEMENTS) out = out.replace(re, sub);
  return out;
}

function looksLikeImageUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return IMAGE_EXT.test(path);
  } catch {
    return IMAGE_EXT.test(url);
  }
}

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let m: RegExpExecArray | null;

    if ((m = /^`([^`\n]+)`/.exec(rest))) {
      nodes.push({ type: 'code', value: m[1] });
      i += m[0].length;
      continue;
    }
    if ((m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest))) {
      // Treat non-image URLs as regular links (common when people misuse ![alt](url)).
      if (looksLikeImageUrl(m[2])) {
        nodes.push({ type: 'image', alt: m[1], url: m[2] });
      } else {
        nodes.push({
          type: 'link',
          url: m[2],
          children: [{ type: 'text', value: m[1] || m[2] }],
        });
      }
      i += m[0].length;
      continue;
    }
    if ((m = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest))) {
      nodes.push({ type: 'link', url: m[2], children: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    if ((m = /^<((?:https?|mailto):[^>\s]+)>/.exec(rest))) {
      nodes.push({ type: 'link', url: m[1], children: [{ type: 'text', value: m[1] }] });
      i += m[0].length;
      continue;
    }
    if ((m = /^\*\*\*([^\s*][^*]*?)\*\*\*/.exec(rest))) {
      nodes.push({ type: 'bold', children: [{ type: 'italic', children: parseInline(m[1]) }] });
      i += m[0].length;
      continue;
    }
    if ((m = /^\*\*([^\s*][^*]*?)\*\*/.exec(rest) ?? /^__([^\s_][^_]*?)__/.exec(rest))) {
      nodes.push({ type: 'bold', children: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    if ((m = /^\*([^\s*][^*]*?)\*/.exec(rest) ?? /^_([^\s_][^_]*?)_/.exec(rest))) {
      nodes.push({ type: 'italic', children: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    if ((m = /^~~([^~]+)~~/.exec(rest))) {
      nodes.push({ type: 'strike', children: parseInline(m[1]) });
      i += m[0].length;
      continue;
    }
    if ((m = /^(https?:\/\/[^\s<>)\]]+)/.exec(rest))) {
      nodes.push({ type: 'link', url: m[1], children: [{ type: 'text', value: m[1] }] });
      i += m[0].length;
      continue;
    }
    if ((m = /^(?:\\\n|  \n)/.exec(rest))) {
      nodes.push({ type: 'break' });
      i += m[0].length;
      continue;
    }

    const next = rest.slice(1).search(/[`*_~\[!<\\]|https?:\/\//);
    const take = next === -1 ? rest.length : next + 1;
    nodes.push({ type: 'text', value: rest.slice(0, take) });
    i += take;
  }

  const merged: InlineNode[] = [];
  for (const n of nodes) {
    const last = merged[merged.length - 1];
    if (n.type === 'text' && last && last.type === 'text') last.value += n.value;
    else merged.push(n);
  }
  return merged;
}

function leadingSpaces(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === ' ') n += 1;
  return n;
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  return parseBlocksFromLines(lines);
}

function parseBlocksFromLines(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Fenced code
    const fence = /^(\s*)(```|~~~)\s*([\w-]+)?\s*$/.exec(line);
    if (fence) {
      const marker = fence[2];
      const lang = fence[3] ?? null;
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^\\s*${marker}\\s*$`).test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'code', text: code.join('\n'), lang });
      if (i < lines.length) i += 1;
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line) || /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: heading[2],
      });
      i += 1;
      continue;
    }

    // Image-only line → block image (or link if URL isn't an image)
    const imgOnly = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/.exec(line);
    if (imgOnly) {
      if (looksLikeImageUrl(imgOnly[2])) {
        blocks.push({ type: 'image', alt: imgOnly[1], url: imgOnly[2] });
      } else {
        blocks.push({
          type: 'paragraph',
          text: `[${imgOnly[1] || imgOnly[2]}](${imgOnly[2]})`,
        });
      }
      i += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && (/^\s*>/.test(lines[i]) || (lines[i].trim() && quoted.length > 0 && !isBlockStart(lines[i])))) {
        if (/^\s*>/.test(lines[i])) {
          quoted.push(lines[i].replace(/^\s*>\s?/, ''));
        } else if (!lines[i].trim()) {
          break;
        } else {
          quoted.push(lines[i]);
        }
        i += 1;
      }
      blocks.push({ type: 'blockquote', children: parseBlocksFromLines(quoted) });
      continue;
    }

    // GFM table
    if (i + 1 < lines.length && /\|/.test(line) && /^\s*\|?[\s:-]+\|[\s:|-]+$/.test(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim()) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const listMatch = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (listMatch) {
      const baseIndent = listMatch[1].length;
      const ordered = /\d/.test(listMatch[2]);
      const items: ListItem[] = [];

      while (i < lines.length) {
        const cur = lines[i];
        const cm = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(cur);
        if (!cm || cm[1].length !== baseIndent || /\d/.test(cm[2]) !== ordered) break;

        let rest = cm[3];
        let checked: boolean | null = null;
        const task = /^\[([ xX])\]\s*(.*)$/.exec(rest);
        if (task) {
          checked = task[1].toLowerCase() === 'x';
          rest = task[2];
        }

        const itemLines: string[] = [rest];
        i += 1;
        // Collect continuation lines (indented further than baseIndent)
        while (i < lines.length) {
          const nxt = lines[i];
          if (!nxt.trim()) {
            if (
              i + 1 < lines.length &&
              lines[i + 1].length > baseIndent &&
              leadingSpaces(lines[i + 1]) > baseIndent
            ) {
              itemLines.push('');
              i += 1;
              continue;
            }
            break;
          }
          const indent = leadingSpaces(nxt);
          if (indent > baseIndent) {
            itemLines.push(nxt.slice(Math.min(indent, baseIndent + 2)));
            i += 1;
            continue;
          }
          break;
        }

        const [firstLine, ...moreLines] = itemLines;
        const children = moreLines.length ? parseBlocksFromLines(moreLines) : [];
        items.push({ text: firstLine, checked, children });
      }

      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // Paragraph — soft-join consecutive non-empty lines
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      if (isBlockStart(lines[i])) break;
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  }

  return blocks;
}

function isBlockStart(line: string): boolean {
  return (
    /^\s{0,3}(#{1,6})\s+/.test(line) ||
    /^\s*>/.test(line) ||
    /^\s*([-*+]|\d+[.)])\s+/.test(line) ||
    /^(\s*)(```|~~~)/.test(line) ||
    /^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line) ||
    /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)
  );
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

type CompactProp = boolean | undefined;

export const MarkdownViewer = memo(function MarkdownViewer({
  markdown,
  compact,
  allowRemoteImages = false,
}: {
  markdown: string;
  compact?: CompactProp;
  allowRemoteImages?: boolean;
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

  const blocks = useMemo(() => parseBlocks(markdown), [markdown]);

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

  function renderInline(value: string): React.ReactNode {
    return renderNodes(parseInline(value));
  }

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
                {renderInline(block.text)}
              </Text>
              <View style={styles.headingRule} />
            </View>
          );
        }
        return (
          <Text key={index} style={[style, bottom]} selectable>
            {renderInline(block.text)}
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
                    {renderInline(child.text)}
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
                    <View style={styles.checkbox}>
                      <MaterialCommunityIcons
                        name={item.checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={base + 2}
                        color={item.checked ? accent : textSecondary}
                      />
                    </View>
                  ) : (
                    <Text style={block.ordered ? styles.listOrderedMarker : styles.listMarker}>
                      {block.ordered ? `${ii + 1}.` : '•'}
                    </Text>
                  )}
                  <Text
                    style={[styles.listText, item.checked ? styles.strike : null]}
                    selectable>
                    {renderInline(item.text)}
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
                    {renderInline(cell)}
                  </Text>
                </View>
              ))}
            </View>
            {block.rows.map((row, ri) => (
              <View key={ri} style={[styles.tableRow, ri % 2 === 1 ? styles.tableRowAlt : null]}>
                {row.map((cell, ci) => (
                  <View key={ci} style={styles.tableCell}>
                    <Text style={styles.tableText} selectable>
                      {renderInline(cell)}
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
          {renderInline(block.text)}
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
