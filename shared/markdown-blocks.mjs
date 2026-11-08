// Shared by the React layout editor and the Node.js correction validator.
// The YAML prefix (including the blank lines immediately after it) is immutable.
export function splitMarkdownFrontMatter(markdown) {
  const raw = String(markdown ?? '');
  // Match only a YAML header at the beginning of the document. Do not use
  // \s here: it also matches newlines and can absorb/alter the separator.
  const header = raw.match(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!header) return {frontMatter: '', body: raw};

  // Preserve *all* immediately following blank lines, including CRLF and
  // whitespace-only lines. The original validation guards this entire prefix.
  const afterHeader = raw.slice(header[0].length);
  const separator = afterHeader.match(/^(?:[ \t]*\r?\n)*/)?.[0] ?? '';
  const length = header[0].length + separator.length;
  return {frontMatter: raw.slice(0, length), body: raw.slice(length)};
}

// Split body at blank lines, but never split inside fenced code blocks.
export function markdownBlocks(markdown) {
  const {body} = splitMarkdownFrontMatter(markdown);
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
  if (!expected.every(block => seen.has(block.id))) {
    throw new Error('Layout block IDs do not match revision');
  }
  return items.map(item => ({id:item.id,width:String(item.width),align:item.align}));
}

// Reorder the body blocks, preserving the exact original YAML prefix.
// Width and alignment stay in layout.json; Markdown represents document order.
export function serializeReorderedMarkdown(markdown, items) {
  const normalized = validateLayoutBlocks(markdown, items);
  const raw = String(markdown ?? '');
  const {frontMatter} = splitMarkdownFrontMatter(raw);
  const source = markdownBlocks(raw);
  const byId = new Map(source.map(block => [block.id,block.markdown]));
  const newline = raw.includes('\r\n') && !/(^|[^\r])\n/.test(raw) ? '\r\n' : '\n';
  const body = normalized.map(item => byId.get(item.id).replace(/\n/g, newline))
    .join(newline + newline);
  const trailing = raw.endsWith('\r\n') ? '\r\n' : raw.endsWith('\n') ? '\n' : '';
  // Do not add a second terminal newline when the source has zero body blocks.
  return frontMatter + body + (body ? trailing : '');
}

export function layoutForReorderedMarkdown(markdown, items) {
  const normalized = validateLayoutBlocks(markdown, items);
  return normalized.map((item, index) => ({
    id:`block-${index}`, width:item.width, align:item.align
  }));
}
