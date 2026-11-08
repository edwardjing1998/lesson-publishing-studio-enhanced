import {createHash} from 'node:crypto';
import path from 'node:path/posix';
import {BlobServiceClient} from '@azure/storage-blob';
import {DefaultAzureCredential} from '@azure/identity';
import {getRevision, saveRevision} from './markdown-corrections.mjs';
import {validateLayoutBlocks, defaultLayout, serializeReorderedMarkdown, layoutForReorderedMarkdown} from '../shared/markdown-blocks.mjs';

const bad = (message, statusCode = 400) => Object.assign(new Error(message), {statusCode});
const digest = text => createHash('sha256').update(text).digest('hex');
let container;
function blobs() {
  return (container ||= new BlobServiceClient(
    process.env.AZURE_STORAGE_ENDPOINT, new DefaultAzureCredential()
  ).getContainerClient(process.env.AZURE_STORAGE_CONTAINER));
}
function layoutName(revision) {
  // Revision ID and markdownBlob are verified by getRevision().
  const root = path.dirname(revision.markdownBlob);
  return `${root}/corrections/${revision.revisionId}/layout.json`;
}
export async function readRevisionLayout(markdownBlob, revisionId) {
  const revision = await getRevision(markdownBlob, revisionId);
  const target = blobs().getBlobClient(layoutName(revision));
  try {
    const properties = await target.getProperties();
    if (properties.contentLength > 100_000) throw bad('Layout is too large', 413);
    const data = JSON.parse((await target.downloadToBuffer()).toString('utf8'));
    if (data.markdownHash !== digest(revision.correctedMarkdown)) throw bad('Layout is stale for this revision',409);
    const blocks = validateLayoutBlocks(revision.correctedMarkdown, data.blocks);
    return {...data, blocks, layoutEtag:properties.etag};
  } catch (error) {
    if (error.statusCode !== 404) throw error;
    return {
      schema:'studio-markdown-layout/v1',
      revisionId:revision.revisionId,
      markdownBlob:revision.markdownBlob,
      markdownHash:digest(revision.correctedMarkdown),
      blocks:defaultLayout(revision.correctedMarkdown),
      layoutEtag:null,
      updatedAt:null
    };
  }
}
export async function saveRevisionLayout({markdownBlob, revisionId, blocks, layoutEtag, operator}) {
  const revision = await getRevision(markdownBlob, revisionId);
  let normalized;
  try { normalized = validateLayoutBlocks(revision.correctedMarkdown, blocks); }
  catch (error) {throw bad(error.message,422);}
  if (layoutEtag !== null && (typeof layoutEtag !== 'string' || layoutEtag.length > 200)) {
    throw bad('Invalid layoutEtag');
  }
  const data = {
    schema:'studio-markdown-layout/v1',
    revisionId:revision.revisionId,
    markdownBlob:revision.markdownBlob,
    markdownHash:digest(revision.correctedMarkdown),
    blocks:normalized,
    updatedAt:new Date().toISOString(),
    updatedBy:String(operator || 'unknown').slice(0,128)
  };
  const target = blobs().getBlockBlobClient(layoutName(revision));
  const payload = Buffer.from(JSON.stringify(data,null,2));
  try {
    const result = await target.uploadData(payload, {
      conditions:layoutEtag ? {ifMatch:layoutEtag} : {ifNoneMatch:'*'},
      blobHTTPHeaders:{blobContentType:'application/json',blobCacheControl:'private, no-store'}
    });
    return {...data, layoutEtag:result.etag};
  } catch (error) {
    if (error.statusCode === 409 || error.statusCode === 412) {
      throw bad('Layout was updated elsewhere. Close and reopen the popup, then retry.',409);
    }
    throw error;
  }
}

// Create a new immutable Markdown revision, rather than mutating an existing revision.
// The source revision and original Document Intelligence files remain untouched.
export async function saveReorderedRevision({markdownBlob, revisionId, blocks, layoutEtag, operator}) {
  const source = await getRevision(markdownBlob, revisionId);
  let normalized;
  try {normalized = validateLayoutBlocks(source.correctedMarkdown, blocks);}
  catch(error) {throw bad(error.message,422);}

  // Prevent saving a stale layout after another user updated it.
  const existing = await readRevisionLayout(markdownBlob, revisionId);
  if ((existing.layoutEtag || null) !== (layoutEtag || null)) {
    throw bad('Layout changed elsewhere. Reopen the saved revision and try again.',409);
  }
  const correctedMarkdown = serializeReorderedMarkdown(source.correctedMarkdown, normalized);
  const record = await saveRevision({
    markdownBlob,
    originalEtag:source.originalEtag,
    correctedMarkdown,
    note:`Layout reordered from revision ${revisionId}`,
    operator
  });
  // Stable block IDs are regenerated in the new Markdown order.
  const newBlocks = layoutForReorderedMarkdown(source.correctedMarkdown, normalized);
  try {
    await saveRevisionLayout({
      markdownBlob, revisionId:record.revisionId, blocks:newBlocks,
      layoutEtag:null, operator
    });
  } catch (error) {
    // The new .md revision remains valid even if the separate visual layout
    // cannot be saved; report its ID so the user can recover it from history.
    error.message = `Markdown revision ${record.revisionId} was created but layout JSON could not be saved: ${error.message}`;
    throw error;
  }
  return {revisionId:record.revisionId, sourceRevisionId:revisionId,
    correctedMarkdown, markdownPath:record.markdownPath, blocks:newBlocks};
}

export function mountRevisionLayout(app) {
  app.post('/api/v1/markdown/corrections/:revisionId/save-layout-as-revision', async (req,res) => {
    const record = await saveReorderedRevision({
      markdownBlob:req.body?.markdownBlob,
      revisionId:req.params.revisionId,
      blocks:req.body?.blocks,
      layoutEtag:req.body?.layoutEtag ?? null,
      operator:req.operator
    });
    res.status(201).json(record);
  });
  app.get('/api/v1/markdown/corrections/:revisionId/layout', async (req,res) => {
    res.json(await readRevisionLayout(req.query.markdownBlob,req.params.revisionId));
  });
  app.put('/api/v1/markdown/corrections/:revisionId/layout', async (req,res) => {
    res.json(await saveRevisionLayout({
      markdownBlob:req.body?.markdownBlob,
      revisionId:req.params.revisionId,
      blocks:req.body?.blocks,
      layoutEtag:req.body?.layoutEtag ?? null,
      operator:req.operator
    }));
  });
}
