import {useEffect, useState} from 'react';
import Markdown from 'react-markdown';
import gfm from 'remark-gfm';
import math from 'remark-math';
import katex from 'rehype-katex';

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
  const [aiInstructions,setAiInstructions] = useState('Compare all mathematical symbols, questions, tables, and missing text against the PNG.');
  const [maxRegions,setMaxRegions] = useState(6);
  const [maxPasses,setMaxPasses] = useState(2);
  const [segmentation,setSegmentation] = useState('layout');
  const [deepJob,setDeepJob] = useState(null);
  const [deepLoading,setDeepLoading] = useState(false);
  const [revisions,setRevisions] = useState([]);
  const [approvedRevisionId,setApprovedRevisionId] = useState(null);
  const [selectedRevisionId,setSelectedRevisionId] = useState('');
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [savedId,setSavedId] = useState('');
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
    setSavedId('');setSelectedRevisionId('');setRevisions([]);setApprovedRevisionId(null);setDeepJob(null);setDeepLoading(false);
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
    const value = await send('/api/v1/markdown/compare',{markdownBlob:name,instructions:aiInstructions});
    if (value.originalEtag !== page.originalEtag) throw new Error('Source changed. Refresh the page.');
    setDraft(value.correctedMarkdown);
    setChanges(value.changes || []);
    setUncertainties(value.uncertainties || []);
    setSavedId('');
    setMessage('AI proposed corrections. Review all changes before saving.');
  });
  async function deepReview() {
    if(draft !== page.markdown && !window.confirm('Deep review will propose edits to your current draft. Continue?'))return;
    setError('');setMessage('');setDeepLoading(true);setDeepJob(null);
    try {
      const started=await send('/api/v1/markdown/deep-review',{
        markdownBlob:name,originalEtag:page.originalEtag,markdown:draft,
        instructions:aiInstructions,maxRegions,maxPasses,mode:segmentation
      });
      // Poll while this component remains mounted. Cleanup on unmount below.
      setDeepJob({jobId:started.jobId,status:started.status});
    }catch(err){setDeepLoading(false);setError(err.message);}
  }
  useEffect(()=>{
    const id=deepJob?.jobId;
    if(!id || !deepLoading)return undefined;
    let active=true;
    const poll=async()=>{
      try{
        const result=await request(`/api/v1/markdown/deep-review/${encodeURIComponent(id)}`);
        if(!active)return;
        setDeepJob(result);
        if(['FAILED','REVIEW_REQUIRED'].includes(result.status)){
          setDeepLoading(false);
          if(result.status==='FAILED')setError(result.error || 'Deep review failed');
          else setMessage('Deep review complete. Check every flagged region and correction before saving.');
        }
      }catch(err){if(active){setDeepLoading(false);setError(err.message);}}
    };
    poll();const timer=setInterval(poll,3000);
    return()=>{active=false;clearInterval(timer);};
  },[deepJob?.jobId,deepLoading]);
  function applyDeepDraft(){
    if(!deepJob?.correctedMarkdown || deepJob.status!=='REVIEW_REQUIRED')return;
    if(!window.confirm('Replace your current editor draft with the proposed deep correction? Review all changes before saving.'))return;
    setDraft(deepJob.correctedMarkdown);setSavedId('');setSelectedRevisionId('');
    setMessage('Deep correction loaded into editor. Human review and Save New Revision are still required.');
  }
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
    if (!revisionId) {setSelectedRevisionId('');return;}
    if (draft !== page.markdown && !window.confirm('Loading a revision replaces unsaved edits. Continue?')) return;
    const value = await request(`/api/v1/markdown/corrections/${encodeURIComponent(revisionId)}?markdownBlob=${encodeURIComponent(name)}`);
    setDraft(value.correctedMarkdown);
    setSelectedRevisionId(revisionId);
    setSavedId(revisionId);
    setMessage('Loaded saved revision.');
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
      <button type="button" disabled={!!busy || !page.sourceUrl} onClick={compare}>{busy==='ai'?'Comparing...':'AI Compare PNG + Markdown'}</button>
      <button type="button" disabled={!!busy || unchanged} onClick={() => {setDraft(page.markdown);setChanges([]);setUncertainties([]);setSavedId('');setSelectedRevisionId('');}}>Reset to original</button>
      <button type="button" disabled={!!busy} onClick={save}>{busy==='save'?'Saving...':'Save New Revision'}</button>
      <button type="button" disabled={!!busy || !savedId} onClick={approve}>Approve Saved Revision</button>
    </div>
    <div className="deep-review-controls">
      <h4>AI correction instructions</h4>
      <textarea className="deep-instructions" value={aiInstructions} maxLength={2000} onChange={e=>setAiInstructions(e.target.value)} aria-label="AI correction instructions"/>
      <div className="deep-review-options">
        <label>Crop strategy <select value={segmentation} onChange={e=>setSegmentation(e.target.value)}><option value="layout">Layout-assisted coverage</option><option value="grid">Overlapping grid</option></select></label>
        <label>Regions <select value={maxRegions} onChange={e=>setMaxRegions(Number(e.target.value))}>{[4,6,8,12].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <label>Verification passes <select value={maxPasses} onChange={e=>setMaxPasses(Number(e.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      </div>
      <div className="correction-actions">
        <button type="button" disabled={!!busy || deepLoading || !page.sourceUrl} onClick={deepReview}>{deepLoading ? 'Deep review running…' : 'Deep Correct & Verify'}</button>
        <button type="button" disabled={!!busy || deepLoading || deepJob?.status!=='REVIEW_REQUIRED'} onClick={applyDeepDraft}>Apply Deep Correction to Editor</button>
      </div>
      {deepJob && <section className="deep-review-result" aria-live="polite">
        <b>Deep review: {deepJob.status}</b>
        <p>Regions processed: {deepJob.regions?.length || 0} · Proposed edits: {deepJob.summary?.appliedEdits || 0} · Unresolved issues: {deepJob.summary?.unresolvedIssues || 0} · Uncertainties: {deepJob.summary?.uncertaintyCount || 0}</p>
        {(deepJob.regions || []).map(r=><details key={r.id}><summary>{r.id}: {r.status} · {r.applied?.length || 0} changes · {r.issues?.length || 0} issues</summary>
          {(r.applied || []).map((v,i)=><p key={`a${i}`}><b>Proposed edit:</b> {v.before} → {v.after}</p>)}
          {(r.issues || []).map((v,i)=><p key={`i${i}`}><b>{v.type}:</b> {v.message}</p>)}
          {(r.uncertainties || []).map((v,i)=><p key={`u${i}`}><b>Uncertain:</b> {String(v)}</p>)}
          {(r.rejected || []).map((v,i)=><p key={`r${i}`}><b>Unapplied:</b> {v.reason} — {v.before}</p>)}
        </details>)}
        {(deepJob.checks?.arithmetic || []).map((v,i)=><p key={`m${i}`}><b>Arithmetic review:</b> {v.message}</p>)}
        {deepJob.error && <p role="alert">{deepJob.error}</p>}
        <small>Model verification does not prove full accuracy. Inspect the original image and review all unresolved content manually.</small>
      </section>}
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
    <div className="correction-history"><h4>Saved correction revisions</h4>
      <select value={selectedRevisionId} disabled={!!busy} onChange={e=>selectRevision(e.target.value)} aria-label="Saved revision">
        <option value="">Choose revision...</option>
        {revisions.map(item=><option value={item.revisionId} key={item.revisionId}>{item.createdAt} - {item.revisionId.slice(0,8)} {item.revisionId===approvedRevisionId?'(APPROVED)':''}</option>)}
      </select>
      <small>Saving creates a new revision. Approval writes a separate pointer. Neither changes the original OCR file or Databricks tables.</small>
    </div>
  </section>;
}
