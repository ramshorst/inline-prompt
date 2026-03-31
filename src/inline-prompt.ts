import Anthropic from '@anthropic-ai/sdk';

// ─── State ────────────────────────────────────────────────────────────────────

interface CapturedSelection {
  text: string;
  range: Range;
  rect: DOMRect;
}

let editor: HTMLElement | null = null;
let apiKey = '';
let captured: CapturedSelection | null = null;
let inPromptMode = false;
let isMouseDown = false;

// Undo/redo intercept
interface EditEntry {
  prompt: string;
  originalText: string;
  newText: string;
  container: HTMLElement;
}

let editStack: EditEntry[] = [];         // all AI edits in order; Ctrl+Z walks backwards
let lastEditOriginalText = '';           // kept for redo (lastRestoredNode target)
let lastEditNewText = '';                // kept for redo
let interceptNextUndo = false;           // true while accept bar is showing
let promptOpenedByUndo = false;
let lastRestoredNode: Text | null = null;
let loaderEl: HTMLElement | null = null;
let lastEditContainer: HTMLElement | null = null;
let highlightSpans: HTMLElement[] = [];

let promptWrapper: HTMLElement | null = null;
let promptInput: HTMLInputElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let undoCheckTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Public API ───────────────────────────────────────────────────────────────

export function initInlinePrompt(editorEl: HTMLElement, key: string): void {
  if (editor) destroyInlinePrompt();
  editor = editorEl;
  apiKey = key;

  buildUI();

  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('mousedown', onMouseDown_);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onGlobalKeydown, true);
  editor.addEventListener('input', onEditorInput);
}

export function destroyInlinePrompt(): void {
  document.removeEventListener('selectionchange', onSelectionChange);
  document.removeEventListener('mousedown', onMouseDown_);
  document.removeEventListener('mouseup', onMouseUp);
  document.removeEventListener('keydown', onGlobalKeydown, true);
  editor?.removeEventListener('input', onEditorInput);

  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (undoCheckTimer) { clearTimeout(undoCheckTimer); undoCheckTimer = null; }
  promptWrapper?.remove();
  promptWrapper = null;
  promptInput = null;
  captured = null;
  inPromptMode = false;
  editStack = [];
  interceptNextUndo = false;
  promptOpenedByUndo = false;
  lastRestoredNode = null;
  loaderEl = null;
  lastEditContainer = null;
  highlightSpans = [];
  editor = null;
}

// ─── DOM builder ──────────────────────────────────────────────────────────────

