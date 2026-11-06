import { describe, expect, test } from 'bun:test';

import { adfToMarkdown, markdownToAdf, type AdfNode } from './adf';

const doc = (...content: AdfNode[]) => ({ type: 'doc', version: 1, content });
const text = (value: string, ...marks: string[]): AdfNode => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});

describe('adfToMarkdown', () => {
  test('converts headings, marks, links and lists', () => {
    const result = adfToMarkdown(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [text('Plan')] },
        {
          type: 'paragraph',
          content: [
            text('Ship '),
            text('today', 'strong'),
            text(' via '),
            { type: 'text', text: 'docs', marks: [{ type: 'link', attrs: { href: 'https://x.dev' } }] },
          ],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [text('one')] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [text('two', 'code')] }] },
          ],
        },
        {
          type: 'taskList',
          content: [
            { type: 'taskItem', attrs: { state: 'DONE' }, content: [text('done')] },
            { type: 'taskItem', attrs: { state: 'TODO' }, content: [text('next')] },
          ],
        }
      )
    );
    expect(result.lossless).toBe(true);
    expect(result.markdown).toBe(
      '## Plan\n\nShip **today** via [docs](https://x.dev)\n\n- one\n- `two`\n\n- [x] done\n- [ ] next'
    );
  });

  test('flags content Markdown cannot hold', () => {
    const result = adfToMarkdown(
      doc({ type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'a' } }] }, { type: 'paragraph', content: [text('hi')] })
    );
    expect(result.lossless).toBe(false);
    expect(result.markdown).toBe('hi');
  });

  test('empty or missing descriptions are empty text', () => {
    expect(adfToMarkdown(null)).toEqual({ markdown: '', lossless: true });
  });
});

describe('markdownToAdf', () => {
  test('round-trips what the editor writes', () => {
    const markdown = '## Plan\n\nShip **today** via [docs](https://x.dev)\n\n1. one\n2. two\n\n- [x] done\n- [ ] next\n\n> quote\n\n```ts\nconst a = 1;\n```';
    const adf = markdownToAdf(markdown);
    expect(adf?.type).toBe('doc');
    expect(adfToMarkdown(adf).markdown).toBe(markdown);
  });

  test('line breaks become hard breaks, not raw newlines in text', () => {
    const adf = markdownToAdf('line one\nline two');
    expect(adf?.content[0].content?.map((node) => node.type)).toEqual(['text', 'hardBreak', 'text']);
  });

  test('empty text clears the description', () => {
    expect(markdownToAdf('  \n')).toBeNull();
  });
});
