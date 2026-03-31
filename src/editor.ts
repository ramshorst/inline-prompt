import { initInlinePrompt, destroyInlinePrompt } from './inline-prompt';
import catImg from './cat.png';

const SAMPLE_CONTENT = `<p>It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him.</p><p>The hallway smelt of boiled cabbage and old rag mats. At one end of it a coloured poster, too large for the wall, had been tacked to the wall. It depicted simply an enormous face, more than a metre wide: the face of a man of about forty-five, with a heavy black moustache and ruggedly handsome features.</p><p>Winston made for the stairs. It was no use trying the lift. Even at the best of times it was seldom working, and at present the electric current was cut off during daylight hours. It was part of the economy drive in preparation for Hate Week.</p>`;

export function renderEditor(apiKey: string, onLogout: () => void): void {
  destroyInlinePrompt();

  const app = document.getElementById('app')!;
  app.innerHTML = `
    <div class="min-h-screen bg-gray-50 flex flex-col">

      <header class="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10
                     px-6 py-3 flex items-center justify-between">
        <span class="text-sm font-semibold text-gray-900">Inline Prompt</span>
        <button
          id="logout-btn"
          class="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Change API key
        </button>
      </header>

      <!-- Fade-to-white overlay so bottom buttons always read cleanly over text -->
      <div style="
        position: fixed; bottom: 0; left: 0; right: 0; height: 100px;
        background: linear-gradient(to bottom, transparent, #f9fafb);
        pointer-events: none; z-index: 9997;
      "></div>

      <main class="flex-1 flex justify-center px-6 pt-10">
        <div class="w-full max-w-2xl">
          <div
            id="editor"
            contenteditable="true"
            data-placeholder="Start writing..."
            spellcheck="true"
            class="w-full bg-gray-100 rounded-2xl px-14 pt-10 pb-28 text-gray-800 focus:outline-none"
            style="font-family: 'Lora', Georgia, serif; font-size: 18px; line-height: 1.85; min-height: calc(100vh - 48px - 2.5rem);"
          ></div>
        </div>
      </main>

    </div>
  `;

  document.getElementById('logout-btn')!.addEventListener('click', onLogout);

  const editor = document.getElementById('editor') as HTMLDivElement;
  editor.innerHTML = SAMPLE_CONTENT;

  initInlinePrompt(editor, apiKey);

  // Cat mascot hint
  const catHint = document.createElement('div');
  catHint.style.cssText = `
    position: fixed;
    bottom: 28px;
    right: 28px;
    display: flex;
    align-items: flex-end;
    gap: 10px;
    z-index: 50;
    animation: catFadeIn 0.4s ease both;
  `;

  catHint.innerHTML = `
    <style>
      @keyframes catFadeIn {
        from { opacity: 0; transform: translateY(12px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes catFadeOut {
        from { opacity: 1; transform: translateY(0); }
        to   { opacity: 0; transform: translateY(8px); }
      }
    </style>
    <div style="
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 16px 16px 4px 16px;
      padding: 10px 14px;
      font-size: 13px;
      color: #374151;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      max-width: 190px;
      line-height: 1.45;
    ">
      Select some text to edit it with AI ✨
    </div>
    <img src="${catImg}" style="
      width: 52px;
      height: 52px;
      border-radius: 50%;
      object-fit: cover;
      box-shadow: 0 2px 10px rgba(0,0,0,0.12);
      flex-shrink: 0;
    " />
  `;

  document.body.appendChild(catHint);

  const dismissCat = () => {
    catHint.style.animation = 'catFadeOut 0.3s ease both';
    catHint.addEventListener('animationend', () => catHint.remove(), { once: true });
  };

  // Dismiss after 5s or on first text selection
  const dismissTimer = setTimeout(dismissCat, 5000);
  const onSelect = () => {
    if ((window.getSelection()?.toString() ?? '').length > 0) {
      clearTimeout(dismissTimer);
      document.removeEventListener('selectionchange', onSelect);
      dismissCat();
    }
  };
  document.addEventListener('selectionchange', onSelect);

  // Move cursor to end and focus
  requestAnimationFrame(() => {
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  });
}
