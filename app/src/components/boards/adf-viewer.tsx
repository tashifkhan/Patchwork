import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { JiraMedia } from '@/api/jira';
import { useTheme } from '@/components/theme/context';
import type { AdfNode } from '@/lib/adf';
import { haptics } from '@/lib/haptics';
import { DURATION } from '@/lib/motion';
import type { ThemeColors } from '@/lib/theme';
import { withAlpha } from '@/lib/theme';
import { Text, View } from '@/tw';

const ANDROID = Platform.OS === 'android';
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const CELL_WIDTH = 150;

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Context {
  colors: ThemeColors;
  media: Record<string, JiraMedia>;
  headers?: Record<string, string>;
  base: number;
  lh: number;
  tracking: number;
  gap: number;
  /** Table header cells: body text in bold. */
  strong?: boolean;
  dark: boolean;
  openImage: (image: { uri: string; headers?: Record<string, string>; name?: string }) => void;
  /** Where to send people for things the app cannot open itself (files). */
  fallbackUrl?: string;
}

/**
 * A Jira description (or any ADF) drawn as it is: images from the issue's
 * attachments, tables, panels, expands, mentions, status lozenges, smart
 * links and the rest. Tap an image to see it full size.
 */
export function AdfViewer({
  nodes,
  media = {},
  headers,
  fallbackUrl,
  compact,
}: {
  nodes: AdfNode[];
  /** ADF media id → attachment, from `fetchJiraIssue`. */
  media?: Record<string, JiraMedia>;
  /** Auth headers for Jira-hosted media. Never sent to external images. */
  headers?: Record<string, string>;
  fallbackUrl?: string;
  compact?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const [viewing, setViewing] = useState<{ uri: string; headers?: Record<string, string>; name?: string } | null>(
    null
  );
  const ctx: Context = {
    colors,
    media,
    headers,
    fallbackUrl,
    dark: scheme === 'dark',
    base: ANDROID ? (compact ? 14 : 16) : compact ? 14 : 15,
    lh: ANDROID ? (compact ? 20 : 24) : compact ? 20 : 22,
    tracking: ANDROID ? (compact ? 0.25 : 0.5) : 0,
    gap: compact ? 8 : 10,
    openImage: (image) => {
      haptics.tap();
      setViewing(image);
    },
  };
  return (
    <View>
      {renderBlocks(nodes, ctx, true)}
      <ImageViewer image={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}

// ── Blocks ─────────────────────────────────────────────────────────────

function renderBlocks(nodes: AdfNode[], ctx: Context, top = false): ReactNode {
  return nodes.map((node, index) => (
    <View key={index} style={{ marginBottom: top && index === nodes.length - 1 ? 0 : ctx.gap }}>
      <Block node={node} ctx={ctx} />
    </View>
  ));
}

/** Children of a container whose own padding sets the spacing (cells, panels, list items). */
function renderInner(nodes: AdfNode[], ctx: Context): ReactNode {
  return nodes.map((node, index) => (
    <View key={index} style={{ marginBottom: index === nodes.length - 1 ? 0 : Math.round(ctx.gap * 0.6) }}>
      <Block node={node} ctx={ctx} />
    </View>
  ));
}

function bodyStyle(ctx: Context): TextStyle {
  return {
    color: ctx.colors.text,
    fontSize: ctx.base,
    lineHeight: ctx.lh,
    letterSpacing: ctx.tracking,
    ...(ctx.strong ? { fontWeight: '600' as const } : null),
  };
}

function Block({ node, ctx }: { node: AdfNode; ctx: Context }) {
  const { colors } = ctx;
  const content = node.content ?? [];
  switch (node.type) {
    case 'paragraph':
      if (content.length === 0) return null;
      return <Paragraph nodes={content} ctx={ctx} style={bodyStyle(ctx)} />;
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      const size = [0, 22, 19, 17, ctx.base + 1, ctx.base, ctx.base - 1][level];
      return (
        <Paragraph
          nodes={content}
          ctx={ctx}
          style={{
            color: level === 6 ? colors.text2 : colors.text,
            fontSize: size,
            lineHeight: Math.round(size * 1.3),
            fontWeight: level <= 2 ? '700' : '600',
          }}
        />
      );
    }
    case 'bulletList':
    case 'orderedList': {
      const start = Number(node.attrs?.order) || 1;
      return (
        <View style={{ gap: 2 }}>
          {content.map((item, index) => (
            <ListRow
              key={index}
              ctx={ctx}
              marker={
                <Text
                  style={{
                    color: colors.text2,
                    fontSize: ctx.base,
                    lineHeight: ctx.lh,
                    minWidth: node.type === 'orderedList' ? 20 : 16,
                    textAlign: node.type === 'orderedList' ? 'right' : 'center',
                  }}>
                  {node.type === 'orderedList' ? `${start + index}.` : '•'}
                </Text>
              }>
              {renderInner(item.content ?? [], ctx)}
            </ListRow>
          ))}
        </View>
      );
    }
    case 'taskList':
    case 'decisionList':
      return (
        <View style={{ gap: 2 }}>
          {content.map((item, index) =>
            item.type === 'taskList' || item.type === 'decisionList' ? (
              <View key={index} style={{ paddingLeft: 24 }}>
                <Block node={item} ctx={ctx} />
              </View>
            ) : (
              <ListRow
                key={index}
                ctx={ctx}
                marker={
                  <MaterialCommunityIcons
                    name={
                      node.type === 'decisionList'
                        ? 'arrow-decision-outline'
                        : item.attrs?.state === 'DONE'
                          ? 'checkbox-marked'
                          : 'checkbox-blank-outline'
                    }
                    size={ctx.base + 2}
                    color={item.attrs?.state === 'DONE' || node.type === 'decisionList' ? colors.accent : colors.text2}
                    style={{ width: 20, textAlign: 'center', marginTop: (ctx.lh - ctx.base - 2) / 2 }}
                  />
                }>
                <Paragraph
                  nodes={item.content ?? []}
                  ctx={ctx}
                  style={{
                    ...bodyStyle(ctx),
                    ...(item.attrs?.state === 'DONE' && node.type === 'taskList'
                      ? { textDecorationLine: 'line-through', color: colors.text3 }
                      : null),
                  }}
                />
              </ListRow>
            )
          )}
        </View>
      );
    case 'blockquote':
      return (
        <View
          style={{
            borderLeftWidth: 3,
            borderLeftColor: colors.accent,
            backgroundColor: colors.bg2,
            borderTopRightRadius: 6,
            borderBottomRightRadius: 6,
            paddingLeft: 12,
            paddingRight: 10,
            paddingVertical: 8,
          }}>
          {renderInner(content, { ...ctx, colors: { ...colors, text: colors.text2 } })}
        </View>
      );
    case 'codeBlock': {
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
      return (
        <View>
          {language ? (
            <Text style={{ color: colors.text3, fontSize: 10, fontFamily: MONO, marginBottom: 6 }}>{language}</Text>
          ) : null}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{
              backgroundColor: colors.bg3,
              borderRadius: 10,
              borderCurve: 'continuous',
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.separator,
            }}
            contentContainerStyle={{ minWidth: '100%' }}>
            <Text
              selectable
              style={{
                color: colors.text,
                fontFamily: MONO,
                fontSize: ctx.base - 2,
                lineHeight: ctx.lh - 2,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}>
              {content.map((child) => child.text ?? '').join('')}
            </Text>
          </ScrollView>
        </View>
      );
    }
    case 'rule':
      return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginVertical: 2 }} />;
    case 'panel':
      return <Panel node={node} ctx={ctx} />;
    case 'expand':
    case 'nestedExpand':
      return <Expand node={node} ctx={ctx} />;
    case 'table':
      return <Table node={node} ctx={ctx} />;
    case 'mediaSingle':
      return (
        <View style={{ alignItems: 'center' }}>
          {content.map((child, index) => (
            <Media key={index} node={child} ctx={ctx} widthPercent={Number(node.attrs?.width) || undefined} />
          ))}
        </View>
      );
    case 'mediaGroup':
      return (
        <View style={{ gap: 8 }}>
          {content.map((child, index) => (
            <Media key={index} node={child} ctx={ctx} />
          ))}
        </View>
      );
    case 'media':
      return <Media node={node} ctx={ctx} />;
    case 'blockCard':
    case 'embedCard':
      return <LinkCard url={String(node.attrs?.url ?? '')} ctx={ctx} />;
    case 'layoutSection':
    case 'layoutColumn':
    case 'bodiedExtension':
      return <View>{renderInner(content, ctx)}</View>;
    case 'extension':
      return <Notice icon="puzzle-outline" label="A Jira app's content. Open the issue in Jira to see it." ctx={ctx} />;
    default:
      // Unknown blocks: whatever they hold, else their text.
      if (content.length && content.every((child) => isInline(child))) {
        return <Paragraph nodes={content} ctx={ctx} style={bodyStyle(ctx)} />;
      }
      if (content.length) return <View>{renderInner(content, ctx)}</View>;
      return node.text ? <Text style={bodyStyle(ctx)}>{node.text}</Text> : null;
  }
}

