// Shared by React and Node. Split at blank lines except inside fenced code blocks.
// Blocks can be re-serialized into a new immutable Markdown revision.
export function markdownBlocks(markdown) {
  const body = String(markdown || '').replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '');
  const lines = body.split(/\r?\n/);
  const blocks = [];
  let group = [];
  let fence = null;
  function flush() {
    const value = group.join('\n').trim();
    if (value) blocks.push({id:`block-${blocks.length}`, markdown:value});
    group = [];
  }
  for (const line of lines) {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      const char = marker[1][0];
      if (!fence) fence = {char, size:marker[1].length};
      else if (fence.char === char && marker[1].length >= fence.size) fence = null;
    }
    if (!fence && !line.trim()) flush();
    else group.push(line);
  }
  flush();
  return blocks;
}
export const DEFAULT_WIDTH = '100';
export const VALID_WIDTHS = ['100','75','50'];
export const VALID_ALIGNMENTS = ['left','center','right'];
export function defaultLayout(markdown) {
  return markdownBlocks(markdown).map(block => ({id:block.id,width:DEFAULT_WIDTH,align:'left'}));
}
export function validateLayoutBlocks(markdown, items) {
  const expected = markdownBlocks(markdown);
  if (!Array.isArray(items) || items.length !== expected.length || items.length > 150) {
    throw new Error('Layout does not match the number of Markdown blocks');
  }
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !/^block-\d+$/.test(item.id) ||
        seen.has(item.id) || !VALID_WIDTHS.includes(String(item.width)) ||
        !VALID_ALIGNMENTS.includes(item.align)) {
      throw new Error('Invalid layout block');
    }
    seen.add(item.id);
  }
  if (!expected.every(block => seen.has(block.id))) throw new Error('Layout block IDs do not match revision');
  return items.map(item => ({id:item.id,width:String(item.width),align:item.align}));
}

// Reorder existing blocks without changing their contents or YAML front matter.
// Width and alignment are rendering metadata; Markdown itself stores block order.
export function serializeReorderedMarkdown(markdown, items) {
  const normalized = validateLayoutBlocks(markdown, items);
  const raw = String(markdown || '');
  const front = raw.match(/^---\s*\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/)?.[0] || '';
  const source = markdownBlocks(raw);
  const byId = new Map(source.map(block => [block.id,block.markdown]));
  const body = normalized.map(item => byId.get(item.id)).join('\n\n');
  // Keep the original YAML text byte-for-byte and preserve trailing newline convention.
  return front + body + (raw.endsWith('\n') ? '\n' : '');
}

export function layoutForReorderedMarkdown(markdown, items) {
  const normalized = validateLayoutBlocks(markdown, items);
  return normalized.map((item, index) => ({
    id: `block-${index}`, width: item.width, align: item.align
  }));
}
