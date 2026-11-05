import { Lexer, type Token, type Tokens } from 'marked';

/**
 * Markdown → a small render tree for the notes viewer.
 *
 * Parsing is done by `marked` (CommonMark + GitHub Flavored Markdown: task
 * lists, tables, strikethrough, autolinks), so nested lists, quotes and
 * escapes behave like they do on GitHub. This module only reshapes marked's
 * tokens into the few node kinds the app renders with its own styles.
 */

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'link'; url: string; children: InlineNode[] }
  | { type: 'image'; url: string; alt: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'strike'; children: InlineNode[] }
  | { type: 'break' };

export interface ListItem {
  inline: InlineNode[];
  /** null for a plain bullet; true/false for a `- [x]` / `- [ ]` task. */
  checked: boolean | null;
  /** Position among all task items in the document, for toggling in the source. */
  taskIndex: number | null;
  children: Block[];
}

export type Block =
  | { type: 'paragraph'; inline: InlineNode[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; inline: InlineNode[] }
  | { type: 'blockquote'; children: Block[] }
  | { type: 'code'; text: string; lang: string | null }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { type: 'table'; header: InlineNode[][]; rows: InlineNode[][][] }
  | { type: 'image'; url: string; alt: string }
  | { type: 'hr' };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(\?.*)?$/i;

function looksLikeImageUrl(url: string): boolean {
  try {
    return IMAGE_EXT.test(new URL(url).pathname);
  } catch {
    return IMAGE_EXT.test(url);
  }
}

/** Notes are typed on phones: a single newline is a line break, like Things. */
const OPTIONS = { gfm: true, breaks: true } as const;

export function parseMarkdown(markdown: string): Block[] {
  const tokens = new Lexer(OPTIONS).lex(markdown.replace(/\r\n/g, '\n'));
  const counter = { tasks: 0 };
  return toBlocks(tokens, counter);
}

function toBlocks(tokens: Token[], counter: { tasks: number }): Block[] {
  const out: Block[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'space':
      case 'def':
        break;
      case 'heading': {
        const heading = token as Tokens.Heading;
        out.push({
          type: 'heading',
          level: Math.min(Math.max(heading.depth, 1), 6) as 1 | 2 | 3 | 4 | 5 | 6,
          inline: toInline(heading.tokens),
        });
        break;
      }
      case 'paragraph': {
        const paragraph = token as Tokens.Paragraph;
        const inline = toInline(paragraph.tokens);
        // A paragraph that is only an image renders as a full-width picture.
        const only = inline.length === 1 ? inline[0] : null;
        if (only?.type === 'image') out.push({ type: 'image', url: only.url, alt: only.alt });
        else out.push({ type: 'paragraph', inline });
        break;
      }
      case 'text': {
        const text = token as Tokens.Text;
        out.push({ type: 'paragraph', inline: text.tokens ? toInline(text.tokens) : plain(text.text) });
        break;
      }
      case 'blockquote':
        out.push({ type: 'blockquote', children: toBlocks((token as Tokens.Blockquote).tokens, counter) });
        break;
      case 'code': {
        const code = token as Tokens.Code;
        out.push({ type: 'code', text: code.text, lang: code.lang?.trim() || null });
        break;
      }
      case 'list': {
        const list = token as Tokens.List;
        const start = typeof list.start === 'number' ? list.start : 1;
        out.push({
          type: 'list',
          ordered: list.ordered,
          start,
          items: list.items.map((item) => toListItem(item, counter)),
        });
        break;
      }
      case 'table': {
        const table = token as Tokens.Table;
        out.push({
          type: 'table',
          header: table.header.map((cell) => toInline(cell.tokens)),
          rows: table.rows.map((row) => row.map((cell) => toInline(cell.tokens))),
        });
        break;
      }
      case 'hr':
        out.push({ type: 'hr' });
        break;
      case 'html':
        // No HTML rendering in notes; show what was typed.
        if ((token as Tokens.HTML).text.trim()) {
          out.push({ type: 'paragraph', inline: plain((token as Tokens.HTML).text.trim()) });
        }
        break;
      default:
        if ('text' in token && typeof token.text === 'string' && token.text.trim()) {
          out.push({ type: 'paragraph', inline: plain(token.text) });
        }
    }
  }
  return out;
}