function buildUI(): void {
  promptWrapper = document.createElement('div');
  promptWrapper.style.cssText = `
    position: fixed;
    bottom: 20px;
    z-index: 9998;
    display: none;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  `;

  promptWrapper.innerHTML = `
    <div id="pill-container" style="display: flex; justify-content: center;">
      <button id="prompt-pill" style="
        background: white;
        color: #374151;
        border: none;
        border-radius: 9999px;
        padding: 10px 16px 8px;
        font-size: 12px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        display: flex;
        align-items: flex-end;
        gap: 7px;
        cursor: pointer;
        pointer-events: all;
        box-shadow: 0 2px 16px rgba(0,0,0,0.13), 0 1px 4px rgba(0,0,0,0.07);
      ">
        Edit
        <span style="
          font-family: monospace;
          font-size: 10px;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          padding: 1px 5px;
          color: #9ca3af;
          line-height: 1.5;
        ">↵</span>
      </button>
    </div>

    <div id="prompt-bar-inner" style="
      display: none;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 9999px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.06);
      align-items: center;
      gap: 8px;
      padding: 0 6px 0 18px;
      height: 46px;
      pointer-events: all;
      transform-origin: bottom center;
    ">
      <input
        id="pb-input"
        type="text"
        tabindex="-1"
        placeholder="What should I do with it?"
        style="
          flex: 1;
          border: none;
          outline: none;
          font-size: 13.5px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #111827;
          background: transparent;
          min-width: 0;
        "
      />
      <button id="pb-send" style="
        display: none;
        align-items: center;
        gap: 6px;
        background: white;
        color: #374151;
        border: 1px solid #e5e7eb;
        border-radius: 9999px;
        padding: 5px 10px 5px 12px;
        font-size: 12px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        cursor: pointer;
        flex-shrink: 0;
        white-space: nowrap;
        box-shadow: 0 1px 4px rgba(0,0,0,0.07);
      ">
        Send
        <span style="
          font-family: monospace;
          font-size: 10px;
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          padding: 1px 5px;
          color: #9ca3af;
          line-height: 1.5;
        ">↵</span>
      </button>
    </div>

    <div id="accept-bar" style="display: none; justify-content: center; gap: 6px; pointer-events: all;">
      <button id="btn-accept" style="
        display: flex; align-items: center; gap: 6px;
        background: #111827; color: white;
        border: none; border-radius: 9999px;
        padding: 7px 14px 7px 16px;
        font-size: 12px; font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        cursor: pointer; white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      ">
        Accept
        <span style="
          font-family: monospace; font-size: 10px;
          background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.25);
          border-radius: 4px; padding: 1px 5px; color: rgba(255,255,255,0.75); line-height: 1.5;
        ">↵</span>
      </button>
      <button id="btn-undo" style="
        display: flex; align-items: center; gap: 6px;
        background: white; color: #6b7280;
        border: 1px solid #e5e7eb; border-radius: 9999px;
        padding: 7px 14px 7px 16px;
        font-size: 12px; font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        cursor: pointer; white-space: nowrap;
        box-shadow: 0 1px 4px rgba(0,0,0,0.07);
      ">
        Undo
        <span id="undo-kbd" style="
          font-family: monospace; font-size: 10px;
          background: #f3f4f6; border: 1px solid #e5e7eb;
          border-radius: 4px; padding: 1px 5px; color: #9ca3af; line-height: 1.5;
        "></span>
      </button>
    </div>

    <div id="redo-hint" style="display: none; justify-content: center; pointer-events: all;">
      <button id="btn-redo" style="
        display: flex; align-items: center; gap: 6px;
        background: white; color: #6b7280;
        border: 1px solid #e5e7eb; border-radius: 9999px;
        padding: 7px 14px 7px 16px;
        font-size: 12px; font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        cursor: pointer; white-space: nowrap;
        box-shadow: 0 1px 4px rgba(0,0,0,0.07);
      ">
        Redo
        <span id="redo-kbd" style="
          font-family: monospace; font-size: 10px;
          background: #f3f4f6; border: 1px solid #e5e7eb;
          border-radius: 4px; padding: 1px 5px; color: #9ca3af; line-height: 1.5;
        "></span>
      </button>
    </div>
  `;

  document.body.appendChild(promptWrapper);

  promptInput = promptWrapper.querySelector('#pb-input') as HTMLInputElement;
  promptInput.addEventListener('keydown', onPromptKeydown);
  promptInput.addEventListener('input', onPromptInput);

  const pill = promptWrapper.querySelector('#prompt-pill') as HTMLButtonElement;
  pill.addEventListener('click', activatePromptMode);

  const sendBtn = promptWrapper.querySelector('#pb-send') as HTMLButtonElement;
  sendBtn.addEventListener('click', () => {
    const val = promptInput!.value.trim();
    if (val) submitPrompt(val);
  });

  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform);

  const acceptBtn = promptWrapper.querySelector('#btn-accept') as HTMLButtonElement;
  acceptBtn.addEventListener('click', acceptChanges);

  const undoKbd = promptWrapper.querySelector('#undo-kbd') as HTMLElement;
  undoKbd.textContent = isMac ? '⌘Z' : 'Ctrl+Z';
  const undoBtn = promptWrapper.querySelector('#btn-undo') as HTMLButtonElement;
  undoBtn.addEventListener('click', performAIUndo);

  const redoKbd = promptWrapper.querySelector('#redo-kbd') as HTMLElement;
  redoKbd.textContent = isMac ? '⌘⇧Z' : 'Ctrl+Shift+Z';
  const redoBtn = promptWrapper.querySelector('#btn-redo') as HTMLButtonElement;
  redoBtn.addEventListener('click', () => {
    if (lastRestoredNode?.parentNode && lastEditNewText) {
      hideUI();
      applyDiffToNode(lastRestoredNode, lastEditOriginalText, lastEditNewText);
      editStack.push({ prompt: editStack[editStack.length - 1]?.prompt ?? '', originalText: lastEditOriginalText, newText: lastEditNewText, container: lastEditContainer! });
      lastRestoredNode = null;
      interceptNextUndo = true;
      showAcceptBar();
    }
  });
}

// ─── Selection handling ───────────────────────────────────────────────────────

function onSelectionChange(): void {
  if (isMouseDown) return;
  if (inPromptMode) {
    // If the user makes a new selection inside the editor, close the prompt
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount > 0 && isRangeInEditor(sel.getRangeAt(0))) {
      hideUI();
      checkSelection();
    }
    return;
  }
  checkSelection();
}

