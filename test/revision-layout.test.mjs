import test from 'node:test';
import assert from 'node:assert/strict';
import {markdownBlocks,defaultLayout,validateLayoutBlocks} from '../shared/markdown-blocks.mjs';

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