function toListItem(item: Tokens.ListItem, counter: { tasks: number }): ListItem {
  const taskIndex = item.task ? counter.tasks++ : null;
  const content = item.tokens.filter((token) => token.type !== 'checkbox' && token.type !== 'space');
  // The first text/paragraph is the item's own line; anything after it
  // (nested lists, extra paragraphs) renders indented underneath.
  const [first, ...rest] = content;
  let inline: InlineNode[] = [];
  let children: Token[] = content;
  if (first && (first.type === 'text' || first.type === 'paragraph')) {
    const tokens = (first as Tokens.Text | Tokens.Paragraph).tokens;
    inline = tokens ? toInline(tokens.filter((token) => token.type !== 'checkbox')) : plain(first.raw.trim());
    children = rest;
  }
  return {
    inline: trimLeadingSpace(inline),
    checked: item.task ? !!item.checked : null,
    taskIndex,
    children: toBlocks(children, counter),
  };
}

function toInline(tokens: Token[] | undefined): InlineNode[] {
  if (!tokens) return [];
  const out: InlineNode[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        const text = token as Tokens.Text;
        if (text.tokens && text.tokens.length > 0) out.push(...toInline(text.tokens));
        else out.push(...plain(text.text));
        break;
      }
      case 'escape':
        out.push({ type: 'text', value: (token as Tokens.Escape).text });
        break;
      case 'strong':
        out.push({ type: 'bold', children: toInline((token as Tokens.Strong).tokens) });
        break;
      case 'em':
        out.push({ type: 'italic', children: toInline((token as Tokens.Em).tokens) });
        break;
      case 'del':
        out.push({ type: 'strike', children: toInline((token as Tokens.Del).tokens) });
        break;
      case 'codespan':
        out.push({ type: 'code', value: decodeEntities((token as Tokens.Codespan).text) });
        break;
      case 'br':
        out.push({ type: 'break' });
        break;
      case 'link': {
        const link = token as Tokens.Link;
        out.push({ type: 'link', url: link.href, children: toInline(link.tokens) });
        break;
      }
      case 'image': {
        const image = token as Tokens.Image;
        // `![name](https://github.com/...)` is usually a link typed with a stray `!`.
        if (looksLikeImageUrl(image.href)) out.push({ type: 'image', url: image.href, alt: image.text });
        else out.push({ type: 'link', url: image.href, children: plain(image.text || image.href) });
        break;
      }
      case 'checkbox':
        break;
      default:
        if ('text' in token && typeof token.text === 'string') out.push(...plain(token.text));
    }
  }
  return merge(out);
}

function plain(value: string): InlineNode[] {
  return value ? [{ type: 'text', value: decodeEntities(value) }] : [];
}

/** marked escapes `&`, `<`, `>` and quotes in text; the viewer shows plain characters. */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function trimLeadingSpace(nodes: InlineNode[]): InlineNode[] {
  const first = nodes[0];
  if (first?.type !== 'text') return nodes;
  const value = first.value.replace(/^\s+/, '');
  return value ? [{ ...first, value }, ...nodes.slice(1)] : nodes.slice(1);
}

function merge(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    if (node.type === 'text' && last?.type === 'text') out[out.length - 1] = { ...last, value: last.value + node.value };
    else out.push(node);
  }
  return out;
}

/**
 * Flip the nth task checkbox (`- [ ]` ↔ `- [x]`) in the source, counting task
 * items in document order like `parseMarkdown` does. Code blocks are skipped
 * so a checkbox shown inside a fence is never counted.
 */
export function toggleTaskInMarkdown(markdown: string, taskIndex: number): string {
  const lines = markdown.split('\n');
  let seen = 0;
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = /^\s*(```|~~~)/.exec(line);
    if (fenceMatch) {
      fence = fence === fenceMatch[1] ? null : fence ?? fenceMatch[1];
      continue;
    }
    if (fence) continue;
    const task = /^(\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/.exec(line);
    if (!task) continue;
    if (seen === taskIndex) {
      const mark = task[2] === ' ' ? 'x' : ' ';
      lines[i] = `${task[1]}[${mark}]${line.slice(task[0].length)}`;
      return lines.join('\n');
    }
    seen += 1;
  }
  return markdown;
}
