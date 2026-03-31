import { renderApiKeyScreen } from './api-key';
import { renderEditor } from './editor';

const STORAGE_KEY = 'claude-api-key';

function init(): void {
  const savedKey = localStorage.getItem(STORAGE_KEY);
  if (savedKey) {
    renderEditor(savedKey, logout);
  } else {
    renderApiKeyScreen((key) => {
      localStorage.setItem(STORAGE_KEY, key);
      renderEditor(key, logout);
    });
  }
}

function logout(): void {
  // Don't clear the key yet — only overwrite it when a new one is validated
  renderApiKeyScreen((key) => {
    localStorage.setItem(STORAGE_KEY, key);
    renderEditor(key, logout);
  });
}

init();
