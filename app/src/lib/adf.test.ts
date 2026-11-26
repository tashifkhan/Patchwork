import { describe, expect, test } from 'bun:test';

import { adfFromSegments, adfSegments, adfToMarkdown, markdownToAdf, survivesMarkdown, type AdfNode } from './adf';

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

  test('bold split across nodes, with spaces at its edges, stays bold', () => {
    // From a real description: "** **Wants to…" showed literal asterisks.
    const result = adfToMarkdown(
      doc({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [text(' ', 'strong'), text('Wants to ship ', 'strong'), text('soon')] }],
      })
    );
    expect(result.markdown).toBe('>  **Wants to ship** soon');
    expect(result.markdown).not.toContain('** **');
  });

  test('whitespace-only marked text gets no markers', () => {
    expect(adfToMarkdown(doc({ type: 'paragraph', content: [text('a'), text(' ', 'em'), text('b')] })).markdown).toBe(
      'a b'
    );
  });

  test('mentions, status and smart links are lossy', () => {
    const result = adfToMarkdown(
      doc({
        type: 'paragraph',
        content: [
          { type: 'mention', attrs: { id: '1', text: '@Bob' } },
          { type: 'status', attrs: { text: 'Done', color: 'green' } },
        ],
      })
    );
    expect(result).toEqual({ markdown: '@BobDone', lossless: false });
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

describe('description segments', () => {
  const image: AdfNode = {
    type: 'mediaSingle',
    attrs: { layout: 'center' },
    content: [{ type: 'media', attrs: { id: 'm1', type: 'file', collection: 'c' } }],
  };
  const table: AdfNode = {
    type: 'table',
    content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [text('H')] }] }] }],
  };
  const mention: AdfNode = { type: 'paragraph', content: [text('Ping '), { type: 'mention', attrs: { id: '9', text: '@Ana' } }] };
  const source = doc(
    { type: 'paragraph', content: [text('Intro '), text('bold', 'strong')] },
    image,
    { type: 'heading', attrs: { level: 2 }, content: [text('Steps')] },
    { type: 'orderedList', attrs: { order: 1 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('one')] }] }] },
    mention,
    table
  );

  test('split Markdown runs from blocks it cannot hold, ending in text', () => {
    const segments = adfSegments(source);
    expect(segments.map((segment) => (segment.kind === 'text' ? segment.markdown : segment.node.type))).toEqual([
      'Intro **bold**',
      'mediaSingle',
      '## Steps\n\n1. one',
      'paragraph',
      'table',
      '',
    ]);
  });

  test('nothing edited sends back the same document', () => {
    const segments = adfSegments(source);
    expect(adfFromSegments(segments, [])).toEqual(source as never);
  });

  test('editing text keeps images, tables and mentions untouched', () => {
    const segments = adfSegments(source);
    const drafts = segments.map((segment) => (segment.kind === 'text' ? segment.markdown : ''));
    drafts[2] = '## Steps\n\n1. one\n2. two';
    drafts[5] = 'Added at the end';
    const saved = adfFromSegments(segments, drafts);
    expect(saved?.content[1]).toBe(image);
    expect(saved?.content[0]).toBe(source.content[0]);
    expect(saved?.content.find((node) => node.type === 'table')).toBe(table);
    expect(saved?.content).toContain(mention);
    expect(adfToMarkdown(saved).markdown).toContain('2. two');
    expect(saved?.content[saved.content.length - 1]).toEqual({ type: 'paragraph', content: [text('Added at the end')] });
  });

  test('clearing a plain description clears the field', () => {
    const segments = adfSegments(doc({ type: 'paragraph', content: [text('hi')] }));
    expect(adfFromSegments(segments, [''])).toBeNull();
  });

  test('empty descriptions are one empty text segment', () => {
    expect(adfSegments(null)).toEqual([{ kind: 'text', markdown: '', nodes: [] }]);
  });

  test('blocks that would change through Markdown are kept as they are', () => {
    expect(survivesMarkdown({ type: 'paragraph', content: [text('literal *stars* here')] })).toBe(false);
    expect(survivesMarkdown({ type: 'paragraph', content: [text('x', 'underline')] })).toBe(false);
    expect(survivesMarkdown({ type: 'panel', attrs: { panelType: 'info' }, content: [{ type: 'paragraph', content: [text('a')] }] })).toBe(false);
    expect(survivesMarkdown({ type: 'paragraph', content: [text('plain '), text('em', 'em'), text(' ok')] })).toBe(true);
    expect(survivesMarkdown({ type: 'taskList', attrs: { localId: 'a' }, content: [{ type: 'taskItem', attrs: { localId: 'b', state: 'DONE' }, content: [text('done')] }] })).toBe(true);
  });
});