function onMouseDown_(e: MouseEvent): void {
  if (promptWrapper?.contains(e.target as Node)) return;
  isMouseDown = true;
  hideUI(); // always close — even when in prompt mode
}

function onMouseUp(): void {
  isMouseDown = false;
  setTimeout(checkSelection, 10);
}

function onEditorInput(e: Event): void {
  const inputType = (e as InputEvent).inputType;
  if (inputType === 'historyUndo') {
    // Native undo fired — cancel pending AI undo check
    if (undoCheckTimer) { clearTimeout(undoCheckTimer); undoCheckTimer = null; }
  } else if (inputType !== 'historyRedo') {
    lastRestoredNode = null; // new manual edit invalidates redo
    if (highlightSpans.length > 0) fadeOutHighlights();
  }
}

function fadeOutHighlights(): void {
  const spans = highlightSpans;
  highlightSpans = [];
  interceptNextUndo = false;
  hideAcceptBar();
  spans.forEach(span => {
    span.style.transition = 'background-color 0.4s ease';
    span.style.backgroundColor = 'transparent';
  });
  setTimeout(() => spans.forEach(span => { span.style.transition = ''; }), 400);
}

function checkSelection(): void {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) { hideUI(); return; }

  const text = sel.toString().trim();
  if (!text) { hideUI(); return; }

  const range = sel.getRangeAt(0);
  if (!isRangeInEditor(range)) { hideUI(); return; }

  const rect = range.getBoundingClientRect();
  const isNew = !captured;
  captured = { text, range: range.cloneRange(), rect };
  showPill(isNew);
}

function isRangeInEditor(range: Range): boolean {
  return !!editor && editor.contains(range.commonAncestorContainer);
}

// ─── Pill / bar show & hide ───────────────────────────────────────────────────

function positionWrapper(): void {
  if (!promptWrapper || !editor) return;
  const r = editor.getBoundingClientRect();
  promptWrapper.style.left = `${r.left}px`;
  promptWrapper.style.width = `${r.width}px`;
}

function showPill(animate: boolean): void {
  if (!promptWrapper) return;
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  positionWrapper();

  const pillContainer = promptWrapper.querySelector('#pill-container') as HTMLElement;
  const bar = promptWrapper.querySelector('#prompt-bar-inner') as HTMLElement;

  bar.style.display = 'none';
  pillContainer.style.display = 'flex';
  promptWrapper.style.display = 'flex';

  if (animate) {
    const pill = promptWrapper.querySelector('#prompt-pill') as HTMLElement;
    pill.style.animation = 'none';
    void pill.offsetWidth;
    pill.style.animation = 'pillIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards';
  }
}

function hideUI(): void {
  if (!promptWrapper || promptWrapper.style.display === 'none') return;

  const pill = promptWrapper.querySelector('#prompt-pill') as HTMLElement;
  pill.style.animation = 'pillOut 0.12s ease-in forwards';

  const bar = promptWrapper.querySelector('#prompt-bar-inner') as HTMLElement;
  if (bar.style.display !== 'none') {
    bar.style.animation = 'promptBarOut 0.12s ease-in forwards';
  }

  hideRedoHint();

  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  hideTimer = setTimeout(() => {
    if (promptWrapper) {
      promptWrapper.style.display = 'none';
      (promptWrapper.querySelector('#pill-container') as HTMLElement).style.display = 'none';
      (promptWrapper.querySelector('#prompt-bar-inner') as HTMLElement).style.display = 'none';
    }
    hideTimer = null;
  }, 120);

  inPromptMode = false;
  promptOpenedByUndo = false;
  captured = null;
  if (promptInput) { promptInput.value = ''; promptInput.blur(); }
}

// ─── Prompt mode ──────────────────────────────────────────────────────────────

function activatePromptMode(): void {
  if (!promptWrapper || !promptInput || !captured) return;
  inPromptMode = true;

  const pillContainer = promptWrapper.querySelector('#pill-container') as HTMLElement;
  const pill = promptWrapper.querySelector('#prompt-pill') as HTMLElement;
  const bar = promptWrapper.querySelector('#prompt-bar-inner') as HTMLElement;

  pill.style.animation = 'pillOut 0.1s ease-in forwards';
  setTimeout(() => {
    pillContainer.style.display = 'none';
    bar.style.display = 'flex';
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = 'promptBarIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards';
    resetHint();
    setTimeout(() => promptInput!.focus(), 20);
  }, 100);
}

