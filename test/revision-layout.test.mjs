import test from 'node:test';
import assert from 'node:assert/strict';
import {markdownBlocks,defaultLayout,validateLayoutBlocks,serializeReorderedMarkdown,layoutForReorderedMarkdown} from '../shared/markdown-blocks.mjs';

test('front matter is not a draggable content block',()=>{
  const b=markdownBlocks('---\nsourceBlob: source/a.png\n---\n\n# Heading\n\nParagraph');
  assert.equal(b.length,2);assert.equal(b[0].markdown,'# Heading');
});
test('blank lines inside code fence do not split',()=>{
  const b=markdownBlocks('```js\nconst a=1;\n\nconst b=2;\n```\n\nAfter');
  assert.equal(b.length,2);
});
test('only exact block IDs can be reordered',()=>{
  const markdown='# Heading\n\nText';
  const b=defaultLayout(markdown).reverse();
  assert.equal(validateLayoutBlocks(markdown,b)[0].id,'block-1');
  assert.throws(()=>validateLayoutBlocks(markdown,[b[0],b[0]]));
  assert.throws(()=>validateLayoutBlocks(markdown,[{...b[0],width:'999'},b[1]]));
});

test('saving reordered content preserves original YAML frontmatter and figure links',()=>{
  const original='---\nsourceBlob: source/page.png\n---\n\n# Math\n\n![Figure](figures/a.png)\n\n6 × 8 = 48\n';
  const reversed=defaultLayout(original).reverse();
  const next=serializeReorderedMarkdown(original,reversed);
  assert.equal(next,'---\nsourceBlob: source/page.png\n---\n6 × 8 = 48\n\n![Figure](figures/a.png)\n\n# Math\n');
  assert.deepEqual(markdownBlocks(next).map(x=>x.markdown),['6 × 8 = 48','![Figure](figures/a.png)','# Math']);
  assert.deepEqual(layoutForReorderedMarkdown(original,reversed).map(x=>x.id),['block-0','block-1','block-2']);
});
test('rejects incomplete or repeated IDs before writing Markdown',()=>{
  const source='# Heading\n\nAnother paragraph';
  assert.throws(()=>serializeReorderedMarkdown(source,[defaultLayout(source)[0]]));
  assert.throws(()=>serializeReorderedMarkdown(source,[defaultLayout(source)[0],defaultLayout(source)[0]]));
});
