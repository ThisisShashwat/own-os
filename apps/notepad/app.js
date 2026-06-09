/* apps/notepad/app.js */

/**
 * Initialize the Notepad Application.
 * Renders a standard text editor interface with basic file download capabilities.
 * @param {HTMLElement} container - The DOM element where the app renders.
 * @param {Object} OS - The global OS kernel.
 */
export function init(container, OS) {
  // Clear any existing contents
  container.innerHTML = '';

  const storage = OS.getStorage('notepad');

  const notepadContainer = document.createElement('div');
  notepadContainer.className = 'notepad-app';

  notepadContainer.innerHTML = `
    <div class="notepad-menu">
      <span class="notepad-menu-item" id="menu-clear">Clear</span>
      <span class="notepad-menu-item" id="menu-download">Download</span>
    </div>
    <div class="notepad-editor-wrapper">
      <textarea class="notepad-textarea" placeholder="Start typing here..."></textarea>
    </div>
    <div class="notepad-statusbar">
      <span id="char-count">Characters: 0</span>
      <span>UTF-8</span>
    </div>
  `;

  container.appendChild(notepadContainer);

  const textarea = notepadContainer.querySelector('.notepad-textarea');
  const charCount = notepadContainer.querySelector('#char-count');
  const btnClear = notepadContainer.querySelector('#menu-clear');
  const btnDownload = notepadContainer.querySelector('#menu-download');

  // Load saved draft on startup
  const savedText = storage.get('draft') || '';
  if (savedText) {
    textarea.value = savedText;
    charCount.textContent = `Characters: ${savedText.length}`;
  }

  // Update status bar and save draft on input
  textarea.addEventListener('input', () => {
    charCount.textContent = `Characters: ${textarea.value.length}`;
    storage.set('draft', textarea.value);
  });

  // Clear textarea and remove draft
  btnClear.addEventListener('click', () => {
    textarea.value = '';
    charCount.textContent = 'Characters: 0';
    storage.remove('draft');
    textarea.focus();
  });

  // Download text file using Blob
  btnDownload.addEventListener('click', () => {
    const text = textarea.value;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // Focus editor
  textarea.focus();
}
