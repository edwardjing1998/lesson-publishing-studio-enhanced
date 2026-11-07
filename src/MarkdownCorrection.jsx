import {useEffect, useState} from 'react';
import Markdown from 'react-markdown';
import gfm from 'remark-gfm';
import math from 'remark-math';
import katex from 'rehype-katex';
import RenderedMarkdownModal from './RenderedMarkdownModal.jsx';

async function request(url, options = {}) {
  const response = await fetch(url, {
    cache:'no-store',
    ...options,
    headers:{'Content-Type':'application/json',...(options.headers || {})}
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}
const send = (url, body) => request(url, {method:'POST', body:JSON.stringify(body)});
const stripFrontmatter = value => (value || '').replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');

export default function MarkdownCorrection({page}) {
  const [draft,setDraft] = useState(page?.markdown || '');
  const [changes,setChanges] = useState([]);
  const [uncertainties,setUncertainties] = useState([]);
  const [note,setNote] = useState('');
  const [revisions,setRevisions] = useState([]);
  const [approvedRevisionId,setApprovedRevisionId] = useState(null);
  const [selectedRevisionId,setSelectedRevisionId] = useState('');
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [savedId,setSavedId] = useState('');
  const [fullPreviewOpen,setFullPreviewOpen] = useState(false);
  const [revisionPreview,setRevisionPreview] = useState(null);
  const name = page?.markdownBlob || '';
  const historyUrl = `/api/v1/markdown/corrections?markdownBlob=${encodeURIComponent(name)}`;

  async function refreshHistory() {
    const value = await request(historyUrl);
    setRevisions(value.items || []);
    setApprovedRevisionId(value.approvedRevisionId || null);
  }
  useEffect(() => {
    let active = true;
    setDraft(page?.markdown || '');
    setChanges([]);setUncertainties([]);setError('');setMessage('');
    setSavedId('');setSelectedRevisionId('');setRevisions([]);setApprovedRevisionId(null);setRevisionPreview(null);
    if (!name) return () => {active=false;};
    request(`/api/v1/markdown/corrections?markdownBlob=${encodeURIComponent(name)}`)
      .then(value => {if(active){setRevisions(value.items || []);setApprovedRevisionId(value.approvedRevisionId || null);}})
      .catch(err => {if(active)setError(err.message);});
    return () => {active=false;};
  }, [name, page?.originalEtag]);

  async function run(action, callback) {
    setBusy(action);setError('');setMessage('');
    try {await callback();}
    catch(err){setError(err.message || 'Request failed');}
    finally{setBusy('');}
  }
  const compare = () => run('ai',async () => {
    if (draft !== page.markdown && !window.confirm('AI comparison will replace your unsaved edits. Continue?')) return;
    const value = await send('/api/v1/markdown/compare',{markdownBlob:name});
    if (value.originalEtag !== page.originalEtag) throw new Error('Source changed. Refresh the page.');
    setDraft(value.correctedMarkdown);
    setChanges(value.changes || []);
    setUncertainties(value.uncertainties || []);
    setSavedId('');
    setMessage('AI proposed corrections. Review all changes before saving.');
  });
  const save = () => run('save',async () => {
    const value = await send('/api/v1/markdown/corrections',{
      markdownBlob:name,originalEtag:page.originalEtag,correctedMarkdown:draft,note
    });
    setSavedId(value.revisionId);
    setSelectedRevisionId(value.revisionId);
    await refreshHistory();
    setMessage(`Saved immutable draft ${value.revisionId}. Original content.md was not changed.`);
  });
  const selectRevision = revisionId => run('load',async () => {
    if (!revisionId) {setSelectedRevisionId('');setRevisionPreview(null);return;}
    if (draft !== page.markdown && !window.confirm('Loading a revision replaces unsaved edits. Continue?')) return;
    const value = await request(`/api/v1/markdown/corrections/${encodeURIComponent(revisionId)}?markdownBlob=${encodeURIComponent(name)}`);
    setDraft(value.correctedMarkdown);
    setSelectedRevisionId(revisionId);
    setRevisionPreview(null);
    setSavedId(revisionId);
    setMessage('Loaded saved revision.');
  });
  // Preview only an immutable saved revision fetched from Azure. Do not preview
  // draft text here or replace unsaved edits in the editor.
  const openSavedRevisionPreview = () => run('preview-revision', async () => {
    if (!selectedRevisionId) throw new Error('Choose a saved revision to preview.');
    const revisionId = selectedRevisionId;
    const value = await request(`/api/v1/markdown/corrections/${encodeURIComponent(revisionId)}?markdownBlob=${encodeURIComponent(name)}`);
    if (typeof value.correctedMarkdown !== 'string') throw new Error('Saved revision has no Markdown content.');
    setRevisionPreview({
      revisionId,
      markdown: value.correctedMarkdown,
      createdAt: revisions.find(item => item.revisionId === revisionId)?.createdAt || '',
      approved: revisionId === approvedRevisionId
    });
  });
  const approve = () => run('approve',async () => {
    if (!savedId) throw new Error('Save a revision before approving.');
    const answer = window.confirm('Approve this saved revision? This does NOT reingest Databricks or replace content.md.');
    if (!answer) return;
    const result = await send(`/api/v1/markdown/corrections/${encodeURIComponent(savedId)}/approve`,{markdownBlob:name});
    await refreshHistory();
    setMessage(`Revision ${result.revisionId} approved. Downstream Databricks sync: NOT_STARTED.`);
  });
  if (!page) return null;
  const unchanged = draft === page.markdown;
  return <section className="markdown-correction" aria-label="Markdown correction editor">
    <header className="correction-heading">
      <div><h3>Markdown Correction</h3><p>Original PNG is the reference. AI suggestions must be reviewed before approval.</p></div>
      <span className="correction-status">{approvedRevisionId ? `Approved: ${approvedRevisionId.slice(0,8)}` : 'Not approved'}</span>
    </header>
    {!page.sourceUrl && <p className="source-browser-error">No original source image was found. Manual corrections are available, but AI comparison requires a PNG/JPEG/WebP.</p>}
    {error && <p className="source-browser-error" role="alert">{error}</p>}
    {message && <p className="correction-message" role="status">{message}</p>}
    <div className="correction-actions">
      <button type="button" onClick={() => setFullPreviewOpen(true)}>Enlarge Rendered Markdown</button>
      <button type="button" disabled={!!busy || !page.sourceUrl} onClick={compare}>{busy==='ai'?'Comparing...':'AI Compare PNG + Markdown'}</button>
      <button type="button" disabled={!!busy || unchanged} onClick={() => {setDraft(page.markdown);setChanges([]);setUncertainties([]);setSavedId('');setSelectedRevisionId('');}}>Reset to original</button>
      <button type="button" disabled={!!busy} onClick={save}>{busy==='save'?'Saving...':'Save New Revision'}</button>
      <button type="button" disabled={!!busy || !savedId} onClick={approve}>Approve Saved Revision</button>
    </div>
    <label className="correction-note">Revision note
      <input value={note} maxLength={1000} onChange={e=>setNote(e.target.value)} placeholder="Describe the corrections" />
    </label>
    <div className="correction-columns">
      <div className="correction-pane"><h4>Original image</h4>
        {page.sourceUrl ? (/\.pdf$/i.test(page.sourceBlob || '') ?
          <iframe src={page.sourceUrl} title="Original textbook page"/> :
          <img src={page.sourceUrl} alt="Original textbook page"/>) : <p>Not available</p>}
      </div>
      <div className="correction-pane"><h4>Editable corrected Markdown</h4>
        <textarea spellCheck={false} value={draft} onChange={e=>{setDraft(e.target.value);setSavedId('');setSelectedRevisionId('');}} aria-label="Corrected Markdown"/>
      </div>
      <div className="correction-pane"><h4>Rendered draft preview</h4>
        <div className="correction-rendered"><Markdown remarkPlugins={[gfm,math]} rehypePlugins={[katex]}
          components={{img:({src,alt})=>page.figureUrls?.[src] ? <img src={page.figureUrls[src]} alt={alt || 'Figure'}/> : <span>[Missing figure: {alt || src}]</span>}}>
          {stripFrontmatter(draft)}
        </Markdown></div>
      </div>
    </div>
    {(changes.length > 0 || uncertainties.length > 0) && <div className="correction-findings">
      <h4>AI review findings (not verified)</h4>
      {changes.map((x,i)=><p key={i}><b>{x.category || 'Change'}:</b> {x.before || ''} {' -> '} {x.after || ''} {x.reason ? `(${x.reason})` : ''}</p>)}
      {uncertainties.map((x,i)=><p key={`u${i}`}><b>Uncertain:</b> {String(x)}</p>)}
    </div>}
    {fullPreviewOpen && <RenderedMarkdownModal markdown={draft} figureUrls={page.figureUrls} title="Corrected Markdown — Full-page preview" onClose={() => setFullPreviewOpen(false)}/>}
    <div className="correction-history"><h4>Saved correction revisions</h4>
      <div className="correction-revision-controls">
      <select value={selectedRevisionId} disabled={!!busy} onChange={e=>selectRevision(e.target.value)} aria-label="Saved revision">
        <option value="">Choose revision...</option>
        {revisions.map(item=><option value={item.revisionId} key={item.revisionId}>{item.createdAt} - {item.revisionId.slice(0,8)} {item.revisionId===approvedRevisionId?'(APPROVED)':''}</option>)}
      </select>
      <button type="button" className="saved-revision-preview-button" disabled={!!busy || !selectedRevisionId} onClick={openSavedRevisionPreview}>{busy === 'preview-revision' ? 'Loading preview...' : 'Enlarge Saved Revision'}</button>
      </div>
      <small>Choose a saved revision, enlarge it, drag Markdown blocks to reorder them, and save the revision-specific layout JSON. The saved Markdown text itself is unchanged.</small>
      <small>Saving creates a new revision. Approval writes a separate pointer. Neither changes the original OCR file or Databricks tables.</small>
    </div>
    {revisionPreview && <RenderedMarkdownModal markdown={revisionPreview.markdown} figureUrls={page.figureUrls} title={`Saved revision ${revisionPreview.revisionId.slice(0,8)}${revisionPreview.approved ? ' (APPROVED)' : ''}`} revisionId={revisionPreview.revisionId} markdownBlob={name} onClose={() => setRevisionPreview(null)}/>}
  </section>;
}
