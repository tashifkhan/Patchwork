import { Lexer, type Token, type Tokens } from 'marked';

/**
 * Jira Cloud descriptions are Atlassian Document Format (ADF), a JSON tree.
 * The app edits notes as Markdown, so this converts both ways for the parts
 * people actually write: paragraphs, headings, lists, task lists, quotes,
 * code, rules, links and inline marks.
 *
 * Anything else (images, tables, panels, expand blocks) cannot survive the
 * round trip. `adfToMarkdown` reports it as `lossless: false`, and the editor
 * then keeps the description read-only, so saving never deletes it.
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
const LOSSLESS_INLINE = new Set(['text', 'hardBreak', 'mention', 'emoji', 'inlineCard', 'date', 'status']);
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
  return nodes
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

function marked(node: AdfNode, state: { lossless: boolean }): string {
  let text = node.text ?? '';
  const marks = node.marks ?? [];
  if (marks.some((mark) => mark.type === 'code')) text = `\`${text}\``;
  for (const mark of marks) {
    if (!LOSSLESS_MARKS.has(mark.type)) state.lossless = false;
    if (mark.type === 'strong') text = `**${text}**`;
    else if (mark.type === 'em') text = `*${text}*`;
    else if (mark.type === 'strike') text = `~~${text}~~`;
  }
  const link = marks.find((mark) => mark.type === 'link');
  if (link && typeof link.attrs?.href === 'string') text = `[${text}](${link.attrs.href})`;
  return text;
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
