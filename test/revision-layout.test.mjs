import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitMarkdownFrontMatter, markdownBlocks, defaultLayout,
  validateLayoutBlocks, serializeReorderedMarkdown,
  layoutForReorderedMarkdown
} from '../shared/markdown-blocks.mjs';

test('front matter is not a draggable content block', () => {
  const b = markdownBlocks('---\nsourceBlob: source/a.png\n---\n\n# Heading\n\nParagraph');
  assert.equal(b.length, 2);
  assert.equal(b[0].markdown, '# Heading');
});

test('blank lines inside code fence do not split', () => {
  const b = markdownBlocks('```js\nconst a=1;\n\nconst b=2;\n```\n\nAfter');
  assert.equal(b.length, 2);
});

test('only exact block IDs can be reordered', () => {
  const markdown = '# Heading\n\nText';
  const b = defaultLayout(markdown).reverse();
  assert.equal(validateLayoutBlocks(markdown, b)[0].id, 'block-1');
  assert.throws(() => validateLayoutBlocks(markdown, [b[0], b[0]]));
  assert.throws(() => validateLayoutBlocks(markdown, [{...b[0], width:'999'}, b[1]]));
});

test('saving reordered content preserves original YAML frontmatter and figure links', () => {
  const original = '---\nsourceBlob: source/page.png\n---\n\n# Math\n\n![Figure](figures/a.png)\n\n6 × 8 = 48\n';
  const next = serializeReorderedMarkdown(original, defaultLayout(original).reverse());
  assert.equal(next, '---\nsourceBlob: source/page.png\n---\n\n6 × 8 = 48\n\n![Figure](figures/a.png)\n\n# Math\n');
  assert.equal(splitMarkdownFrontMatter(original).frontMatter, splitMarkdownFrontMatter(next).frontMatter);
  assert.deepEqual(markdownBlocks(next).map(x => x.markdown), [
    '6 × 8 = 48', '![Figure](figures/a.png)', '# Math'
  ]);
  assert.deepEqual(layoutForReorderedMarkdown(original, defaultLayout(original).reverse()).map(x => x.id), [
    'block-0','block-1','block-2'
  ]);
});

test('preserves multiple blank lines and whitespace after YAML header exactly', () => {
  const original = '---\nbook_id: book-01\n---\n\n \t\n\n# First\n\nSecond\n';
  const next = serializeReorderedMarkdown(original, defaultLayout(original).reverse());
  assert.equal(splitMarkdownFrontMatter(next).frontMatter, splitMarkdownFrontMatter(original).frontMatter);
  assert.ok(next.endsWith('Second\n\n# First\n'));
});

test('preserves CRLF YAML and CRLF body when reordering', () => {
  const original = '---\r\nbook_id: book-01\r\n---\r\n\r\n# First\r\n\r\nSecond\r\n';
  const next = serializeReorderedMarkdown(original, defaultLayout(original).reverse());
  assert.equal(splitMarkdownFrontMatter(next).frontMatter, splitMarkdownFrontMatter(original).frontMatter);
  assert.equal(next, '---\r\nbook_id: book-01\r\n---\r\n\r\nSecond\r\n\r\n# First\r\n');
});

test('preserves YAML without a separator and no-YAML Markdown', () => {
  const original = '---\nsourceBlob: source/a.png\n---\n# One\n\nTwo';
  const next = serializeReorderedMarkdown(original, defaultLayout(original).reverse());
  assert.equal(splitMarkdownFrontMatter(original).frontMatter, splitMarkdownFrontMatter(next).frontMatter);
  assert.equal(next, '---\nsourceBlob: source/a.png\n---\nTwo\n\n# One');
  const plain = '# One\n\nTwo';
  assert.equal(serializeReorderedMarkdown(plain, defaultLayout(plain).reverse()), 'Two\n\n# One');
});

test('rejects incomplete or repeated IDs before writing Markdown', () => {
  const source = '# Heading\n\nAnother paragraph';
  assert.throws(() => serializeReorderedMarkdown(source,[defaultLayout(source)[0]]));
  assert.throws(() => serializeReorderedMarkdown(source,[defaultLayout(source)[0],defaultLayout(source)[0]]));
});
