import {useEffect, useMemo, useState} from 'react';
import Markdown from 'react-markdown';
import gfm from 'remark-gfm';
import LayoutCanvas from './LayoutCanvas.jsx';
import './source-browser.css';

async function getJson(url, signal) {
  const response = await fetch(url, {signal, cache:'no-store'});
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Source browser request failed (HTTP ${response.status})`);
  }
  return response.json();
}

const unique = values => [...new Set(values.filter(Boolean))].sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
const withoutFrontmatter = markdown => (markdown || '').replace(/^---\s*[\s\S]*?\n---\s*/m, '');

export default function SourceBrowser() {
  const [pages, setPages] = useState([]);
  const [book, setBook] = useState('');
  const [chapter, setChapter] = useState('');
  const [pageId, setPageId] = useState('');
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState('compare');
  const [showBoxes, setShowBoxes] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingList(true);
    setError('');
    getJson('/api/source-browser/pages', controller.signal)
      .then(result => setPages(result.pages || []))
      .catch(err => {if (err.name !== 'AbortError') setError(err.message);})
      .finally(() => {if (!controller.signal.aborted) setLoadingList(false);});
    return () => controller.abort();
  }, [reload]);

  const books = useMemo(() => unique(pages.map(x => x.bookId)), [pages]);
  const chapters = useMemo(() => unique(pages.filter(x => x.bookId === book).map(x => x.chapterId)), [pages,book]);
  const pageIds = useMemo(() => unique(pages.filter(x => x.bookId === book && x.chapterId === chapter).map(x => x.pageId)), [pages,book,chapter]);
  const record = useMemo(() => pages.find(x => x.bookId === book && x.chapterId === chapter && x.pageId === pageId), [pages,book,chapter,pageId]);
  const index = pages.findIndex(x => x.markdownBlob === record?.markdownBlob);

  useEffect(() => {if (!books.includes(book)) setBook(books[0] || '');}, [books,book]);
  useEffect(() => {if (!chapters.includes(chapter)) setChapter(chapters[0] || '');}, [chapters,chapter]);
  useEffect(() => {if (!pageIds.includes(pageId)) setPageId(pageIds[0] || '');}, [pageIds,pageId]);

  useEffect(() => {
    const controller = new AbortController();
    setSelected(null);
    if (!record) return () => controller.abort();
    setLoadingPage(true);
    setError('');
    getJson(`/api/source-browser/page?markdownBlob=${encodeURIComponent(record.markdownBlob)}`, controller.signal)
      .then(setSelected)
      .catch(err => {if (err.name !== 'AbortError') setError(err.message);})
      .finally(() => {if (!controller.signal.aborted) setLoadingPage(false);});
    return () => controller.abort();
  }, [record?.markdownBlob, reload]);

  function jump(delta) {
    const next = pages[index + delta];
    if (next) {setBook(next.bookId);setChapter(next.chapterId);setPageId(next.pageId);}
  }

  return <section className="source-browser" aria-label="Azure Markdown Source Browser">
    <div className="source-browser-heading"><div><h2>Azure Markdown & Image Browser</h2><p>Browse source files in Azure Blob Storage independently of approved learning plans.</p></div><button className="secondary" onClick={() => setReload(n => n + 1)}>Refresh files</button></div>
    <div className="source-browser-filters">
      <label>Book<select aria-label="Source Book" value={book} onChange={event => {setBook(event.target.value);setChapter('');setPageId('');}}>{books.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Chapter<select aria-label="Source Chapter" value={chapter} onChange={event => {setChapter(event.target.value);setPageId('');}}>{chapters.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Page<select aria-label="Source Page" value={pageId} onChange={event => setPageId(event.target.value)}>{pageIds.map(x => <option key={x}>{x}</option>)}</select></label>
      <div className="source-browser-pager"><button className="secondary" disabled={index <= 0} onClick={() => jump(-1)}>Previous</button><span>{index >= 0 ? `${index+1} / ${pages.length}` : `0 / ${pages.length}`}</span><button className="secondary" disabled={index < 0 || index >= pages.length-1} onClick={() => jump(1)}>Next</button></div>
    </div>
    {error && <p className="source-browser-error" role="alert">{error}</p>}
    {(loadingList || loadingPage) && <p>Loading Azure files…</p>}
    {!loadingList && pages.length === 0 && <p>No generated content.md pages found under the configured Azure prefix.</p>}
    {record && selected && <>
      <div className="source-browser-toolbar"><span title={record.markdownBlob}>{record.id}</span><div><button className={mode === 'compare' ? 'chosen' : ''} onClick={() => setMode('compare')}>Original + Markdown</button><button className={mode === 'markdown' ? 'chosen' : ''} onClick={() => setMode('markdown')}>Markdown</button><button className={mode === 'layout' ? 'chosen' : ''} onClick={() => setMode('layout')}>Layout</button><label><input type="checkbox" checked={showBoxes} onChange={e => setShowBoxes(e.target.checked)}/> Boxes</label></div></div>
      <div className={'source-browser-view source-browser-mode-' + mode}>
        {mode === 'compare' && <div className="source-browser-pane"><h3>Original page image</h3>{selected.sourceUrl ? (/\.pdf$/i.test(selected.sourceBlob || '') ? <iframe title="Original PDF" src={selected.sourceUrl}/> : <img src={selected.sourceUrl} alt="Original scanned page"/>) : <p>Original source image not found.</p>}</div>}
        {(mode === 'compare' || mode === 'markdown') && <div className="source-browser-pane"><h3>Rendered Markdown</h3><div className="source-browser-markdown"><Markdown remarkPlugins={[gfm]} components={{img: ({src,alt}) => selected.figureUrls?.[src] ? <img src={selected.figureUrls[src]} alt={alt || 'Extracted figure'} /> : <span>[Image unavailable: {alt || src}]</span>}}>{withoutFrontmatter(selected.markdown)}</Markdown></div></div>}
        {mode === 'layout' && <div className="source-browser-pane"><h3>Layout reconstruction</h3>{selected.layout ? <LayoutCanvas data={selected.layout} figureUrls={Object.values(selected.figureUrls || {})} showBoxes={showBoxes}/> : <p>No layout.json for this page.</p>}</div>}
      </div>
      <div className="source-browser-meta"><span>Markdown: {record.markdownBlob}</span><span>Original: {selected.sourceBlob || 'Not found'}</span><span>Referenced figures: {Object.keys(selected.figureUrls || {}).length}</span></div>
    </>}
  </section>;
}
