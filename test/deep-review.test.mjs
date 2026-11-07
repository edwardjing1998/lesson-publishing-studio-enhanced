import test from 'node:test';
import assert from 'node:assert/strict';
import {segmentImage,applyExactEdits,validateDeepDraft} from '../server/markdown-deep-review.mjs';

test('overlapping grid covers edges and limits regions',()=>{
 const areas=segmentImage(1200,1800,null,{maxRegions:6});
 assert.equal(areas.length,6);
 assert.equal(areas[0].left,0);assert.equal(areas[0].top,0);
 assert.equal(areas.at(-1).top+areas.at(-1).height,1800);
 assert.ok(areas.every(r=>r.width>0&&r.height>0));
});
test('layout polygons count but do not eliminate image regions',()=>{
 const layout={analyzeResult:{pages:[{width:1200,height:1800,lines:[{polygon:[20,20,100,20,100,60,20,60]}]}]}};
 const areas=segmentImage(1200,1800,layout,{maxRegions:4});
 assert.equal(areas.length,4);
 assert.equal(areas[0].segmentation,'layout-assisted-grid');
});
test('only unique exact matches are applied',()=>{
 const original='---\nsourceBlob: source/a.png\n---\n6 × 3 = 48\n![x](figures/figure-1.png)';
 const result=applyExactEdits(original,[{before:'6 × 3 = 48',after:'6 × 8 = 48'}],original);
 assert.ok(result.markdown.includes('6 × 8 = 48'));
 assert.equal(result.applied.length,1);
 assert.equal(result.rejected.length,0);
});
test('duplicate matches and changed image links are rejected',()=>{
 const original='first first\n![a](figures/f.png)';
 assert.equal(applyExactEdits(original,[{before:'first',after:'second'}],original).applied.length,0);
 assert.throws(()=>validateDeepDraft(original,'first first\n![a](figures/g.png)'));
});
