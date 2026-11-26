import { Lexer, type Token, type Tokens } from 'marked';

/**
 * Jira Cloud descriptions are Atlassian Document Format (ADF), a JSON tree.
 * The app edits notes as Markdown, so this converts both ways for the parts
 * people actually write: paragraphs, headings, lists, task lists, quotes,
 * code, rules, links and inline marks.
 *
 * Anything else (images, tables, panels, expand blocks, mentions) cannot
 * survive a trip through Markdown. `adfSegments` splits a description into
 * runs of top-level blocks that do survive it, which the editor edits as
 * Markdown, and the blocks that don't, which it shows as they are and sends
 * back untouched (`adfFromSegments`).
 */

export interface AdfNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

export interface AdfDoc {
  type: 'doc';
  version: 1;
  content: AdfNode[];
}

// ── ADF → Markdown ─────────────────────────────────────────────────────

const LOSSLESS_BLOCKS = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'blockquote',
  'codeBlock',
  'rule',
]);
// Mentions, emoji, smart links, dates and status lozenges come out as their
// text, but that text cannot turn back into the node, so they are lossy too.
const LOSSLESS_INLINE = new Set(['text', 'hardBreak']);
const LOSSLESS_MARKS = new Set(['strong', 'em', 'code', 'link', 'strike']);

export function adfToMarkdown(doc: unknown): { markdown: string; lossless: boolean } {
  const state = { lossless: true };
  if (!doc || typeof doc !== 'object') return { markdown: '', lossless: true };
  const root = doc as AdfNode;
  const markdown = blocks(root.content ?? [], state, '').trim();
  return { markdown, lossless: state.lossless };
}

function blocks(nodes: AdfNode[], state: { lossless: boolean }, indent: string): string {
  return nodes
    .map((node) => block(node, state, indent))
    .filter((text) => text !== '')
    .join('\n\n');
}

function block(node: AdfNode, state: { lossless: boolean }, indent: string): string {
  if (!LOSSLESS_BLOCKS.has(node.type) && !LOSSLESS_INLINE.has(node.type)) state.lossless = false;
  switch (node.type) {
    case 'paragraph':
      return indent + inline(node.content ?? [], state).replace(/\n/g, `\n${indent}`);
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      return `${indent}${'#'.repeat(level)} ${inline(node.content ?? [], state)}`;
    }
    case 'bulletList':
    case 'orderedList': {
      const start = Number(node.attrs?.order) || 1;
      return (node.content ?? [])
        .map((item, index) => {
          const marker = node.type === 'orderedList' ? `${start + index}. ` : '- ';
          return listItem(item, marker, state, indent);
        })
        .join('\n');
    }
    case 'taskList':
      return (node.content ?? [])
        .map((item) => {
          if (item.type === 'taskList') return block(item, state, `${indent}  `);
          const done = item.attrs?.state === 'DONE';
          return `${indent}- [${done ? 'x' : ' '}] ${inline(item.content ?? [], state)}`;
        })
        .join('\n');
    case 'blockquote':
      return blocks(node.content ?? [], state, '')
        .split('\n')
        .map((line) => `${indent}> ${line}`.trimEnd())
        .join('\n');
    case 'codeBlock': {
      const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
      const code = (node.content ?? []).map((child) => child.text ?? '').join('');
      return `${indent}\`\`\`${lang}\n${code}\n\`\`\``;
    }
    case 'rule':
      return `${indent}---`;
    default:
      // Unknown block: keep any text in it so nothing reads as empty.
      return node.content ? blocks(node.content, state, indent) : inline([node], state);
  }
}

function listItem(item: AdfNode, marker: string, state: { lossless: boolean }, indent: string): string {
  const pad = ' '.repeat(marker.length);
  const [first, ...rest] = item.content ?? [];
  const head = first?.type === 'paragraph' ? inline(first.content ?? [], state) : first ? block(first, state, '') : '';
  const tail = rest.map((child) => block(child, state, indent + pad)).filter(Boolean);
  return [`${indent}${marker}${head}`, ...tail].join('\n');
}