/** Open the bar immediately (no pill animation) with a pre-filled prompt. */
function activatePromptModeWithPrompt(prompt: string): void {
  if (!promptWrapper || !promptInput || !captured) return;
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  inPromptMode = true;

  const pillContainer = promptWrapper.querySelector('#pill-container') as HTMLElement;
  const bar = promptWrapper.querySelector('#prompt-bar-inner') as HTMLElement;

  pillContainer.style.display = 'none';
  bar.style.display = 'flex';
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = 'promptBarIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards';

  promptInput.value = prompt;
  onPromptInput(); // sync hint visibility
  setTimeout(() => promptInput!.focus(), 30);

  if (promptOpenedByUndo) showRedoHint();
}

function onGlobalKeydown(e: KeyboardEvent): void {
  // Cmd+A / Ctrl+A — restrict select-all to the editor content only
  if ((e.key === 'a' || e.key === 'A') && (e.metaKey || e.ctrlKey) && editor) {
    const active = document.activeElement;
    if (active === editor || editor.contains(active)) {
      e.preventDefault();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }
  }

  // Cmd+Shift+Z / Ctrl+Shift+Z — redo AI edit after manual undo
  if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && e.shiftKey) {
    if (lastRestoredNode?.parentNode && lastEditNewText) {
      e.preventDefault();
      hideUI();
      applyDiffToNode(lastRestoredNode, lastEditOriginalText, lastEditNewText);
      editStack.push({ prompt: editStack[editStack.length - 1]?.prompt ?? '', originalText: lastEditOriginalText, newText: lastEditNewText, container: lastEditContainer! });
      lastRestoredNode = null;
      interceptNextUndo = true;
      showAcceptBar();
      return;
    }
  }

  // Cmd+Z / Ctrl+Z — two-step undo after an AI edit
  if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
    // Second Ctrl+Z while prompt was re-opened by undo → just close
    if (promptOpenedByUndo && inPromptMode) {
      e.preventDefault();
      promptOpenedByUndo = false;
      hideUI();
      return;
    }

    // Ctrl+Z after any AI edit — let native undo run first (for manual edits),
    // then if no historyUndo input fires within 100ms, do the AI undo.
    if (findLastUndoable()) {
      if (undoCheckTimer) clearTimeout(undoCheckTimer);
      undoCheckTimer = setTimeout(() => {
        undoCheckTimer = null;
        performAIUndo();
      }, 100);
      return; // let native undo run; if it fires historyUndo we'll cancel above
    }
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    const savedRange = captured?.range.cloneRange() ?? null;
    hideUI();
    requestAnimationFrame(() => {
      editor?.focus();
      if (savedRange) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(savedRange);
      }
    });
    return;
  }

  // Enter while accept bar is showing → accept the AI edit
  if (e.key === 'Enter' && interceptNextUndo && !inPromptMode) {
    e.preventDefault();
    acceptChanges();
    return;
  }

  // Enter while editor focused + pill visible → activate
  if (
    e.key === 'Enter' &&
    !inPromptMode &&
    captured &&
    promptWrapper?.style.display !== 'none' &&
    document.activeElement === editor
  ) {
    e.preventDefault();
    activatePromptMode();
  }
}

function onPromptKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const val = promptInput!.value.trim();
    if (val) submitPrompt(val);
  } else if (e.key === 'Escape') {
    const savedRange = captured?.range.cloneRange() ?? null;
    hideUI();
    requestAnimationFrame(() => {
      editor?.focus();
      if (savedRange) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(savedRange);
      }
    });
  }
}

function onPromptInput(): void {
  const send = promptWrapper?.querySelector('#pb-send') as HTMLElement | null;
  if (send) send.style.display = promptInput!.value.length > 0 ? 'flex' : 'none';
}

// ─── API call & replacement ───────────────────────────────────────────────────

async function submitPrompt(userPrompt: string): Promise<void> {
  if (!captured) return;
  const snap = captured;
  promptOpenedByUndo = false;

  // Hide the bar immediately — user sees the loader in the text instead
  hideUI();
  hideAcceptBar();

  insertLoader(snap);

  try {
    const ctx = getDocumentContext(snap.range);
    const result = await callClaude(snap.text, userPrompt, ctx);
    replaceLoaderWithDiff(snap.text, result);
    editStack.push({ prompt: userPrompt, originalText: snap.text, newText: result, container: lastEditContainer! });
    interceptNextUndo = true;
    showAcceptBar();
  } catch (err) {
    console.error(err);
    if (editor) editor.setAttribute('contenteditable', 'true');
    if (loaderEl) { loaderEl.replaceWith(document.createTextNode(snap.text)); loaderEl = null; }
  }
}

