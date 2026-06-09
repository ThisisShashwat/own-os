/* core/window-manager.js */

(function () {
  const windowManager = {
    // Map to keep track of active windows: Map<id, WindowState>
    windows: new Map(),
    
    // Counter for generating window IDs
    _nextId: 1,

    /**
     * Initialize the Window Manager.
     * @param {Object} OS - The global OS kernel.
     */
    init(OS) {
      this.OS = OS;

      // Listen for app launch events to create windows
      OS.on('app:launched', (data) => {
        this.createWindow(data.id, data.manifest);
      });

      // Listen for window close requests from the UI chrome controls
      OS.on('window:close:request', (id) => {
        this.closeWindow(id);
      });

      // Listen for window maximize requests
      OS.on('window:maximize:request', (id) => {
        this.maximizeWindow(id);
      });

      // Listen for window minimize requests
      OS.on('window:minimize:request', (id) => {
        this.minimizeWindow(id);
      });

      // Listen for window restore requests
      OS.on('window:restore:request', (id) => {
        this.restoreWindow(id);
      });

      // Create and mount the snap preview helper element
      this.snapPreview = document.createElement('div');
      this.snapPreview.className = 'os-snap-preview';
      document.getElementById('os-window-layer').appendChild(this.snapPreview);

      // Listen for desktop focus events to unfocus all windows
      OS.on('desktop:focused', () => {
        this.windows.forEach((w) => {
          w.element.classList.remove('os-window--focused');
        });
        this.focusedWindowId = null;
      });

      // Listen for system booted event to restore saved window session
      OS.on('system:booted', () => {
        this.restoreSession();
      });

      // Listen for browser viewport resize to adjust window bounds
      window.addEventListener('resize', () => {
        this.handleViewportResize();
      });

      console.log('[WindowManager] Initialized and subscribed to app:launched & window:close:request');
    },

    /**
     * Create a new window for an application.
     * @param {string} appId - The ID of the application launching.
     * @param {Object} manifest - The application's manifest settings.
     * @returns {string} The unique ID of the created window.
     */
    createWindow(appId, manifest) {
      // 0. Singleton App Check: focus existing window if already open
      if (manifest.singleton) {
        for (const [id, win] of this.windows.entries()) {
          if (win.appId === appId) {
            this.focusWindow(id);
            if (win.state === 'minimized') {
              this.restoreWindow(id);
            }
            return id;
          }
        }
      }

      const windowId = `win_${appId}_${this._nextId++}`;
      console.log(`[WindowManager] Creating window "${windowId}" for app "${appId}"`);

      // 1. Calculate default dimensions and cascading coordinates
      const desktop = document.getElementById('os-desktop');
      const dWidth = desktop ? desktop.clientWidth : window.innerWidth;
      const dHeight = desktop ? desktop.clientHeight : window.innerHeight - 48; // Less taskbar

      const width = manifest.defaultSize?.width || 600;
      const height = manifest.defaultSize?.height || 400;

      // Calculate position: offset from the last opened window, or center if it's the first
      let left, top;
      if (this.windows.size === 0) {
        left = Math.max(20, Math.floor((dWidth - width) / 2));
        top = Math.max(20, Math.floor((dHeight - height) / 2));
      } else {
        const activeWindows = Array.from(this.windows.values());
        const lastWin = activeWindows[activeWindows.length - 1];
        
        left = lastWin.position.left + 25;
        top = lastWin.position.top + 25;

        // Wrap back to top-left if the window would overflow the screen boundary
        if (left + width > dWidth - 20 || top + height > dHeight - 20) {
          left = 40;
          top = 40;
        }
      }

      // 2. Build the main Window DOM container
      const windowEl = document.createElement('div');
      windowEl.className = 'os-window';
      windowEl.id = windowId;
      windowEl.setAttribute('data-window-id', windowId);
      windowEl.setAttribute('data-app-id', appId);

      // Apply initial coordinates and dimensions
      windowEl.style.left = `${left}px`;
      windowEl.style.top = `${top}px`;
      windowEl.style.width = `${width}px`;
      windowEl.style.height = `${height}px`;

      // 3. Construct and attach the title bar (chrome)
      if (this.OS.windowChrome && typeof this.OS.windowChrome.create === 'function') {
        const titlebar = this.OS.windowChrome.create(manifest, windowId);
        windowEl.appendChild(titlebar);
        
        // Wire up dragging logic
        this._setupDrag(titlebar, windowEl, windowId);
      } else {
        console.warn('[WindowManager] Window Chrome component not found, window will have no header.');
      }

      // 4. Construct and attach the window content body area
      const bodyEl = document.createElement('div');
      bodyEl.className = 'os-window-body';
      windowEl.appendChild(bodyEl);

      // 5. Append resize handles (8 directions)
      const directions = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
      directions.forEach(dir => {
        const handle = document.createElement('div');
        handle.className = `os-window-resize-handle os-window-resize-handle--${dir}`;
        handle.setAttribute('data-direction', dir);
        windowEl.appendChild(handle);
      });

      // Wire up resizing logic
      this._setupResize(windowEl, windowId);

      // 6. Insert window into the DOM window layer
      const layer = document.getElementById('os-window-layer');
      if (layer) {
        layer.appendChild(windowEl);
      } else {
        console.error('[WindowManager] #os-window-layer container not found in DOM.');
        return null;
      }

      // Focus window on click/pointerdown
      windowEl.addEventListener('pointerdown', () => {
        this.focusWindow(windowId);
      });

      // 7. Store window state internally
      this.windows.set(windowId, {
        id: windowId,
        appId: appId,
        element: windowEl,
        manifest: manifest,
        state: 'normal', // 'normal', 'minimized', 'maximized'
        position: { left, top },
        size: { width, height },
        restorePosition: { left, top },
        restoreSize: { width, height },
        zIndex: 100
      });

      // 8. Focus the newly created window
      this.focusWindow(windowId);

      // Load CSS styles dynamically if specified in manifest
      if (manifest.styles) {
        const styleId = `app-style-${appId}`;
        if (!document.getElementById(styleId)) {
          const link = document.createElement('link');
          link.id = styleId;
          link.rel = 'stylesheet';
          link.href = new URL(manifest.styles, window.location.href).href;
          document.head.appendChild(link);
        }
      }

      // Load entry script dynamically and initialize app UI
      if (manifest.entry) {
        const entryUrl = new URL(manifest.entry, window.location.href).href;
        import(entryUrl)
          .then(module => {
            if (module && typeof module.init === 'function') {
              module.init(bodyEl, this.OS);
            } else {
              console.error(`[WindowManager] App entry script "${manifest.entry}" did not export an init function.`);
            }
          })
          .catch(err => {
            console.error(`[WindowManager] Failed to dynamically load app script "${manifest.entry}":`, err);
          });
      }

      // 9. Dispatch lifecycle event
      this.OS.emit('window:created', { id: windowId, appId, manifest });

      this.saveSession();

      return windowId;
    },

    /**
     * Focus a window and bring it to the front of the stacking order.
     * @param {string} id - The ID of the window to focus.
     */
    focusWindow(id) {
      const win = this.windows.get(id);
      if (!win) return;

      // 1. Update focused class across elements
      this.windows.forEach((w, key) => {
        if (key === id) {
          w.element.classList.add('os-window--focused');
        } else {
          w.element.classList.remove('os-window--focused');
        }
      });

      // 2. Manage stacking index (Z-Index)
      const activeWindows = Array.from(this.windows.values())
        .filter(w => w.id !== id && w.state !== 'minimized'); // Exclude current and minimized windows

      // Sort by their current z-indices
      activeWindows.sort((a, b) => a.zIndex - b.zIndex);

      // Place current window at the end of the stack (topmost)
      activeWindows.push(win);

      // Apply sequential z-indices to prevent infinite index growth
      const baseZ = 100;
      activeWindows.forEach((w, index) => {
        w.zIndex = baseZ + index;
        w.element.style.zIndex = w.zIndex;
      });

      // 3. Update active pointer state
      this.focusedWindowId = id;

      // 4. Emit event
      this.OS.emit('window:focused', { id });

      this.saveSession();
    },

    /**
     * Close a window, clean up its DOM nodes, and focus the next topmost window.
     * @param {string} id - The ID of the window to close.
     */
    closeWindow(id) {
      const win = this.windows.get(id);
      if (!win) return;

      console.log(`[WindowManager] Closing window: ${id}`);

      // 1. Remove the window from the DOM
      if (win.element && win.element.parentNode) {
        win.element.parentNode.removeChild(win.element);
      }

      // 2. Delete state entry
      const appId = win.appId;
      this.windows.delete(id);

      // 3. Emit close event
      this.OS.emit('window:closed', { id, appId });

      // 4. Focus the next topmost window if the closed window was currently focused
      if (this.focusedWindowId === id) {
        this.focusedWindowId = null;

        // Filter and sort remaining visible windows by z-index
        const remaining = Array.from(this.windows.values())
          .filter(w => w.state !== 'minimized');

        if (remaining.length > 0) {
          remaining.sort((a, b) => b.zIndex - a.zIndex); // Descending zIndex
          this.focusWindow(remaining[0].id); // Focus the topmost window
        }
      }

      this.saveSession();
    },

    /**
     * Set up pointer-based dragging on the title bar of a window.
     * @param {HTMLElement} titlebar - The title bar element of the window.
     * @param {HTMLElement} windowEl - The main outer window container element.
     * @param {string} windowId - The unique ID of the window.
     */
    _setupDrag(titlebar, windowEl, windowId) {
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;
      let pendingSnap = null;

      titlebar.addEventListener('pointerdown', (e) => {
        // 1. Ignore if user clicks on window control buttons (min/max/close)
        if (e.target.closest('.os-window-control-btn')) return;

        const win = this.windows.get(windowId);
        if (!win) return;

        // 2. Focus the window
        this.focusWindow(windowId);

        // Save stable restore parameters before drag shifts them
        if (win.state === 'normal') {
          win.restorePosition = { ...win.position };
          win.restoreSize = { ...win.size };
        }

        // 3. Initialize drag coordinates
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = win.position.left;
        startTop = win.position.top;

        // 4. Capture pointer events so cursor doesn't drift away on fast moves
        titlebar.setPointerCapture(e.pointerId);
        windowEl.classList.add('os-window--dragging');
      });

      // Toggle maximize on double-click
      titlebar.addEventListener('dblclick', (e) => {
        if (e.target.closest('.os-window-control-btn')) return;
        this.maximizeWindow(windowId);
      });

      titlebar.addEventListener('pointermove', (e) => {
        if (!isDragging) return;

        const win = this.windows.get(windowId);
        if (!win) return;

        // Check if window is maximized or snapped, and needs to be "peeled off" to float
        if (win.state !== 'normal') {
          // Restore size to floating state
          const restoreW = win.restoreSize?.width || 600;
          const restoreH = win.restoreSize?.height || 400;

          // Revert visual states
          windowEl.classList.remove('os-window--maximized');
          windowEl.classList.remove('os-window--snapped');
          windowEl.style.width = `${restoreW}px`;
          windowEl.style.height = `${restoreH}px`;
          win.size = { width: restoreW, height: restoreH };
          win.state = 'normal';

          // Reset the maximize button glyph to standard maximize (◻)
          const maxBtn = windowEl.querySelector('.os-window-control-btn--maximize');
          if (maxBtn) {
            maxBtn.innerHTML = '&#9633;'; // Maximize icon (◻)
            maxBtn.title = 'Maximize';
          }

          // Position window so the cursor is centered horizontally on the titlebar
          let peelLeft = e.clientX - restoreW / 2;
          let peelTop = e.clientY - 18; // approx center of titlebar

          // Keep inside screen boundaries
          peelLeft = Math.max(10, Math.min(window.innerWidth - restoreW - 10, peelLeft));
          peelTop = Math.max(0, peelTop);

          // Re-anchor the drag coordinates
          startLeft = peelLeft;
          startTop = peelTop;
          startX = e.clientX;
          startY = e.clientY;

          windowEl.style.left = `${peelLeft}px`;
          windowEl.style.top = `${peelTop}px`;
          win.position = { left: peelLeft, top: peelTop };
          
          return;
        }

        // Calculate offset delta
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const left = startLeft + dx;
        const top = startTop + dy;

        // 5. Apply layout positioning
        windowEl.style.left = `${left}px`;
        windowEl.style.top = `${top}px`;

        // 6. Update state values
        win.position.left = left;
        win.position.top = top;

        // --- Edge Snapping Detection ---
        const dWidth = window.innerWidth;
        const dHeight = window.innerHeight - 48; // Less taskbar
        const edgeThreshold = 15;

        if (e.clientY < edgeThreshold) {
          // Top Snap (Maximize Preview)
          this.snapPreview.style.left = '4px';
          this.snapPreview.style.top = '4px';
          this.snapPreview.style.width = `${dWidth - 8}px`;
          this.snapPreview.style.height = `${dHeight - 8}px`;
          this.snapPreview.classList.add('os-snap-preview--active');
          pendingSnap = 'maximized';
        } else if (e.clientX < edgeThreshold) {
          // Left Snap (Left Half Preview)
          this.snapPreview.style.left = '4px';
          this.snapPreview.style.top = '4px';
          this.snapPreview.style.width = `${Math.floor(dWidth / 2) - 8}px`;
          this.snapPreview.style.height = `${dHeight - 8}px`;
          this.snapPreview.classList.add('os-snap-preview--active');
          pendingSnap = 'left';
        } else if (e.clientX > dWidth - edgeThreshold) {
          // Right Snap (Right Half Preview)
          this.snapPreview.style.left = `${Math.floor(dWidth / 2) + 4}px`;
          this.snapPreview.style.top = '4px';
          this.snapPreview.style.width = `${Math.floor(dWidth / 2) - 8}px`;
          this.snapPreview.style.height = `${dHeight - 8}px`;
          this.snapPreview.classList.add('os-snap-preview--active');
          pendingSnap = 'right';
        } else {
          // No snapping edge hit
          this.snapPreview.classList.remove('os-snap-preview--active');
          pendingSnap = null;
        }
      });

      titlebar.addEventListener('pointerup', (e) => {
        if (!isDragging) return;
        isDragging = false;

        titlebar.releasePointerCapture(e.pointerId);
        windowEl.classList.remove('os-window--dragging');
        this.snapPreview.classList.remove('os-snap-preview--active');

        const win = this.windows.get(windowId);
        if (!win) return;

        // Apply Snapping if pending
        if (pendingSnap) {
          const dWidth = window.innerWidth;
          const dHeight = window.innerHeight - 48;

          if (pendingSnap === 'maximized') {
            win.state = 'maximized';
            windowEl.classList.remove('os-window--snapped');
            windowEl.classList.add('os-window--maximized');
            // Clean inline values
            windowEl.style.width = '';
            windowEl.style.height = '';
            win.position = { left: 0, top: 0 };
            win.size = { width: dWidth, height: dHeight };
          } else if (pendingSnap === 'left') {
            win.state = 'snapped-left';
            windowEl.classList.remove('os-window--maximized');
            windowEl.classList.add('os-window--snapped');
            const targetW = Math.floor(dWidth / 2);
            windowEl.style.left = '0px';
            windowEl.style.top = '0px';
            windowEl.style.width = `${targetW}px`;
            windowEl.style.height = `${dHeight}px`;
            win.position = { left: 0, top: 0 };
            win.size = { width: targetW, height: dHeight };
          } else if (pendingSnap === 'right') {
            win.state = 'snapped-right';
            windowEl.classList.remove('os-window--maximized');
            windowEl.classList.add('os-window--snapped');
            const targetW = Math.floor(dWidth / 2);
            windowEl.style.left = `${targetW}px`;
            windowEl.style.top = '0px';
            windowEl.style.width = `${dWidth - targetW}px` ;
            windowEl.style.height = `${dHeight}px`;
            win.position = { left: targetW, top: 0 };
            win.size = { width: dWidth - targetW, height: dHeight };
          }

          this.OS.emit('window:snapped', { id: windowId, state: win.state });
        } else {
          // Emit drag complete event
          this.OS.emit('window:dragged', { id: windowId, position: win.position });
        }

        this.saveSession();
        pendingSnap = null;
      });

      titlebar.addEventListener('pointercancel', (e) => {
        if (!isDragging) return;
        isDragging = false;
        titlebar.releasePointerCapture(e.pointerId);
        windowEl.classList.remove('os-window--dragging');
        this.snapPreview.classList.remove('os-snap-preview--active');
        pendingSnap = null;
      });
    },

    /**
     * Set up pointer-based resizing for a window using its handles.
     * @param {HTMLElement} windowEl - The main outer window container element.
     * @param {string} windowId - The unique ID of the window.
     */
    _setupResize(windowEl, windowId) {
      const handles = windowEl.querySelectorAll('.os-window-resize-handle');
      
      handles.forEach(handle => {
        const dir = handle.getAttribute('data-direction');
        
        let isResizing = false;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;
        let startLeft = 0;
        let startTop = 0;

        handle.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();

          const win = this.windows.get(windowId);
          if (!win || win.state === 'maximized') return;

          // Focus the window
          this.focusWindow(windowId);

          isResizing = true;
          startX = e.clientX;
          startY = e.clientY;
          startWidth = win.size.width;
          startHeight = win.size.height;
          startLeft = win.position.left;
          startTop = win.position.top;

          handle.setPointerCapture(e.pointerId);
          windowEl.classList.add('os-window--resizing');
        });

        handle.addEventListener('pointermove', (e) => {
          if (!isResizing) return;

          const win = this.windows.get(windowId);
          if (!win) return;

          const dx = e.clientX - startX;
          const dy = e.clientY - startY;

          const minW = win.manifest.minSize?.width || 300;
          const minH = win.manifest.minSize?.height || 200;

          let newWidth = startWidth;
          let newHeight = startHeight;
          let newLeft = startLeft;
          let newTop = startTop;

          // Handle horizontal resizing (East, West)
          if (dir.includes('e')) {
            newWidth = startWidth + dx;
            if (newWidth < minW) newWidth = minW;
          } else if (dir.includes('w')) {
            newWidth = startWidth - dx;
            if (newWidth < minW) {
              newWidth = minW;
              newLeft = startLeft + startWidth - minW;
            } else {
              newLeft = startLeft + dx;
            }
          }

          // Handle vertical resizing (North, South)
          if (dir.includes('s')) {
            newHeight = startHeight + dy;
            if (newHeight < minH) newHeight = minH;
          } else if (dir.includes('n')) {
            newHeight = startHeight - dy;
            if (newHeight < minH) {
              newHeight = minH;
              newTop = startTop + startHeight - minH;
            } else {
              newTop = startTop + dy;
            }
          }

          // Apply dimensions and positions to DOM
          if (dir.includes('e') || dir.includes('w')) {
            windowEl.style.width = `${newWidth}px`;
            win.size.width = newWidth;
            if (dir.includes('w')) {
              windowEl.style.left = `${newLeft}px`;
              win.position.left = newLeft;
            }
          }

          if (dir.includes('n') || dir.includes('s')) {
            windowEl.style.height = `${newHeight}px`;
            win.size.height = newHeight;
            if (dir.includes('n')) {
              windowEl.style.top = `${newTop}px`;
              win.position.top = newTop;
            }
          }
        });

        const stopResize = (e) => {
          if (!isResizing) return;
          isResizing = false;

          handle.releasePointerCapture(e.pointerId);
          windowEl.classList.remove('os-window--resizing');

          const win = this.windows.get(windowId);
          if (win) {
            this.OS.emit('window:resized', {
              id: windowId,
              size: win.size,
              position: win.position
            });
            this.saveSession();
          }
        };

        handle.addEventListener('pointerup', stopResize);
        handle.addEventListener('pointercancel', stopResize);
      });
    },

    /**
     * Maximize a window to fill the screen or restore it if already maximized.
     * @param {string} id - The ID of the window to maximize.
     */
    maximizeWindow(id) {
      const win = this.windows.get(id);
      if (!win) return;

      // Toggle behavior if already maximized
      if (win.state === 'maximized') {
        this.restoreWindow(id);
        return;
      }

      console.log(`[WindowManager] Maximizing window: ${id}`);

      // Save restore parameters if currently normal
      if (win.state === 'normal') {
        win.restorePosition = { ...win.position };
        win.restoreSize = { ...win.size };
      }

      win.state = 'maximized';
      win.element.classList.add('os-window--maximized');

      // Clear inline positions so CSS taking full coverage takes priority
      win.element.style.left = '';
      win.element.style.top = '';
      win.element.style.width = '';
      win.element.style.height = '';

      // Update state dimensions (full workspace size)
      const dWidth = window.innerWidth;
      const dHeight = window.innerHeight - 48;
      win.position = { left: 0, top: 0 };
      win.size = { width: dWidth, height: dHeight };

      // Update control button icon to restore state
      const maxBtn = win.element.querySelector('.os-window-control-btn--maximize');
      if (maxBtn) {
        maxBtn.innerHTML = '&#128471;'; // Restore icon (🗗)
        maxBtn.title = 'Restore Down';
      }

      this.OS.emit('window:maximized', { id });
      this.saveSession();
    },

    /**
     * Minimize a window to hide it from screen view.
     * @param {string} id - The ID of the window to minimize.
     */
    minimizeWindow(id) {
      const win = this.windows.get(id);
      if (!win) return;

      console.log(`[WindowManager] Minimizing window: ${id}`);

      // Track the state prior to minimization so we know what to restore to
      win.prevState = win.state;
      win.state = 'minimized';
      win.element.classList.add('os-window--minimized');

      this.OS.emit('window:minimized', { id });

      // If the minimized window was focused, find the next topmost window to focus
      if (this.focusedWindowId === id) {
        this.focusedWindowId = null;

        const remaining = Array.from(this.windows.values())
          .filter(w => w.state !== 'minimized');

        if (remaining.length > 0) {
          remaining.sort((a, b) => b.zIndex - a.zIndex);
          this.focusWindow(remaining[0].id);
        }
      }
      this.saveSession();
    },

    /**
     * Restore a window back to its pre-maximized/pre-minimized state.
     * @param {string} id - The ID of the window to restore.
     */
    restoreWindow(id) {
      const win = this.windows.get(id);
      if (!win) return;

      console.log(`[WindowManager] Restoring window: ${id}`);

      // If restoring from minimized, check if it was previously maximized
      if (win.state === 'minimized') {
        win.element.classList.remove('os-window--minimized');
        if (win.prevState === 'maximized') {
          win.state = 'normal'; // Reset so maximizeWindow thinks it's normal and triggers maximization
          this.focusWindow(id);
          this.maximizeWindow(id);
          return;
        }
      }

      win.state = 'normal';
      win.element.classList.remove('os-window--maximized');
      win.element.classList.remove('os-window--minimized');
      win.element.classList.remove('os-window--snapped');

      // Re-apply saved dimensions and coordinates
      const restoreW = win.restoreSize?.width || 600;
      const restoreH = win.restoreSize?.height || 400;
      const restoreL = win.restorePosition?.left ?? 100;
      const restoreT = win.restorePosition?.top ?? 100;

      win.element.style.width = `${restoreW}px`;
      win.element.style.height = `${restoreH}px`;
      win.element.style.left = `${restoreL}px`;
      win.element.style.top = `${restoreT}px`;

      win.position = { left: restoreL, top: restoreT };
      win.size = { width: restoreW, height: restoreH };

      // Update control button icon back to maximize state
      const maxBtn = win.element.querySelector('.os-window-control-btn--maximize');
      if (maxBtn) {
        maxBtn.innerHTML = '&#9633;'; // Maximize icon (◻)
        maxBtn.title = 'Maximize';
      }

      // Focus the restored window
      this.focusWindow(id);

      this.OS.emit('window:restored', { id });
    },

    /**
     * Serialize and save the current layout session of open windows to settings store.
     */
    saveSession() {
      if (!this.OS) return;
      const sessionData = Array.from(this.windows.values()).map(win => ({
        appId: win.appId,
        state: win.state,
        position: { ...win.position },
        size: { ...win.size },
        restorePosition: { ...win.restorePosition },
        restoreSize: { ...win.restoreSize },
        zIndex: win.zIndex
      }));
      this.OS.settings.set('session_windows', sessionData);
    },

    /**
     * Restore windows layout from the saved session settings.
     */
    restoreSession() {
      const sessionData = this.OS.settings.get('session_windows') || [];
      if (sessionData.length === 0) return;

      console.log(`[WindowManager] Restoring ${sessionData.length} windows from saved session...`);

      // Sort windows by z-index so they are stacked in the correct order
      sessionData.sort((a, b) => a.zIndex - b.zIndex);

      sessionData.forEach(savedWin => {
        const manifest = this.OS.getApp(savedWin.appId);
        if (!manifest) return;

        this._createWindowForRestore(savedWin.appId, manifest, savedWin);
      });

      // Refocus the topmost window
      const remaining = Array.from(this.windows.values())
        .filter(w => w.state !== 'minimized');
      if (remaining.length > 0) {
        remaining.sort((a, b) => b.zIndex - a.zIndex);
        this.focusWindow(remaining[0].id);
      }
    },

    /**
     * Helper to create a window specifically with restored dimensions and state.
     */
    _createWindowForRestore(appId, manifest, savedState) {
      const windowId = `win_${appId}_${this._nextId++}`;
      
      const windowEl = document.createElement('div');
      windowEl.className = 'os-window';
      windowEl.id = windowId;
      windowEl.setAttribute('data-window-id', windowId);
      windowEl.setAttribute('data-app-id', appId);

      // Apply initial coordinates and dimensions
      windowEl.style.left = `${savedState.position.left}px`;
      windowEl.style.top = `${savedState.position.top}px`;
      windowEl.style.width = `${savedState.size.width}px`;
      windowEl.style.height = `${savedState.size.height}px`;

      // Construct and attach title bar
      if (this.OS.windowChrome && typeof this.OS.windowChrome.create === 'function') {
        const titlebar = this.OS.windowChrome.create(manifest, windowId);
        windowEl.appendChild(titlebar);
        this._setupDrag(titlebar, windowEl, windowId);
      }

      // Construct and attach body
      const bodyEl = document.createElement('div');
      bodyEl.className = 'os-window-body';
      windowEl.appendChild(bodyEl);

      // Append resize handles
      const directions = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];
      directions.forEach(dir => {
        const handle = document.createElement('div');
        handle.className = `os-window-resize-handle os-window-resize-handle--${dir}`;
        handle.setAttribute('data-direction', dir);
        windowEl.appendChild(handle);
      });
      this._setupResize(windowEl, windowId);

      // Insert into DOM
      const layer = document.getElementById('os-window-layer');
      if (layer) {
        layer.appendChild(windowEl);
      }

      // Focus listener
      windowEl.addEventListener('pointerdown', () => {
        this.focusWindow(windowId);
      });

      // Store window state
      this.windows.set(windowId, {
        id: windowId,
        appId: appId,
        element: windowEl,
        manifest: manifest,
        state: savedState.state,
        position: savedState.position,
        size: savedState.size,
        restorePosition: savedState.restorePosition,
        restoreSize: savedState.restoreSize,
        zIndex: savedState.zIndex
      });

      // Apply layouts and visual classes
      windowEl.style.zIndex = savedState.zIndex;

      if (savedState.state === 'maximized') {
        windowEl.classList.add('os-window--maximized');
        windowEl.style.left = '';
        windowEl.style.top = '';
        windowEl.style.width = '';
        windowEl.style.height = '';
        
        const maxBtn = windowEl.querySelector('.os-window-control-btn--maximize');
        if (maxBtn) {
          maxBtn.innerHTML = '&#128471;';
          maxBtn.title = 'Restore Down';
        }
      } else if (savedState.state.startsWith('snapped')) {
        windowEl.classList.add('os-window--snapped');
      } else if (savedState.state === 'minimized') {
        windowEl.classList.add('os-window--minimized');
      }

      // Load CSS styles
      if (manifest.styles) {
        const styleId = `app-style-${appId}`;
        if (!document.getElementById(styleId)) {
          const link = document.createElement('link');
          link.id = styleId;
          link.rel = 'stylesheet';
          link.href = new URL(manifest.styles, window.location.href).href;
          document.head.appendChild(link);
        }
      }

      // Load entry script
      if (manifest.entry) {
        const entryUrl = new URL(manifest.entry, window.location.href).href;
        import(entryUrl)
          .then(module => {
            if (module && typeof module.init === 'function') {
              module.init(bodyEl, this.OS);
            }
          })
          .catch(err => {
            console.error(`[WindowManager] Failed to dynamically load app script "${manifest.entry}":`, err);
          });
      }

      this.OS.emit('window:created', { id: windowId, appId, manifest });

      return windowId;
    },

    // Timeout reference to debounce layout saves on resize
    _resizeSaveTimeout: null,

    /**
     * Handle browser viewport resize to keep active windows adjusted and accessible.
     */
    handleViewportResize() {
      const desktop = document.getElementById('os-desktop');
      const dWidth = desktop ? desktop.clientWidth : window.innerWidth;
      const dHeight = desktop ? desktop.clientHeight : window.innerHeight - 48;

      this.windows.forEach((win) => {
        const windowEl = win.element;

        if (win.state === 'maximized') {
          // Maximized window sizing is handled by CSS, just update state metrics
          win.position = { left: 0, top: 0 };
          win.size = { width: dWidth, height: dHeight };
        } else if (win.state === 'snapped-left') {
          // Update bounds for snapped left
          const targetW = Math.floor(dWidth / 2);
          windowEl.style.left = '0px';
          windowEl.style.top = '0px';
          windowEl.style.width = `${targetW}px`;
          windowEl.style.height = `${dHeight}px`;
          win.position = { left: 0, top: 0 };
          win.size = { width: targetW, height: dHeight };
        } else if (win.state === 'snapped-right') {
          // Update bounds for snapped right
          const targetW = Math.floor(dWidth / 2);
          const leftOffset = targetW;
          const actualW = dWidth - targetW;
          windowEl.style.left = `${leftOffset}px`;
          windowEl.style.top = '0px';
          windowEl.style.width = `${actualW}px`;
          windowEl.style.height = `${dHeight}px`;
          win.position = { left: leftOffset, top: 0 };
          win.size = { width: actualW, height: dHeight };
        } else {
          // Normal/floating window: clamp dimensions and ensure header is accessible
          const minW = win.manifest.minSize?.width || 300;
          const minH = win.manifest.minSize?.height || 200;

          let newW = win.size.width;
          let newH = win.size.height;

          if (newW > dWidth) {
            newW = Math.max(minW, dWidth);
            windowEl.style.width = `${newW}px`;
            win.size.width = newW;
          }
          if (newH > dHeight) {
            newH = Math.max(minH, dHeight);
            windowEl.style.height = `${newH}px`;
            win.size.height = newH;
          }

          // Clamp left/top coordinates so at least a portion of the window header remains clickable
          const maxLeft = Math.max(0, dWidth - 100);
          const maxTop = Math.max(0, dHeight - 40);

          const newLeft = Math.max(0, Math.min(win.position.left, maxLeft));
          const newTop = Math.max(0, Math.min(win.position.top, maxTop));

          windowEl.style.left = `${newLeft}px`;
          windowEl.style.top = `${newTop}px`;
          win.position = { left: newLeft, top: newTop };
        }
      });

      // Debounce saving session to avoid local storage write spam during active dragging
      if (this._resizeSaveTimeout) {
        clearTimeout(this._resizeSaveTimeout);
      }
      this._resizeSaveTimeout = setTimeout(() => {
        this.saveSession();
        this._resizeSaveTimeout = null;
      }, 500);
    }
  };

  // Register in the global OS namespace
  if (window.OS) {
    window.OS.wm = windowManager;
  } else {
    console.error('[WindowManager] OS kernel not found.');
  }
})();