function inline(nodes: AdfNode[], state: { lossless: boolean }): string {
  return mergeText(nodes)
    .map((node) => {
      if (!LOSSLESS_INLINE.has(node.type)) state.lossless = false;
      switch (node.type) {
        case 'text':
          return marked(node, state);
        case 'hardBreak':
          return '\n';
        case 'mention':
          return String(node.attrs?.text ?? '@someone');
        case 'emoji':
          return String(node.attrs?.text ?? node.attrs?.shortName ?? '');
        case 'inlineCard':
          return String(node.attrs?.url ?? '');
        case 'date': {
          const stamp = Number(node.attrs?.timestamp);
          return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
        }
        case 'status':
          return String(node.attrs?.text ?? '');
        default:
          return node.content ? inline(node.content, state) : (node.text ?? '');
      }
    })
    .join('');
}

const WRAP_MARKS = new Set(['strong', 'em', 'strike']);

function marked(node: AdfNode, state: { lossless: boolean }): string {
  let text = node.text ?? '';
  const marks = node.marks ?? [];
  for (const mark of marks) if (!LOSSLESS_MARKS.has(mark.type)) state.lossless = false;
  // `** **` and `**word **` are not emphasis in Markdown, so the asterisks
  // showed up as text. Whitespace at the edges goes outside the markers, and
  // text that is only whitespace gets none.
  let lead = '';
  let trail = '';
  if (marks.every((mark) => WRAP_MARKS.has(mark.type))) {
    if (!text.trim()) return text;
    lead = /^\s*/.exec(text)?.[0] ?? '';
    trail = /\s*$/.exec(text)?.[0] ?? '';
    text = text.slice(lead.length, text.length - trail.length);
  }
  if (marks.some((mark) => mark.type === 'code')) text = `\`${text}\``;
  for (const mark of marks) {
    if (mark.type === 'strong') text = `**${text}**`;
    else if (mark.type === 'em') text = `*${text}*`;
    else if (mark.type === 'strike') text = `~~${text}~~`;
  }
  const link = marks.find((mark) => mark.type === 'link');
  if (link && typeof link.attrs?.href === 'string') text = `[${text}](${link.attrs.href})`;
  return lead + text + trail;
}

function marksKey(node: AdfNode): string {
  return JSON.stringify(
    [...(node.marks ?? [])]
      .map((mark) => ({ type: mark.type, ...(mark.attrs && Object.keys(mark.attrs).length ? { attrs: mark.attrs } : {}) }))
      .sort((a, b) => a.type.localeCompare(b.type))
  );
}

/**
 * Join neighbouring text nodes that carry the same marks. Jira splits bold
 * runs ("** **" then "**Wants to…**"); written out one by one they became
 * `** ****Wants to…**`, which Markdown shows as literal asterisks.
 */
function mergeText(nodes: AdfNode[]): AdfNode[] {
  const out: AdfNode[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (node.type === 'text' && last?.type === 'text' && marksKey(last) === marksKey(node)) {
      out[out.length - 1] = { ...last, text: (last.text ?? '') + (node.text ?? '') };
    } else {
      out.push(node);
    }
  }
  return out;
}

// ── Markdown → ADF ─────────────────────────────────────────────────────

/** Markdown as an ADF document. Empty text gives null, which clears the field. */
export function markdownToAdf(markdown: string): AdfDoc | null {
  if (!markdown.trim()) return null;
  const tokens = new Lexer({ gfm: true, breaks: true }).lex(markdown);
  return { type: 'doc', version: 1, content: blockTokens(tokens) };
}

function blockTokens(tokens: Token[]): AdfNode[] {
  return tokens.flatMap((token): AdfNode[] => {
    switch (token.type) {
      case 'space':
        return [];
      case 'heading': {
        const heading = token as Tokens.Heading;
        return [{ type: 'heading', attrs: { level: heading.depth }, content: inlineTokens(heading.tokens) }];
      }
      case 'paragraph':
        return [paragraph(inlineTokens((token as Tokens.Paragraph).tokens))];
      case 'text': {
        const text = token as Tokens.Text;
        return [paragraph(text.tokens ? inlineTokens(text.tokens) : textNodes(text.text, []))];
      }
      case 'blockquote':
        return [{ type: 'blockquote', content: blockTokens((token as Tokens.Blockquote).tokens) }];
      case 'code': {
        const code = token as Tokens.Code;
        return [
          {
            type: 'codeBlock',
            ...(code.lang ? { attrs: { language: code.lang } } : {}),
            content: code.text ? [{ type: 'text', text: code.text }] : [],
          },
        ];
      }
      case 'hr':
        return [{ type: 'rule' }];
      case 'list':
        return [list(token as Tokens.List)];
      default: {
        const raw = 'text' in token && typeof token.text === 'string' ? token.text : token.raw;
        return raw.trim() ? [paragraph(textNodes(raw.trim(), []))] : [];
      }
    }
  });
}

