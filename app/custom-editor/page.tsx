"use client";
import React, { useEffect, useRef } from "react";

/**
 * Minimal Google-Docs-style multi-page editor (A4 pages)
 * - contentEditable pages
 * - toolbar uses document.execCommand for simplicity
 * - auto-creates new pages when content overflows
 *
 * Drop in: <MultiPageEditor />
 */

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PAGE_PADDING_MM = 20; // same as CSS

function mmToPx(mm: number) {
    return Math.round((mm * 96) / 25.4); // 96 DPI
}

export default function MultiPageEditor() {
    const editorRef = useRef<HTMLDivElement | null>(null);

    // maximum content height inside page-content (px)
    const maxContentHeight = mmToPx(A4_HEIGHT_MM - PAGE_PADDING_MM * 2);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        // initialize with one page
        if (editor.querySelectorAll(".page").length === 0) {
            const page = createPage();
            const content = page.querySelector<HTMLDivElement>(".page-content")!;
            content.innerHTML = `<p><br></p>`; // initial empty line
            editor.appendChild(page);
            placeCaretAtEnd(content);
        }

        // event listeners
        function onInput(e: Event) {
            const target = e.target as HTMLElement | null;
            const pageContent = target?.closest(".page-content") as HTMLElement | null;
            // If event not in a page-content, ignore
            if (!pageContent) return;

            autoPaginate(pageContent);
        }

        // Handle keyup for immediate punctuation/enter events
        function onKeyUp(e: KeyboardEvent) {
            const target = e.target as HTMLElement | null;
            const pageContent = target?.closest(".page-content") as HTMLElement | null;
            if (!pageContent) return;
            // small delay to allow DOM updates
            setTimeout(() => autoPaginate(pageContent), 0);
        }

        // handle paste as well
        function onPaste(e: ClipboardEvent) {
            const target = e.target as HTMLElement | null;
            const pageContent = target?.closest(".page-content") as HTMLElement | null;
            if (!pageContent) return;
            setTimeout(() => autoPaginate(pageContent), 10);
        }

        editor.addEventListener("input", onInput, true);
        editor.addEventListener("keyup", onKeyUp, true);
        editor.addEventListener("paste", onPaste, true);

        return () => {
            editor.removeEventListener("input", onInput, true);
            editor.removeEventListener("keyup", onKeyUp, true);
            editor.removeEventListener("paste", onPaste, true);
        };
    }, [maxContentHeight]);

    // Create page DOM element
    function createPage(): HTMLDivElement {
        const page = document.createElement("div");
        page.className = "page";
        page.style.width = `${A4_WIDTH_MM}mm`;
        page.style.height = `${A4_HEIGHT_MM}mm`;
        page.style.boxSizing = "border-box";

        const pageContent = document.createElement("div");
        pageContent.className = "page-content";
        pageContent.setAttribute("contentEditable", "true");
        pageContent.setAttribute("spellCheck", "true");
        // ensure block formatting context
        pageContent.style.minHeight = "1px";

        page.appendChild(pageContent);
        return page;
    }

    // Move overflowing nodes from sourcePageContent to a newly created next page
    function autoPaginate(sourcePageContent: HTMLElement) {
        const editor = editorRef.current!;
        // find the page container for this content
        const page = sourcePageContent.closest(".page") as HTMLElement | null;
        if (!page) return;

        // while page content is taller than allowed, create/move to next
        if (sourcePageContent.scrollHeight <= maxContentHeight) return;

        // Ensure there is a next page; if not, create it
        let nextPage = page.nextElementSibling as HTMLElement | null;
        if (!nextPage || !nextPage.classList.contains("page")) {
            nextPage = createPage();
            editor.insertBefore(nextPage, page.nextSibling);
            // ensure it has at least one paragraph
            const nextContent = nextPage.querySelector<HTMLElement>(".page-content")!;
            if (!nextContent.innerHTML) nextContent.innerHTML = "<p><br></p>";
        }

        const nextContent = nextPage.querySelector<HTMLElement>(".page-content")!;
        // Move nodes from the end of source -> start of next until it fits
        // We prefer moving whole block elements (p, div, ul, ol, table, img, hr)
        // If the last node is a text node, we will split it.
        while (sourcePageContent.scrollHeight > maxContentHeight) {
            const last = sourcePageContent.lastChild;
            if (!last) break;

            // If last is a text node with lots of chars, try splitting at midpoint
            if (last.nodeType === Node.TEXT_NODE) {
                const txt = last.textContent || "";
                if (txt.length > 20) {
                    const splitIndex = Math.floor(txt.length / 2);
                    const left = txt.slice(0, splitIndex);
                    const right = txt.slice(splitIndex);
                    last.textContent = left;
                    const newNode = document.createTextNode(right);
                    sourcePageContent.appendChild(newNode); // temporary position
                    // then move newNode to next
                    nextContent.insertBefore(newNode, nextContent.firstChild);
                } else {
                    // short text node, move whole node
                    nextContent.insertBefore(last, nextContent.firstChild);
                }
            } else if ((last as Element).nodeName === "BR" && sourcePageContent.childNodes.length === 1) {
                // avoid removing the last BR entirely
                break;
            } else {
                // move the whole element
                nextContent.insertBefore(last, nextContent.firstChild);
            }

            // If next became too tall (rare), keep moving until both fit
            // Also make sure there is an empty paragraph in source if it becomes empty
            if (sourcePageContent.childNodes.length === 0) {
                sourcePageContent.innerHTML = "<p><br></p>";
            }
            // loop until source fits
            // but to avoid infinite loops, break after many iterations (safety)
        }

        // finally place caret at start of next page's first child (so typing continues)
        setTimeout(() => {
            placeCaretAtStart(nextContent);
        }, 0);
    }

    // Place caret at end of an element
    function placeCaretAtEnd(el: HTMLElement) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        if (!sel) return;
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function placeCaretAtStart(el: HTMLElement) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(true);
        const sel = window.getSelection();
        if (!sel) return;
        sel.removeAllRanges();
        sel.addRange(range);

        // focus the element so typing continues
        (el as HTMLElement).focus();
    }

    // Toolbar actions - wrappers around execCommand
    function exec(command: string, value?: string) {
        document.execCommand(command, false, value ?? "");
        // After formatting, ensure we check pagination for the active page
        const sel = window.getSelection();
        const node = sel?.anchorNode as Node | null;
        const pageContent = node?.parentElement?.closest(".page-content") as HTMLElement | null;
        if (pageContent) {
            setTimeout(() => autoPaginate(pageContent), 0);
        }
    }

    function insertImage() {
        const url = prompt("Image URL");
        if (!url) return;
        exec("insertImage", url);
    }

    function insertLink() {
        const url = prompt("Link URL (include https://)");
        if (!url) return;
        exec("createLink", url);
    }

    function addPage() {
        const editor = editorRef.current!;
        const page = createPage();
        const content = page.querySelector<HTMLElement>(".page-content")!;
        content.innerHTML = "<p><br></p>";
        editor.appendChild(page);
        placeCaretAtStart(content);
    }

    return (
        <div>
            {/* Toolbar */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
                <button onClick={() => exec("bold")} title="Bold"><b>B</b></button>
                <button onClick={() => exec("italic")} title="Italic"><i>I</i></button>
                <button onClick={() => exec("underline")} title="Underline"><u>U</u></button>

                <select onChange={(e) => exec("fontName", e.target.value)} defaultValue="">
                    <option value="">Font</option>
                    <option value="Arial">Arial</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Courier New">Courier New</option>
                    <option value="Verdana">Verdana</option>
                </select>

                <select
                    onChange={(e) => {
                        // fontSize expects 1..7 (browser mapping). We map common sizes.
                        const sizeMap: Record<string, string> = {
                            "10": "1",
                            "12": "2",
                            "14": "3",
                            "18": "4",
                            "24": "5",
                            "32": "6",
                            "48": "7",
                        };
                        const v = sizeMap[e.target.value] ?? "3";
                        exec("fontSize", v);
                    }}
                    defaultValue=""
                >
                    <option value="">Size</option>
                    <option value="10">10</option>
                    <option value="12">12</option>
                    <option value="14">14</option>
                    <option value="18">18</option>
                    <option value="24">24</option>
                    <option value="32">32</option>
                </select>

                <input
                    type="color"
                    title="Text color"
                    onChange={(e) => exec("foreColor", e.target.value)}
                />
                <input
                    type="color"
                    title="Highlight"
                    onChange={(e) => exec("hiliteColor", e.target.value)}
                />

                <button onClick={() => exec("justifyLeft")}>Left</button>
                <button onClick={() => exec("justifyCenter")}>Center</button>
                <button onClick={() => exec("justifyRight")}>Right</button>
                <button onClick={() => exec("justifyFull")}>Justify</button>

                <button onClick={() => exec("insertOrderedList")}>OL</button>
                <button onClick={() => exec("insertUnorderedList")}>UL</button>

                <button onClick={() => exec("outdent")}>Outdent</button>
                <button onClick={() => exec("indent")}>Indent</button>

                <button onClick={() => exec("undo")}>Undo</button>
                <button onClick={() => exec("redo")}>Redo</button>

                <button onClick={insertImage}>Img</button>
                <button onClick={insertLink}>Link</button>

                <button onClick={addPage}>+ Page</button>
            </div>

            {/* Editor container */}
            <div
                ref={editorRef}
                className="mp-editor"
                style={{
                    width: "100%",
                    minHeight: "400px",
                    background: "#f0f0f0",
                    padding: "20px 0",
                    overflowY: "auto",
                }}
            />
        </div>
    );
}