const INLINE = new Set([
  'text',
  'hardBreak',
  'mention',
  'emoji',
  'inlineCard',
  'date',
  'status',
  'placeholder',
  'mediaInline',
  'inlineExtension',
]);

function isInline(node: AdfNode) {
  return INLINE.has(node.type);
}

function ListRow({ marker, children, ctx }: { marker: ReactNode; children: ReactNode; ctx: Context }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 1 }}>
      <View style={{ minHeight: ctx.lh }}>{marker}</View>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const PANELS: Record<string, { icon: IconName; tone: keyof ThemeColors }> = {
  info: { icon: 'information-outline', tone: 'accent' },
  note: { icon: 'note-text-outline', tone: 'purple' },
  tip: { icon: 'lightbulb-on-outline', tone: 'green' },
  success: { icon: 'check-circle-outline', tone: 'green' },
  warning: { icon: 'alert-outline', tone: 'orange' },
  error: { icon: 'close-octagon-outline', tone: 'red' },
};

function Panel({ node, ctx }: { node: AdfNode; ctx: Context }) {
  const kind = PANELS[String(node.attrs?.panelType ?? 'info')] ?? PANELS.info;
  const tone = ctx.colors[kind.tone];
  const emoji = typeof node.attrs?.panelIcon === 'string' ? node.attrs.panelIcon : undefined;
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        padding: 12,
        borderRadius: ANDROID ? 16 : 12,
        borderCurve: 'continuous',
        backgroundColor: withAlpha(tone, 0.12),
      }}>
      {emoji && node.attrs?.panelType === 'custom' ? (
        <Text style={{ fontSize: ctx.base, lineHeight: ctx.lh }}>{emoji}</Text>
      ) : (
        <MaterialCommunityIcons
          name={kind.icon}
          size={18}
          color={tone}
          style={{ marginTop: (ctx.lh - 18) / 2 }}
        />
      )}
      <View style={{ flex: 1 }}>{renderInner(node.content ?? [], ctx)}</View>
    </View>
  );
}

