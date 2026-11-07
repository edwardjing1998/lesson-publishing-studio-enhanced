import {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import Markdown from 'react-markdown';
import gfm from 'remark-gfm';
import math from 'remark-math';
import katex from 'rehype-katex';

// Keep the YAML metadata out of the rendered page, but preserve it in the editor.
function stripFrontmatter(value = '') {
  return String(value).replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
}

// Image references are resolved by the existing Azure source-browser API.
// Never fetch arbitrary image paths from unknown locations.
function Figure({src, alt, figureUrls}) {
  const url = figureUrls?.[src];
  if (!url) return <span className="full-markdown-missing">[Figure not available: {alt || src}]</span>;
  return <img src={url} alt={alt || 'Extracted figure'} loading="lazy" />;
}

export default function RenderedMarkdownModal({markdown, figureUrls = {}, title = 'Full Markdown preview', onClose}) {
  const closeButton = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();

    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') {
        // Keep keyboard users inside the preview dialog.
        const root = document.getElementById('full-markdown-dialog');
        const focusable = root?.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();}
        else if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [onClose]);

  return createPortal(
    <div className="full-markdown-backdrop" onMouseDown={event => {if(event.target === event.currentTarget) onClose();}}>
      <section id="full-markdown-dialog" className="full-markdown-dialog" role="dialog" aria-modal="true" aria-labelledby="full-markdown-title">
        <header className="full-markdown-header">
          <div><h2 id="full-markdown-title">{title}</h2><p>Rendered Markdown, formulas, tables, and extracted figures. This preview is read-only.</p></div>
          <button type="button" ref={closeButton} onClick={onClose} aria-label="Close full Markdown preview">Close ✕</button>
        </header>
        <div className="full-markdown-document">
          <article className="full-markdown-article">
            <Markdown
              remarkPlugins={[gfm, math]}
              rehypePlugins={[katex]}
              components={{img: props => <Figure src={props.src} alt={props.alt} figureUrls={figureUrls}/>}}
            >{stripFrontmatter(markdown)}</Markdown>
          </article>
        </div>
        <footer className="full-markdown-footer">
          <span>Preview only — no changes are saved.</span>
          <button type="button" onClick={onClose}>Close preview</button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