function list(token: Tokens.List): AdfNode {
  if (token.items.length > 0 && token.items.every((item) => item.task)) {
    return {
      type: 'taskList',
      attrs: { localId: localId() },
      content: token.items.map((item) => ({
        type: 'taskItem',
        attrs: { localId: localId(), state: item.checked ? 'DONE' : 'TODO' },
        content: itemInline(item),
      })),
    };
  }
  const start = typeof token.start === 'number' ? token.start : 1;
  return {
    type: token.ordered ? 'orderedList' : 'bulletList',
    ...(token.ordered && start !== 1 ? { attrs: { order: start } } : {}),
    content: token.items.map((item) => {
      const children = blockTokens(item.tokens.filter((child) => child.type !== 'checkbox'));
      // A list item must start with a paragraph.
      const content = children.length > 0 ? children : [paragraph([])];
      if (item.task) {
        const first = content[0];
        if (first.type === 'paragraph') {
          first.content = [{ type: 'text', text: item.checked ? '☑ ' : '☐ ' }, ...(first.content ?? [])];
        }
      }
      return { type: 'listItem', content };
    }),
  };
}

function itemInline(item: Tokens.ListItem): AdfNode[] {
  return item.tokens.flatMap((child) => {
    if (child.type === 'text') {
      const text = child as Tokens.Text;
      return text.tokens ? inlineTokens(text.tokens) : textNodes(text.text, []);
    }
    if (child.type === 'paragraph') return inlineTokens((child as Tokens.Paragraph).tokens);
    return [];
  });
}

function paragraph(content: AdfNode[]): AdfNode {
  return { type: 'paragraph', content };
}

type Mark = NonNullable<AdfNode['marks']>[number];

function inlineTokens(tokens: Token[], marks: Mark[] = []): AdfNode[] {
  return tokens.flatMap((token): AdfNode[] => {
    switch (token.type) {
      case 'strong':
        return inlineTokens((token as Tokens.Strong).tokens, [...marks, { type: 'strong' }]);
      case 'em':
        return inlineTokens((token as Tokens.Em).tokens, [...marks, { type: 'em' }]);
      case 'del':
        return inlineTokens((token as Tokens.Del).tokens, [...marks, { type: 'strike' }]);
      case 'codespan':
        return textNodes(decode((token as Tokens.Codespan).text), [...marks, { type: 'code' }]);
      case 'link': {
        const link = token as Tokens.Link;
        return inlineTokens(link.tokens, [...marks, { type: 'link', attrs: { href: link.href } }]);
      }
      case 'br':
        return [{ type: 'hardBreak' }];
      case 'text': {
        const text = token as Tokens.Text;
        return text.tokens ? inlineTokens(text.tokens, marks) : textNodes(decode(text.text), marks);
      }
      case 'escape':
        return textNodes((token as Tokens.Escape).text, marks);
      default:
        return textNodes(token.raw, marks);
    }
  });
}

/** Text nodes, splitting on newlines into hard breaks (ADF text cannot hold them). */
function textNodes(text: string, marks: Mark[]): AdfNode[] {
  const parts = text.split('\n');
  return parts.flatMap((part, index): AdfNode[] => {
    const node: AdfNode[] = part ? [{ type: 'text', text: part, ...(marks.length ? { marks } : {}) }] : [];
    return index < parts.length - 1 ? [...node, { type: 'hardBreak' }] : node;
  });
}

