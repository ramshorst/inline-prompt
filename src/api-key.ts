import Anthropic from '@anthropic-ai/sdk';

export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 5,
      messages: [{ role: 'user', content: 'Hi' }],
    });
    return true;
  } catch {
    return false;
  }
}

export function renderApiKeyScreen(onSuccess: (key: string) => void): void {
  const app = document.getElementById('app')!;

  app.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div class="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 w-full max-w-sm">

        <div class="mb-8">
          <div class="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center mb-5">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 class="text-xl font-semibold text-gray-900 mb-1.5">Inline Prompt</h1>
          <p class="text-sm text-gray-500 leading-relaxed">
            Enter your Anthropic API key to get started.<br />
            It stays in your browser — nothing is sent to any server.
          </p>
        </div>

        <div class="space-y-3">
          <input
            type="password"
            id="api-key-input"
            placeholder="sk-ant-..."
            autocomplete="off"
            class="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm
                   focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent
                   transition-all placeholder-gray-300"
          />

          <button
            id="validate-btn"
            class="w-full bg-gray-900 text-white rounded-xl py-2.5 text-sm font-medium
                   hover:bg-gray-800 active:scale-[0.98] transition-all
                   flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Continue
          </button>

          <p id="error-msg" class="hidden text-red-500 text-xs text-center pt-1">
            Invalid API key. Please try again.
          </p>
        </div>

      </div>
    </div>
  `;

  const input = document.getElementById('api-key-input') as HTMLInputElement;
  const btn = document.getElementById('validate-btn') as HTMLButtonElement;
  const errorMsg = document.getElementById('error-msg')!;

  async function handleSubmit(): Promise<void> {
    const key = input.value.trim();
    if (!key || btn.disabled) return;

    setLoading(true);
    errorMsg.classList.add('hidden');

    const valid = await validateApiKey(key);

    if (valid) {
      onSuccess(key);
    } else {
      setLoading(false);
      errorMsg.classList.remove('hidden');
      input.focus();
    }
  }

  function setLoading(loading: boolean): void {
    btn.disabled = loading;
    btn.innerHTML = loading
      ? `<svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
           <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
           <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
         </svg>
         Validating...`
      : 'Continue';
  }

  btn.addEventListener('click', handleSubmit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmit();
  });

  requestAnimationFrame(() => input.focus());
}