function insertLoader(snap: CapturedSelection): void {
  // Build the loader element first so we hold a direct reference — never rely
  // on getElementById, which can fail when execCommand strips attributes.
  const loader = document.createElement('span');
  loader.style.cssText =
    'color:transparent;' +
    'border-radius:9999px;' +
    'background:linear-gradient(90deg,#e5e7eb 25%,#d1d5db 50%,#e5e7eb 75%);' +
    'background-size:200% 100%;' +
    'animation:shimmer 1.2s infinite linear;' +
    'display:inline;' +
    '-webkit-box-decoration-break:clone;' +
    'box-decoration-break:clone;';
  loader.textContent = snap.text; // same text = same width, no reflow

  const range = snap.range.cloneRange();
  range.deleteContents();
  range.insertNode(loader);

  loaderEl = loader;
  lastEditOriginalText = snap.text;
  lastRestoredNode = null;

  if (editor) editor.setAttribute('contenteditable', 'false');
}

function replaceLoaderWithDiff(oldText: string, newText: string): void {
  const loader = loaderEl;
  loaderEl = null;
  if (!loader?.parentNode) {
    if (editor) editor.setAttribute('contenteditable', 'true');
    return;
  }

  lastEditNewText = newText;

  // Wrap in a display:contents span so we can locate it for undo
  const container = document.createElement('span');
  container.style.display = 'contents';

  // Apply markdown to the full new text so patterns like **bold text** always render correctly
  const span = document.createElement('span');
  span.innerHTML = markdownToHtml(newText);
  if (oldText !== newText) {
    span.style.backgroundColor = '#fefce8';
    span.style.borderRadius = '2px';
    highlightSpans = [span];
  } else {
    highlightSpans = [];
  }
  container.appendChild(span);

  // Swap while still contenteditable=false so the browser doesn't log it
  // as an undo step. Re-enabling contenteditable afterwards clears the
  // history from the loader insertion too — leaving a clean undo slate.
  loader.replaceWith(container);
  lastEditContainer = container;
  if (editor) editor.setAttribute('contenteditable', 'true');
}

/** Re-apply an edit to an existing text node (used for Cmd+Shift+Z redo). */
function applyDiffToNode(node: Text, oldText: string, newText: string): void {
  if (!node.parentNode) return;

  const container = document.createElement('span');
  container.style.display = 'contents';

  const span = document.createElement('span');
  span.innerHTML = markdownToHtml(newText);
  if (oldText !== newText) {
    span.style.backgroundColor = '#fefce8';
    span.style.borderRadius = '2px';
    highlightSpans = [span];
  } else {
    highlightSpans = [];
  }
  container.appendChild(span);

  node.replaceWith(container);
  lastEditContainer = container;
}

interface DocumentContext {
  fullDoc: string;
  prevParagraph: string;
  currentParagraphMarked: string;
  nextParagraph: string;
}

async function callClaude(
  selectedText: string,
  userPrompt: string,
  ctx: DocumentContext,
): Promise<string> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const parts: string[] = [];
  if (ctx.fullDoc) parts.push(`Document:\n${ctx.fullDoc}`);
  if (ctx.prevParagraph) parts.push(`Paragraph before:\n${ctx.prevParagraph}`);
  parts.push(`Current paragraph (selection marked with [[ ]]):\n${ctx.currentParagraphMarked}`);
  if (ctx.nextParagraph) parts.push(`Paragraph after:\n${ctx.nextParagraph}`);
  parts.push(`Selected text (to rewrite):\n${selectedText}`);
  parts.push(`Instruction: ${userPrompt}`);

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:
      'You are an inline text editor assistant. The user has selected text within a document and wants to transform it. Use the document and paragraph context to maintain consistency in style, tone, and meaning. The selected text is marked with [[ ]] in the current paragraph. Return ONLY the rewritten selection — no explanation, no preamble, no surrounding quotes. You may use **bold** and *italic* markdown for emphasis where appropriate.',
    messages: [{ role: 'user', content: parts.join('\n\n') }],
  });

  const block = msg.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type');
  return block.text.trim();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDocumentContext(range: Range): DocumentContext {
  // Full document text, capped at 2000 chars
  const fullDoc = (editor?.innerText ?? '').slice(0, 2000);

  // Find nearest block ancestor of the selection
  const blockTags = new Set(['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote']);
  let node: Node | null = range.commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE && blockTags.has((node as Element).tagName.toLowerCase())) break;
    node = node.parentNode;
  }

  if (!node || node === editor) {
    return { fullDoc, prevParagraph: '', currentParagraphMarked: range.toString(), nextParagraph: '' };
  }

  const paraEl = node as Element;

  // Build marked paragraph: text before [[ selection ]] text after
  let currentParagraphMarked = paraEl.textContent ?? '';
  try {
    const before = document.createRange();
    before.selectNodeContents(paraEl);
    before.setEnd(range.startContainer, range.startOffset);

    const after = document.createRange();
    after.selectNodeContents(paraEl);
    after.setStart(range.endContainer, range.endOffset);

    currentParagraphMarked = before.toString() + '[[' + range.toString() + ']]' + after.toString();
  } catch (_) { /* fallback: plain paragraph text */ }

  // Adjacent block siblings
  const prevParagraph = adjacentBlockText(paraEl, 'previous');
  const nextParagraph = adjacentBlockText(paraEl, 'next');

  return { fullDoc, prevParagraph, currentParagraphMarked, nextParagraph };
}