/** marked HTML-escapes text tokens; ADF wants the characters. */
function decode(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

let counter = 0;
function localId(): string {
  counter += 1;
  return `pw-${Date.now().toString(36)}-${counter}`;
}

// ── Editing around what Markdown can't hold ────────────────────────────

/**
 * One piece of a description. `text` is a run of top-level blocks that
 * survive Markdown and back unchanged, edited as `markdown`; `nodes` are the
 * originals, sent back as they were when the text is not edited. `rich` is
 * a block that would not survive (an image, a table, a panel, a paragraph
 * with a mention), shown as it is and always sent back untouched.
 */
export type AdfSegment = { kind: 'text'; markdown: string; nodes: AdfNode[] } | { kind: 'rich'; node: AdfNode };

/**
 * Split a description for editing. There is always a text segment last, so
 * people can add to a description that ends in an image or a table.
 */
export function adfSegments(doc: unknown): AdfSegment[] {
  const content = doc && typeof doc === 'object' ? ((doc as AdfNode).content ?? []) : [];
  const segments: AdfSegment[] = [];
  let run: AdfNode[] = [];
  const flush = () => {
    if (run.length === 0) return;
    segments.push({ kind: 'text', markdown: adfToMarkdown({ type: 'doc', content: run }).markdown, nodes: run });
    run = [];
  };
  for (const node of content) {
    if (survivesMarkdown(node)) {
      run.push(node);
    } else {
      flush();
      segments.push({ kind: 'rich', node });
    }
  }
  flush();
  if (segments[segments.length - 1]?.kind !== 'text') segments.push({ kind: 'text', markdown: '', nodes: [] });
  return segments;
}

/**
 * The description to save. `texts[i]` is the edited Markdown for segment
 * `i` (rich segments ignore theirs). Unedited text keeps its original nodes,
 * so only what someone actually changed goes through Markdown. Null clears
 * the field.
 */
export function adfFromSegments(segments: AdfSegment[], texts: (string | undefined)[]): AdfDoc | null {
  const content = segments.flatMap((segment, index): AdfNode[] => {
    if (segment.kind === 'rich') return [segment.node];
    const text = texts[index] ?? segment.markdown;
    if (text === segment.markdown) return segment.nodes;
    return markdownToAdf(text)?.content ?? [];
  });
  return content.some((node) => !isEmptyParagraph(node)) ? { type: 'doc', version: 1, content } : null;
}

/** True when a top-level block comes back the same after Markdown and back. */
export function survivesMarkdown(node: AdfNode): boolean {
  if (isEmptyParagraph(node)) return true;
  const { markdown, lossless } = adfToMarkdown({ type: 'doc', content: [node] });
  if (!lossless || !markdown) return false;
  const back = markdownToAdf(markdown)?.content ?? [];
  return JSON.stringify(normalize([node])) === JSON.stringify(normalize(back));
}

function isEmptyParagraph(node: AdfNode): boolean {
  return node.type === 'paragraph' && (node.content ?? []).every((child) => child.type === 'text' && !child.text?.trim());
}

/** A comparable form: no local ids or default attrs, merged text, sorted marks, trimmed block edges. */
function normalize(nodes: AdfNode[]): unknown[] {
  return mergeText(nodes.flatMap(hoistWhitespace))
    .filter((node) => !(node.type === 'text' && !node.text))
    .map((node, index, all) => {
      const attrs = { ...(node.attrs ?? {}) };
      delete attrs.localId;
      if (node.type === 'orderedList' && Number(attrs.order ?? 1) === 1) delete attrs.order;
      if (node.type === 'codeBlock' && !attrs.language) delete attrs.language;
      let text = node.text;
      if (text != null && index === 0) text = text.trimStart();
      if (text != null && index === all.length - 1) text = text.trimEnd();
      return {
        type: node.type,
        ...(Object.keys(attrs).length ? { attrs } : {}),
        ...(text != null ? { text } : {}),
        ...(node.marks?.length ? { marks: marksKey(node) } : {}),
        ...(node.content ? { content: normalize(node.content) } : {}),
      };
    });
}

/** Whitespace at the edge of bold/italic/strike text, moved outside it (as `marked` writes it). */
function hoistWhitespace(node: AdfNode): AdfNode[] {
  const marks = node.marks ?? [];
  if (node.type !== 'text' || !marks.length || !marks.every((mark) => WRAP_MARKS.has(mark.type))) return [node];
  const text = node.text ?? '';
  if (!text.trim()) return [{ type: 'text', text }];
  const lead = /^\s*/.exec(text)?.[0] ?? '';
  const trail = /\s*$/.exec(text)?.[0] ?? '';
  return [
    ...(lead ? [{ type: 'text', text: lead }] : []),
    { ...node, text: text.slice(lead.length, text.length - trail.length) },
    ...(trail ? [{ type: 'text', text: trail }] : []),
  ];
}
