// PaginatedSyncfusionRTE.tsx
// Drop-in Next.js client component using Syncfusion Rich Text Editor
// Option 2 - Fully Paginated Syncfusion Editor (advanced)
// Features:
// - Keeps Syncfusion RTE toolbar and features
// - Replaces the internal editable area with A4 "page" DIVs (210mm x 297mm)
// - Detects overflow and automatically creates new pages, moving overflowing nodes
// - Handles typing, paste, formatting via document.execCommand (keeps Syncfusion toolbar functionality)
// - Basic export-to-HTML helper
//
// Usage:
// import PaginatedSyncfusionRTE from './PaginatedSyncfusionRTE';
// <PaginatedSyncfusionRTE initialValue={'<p>Hello</p>'} />

'use client';

import React, { useEffect, useRef } from 'react';
import {
    RichTextEditorComponent,
    Toolbar,
    Image,
    Link,
    HtmlEditor,
    QuickToolbar,
    Inject,
} from '@syncfusion/ej2-react-richtexteditor';
import { registerLicense } from '@syncfusion/ej2-base';

const LICENSE_KEY = process.env.NEXT_PUBLIC_SYNCFUSION_LICENSE_KEY || "";
registerLicense(LICENSE_KEY);

type Props = {
    initialValue?: string;
    toolbarSettings?: any;
};

