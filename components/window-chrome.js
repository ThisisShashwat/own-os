/* components/window-chrome.js */

(function () {
  /**
   * Title Bar Chrome factory component.
   * Stamped onto windows by the window manager.
   */
  const windowChrome = {
    /**
     * Create title bar DOM structure for a window.
     * @param {Object} manifest - App manifest settings (name, icon).
     * @param {string} windowId - The unique ID of the target window.
     * @returns {HTMLElement} The titlebar element.
     */
    create(manifest, windowId) {
      const titlebar = document.createElement('div');
      titlebar.className = 'os-window-titlebar';

      // Title layout (Icon + Text)
      const titleEl = document.createElement('div');
      titleEl.className = 'os-window-title';
      
      const iconEl = document.createElement('span');
      iconEl.className = 'os-window-icon';
      iconEl.textContent = manifest.icon || '📦';
      
      const textEl = document.createElement('span');
      textEl.textContent = manifest.name || 'Application';
      
      titleEl.appendChild(iconEl);
      titleEl.appendChild(textEl);
      titlebar.appendChild(titleEl);

      // Window controls button layout
      const controlsEl = document.createElement('div');
      controlsEl.className = 'os-window-controls';

      // Minimize Button
      const minBtn = document.createElement('button');
      minBtn.className = 'os-window-control-btn os-window-control-btn--minimize';
      minBtn.innerHTML = '&#9472;'; // Em-dash (—)
      minBtn.title = 'Minimize';
      minBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent focusing container on button clicks
        window.OS.emit('window:minimize:request', windowId);
      });

      // Maximize/Restore Button
      const maxBtn = document.createElement('button');
      maxBtn.className = 'os-window-control-btn os-window-control-btn--maximize';
      maxBtn.innerHTML = '&#9633;'; // White square outline (◻)
      maxBtn.title = 'Maximize';
      maxBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.OS.emit('window:maximize:request', windowId);
      });

      // Close Button
      const closeBtn = document.createElement('button');
      closeBtn.className = 'os-window-control-btn os-window-control-btn--close';
      closeBtn.innerHTML = '&#10005;'; // Close cross (✕)
      closeBtn.title = 'Close';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.OS.emit('window:close:request', windowId);
      });

      controlsEl.appendChild(minBtn);
      controlsEl.appendChild(maxBtn);
      controlsEl.appendChild(closeBtn);
      titlebar.appendChild(controlsEl);

      return titlebar;
    }
  };

  // Register on global OS object
  if (window.OS) {
    window.OS.windowChrome = windowChrome;
  } else {
    console.error('[WindowChrome] OS kernel not loaded yet.');
  }
})();