function adjacentBlockText(el: Element, direction: 'previous' | 'next'): string {
  let sibling = direction === 'previous' ? el.previousElementSibling : el.nextElementSibling;
  while (sibling) {
    const text = sibling.textContent?.trim() ?? '';
    if (text) return text;
    sibling = direction === 'previous' ? sibling.previousElementSibling : sibling.nextElementSibling;
  }
  return '';
}

function markdownToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

// ─── UI states ────────────────────────────────────────────────────────────────

function resetHint(): void {
  const send = promptWrapper?.querySelector('#pb-send') as HTMLElement | null;
  if (send) send.style.display = 'none';
}

function showAcceptBar(): void {
  if (!promptWrapper) return;
  const bar = promptWrapper.querySelector('#accept-bar') as HTMLElement;
  positionWrapper();
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  promptWrapper.style.display = 'flex';
  bar.style.display = 'flex';
}

function hideAcceptBar(): void {
  const bar = promptWrapper?.querySelector('#accept-bar') as HTMLElement | null;
  if (bar) bar.style.display = 'none';
}

function showRedoHint(): void {
  if (!promptWrapper) return;
  const hint = promptWrapper.querySelector('#redo-hint') as HTMLElement;
  hint.style.display = 'flex';
}

function hideRedoHint(): void {
  const hint = promptWrapper?.querySelector('#redo-hint') as HTMLElement | null;
  if (hint) hint.style.display = 'none';
}

function acceptChanges(): void {
  if (!interceptNextUndo) return;
  highlightSpans.forEach(span => { span.style.backgroundColor = ''; });
  highlightSpans = [];
  interceptNextUndo = false;
  hideAcceptBar();

  if (lastEditContainer?.parentNode) {
    editor?.focus();
    const range = document.createRange();
    range.selectNodeContents(lastEditContainer);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    captured = {
      text: lastEditNewText,
      range: range.cloneRange(),
      rect: range.getBoundingClientRect(),
    };
    positionWrapper();
    showPill(true);
  }
}

function findLastUndoable(): EditEntry | null {
  for (let i = editStack.length - 1; i >= 0; i--) {
    if (editStack[i].container.parentNode) return editStack[i];
  }
  return null;
}

function performAIUndo(): void {
  const entry = findLastUndoable();
  if (!entry) return;

  interceptNextUndo = false;
  hideAcceptBar();
  highlightSpans = [];

  // Remove this entry from the stack
  editStack.splice(editStack.indexOf(entry), 1);

  const parent = entry.container.parentNode!;
  const restored = document.createTextNode(entry.originalText);
  parent.insertBefore(restored, entry.container);
  entry.container.remove();
  if (lastEditContainer === entry.container) lastEditContainer = null;
  lastRestoredNode = restored;
  lastEditOriginalText = entry.originalText;
  lastEditNewText = entry.newText;

  editor?.focus();
  const range = document.createRange();
  range.selectNode(restored);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);

  captured = {
    text: entry.originalText,
    range: range.cloneRange(),
    rect: range.getBoundingClientRect(),
  };
  positionWrapper();
  promptWrapper!.style.display = 'flex';
  promptOpenedByUndo = true;
  activatePromptModeWithPrompt(entry.prompt);
}