export default function PaginatedSyncfusionRTE({ initialValue = '<p></p>', toolbarSettings }: Props) {
    const rteRef = useRef<RichTextEditorComponent | null>(null);
    const pagesContainerRef = useRef<HTMLDivElement | null>(null);
    const observerRef = useRef<MutationObserver | null>(null);

    // Inject A4 page styles
    useEffect(() => {
        const css = `
      .psr-wrapper { padding: 12px; background: #f3f4f6; min-height: 100vh; }
      .psr-rte-host { max-width: 100%; margin: 0 auto; }
      .psr-pages { display:flex; flex-direction:column; gap:18px; align-items:center; padding-bottom:60px; }
      .psr-page { width:210mm; height:297mm; background:white; box-shadow:0 4px 10px rgba(0,0,0,0.06); border:1px solid #e5e7eb; box-sizing:border-box; padding:20mm; position:relative; }
      .psr-page-content { width:100%; height: calc(297mm - 40mm); overflow:visible; outline:none; }
      .psr-page p { margin: 0 0 1em 0; }
    `;
        const s = document.createElement('style');
        s.id = 'psr-styles';
        s.innerHTML = css;
        document.head.appendChild(s);
        return () => { const el = document.getElementById('psr-styles'); if (el) el.remove(); };
    }, []);

    // After RTE is created, replace its content container with paginated pages
    const onCreated = () => {
        // Access the RTE content element (DIV mode)
        // syncfusion sets .e-rte-content inside the component
        const rteElem = rteRef.current?.element as HTMLElement | undefined;
        if (!rteElem) return;

        // find the editable content wrapper used by Syncfusion
        const rteContent = rteElem.querySelector('.e-rte-content') as HTMLElement | null;
        if (!rteContent) {
            console.warn('PaginatedSyncfusionRTE: could not find .e-rte-content');
            return;
        }

        // Clear existing content and insert our pages container
        rteContent.innerHTML = '';
        const pagesWrapper = document.createElement('div');
        pagesWrapper.className = 'psr-pages';
        pagesWrapper.setAttribute('contenteditable', 'false'); // pages container itself not editable

        // create initial page
        const page = createPage(1);
        const content = page.querySelector('.psr-page-content') as HTMLElement;
        content.innerHTML = initialValue;

        pagesWrapper.appendChild(page);
        rteContent.appendChild(pagesWrapper);

        // Save ref
        pagesContainerRef.current = pagesWrapper;

        // Make page content editable and focusable
        attachPageEventHandlers(pagesWrapper);

        // Setup MutationObserver to watch changes and paginate
        setupObserver();

        // Initial paginate in case initial content overflows
        setTimeout(() => checkAndPaginate(), 50);
    };

    // Create page DOM
    function createPage(pageNumber: number) {
        const page = document.createElement('div');
        page.className = 'psr-page';
        page.style.position = 'relative';

        const content = document.createElement('div');
        content.className = 'psr-page-content';
        content.setAttribute('contenteditable', 'true');
        content.setAttribute('data-page', String(pageNumber));

        page.appendChild(content);
        return page;
    }

    function attachPageEventHandlers(pagesWrapper: HTMLDivElement) {
        // Delegate input events from pages container
        pagesWrapper.addEventListener('input', () => checkAndPaginate());
        pagesWrapper.addEventListener('keydown', (ev) => {
            // handle Tab to insert spaces
            if ((ev as KeyboardEvent).key === 'Tab') {
                ev.preventDefault();
                document.execCommand('insertText', false, '  ');
                return;
            }
            // small timeout to allow formatting to apply then paginate
            setTimeout(() => checkAndPaginate(), 10);
        });

        pagesWrapper.addEventListener('paste', (ev) => {
            // Allow paste then sanitize/paginate
            setTimeout(() => checkAndPaginate(), 10);
        });

        // Ensure clicks inside editable areas put caret correctly
        pagesWrapper.addEventListener('click', (ev) => {
            const target = ev.target as HTMLElement;
            const pageContent = findClosestPageContent(target);
            if (pageContent) {
                // focus the clicked editable area
                (pageContent as HTMLElement).focus();
            }
        });
    }

    function findClosestPageContent(node: Node | null) {
        while (node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement;
                if (el.classList && el.classList.contains('psr-page-content')) return el;
            }
            node = node.parentNode;
        }
        return null;
    }

    function mmToPx(mm: number) {
        return mm * (96 / 25.4);
    }

    function setupObserver() {
        if (!pagesContainerRef.current) return;
        if (observerRef.current) observerRef.current.disconnect();

        const observer = new MutationObserver(() => checkAndPaginate());
        observer.observe(pagesContainerRef.current, { childList: true, subtree: true, characterData: true });
        observerRef.current = observer;
    }

    function getPages() {
        return Array.from(pagesContainerRef.current?.querySelectorAll('.psr-page') ?? []) as HTMLDivElement[];
    }

    function checkAndPaginate() {
        const pages = getPages();
        if (!pages.length) return;
        const maxHeight = mmToPx(297 - 40); // page content max height in px

        // Iterate pages forward and move overflow to next page
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const content = page.querySelector('.psr-page-content') as HTMLElement;
            if (!content) continue;

            if (content.scrollHeight > maxHeight + 1) {
                // ensure next page exists
                let nextPage = pages[i + 1];
                if (!nextPage) {
                    const p = createPage(pages.length + 1);
                    pagesContainerRef.current!.appendChild(p);
                    nextPage = p;
                }
                const nextContent = nextPage.querySelector('.psr-page-content') as HTMLElement;

                moveOverflow(content, nextContent, maxHeight);
            }
        }

        // Remove trailing empty page if exists and not the only one
        const updated = getPages();
        if (updated.length > 1) {
            const last = updated[updated.length - 1];
            const lastCnt = last.querySelector('.psr-page-content') as HTMLElement;
            if (lastCnt && lastCnt.innerHTML.trim() === '') last.remove();
        }

        // Update page numbers data attributes
        getPages().forEach((p, idx) => {
            const c = p.querySelector('.psr-page-content') as HTMLElement;
            if (c) c.setAttribute('data-page', String(idx + 1));
        });
    }

    function moveOverflow(source: HTMLElement, target: HTMLElement, maxHeight: number) {
        // Move last child nodes from source to the front of target until source fits
        // If node too large, attempt to split text nodes
        let safety = 0;
        while (source.scrollHeight > maxHeight + 1 && source.lastChild && safety < 2000) {
            const node = source.lastChild;
            // Move block element or inline node
            target.insertBefore(node, target.firstChild);
            safety++;
        }

        // If still overflowing, try splitting last text nodes from target back to source
        if (source.scrollHeight > maxHeight + 1) {
            const last = source.lastChild;
            if (last && last.nodeType === Node.TEXT_NODE) {
                splitTextNodeToFit(last as Text, source, target, maxHeight);
            } else if (last && last.nodeType === Node.ELEMENT_NODE) {
                // try split deepest text node
                const walker = document.createTreeWalker(last as HTMLElement, NodeFilter.SHOW_TEXT, null);
                let textNode: Node | null = null;
                while (walker.nextNode()) textNode = walker.currentNode;
                if (textNode && textNode.nodeValue) splitTextNodeToFit(textNode as Text, source, target, maxHeight);
            }
        }
    }

    function splitTextNodeToFit(textNode: Text, src: HTMLElement, dst: HTMLElement, maxHeight: number) {
        const full = textNode.nodeValue || '';
        if (!full) return;
        // split by words and binary search split point
        const words = full.split(/(\s+)/);
        let lo = 0, hi = words.length;
        let moved = false;
        while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            const left = words.slice(0, mid).join('');
            const right = words.slice(mid).join('');
            const backup = textNode.nodeValue;
            textNode.nodeValue = left;
            const newNode = document.createTextNode(right);
            dst.insertBefore(newNode, dst.firstChild);
            if (src.scrollHeight > maxHeight) {
                // left still too big -> need to move more to dst
                newNode.remove();
                textNode.nodeValue = backup;
                lo = mid + 1;
            } else {
                // left fits; keep split
                moved = true;
                hi = mid;
            }
        }
        return moved;
    }

    // Toolbar proxy: execute command inside active page content
    function execCommand(command: string, value?: string) {
        // ensure focus on current editable area
        const sel = window.getSelection();
        let active = sel && sel.anchorNode ? findClosestPageContent(sel.anchorNode) as HTMLElement : null;
        if (!active) {
            // fallback to last page
            const pages = getPages();
            const last = pages[pages.length - 1];
            active = last.querySelector('.psr-page-content') as HTMLElement;
            placeCaretAtEnd(active);
        }
        document.execCommand(command, false, value);
        setTimeout(() => checkAndPaginate(), 10);
    }

    function placeCaretAtEnd(el: HTMLElement) {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        if (!sel) return;
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function exportHtml() {
        const pages = getPages();
        const wrapper = document.createElement('div');
        pages.forEach((p) => {
            const c = p.querySelector('.psr-page-content') as HTMLElement;
            const pageWrap = document.createElement('div');
            pageWrap.style.width = '210mm';
            pageWrap.style.height = '297mm';
            pageWrap.innerHTML = c.innerHTML;
            wrapper.appendChild(pageWrap);
        });
        return wrapper.innerHTML;
    }

    // Default toolbar if none provided
    const defaultToolbar = {
        items: [
            'Bold', 'Italic', 'Underline', 'StrikeThrough', '|', 'FontName', 'FontSize', 'FontColor', 'BackgroundColor', '|',
            'Formats', 'Alignments', 'OrderedList', 'UnorderedList', '|', 'CreateLink', 'Image', '|', 'ClearFormat', 'Print', 'SourceCode', 'FullScreen', '|', 'Undo', 'Redo'
        ],
        type: 'MultiRow'
    } as any;

    return (
        <div className="psr-wrapper">
            <RichTextEditorComponent ref={rteRef} created={onCreated} toolbarSettings={toolbarSettings ?? defaultToolbar} height={'auto'}>
                <Inject services={[Toolbar, Image, Link, HtmlEditor, QuickToolbar]} />
            </RichTextEditorComponent>
            {/* Note: toolbar buttons still operate via document.execCommand; you can add a custom toolbar UI too */}
            <div style={{ marginTop: 12 }}>
                <button onClick={() => { const html = exportHtml(); const blob = new Blob([html], { type: 'text/html' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'document.html'; a.click(); URL.revokeObjectURL(url); }}>Export HTML</button>
                <button onClick={() => { const pages = getPages(); console.log('Pages:', pages.length); alert(`Pages: ${pages.length}`); }}>Show page count</button>
            </div>
        </div>
    );
}
