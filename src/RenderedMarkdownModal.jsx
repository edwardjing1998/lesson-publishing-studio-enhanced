import {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import Markdown from 'react-markdown';
import gfm from 'remark-gfm';
import math from 'remark-math';
import katex from 'rehype-katex';
import {defaultLayout,markdownBlocks} from '../shared/markdown-blocks.mjs';

function Figure({src,alt,figureUrls}) {
  const url = figureUrls?.[src];
  return url ? <img src={url} alt={alt || 'Extracted figure'} loading="lazy"/> :
    <span className="full-markdown-missing">[Figure not available: {alt || src}]</span>;
}
const getJson = async (url,options={}) => {
  const response = await fetch(url,{cache:'no-store',...options});
  const data = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
};

export default function RenderedMarkdownModal({markdown,figureUrls={},title='Full Markdown preview',onClose,revisionId,markdownBlob,onSavedRevision,initialLayout=null}) {
  const editable = Boolean(revisionId && markdownBlob);
  const content = useMemo(()=>markdownBlocks(markdown),[markdown]);
  const lookup = useMemo(()=>Object.fromEntries(content.map(item=>[item.id,item])),[content]);
  const [blocks,setBlocks] = useState(()=>initialLayout || defaultLayout(markdown));
  const [layoutEtag,setLayoutEtag] = useState(null);
  const [busy,setBusy] = useState(false);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [dirty,setDirty] = useState(false);
  const [dragged,setDragged] = useState(null);
  const closeButton = useRef(null);
  const dragIndex = useRef(null);
  const endpoint = `/api/v1/markdown/corrections/${encodeURIComponent(revisionId || '')}/layout`;

  useEffect(()=>{
    let mounted=true;
    setBlocks(initialLayout || defaultLayout(markdown));setLayoutEtag(null);setDirty(false);setError('');setMessage('');
    if (!editable) return ()=>{mounted=false;};
    setBusy(true);
    getJson(`${endpoint}?markdownBlob=${encodeURIComponent(markdownBlob)}`)
      .then(data=>{if(mounted){setBlocks(data.blocks);setLayoutEtag(data.layoutEtag);}})
      .catch(err=>{if(mounted)setError(err.message);})
      .finally(()=>{if(mounted)setBusy(false);});
    return ()=>{mounted=false;};
  },[markdown,editable,endpoint,markdownBlob,initialLayout]);

  useEffect(()=>{
    const previousFocus=document.activeElement;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeButton.current?.focus();
    const keyDown=event=>{
      if(event.key==='Escape'){event.preventDefault();if(!dirty || window.confirm('Discard unsaved layout changes?'))onClose();}
      if(event.key==='Tab'){
        const root=document.getElementById('full-markdown-dialog');
        const focusable=root?.querySelectorAll('button:not([disabled]),select:not([disabled]),a[href],input:not([disabled])');
        if(!focusable?.length)return;
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',keyDown);
    return ()=>{document.removeEventListener('keydown',keyDown);document.body.style.overflow=previousOverflow;previousFocus?.focus?.();};
  },[onClose,dirty]);

  function update(fn){setBlocks(items=>fn(items));setDirty(true);setMessage('');}
  function move(from,to){
    if(from===null||from===to||from<0||to<0||from>=blocks.length||to>=blocks.length)return;
    update(items=>{const copy=[...items];copy.splice(to,0,copy.splice(from,1)[0]);return copy;});
  }
  function change(id,key,value){update(items=>items.map(item=>item.id===id?{...item,[key]:value}:item));}
  async function save(){
    setSaving(true);setError('');setMessage('');
    try{
      const data=await getJson(`/api/v1/markdown/corrections/${encodeURIComponent(revisionId)}/save-layout-as-revision`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({markdownBlob,blocks,layoutEtag})
      });
      setDirty(false);
      setMessage(`Created a new Markdown revision: ${data.revisionId}`);
      await onSavedRevision?.(data);
    } catch(err){setError(err.message);}finally{setSaving(false);}
  }
  function close(){if(!dirty || window.confirm('Discard unsaved layout changes?'))onClose();}
  const render=(text)=><Markdown remarkPlugins={[gfm,math]} rehypePlugins={[katex]}
    components={{img:props=><Figure src={props.src} alt={props.alt} figureUrls={figureUrls}/>}}>{text}</Markdown>;

  return createPortal(<div className="full-markdown-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
    <section id="full-markdown-dialog" className="full-markdown-dialog" role="dialog" aria-modal="true" aria-labelledby="full-markdown-title">
      <header className="full-markdown-header">
        <div><h2 id="full-markdown-title">{title}</h2><p>{editable ? 'Drag blocks to reorder the Markdown. Save as a new .md revision, then view it in Edit / Correct Markdown.' : 'Rendered Markdown, equations, tables, and figures.'}</p></div>
        <button type="button" ref={closeButton} onClick={close} aria-label="Close Markdown popup">Close ✕</button>
      </header>
      {editable && <div className="revision-layout-toolbar">
        <strong>Saved revision layout editor</strong><span>{busy?'Loading saved layout…':`${blocks.length} blocks`}</span>
        <button disabled={busy||saving||!dirty} type="button" onClick={save}>{saving?'Saving…':'Save Layout & Markdown as New Revision'}</button>
        <button disabled={busy||saving} type="button" onClick={()=>{setBlocks(defaultLayout(markdown));setDirty(true);}}>Reset positions</button>
        {dirty && <small>Unsaved changes</small>}
      </div>}
      {error && <p className="revision-layout-error" role="alert">{error}</p>}
      {message && <p className="revision-layout-message" role="status">{message}</p>}
      <div className="full-markdown-document">
        <article className="full-markdown-article revision-layout-canvas">
          {blocks.map((item,index)=>{
            const source=lookup[item.id];if(!source)return null;
            return <div key={item.id} className={'revision-layout-row'+(dragged===item.id?' dragging':'')}
              onDragOver={event=>{if(editable){event.preventDefault();event.dataTransfer.dropEffect='move';}}}
              onDrop={event=>{if(!editable)return;event.preventDefault();move(dragIndex.current,index);setDragged(null);dragIndex.current=null;}}>
              <div className="revision-layout-block" style={{width:`${item.width}%`,marginLeft:item.align==='right'?'auto':item.align==='center'?'auto':'0',marginRight:item.align==='left'?'auto':item.align==='center'?'auto':'0',textAlign:item.align}}>
                {editable && <div className="revision-layout-controls">
                  <span draggable onDragStart={event=>{dragIndex.current=index;setDragged(item.id);event.dataTransfer.setData('text/plain',item.id);event.dataTransfer.effectAllowed='move';}} onDragEnd={()=>{setDragged(null);dragIndex.current=null;}} className="revision-layout-handle" aria-label={`Drag block ${index+1}`} title="Drag to reorder">⠿ Drag {index+1}</span>
                  <button type="button" disabled={index===0||busy} onClick={()=>move(index,index-1)} title="Move block up">↑</button>
                  <button type="button" disabled={index===blocks.length-1||busy} onClick={()=>move(index,index+1)} title="Move block down">↓</button>
                  <label>Width <select disabled={busy} value={item.width} onChange={event=>change(item.id,'width',event.target.value)}><option value="100">100%</option><option value="75">75%</option><option value="50">50%</option></select></label>
                  <label>Align <select disabled={busy} value={item.align} onChange={event=>change(item.id,'align',event.target.value)}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                </div>}
                <div className="revision-layout-content">{render(source.markdown)}</div>
              </div>
            </div>;
          })}
        </article>
      </div>
      <footer className="full-markdown-footer">
        <span>{editable?'Save creates a NEW Markdown revision with reordered content and its own layout.json. Original OCR and previous revisions remain unchanged.':'Preview only — no changes are saved.'}</span>
        <button type="button" onClick={close}>Close</button>
      </footer>
    </section>
  </div>,document.body);
}
