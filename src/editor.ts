import { initInlinePrompt, destroyInlinePrompt } from './inline-prompt';

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
