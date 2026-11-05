import { describe, expect, test } from 'bun:test';

import { parseMarkdown, toggleTaskInMarkdown, type Block } from './markdown';

const NOTE = `I wanna create a custom Tasks App with
proper native system ui

- MD3 --> material you on Android
- Liquid Glass --> iOS

> maybe convert this code to my ![Electron Todo](https://github.com/tashifkhan/electron-todo)

- [ ] Repo ?
- [x] Done thing
  - nested child`;

describe('parseMarkdown', () => {
  const blocks = parseMarkdown(NOTE);

  test('splits into paragraph, list, quote and task list', () => {
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'list', 'blockquote', 'list']);
  });

  test('a single newline is a line break', () => {
    const paragraph = blocks[0] as Extract<Block, { type: 'paragraph' }>;
    expect(paragraph.inline.some((node) => node.type === 'break')).toBe(true);
  });

  test('bullets carry their text without markers', () => {
    const list = blocks[1] as Extract<Block, { type: 'list' }>;
    expect(list.items[0].inline).toEqual([{ type: 'text', value: 'MD3 --> material you on Android' }]);
    expect(list.items[0].checked).toBeNull();
  });

  test('a non-image ![..](url) becomes a link', () => {
    const quote = blocks[2] as Extract<Block, { type: 'blockquote' }>;
    const paragraph = quote.children[0] as Extract<Block, { type: 'paragraph' }>;
    const link = paragraph.inline.find((node) => node.type === 'link');
    expect(link).toMatchObject({ type: 'link', url: 'https://github.com/tashifkhan/electron-todo' });
  });

  test('task items are checkboxes, numbered in order, with nested children', () => {
    const list = blocks[3] as Extract<Block, { type: 'list' }>;
    expect(list.items.map((item) => [item.checked, item.taskIndex])).toEqual([
      [false, 0],
      [true, 1],
    ]);
    expect(list.items[0].inline).toEqual([{ type: 'text', value: 'Repo ?' }]);
    expect(list.items[1].children[0]?.type).toBe('list');
  });

  test('inline styles and code', () => {
    const [paragraph] = parseMarkdown('**bold** _it_ ~~gone~~ `a < b`') as Extract<Block, { type: 'paragraph' }>[];
    expect(paragraph.inline.map((node) => node.type)).toEqual([
      'bold',
      'text',
      'italic',
      'text',
      'strike',
      'text',
      'code',
    ]);
    expect(paragraph.inline[6]).toEqual({ type: 'code', value: 'a < b' });
  });
});

describe('toggleTaskInMarkdown', () => {
  test('flips the nth task and leaves everything else alone', () => {
    expect(toggleTaskInMarkdown(NOTE, 0)).toContain('- [x] Repo ?');
    expect(toggleTaskInMarkdown(NOTE, 1)).toContain('- [ ] Done thing');
    expect(toggleTaskInMarkdown(NOTE, 5)).toBe(NOTE);
  });

  test('ignores checkboxes inside code fences', () => {
    const source = '```\n- [ ] not real\n```\n- [ ] real';
    expect(toggleTaskInMarkdown(source, 0)).toBe('```\n- [ ] not real\n```\n- [x] real');
  });
});
