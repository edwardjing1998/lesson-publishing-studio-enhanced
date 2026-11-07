import path from 'node:path/posix';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

// The browser uses the same storage account, container, and managed identity
// as the existing Studio. It does not read or change learning-plan records.
let container;
function storage() {
  if (!container) {
    container = new BlobServiceClient(
      process.env.AZURE_STORAGE_ENDPOINT,
      new DefaultAzureCredential()
    ).getContainerClient(process.env.AZURE_STORAGE_CONTAINER);
  }
  return container;
}

function prefix(name, fallback) {
  const value = String(process.env[name] || fallback).replace(/^\/+|\/+$/g, '');
  if (!value || value.split('/').some(part => part === '.' || part === '..')) {
    throw new Error(`Invalid ${name}`);
  }
  return `${value}/`;
}
const generatedPrefix = () => prefix('AZURE_STORAGE_REVIEW_PREFIX', 'generated');
const sourcePrefix = () => prefix('AZURE_STORAGE_SOURCE_PREFIX', 'source');

function validBlobName(value, allowedPrefixes) {
  const name = String(value || '');
  if (!name || name.startsWith('/') || name.includes('\\') ||
      name.split('/').some(part => !part || part === '.' || part === '..') ||
      /[\u0000-\u001f]/.test(name) ||
      !allowedPrefixes.some(allowed => name.startsWith(allowed))) {
    const error = new Error('Invalid or disallowed blob name');
    error.statusCode = 400;
    throw error;
  }
  return name;
}

async function readLimitedBlob(name, maxBytes) {
  const blob = storage().getBlobClient(name);
  const properties = await blob.getProperties();
  if (properties.contentLength > maxBytes) {
    const error = new Error('Source file exceeds preview size limit');
    error.statusCode = 413;
    throw error;
  }
  const bytes = await blob.downloadToBuffer();
  if (bytes.length > maxBytes) throw Object.assign(new Error('Source file too large'), {statusCode: 413});
  return { bytes, contentType: properties.contentType, etag: properties.etag };
}

export async function listSourcePages() {
  const root = generatedPrefix();
  const pages = [];
  const maxPages = Number(process.env.SOURCE_BROWSER_MAX_PAGES || 5000);
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 50000) {
    throw new Error('Invalid SOURCE_BROWSER_MAX_PAGES');
  }
  // A limit prevents unbounded memory usage. For larger libraries, implement a
  // continuation-token based endpoint before raising this limit.
  for await (const item of storage().listBlobsFlat({prefix: root})) {
    if (!item.name.endsWith('/content.md')) continue;
    const segments = item.name.slice(root.length).split('/');
    if (segments.length < 4) continue;
    const [bookId, chapterId, ...pageParts] = segments.slice(0, -1);
    const pageId = pageParts.join('/');
    if (!bookId || !chapterId || !pageId) continue;
    pages.push({
      id: `${bookId}/${chapterId}/${pageId}`,
      bookId,
      chapterId,
      pageId,
      markdownBlob: item.name
    });
    if (pages.length > maxPages) {
      throw Object.assign(new Error('Too many pages. Narrow AZURE_STORAGE_REVIEW_PREFIX or add paging.'), {statusCode: 413});
    }
  }
  return pages.sort((a, b) => a.id.localeCompare(b.id, undefined, {numeric: true}));
}

function resolveFigure(markdownBlob, target) {
  // Permit only relative images contained in the selected generated page.
  if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(target)) return null;
  const base = path.dirname(markdownBlob);
  const clean = target.split(/[?#]/)[0];
  let decoded;
  try { decoded = decodeURIComponent(clean); } catch { return null; }
  const name = path.normalize(path.join(base, decoded));
  return name.startsWith(`${base}/`) ? name : null;
}

async function originalSource(markdown, markdownBlob) {
  const generated = generatedPrefix();
  const source = sourcePrefix();
  const relative = markdownBlob.slice(generated.length).split('/');
  const [book, chapter, ...pagePart] = relative.slice(0, -1);
  const page = pagePart.join('/');
  const declared = markdown.match(/^---[\s\S]*?^sourceBlob:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1]?.trim();
  const candidates = [];
  if (declared && !declared.includes('://')) {
    const normalized = declared.replace(/^\/+/, '');
    // First try the source path recorded in the front matter.
    if (normalized.startsWith(source)) candidates.push(normalized);
  }
  if (book && chapter && page) {
    for (const ext of ['png','jpg','jpeg','webp','pdf']) {
      candidates.push(`${source}${book}/${chapter}/${page}.${ext}`);
      const compact = page.replace(/page-(\d+)/gi, 'page$1');
      if (compact !== page) candidates.push(`${source}${book}/${chapter}/${compact}.${ext}`);
    }
  }
  for (const candidate of new Set(candidates)) {
    try {
      validBlobName(candidate, [source]);
      if (await storage().getBlobClient(candidate).exists()) return candidate;
    } catch { /* Try the next candidate. */ }
  }
  return null;
}

export async function getSourcePage(markdownBlob) {
  const name = validBlobName(markdownBlob, [generatedPrefix()]);
  if (!name.endsWith('/content.md')) throw Object.assign(new Error('Expected content.md'), {statusCode: 400});
  const {bytes, etag} = await readLimitedBlob(name, 2 * 1024 * 1024);
  const markdown = bytes.toString('utf8');
  const base = name.slice(0, -'content.md'.length);
  let layout = null;
  try {
    const result = await readLimitedBlob(`${base}layout.json`, 8 * 1024 * 1024);
    layout = JSON.parse(result.bytes.toString('utf8'));
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
  const figureUrls = {};
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1].trim().replace(/\s+["'][^"']*["']$/, '');
    const blob = resolveFigure(name, link);
    if (blob) figureUrls[link] = `/api/source-browser/blob?name=${encodeURIComponent(blob)}`;
  }
  const sourceBlob = await originalSource(markdown, name);
  return {
    markdownBlob: name,
    originalEtag: etag,
    markdown,
    layout,
    sourceBlob,
    sourceUrl: sourceBlob ? `/api/source-browser/blob?name=${encodeURIComponent(sourceBlob)}` : null,
    figureUrls
  };
}

export async function getSourceBlob(name) {
  const allowed = [generatedPrefix(), sourcePrefix()];
  const value = validBlobName(name, allowed);
  if (!/\.(?:png|jpe?g|webp|gif|pdf)$/i.test(value)) {
    throw Object.assign(new Error('Only preview image/PDF files are served'), {statusCode: 400});
  }
  return readLimitedBlob(value, 12 * 1024 * 1024);
}

export function mountSourceBrowser(app) {
  app.get('/api/source-browser/pages', async (_req, res) => {
    res.json({outputPrefix: generatedPrefix(), pages: await listSourcePages()});
  });
  app.get('/api/source-browser/page', async (req, res) => {
    res.json(await getSourcePage(req.query.markdownBlob));
  });
  app.get('/api/source-browser/blob', async (req, res) => {
    const {bytes, contentType} = await getSourceBlob(req.query.name);
    const extension = path.extname(String(req.query.name)).toLowerCase();
    const type = ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.pdf':'application/pdf'})[extension];
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, no-store');
    res.type(type || contentType || 'application/octet-stream').send(bytes);
  });
}