function Expand({ node, ctx }: { node: AdfNode; ctx: Context }) {
  const [open, setOpen] = useState(false);
  const title = typeof node.attrs?.title === 'string' && node.attrs.title.trim() ? node.attrs.title : 'Details';
  return (
    <View
      style={{
        borderRadius: ANDROID ? 16 : 12,
        borderCurve: 'continuous',
        backgroundColor: ctx.colors.bg2,
        overflow: 'hidden',
      }}>
      <Pressable
        onPress={() => {
          haptics.selection();
          setOpen((value) => !value);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          minHeight: 44,
          backgroundColor: pressed ? ctx.colors.bg3 : 'transparent',
        })}>
        <MaterialCommunityIcons name={open ? 'chevron-down' : 'chevron-right'} size={20} color={ctx.colors.text2} />
        <Text style={{ flex: 1, color: ctx.colors.text, fontSize: ctx.base, fontWeight: '600' }}>{title}</Text>
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>{renderInner(node.content ?? [], ctx)}</View>
      ) : null}
    </View>
  );
}

function Table({ node, ctx }: { node: AdfNode; ctx: Context }) {
  const { colors } = ctx;
  const rows = (node.content ?? []).filter((row) => row.type === 'tableRow');
  const border = StyleSheet.hairlineWidth;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View
        style={{
          borderWidth: border,
          borderColor: colors.separator,
          borderRadius: 10,
          borderCurve: 'continuous',
          overflow: 'hidden',
        }}>
        {rows.map((row, ri) => (
          <View
            key={ri}
            style={{
              flexDirection: 'row',
              borderTopWidth: ri === 0 ? 0 : border,
              borderTopColor: colors.separator,
            }}>
            {(row.content ?? []).map((cell, ci) => {
              const span = Math.max(1, Number(cell.attrs?.colspan) || 1);
              const widths = Array.isArray(cell.attrs?.colwidth) ? (cell.attrs.colwidth as number[]) : [];
              const width = widths.length
                ? widths.reduce((sum, value) => sum + Math.min(320, Math.max(90, Number(value) || CELL_WIDTH)), 0)
                : CELL_WIDTH * span;
              const header = cell.type === 'tableHeader';
              const background =
                typeof cell.attrs?.background === 'string' && /^#[0-9a-f]{6}$/i.test(cell.attrs.background)
                  ? withAlpha(cell.attrs.background, 0.25)
                  : header
                    ? colors.bg2
                    : 'transparent';
              return (
                <View
                  key={ci}
                  style={{
                    width,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    backgroundColor: background,
                    borderLeftWidth: ci === 0 ? 0 : border,
                    borderLeftColor: colors.separator,
                  }}>
                  {renderInner(cell.content ?? [], { ...ctx, base: ctx.base - 1, lh: ctx.lh - 2, strong: header })}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ── Media ──────────────────────────────────────────────────────────────

function Media({ node, ctx, widthPercent }: { node: AdfNode; ctx: Context; widthPercent?: number }) {
  const { colors } = ctx;
  const { width: screen } = useWindowDimensions();
  const attrs = node.attrs ?? {};
  const external = attrs.type === 'external' && typeof attrs.url === 'string' ? attrs.url : undefined;
  const attachment = typeof attrs.id === 'string' ? ctx.media[attrs.id] : undefined;
  const name = attachment?.filename ?? (typeof attrs.alt === 'string' ? attrs.alt : undefined);
  const w = Number(attrs.width);
  const h = Number(attrs.height);
  const ratio = w > 0 && h > 0 ? Math.min(3, Math.max(0.4, w / h)) : 4 / 3;

  const image = external
    ? { uri: external }
    : attachment?.isImage
      ? { uri: attachment.url, headers: ctx.headers }
      : null;

  if (image) {
    const percent = widthPercent && widthPercent < 100 ? `${Math.max(30, widthPercent)}%` : '100%';
    return (
      <Pressable
        onPress={() => ctx.openImage({ ...image, name })}
        accessibilityRole="imagebutton"
        accessibilityLabel={name ? `${name}. Double tap to view full size` : 'Image. Double tap to view full size'}
        style={{ width: percent as `${number}%`, maxWidth: w > 0 ? Math.max(w, 120) : screen }}>
        <Image
          source={image}
          placeholder={
            attachment?.thumbnailUrl ? { uri: attachment.thumbnailUrl, headers: ctx.headers } : undefined
          }
          style={{
            width: '100%',
            aspectRatio: ratio,
            maxHeight: 420,
            borderRadius: 10,
            backgroundColor: colors.bg2,
          }}
          contentFit="contain"
          transition={DURATION.short4}
          cachePolicy="disk"
          accessibilityIgnoresInvertColors
        />
      </Pressable>
    );
  }

  // A file, or an image Patchwork could not match to an attachment.
  const label = name ?? (attachment ? 'Attachment' : 'Image or file');
  return (
    <Pressable
      disabled={!ctx.fallbackUrl}
      onPress={() => ctx.fallbackUrl && void openSafeUrl(ctx.fallbackUrl)}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Open in Jira`}
      style={({ pressed }) => ({
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        minHeight: 48,
        borderRadius: ANDROID ? 16 : 12,
        borderCurve: 'continuous',
        backgroundColor: pressed ? colors.bg3 : colors.bg2,
      })}>
      <MaterialCommunityIcons
        name={attachment ? fileIcon(attachment.mimeType, label) : 'image-off-outline'}
        size={22}
        color={colors.text2}
      />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontSize: ctx.base - 1, fontWeight: '500' }}>
          {label}
        </Text>
        <Text style={{ color: colors.text3, fontSize: 12 }}>
          {attachment?.size ? `${formatSize(attachment.size)} · ` : ''}Opens in Jira
        </Text>
      </View>
      <MaterialCommunityIcons name="open-in-new" size={18} color={colors.text3} />
    </Pressable>
  );
}

function fileIcon(mime: string | undefined, name: string): IconName {
  if (mime?.startsWith('video/')) return 'file-video-outline';
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'file-pdf-box';
  if (/zip|compressed/.test(mime ?? '')) return 'folder-zip-outline';
  if (mime?.startsWith('image/')) return 'file-image-outline';
  return 'file-outline';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ImageViewer({
  image,
  onClose,
}: {
  image: { uri: string; headers?: Record<string, string>; name?: string } | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={image != null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' }}>
        {image ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flex: 1 }}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}>
            <Image
              source={{ uri: image.uri, headers: image.headers }}
              style={{ flex: 1 }}
              contentFit="contain"
              transition={DURATION.medium1}
              cachePolicy="disk"
              accessibilityLabel={image.name}
              accessibilityIgnoresInvertColors
            />
          </ScrollView>
        ) : null}
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 12,
            right: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.18)',
            })}>
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </Pressable>
          <Text numberOfLines={1} style={{ flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' }}>
            {image?.name ?? ''}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function LinkCard({ url, ctx }: { url: string; ctx: Context }) {
  const host = useMemo(() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }, [url]);
  if (!url) return null;
  return (
    <Pressable
      onPress={() => void openSafeUrl(url)}
      accessibilityRole="link"
      accessibilityLabel={url}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        minHeight: 48,
        borderRadius: ANDROID ? 16 : 12,
        borderCurve: 'continuous',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: ctx.colors.separator,
        backgroundColor: pressed ? ctx.colors.bg3 : ctx.colors.bg2,
      })}>
      <MaterialCommunityIcons name="link-variant" size={20} color={ctx.colors.accent} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: ctx.colors.text, fontSize: ctx.base - 1, fontWeight: '500' }}>
          {prettyLink(url)}
        </Text>
        <Text numberOfLines={1} style={{ color: ctx.colors.text3, fontSize: 12 }}>
          {host}
        </Text>
      </View>
    </Pressable>
  );
}

function Notice({ icon, label, ctx }: { icon: IconName; label: string; ctx: Context }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <MaterialCommunityIcons name={icon} size={16} color={ctx.colors.text3} />
      <Text style={{ flex: 1, fontSize: 13, color: ctx.colors.text3 }}>{label}</Text>
    </View>
  );
}

// ── Inline ─────────────────────────────────────────────────────────────

function Paragraph({ nodes, ctx, style }: { nodes: AdfNode[]; ctx: Context; style: TextStyle }) {
  // Inline images sit in a paragraph; draw them below the text rather than inside it.
  const media = nodes.filter((node) => node.type === 'mediaInline');
  const text = nodes.filter((node) => node.type !== 'mediaInline');
  return (
    <>
      {text.length ? (
        <Text selectable style={style}>
          {text.map((node, index) => (
            <Inline key={index} node={node} ctx={ctx} />
          ))}
        </Text>
      ) : null}
      {media.map((node, index) => (
        <View key={`m${index}`} style={{ marginTop: 6 }}>
          <Media node={node} ctx={ctx} />
        </View>
      ))}
    </>
  );
}

const STATUS_TONES: Record<string, keyof ThemeColors> = {
  neutral: 'gray',
  purple: 'purple',
  blue: 'accent',
  red: 'red',
  yellow: 'orange',
  green: 'green',
};

function Inline({ node, ctx }: { node: AdfNode; ctx: Context }) {
  const { colors } = ctx;
  const attrs = node.attrs ?? {};
  switch (node.type) {
    case 'text':
      return <MarkedText node={node} ctx={ctx} />;
    case 'hardBreak':
      return '\n';
    case 'mention': {
      const name = String(attrs.text ?? '@someone');
      return (
        <Text style={{ color: colors.accent, backgroundColor: withAlpha(colors.accent, 0.12), fontWeight: '500' }}>
          {name.startsWith('@') ? name : `@${name}`}
        </Text>
      );
    }
    case 'emoji':
      return String(attrs.text ?? attrs.shortName ?? '');
    case 'inlineCard': {
      const url = String(attrs.url ?? '');
      return url ? (
        <Text style={{ color: colors.accent, fontWeight: '500' }} accessibilityRole="link" onPress={() => void openSafeUrl(url)}>
          {prettyLink(url)}
        </Text>
      ) : null;
    }
    case 'date': {
      const stamp = Number(attrs.timestamp);
      if (!Number.isFinite(stamp)) return null;
      return (
        <Text style={{ color: colors.text, backgroundColor: colors.bg3, fontWeight: '500' }}>
          {` ${new Date(stamp).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} `}
        </Text>
      );
    }
    case 'status': {
      const tone = colors[STATUS_TONES[String(attrs.color ?? 'neutral')] ?? 'gray'];
      return (
        <Text
          style={{
            color: tone,
            backgroundColor: withAlpha(tone, 0.16),
            fontSize: ctx.base - 3,
            fontWeight: '700',
            letterSpacing: 0.4,
          }}>
          {` ${String(attrs.text ?? '').toUpperCase()} `}
        </Text>
      );
    }
    case 'placeholder':
      return <Text style={{ color: colors.text3 }}>{String(attrs.text ?? '')}</Text>;
    default:
      if (node.content) {
        return (
          <>
            {node.content.map((child, index) => (
              <Inline key={index} node={child} ctx={ctx} />
            ))}
          </>
        );
      }
      return node.text ?? null;
  }
}

function MarkedText({ node, ctx }: { node: AdfNode; ctx: Context }) {
  const { colors } = ctx;
  const style: TextStyle = {};
  let link: string | undefined;
  let code = false;
  const decorations: TextStyle['textDecorationLine'][] = [];
  for (const mark of node.marks ?? []) {
    const attrs = mark.attrs ?? {};
    switch (mark.type) {
      case 'strong':
        style.fontWeight = '600';
        break;
      case 'em':
        style.fontStyle = 'italic';
        break;
      case 'strike':
        decorations.push('line-through');
        style.color = colors.text3;
        break;
      case 'underline':
        decorations.push('underline');
        break;
      case 'code':
        code = true;
        break;
      case 'link':
        if (typeof attrs.href === 'string') link = attrs.href;
        break;
      case 'subsup':
        style.fontSize = ctx.base - 4;
        break;
      case 'textColor':
        // Jira's picked colours are chosen on a white page; on dark they can vanish.
        if (!ctx.dark && typeof attrs.color === 'string' && /^#[0-9a-f]{6}$/i.test(attrs.color)) style.color = attrs.color;
        break;
      case 'backgroundColor':
        if (!ctx.dark && typeof attrs.color === 'string' && /^#[0-9a-f]{6}$/i.test(attrs.color)) {
          style.backgroundColor = withAlpha(attrs.color, 0.35);
        }
        break;
    }
  }
  const underline = decorations.includes('underline');
  const strike = decorations.includes('line-through');
  if (underline || strike) {
    style.textDecorationLine = underline && strike ? 'underline line-through' : underline ? 'underline' : 'line-through';
  }
  if (code) {
    Object.assign(style, {
      fontFamily: MONO,
      fontSize: ctx.base - 1.5,
      backgroundColor: colors.bg3,
      color: style.color ?? colors.text,
    });
  }
  if (link) {
    style.color = colors.accent;
    style.fontWeight = style.fontWeight ?? '500';
    const href = link;
    return (
      <Text style={style} accessibilityRole="link" onPress={() => void openSafeUrl(href)}>
        {node.text}
      </Text>
    );
  }
  return Object.keys(style).length ? <Text style={style}>{node.text}</Text> : <>{node.text}</>;
}

// ── Links ──────────────────────────────────────────────────────────────

/** "acme.atlassian.net/browse/SCRUM-4" reads better as "SCRUM-4". */
function prettyLink(url: string): string {
  const issue = /\/browse\/([A-Z][A-Z0-9_]+-\d+)/i.exec(url)?.[1];
  if (issue) return issue;
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

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
