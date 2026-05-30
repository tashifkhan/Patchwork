import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useMemo } from 'react';
import { Linking, StyleSheet } from 'react-native';

import { Text, View, useCSSVariable } from '@/tw';

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
      nodes.push({ type: 'image', alt: m[1], url: m[2] });
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

    // Image-only line → block image
    const imgOnly = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/.exec(line);
    if (imgOnly) {
      blocks.push({ type: 'image', alt: imgOnly[1], url: imgOnly[2] });
      i += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && (/^\s*>/.test(lines[i]) || (lines[i].trim() && quoted.length > 0))) {
        if (/^\s*>/.test(lines[i])) {
          quoted.push(lines[i].replace(/^\s*>\s?/, ''));
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
        // Collect continuation lines (indented further than baseIndent + 1)
        while (i < lines.length) {
          const nxt = lines[i];
          if (!nxt.trim()) {
            // blank — peek next; if it's a continuation, keep going
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

    // Paragraph
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      if (/^\s{0,3}(#{1,6})\s+/.test(lines[i]) || /^\s*>/.test(lines[i]) || /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || /^(\s*)(```|~~~)/.test(lines[i])) {
        break;
      }
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  }

  return blocks;
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
}: {
  markdown: string;
  compact?: CompactProp;
}) {
  const text = useCSSVariable('--sf-text');
  const textSecondary = useCSSVariable('--sf-text-2');
  const textTertiary = useCSSVariable('--sf-text-3');
  const blue = useCSSVariable('--sf-blue');
  const accent = useCSSVariable('--sf-accent');
  const bg2 = useCSSVariable('--sf-bg-2');
  const separator = useCSSVariable('--sf-separator');

  const blocks = useMemo(() => parseBlocks(markdown), [markdown]);

  const base = compact ? 14 : 16;
  const lh = compact ? 20 : 24;
  const gap = compact ? 6 : 10;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        block: { marginBottom: gap },
        body: { color: text, fontSize: base, lineHeight: lh },
        bodySecondary: { color: textSecondary, fontSize: base, lineHeight: lh },
        bold: { fontWeight: '700' },
        italic: { fontStyle: 'italic' },
        strike: { textDecorationLine: 'line-through', color: textTertiary },
        h1: { color: text, fontSize: compact ? 20 : 26, fontWeight: '700', lineHeight: compact ? 26 : 32 },
        h2: { color: text, fontSize: compact ? 18 : 22, fontWeight: '700', lineHeight: compact ? 24 : 28 },
        h3: { color: text, fontSize: compact ? 16 : 19, fontWeight: '600', lineHeight: compact ? 22 : 26 },
        h4: { color: text, fontSize: base + 1, fontWeight: '600', lineHeight: lh + 2 },
        h5: { color: text, fontSize: base, fontWeight: '600', lineHeight: lh },
        h6: { color: textSecondary, fontSize: base, fontWeight: '600', lineHeight: lh, textTransform: 'uppercase', letterSpacing: 0.4 },
        link: { color: blue, textDecorationLine: 'underline' },
        blockquote: {
          borderLeftColor: accent,
          borderLeftWidth: 3,
          marginBottom: gap,
          paddingLeft: 12,
          paddingVertical: 2,
          gap: 4,
        },
        blockquoteText: { color: textSecondary, fontSize: base, lineHeight: lh, fontStyle: 'italic' },
        inlineCode: {
          backgroundColor: bg2,
          color: text,
          borderRadius: 4,
          fontFamily: 'Menlo',
          fontSize: base - 1,
          paddingHorizontal: 5,
          paddingVertical: 1,
        },
        codeBlock: {
          backgroundColor: bg2,
          borderRadius: 8,
          color: text,
          fontFamily: 'Menlo',
          fontSize: base - 2,
          lineHeight: lh - 2,
          marginBottom: gap,
          padding: 12,
          borderCurve: 'continuous',
        },
        codeLang: {
          color: textTertiary,
          fontSize: 11,
          fontFamily: 'Menlo',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 4,
        },
        hr: { backgroundColor: separator, height: StyleSheet.hairlineWidth, marginVertical: gap + 2 },
        listItem: { flexDirection: 'row', gap: 8, marginBottom: 4, alignItems: 'flex-start' },
        listMarker: { color: textSecondary, fontSize: base, lineHeight: lh, minWidth: 18 },
        listOrderedMarker: { color: textSecondary, fontSize: base, lineHeight: lh, minWidth: 22, textAlign: 'right' },
        listText: { color: text, flex: 1, fontSize: base, lineHeight: lh },
        checkbox: { paddingTop: compact ? 1 : 2 },
        image: { width: '100%', height: 180, borderRadius: 8, backgroundColor: bg2, marginBottom: gap },
        inlineImage: { width: 120, height: 90, borderRadius: 6, backgroundColor: bg2, marginVertical: 4 },
        table: { borderColor: separator, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, marginBottom: gap, overflow: 'hidden' },
        tableRow: { flexDirection: 'row' },
        tableRowAlt: { backgroundColor: bg2 },
        tableCell: { flex: 1, paddingHorizontal: 10, paddingVertical: 6, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: separator },
        tableHeader: { fontWeight: '700', color: text, fontSize: base - 1, lineHeight: lh - 2 },
        tableText: { color: text, fontSize: base - 1, lineHeight: lh - 2 },
      }),
    [text, textSecondary, textTertiary, blue, accent, bg2, separator, base, lh, gap, compact]
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
          <Text key={idx} style={styles.link} onPress={() => void Linking.openURL(node.url)}>
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

  function renderBlocks(items: Block[]): React.ReactNode {
    return items.map((block, index) => {
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
        return (
          <Text key={index} style={[style, styles.block]}>
            {renderInline(block.text)}
          </Text>
        );
      }
      if (block.type === 'blockquote') {
        return (
          <View key={index} style={styles.blockquote}>
            {renderBlocks(block.children)}
          </View>
        );
      }
      if (block.type === 'code') {
        return (
          <View key={index}>
            {block.lang ? <Text style={styles.codeLang}>{block.lang}</Text> : null}
            <Text style={styles.codeBlock}>{block.text}</Text>
          </View>
        );
      }
      if (block.type === 'list') {
        return (
          <View key={index} style={styles.block}>
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
                  <Text style={[styles.listText, item.checked ? styles.strike : null]}>
                    {renderInline(item.text)}
                  </Text>
                </View>
                {item.children.length > 0 ? (
                  <View style={{ paddingLeft: 26 }}>{renderBlocks(item.children)}</View>
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
        return (
          <View key={index} style={styles.table}>
            <View style={[styles.tableRow, styles.tableRowAlt]}>
              {block.header.map((cell, ci) => (
                <View key={ci} style={styles.tableCell}>
                  <Text style={styles.tableHeader}>{renderInline(cell)}</Text>
                </View>
              ))}
            </View>
            {block.rows.map((row, ri) => (
              <View key={ri} style={[styles.tableRow, ri % 2 === 1 ? styles.tableRowAlt : null]}>
                {row.map((cell, ci) => (
                  <View key={ci} style={styles.tableCell}>
                    <Text style={styles.tableText}>{renderInline(cell)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        );
      }
      return (
        <Text key={index} style={[styles.body, styles.block]}>
          {renderInline(block.text)}
        </Text>
      );
    });
  }

  return <View>{renderBlocks(blocks)}</View>;
});
