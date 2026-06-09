/* core/taskbar.js */

(function () {
  const taskbar = {
    /**
     * Initialize the Taskbar module.
     * @param {Object} OS - The global OS kernel.
     */
    init(OS) {
      this.OS = OS;
      this.element = document.getElementById('os-taskbar');

      if (!this.element) {
        console.error('[Taskbar] #os-taskbar element not found.');
        return;
      }

      // Build taskbar layout structure
      this._buildLayout();

      // Set initial alignment
      this.updateAlignment();

      // Listen for settings changes to update alignment dynamically
      OS.on('settings:changed', (data) => {
        if (data.key === 'taskbarAlignment') {
          this.updateAlignment();
        }
      });

      // Listen for window/app events to dynamically sync app icons
      OS.on('window:created', () => this.renderApps());
      OS.on('window:closed', () => this.renderApps());
      OS.on('window:focused', () => this.renderApps());
      OS.on('window:minimized', () => this.renderApps());
      OS.on('window:restored', () => this.renderApps());
      OS.on('app:registered', () => this.renderApps());

      // Listen for taskbar app icon click events
      OS.on('taskbar:app:click', (data) => {
        this.handleAppClick(data.appId);
      });

      // Initial render
      this.renderApps();

      console.log('[Taskbar] Module initialized and active apps listeners wired.');
    },

    /**
     * Build layout structure for the taskbar (left, center, right sections).
     */
    _buildLayout() {
      this.element.innerHTML = `
        <div class="os-taskbar-left" id="taskbar-widgets">
          <!-- Left section: Widgets / Search placeholder -->
        </div>
        <div class="os-taskbar-center">
          <button class="os-taskbar-btn os-taskbar-btn--start" id="start-btn" title="Start">
            <svg class="start-icon" viewBox="0 0 24 24" width="18" height="18">
              <path d="M2 2h9.5v9.5H2zm10.5 0H22v9.5h-9.5zM2 12.5h9.5V22H2zm10.5 0H22V22h-9.5z" fill="currentColor"/>
            </svg>
          </button>
          <div class="os-taskbar-apps" id="taskbar-apps">
            <!-- Pinned & Running app icons go here -->
          </div>
        </div>
        <div class="os-taskbar-right" id="taskbar-tray-container">
          <!-- System tray & Clock go here -->
        </div>
      `;

      // Bind Start Menu click emitter
      const startBtn = this.element.querySelector('#start-btn');
      startBtn.addEventListener('click', () => {
        this.OS.emit('startmenu:toggle');
      });
    },

    /**
     * Clear and render taskbar buttons for all pinned and active running applications.
     */
    renderApps() {
      const appsContainer = this.element.querySelector('#taskbar-apps');
      if (!appsContainer) return;

      appsContainer.innerHTML = '';

      const allApps = this.OS.getAllApps();

      // Gather running windows grouped by appId
      const runningApps = new Map();
      if (this.OS.wm && this.OS.wm.windows) {
        this.OS.wm.windows.forEach(win => {
          if (!runningApps.has(win.appId)) {
            runningApps.set(win.appId, []);
          }
          runningApps.get(win.appId).push(win);
        });
      }

      // Display if pinned or currently running
      const displayApps = allApps.filter(app => app.pinned || runningApps.has(app.id));

      // Sort display order: pinned apps first, then running non-pinned apps on the right
      displayApps.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return 0;
      });

      displayApps.forEach(app => {
        const isRunning = runningApps.has(app.id);
        const windows = runningApps.get(app.id) || [];
        
        // Focus state: check if any window of this app is active
        const isFocused = windows.some(win => this.OS.wm && this.OS.wm.focusedWindowId === win.id);
        
        // Minimized state: check if all open windows of this app are minimized
        const isAllMinimized = isRunning && windows.every(win => win.state === 'minimized');

        const appBtn = document.createElement('button');
        appBtn.className = 'os-taskbar-btn os-taskbar-app';
        appBtn.setAttribute('data-app-id', app.id);
        appBtn.title = app.name;

        // Apply visual state classes
        if (isRunning) appBtn.classList.add('os-taskbar-app--running');
        if (isFocused) appBtn.classList.add('os-taskbar-app--focused');
        if (isAllMinimized) appBtn.classList.add('os-taskbar-app--minimized');

        appBtn.innerHTML = `
          <span class="os-taskbar-app-icon">${app.icon || '📦'}</span>
          <span class="os-taskbar-app-indicator"></span>
        `;

        // Emit click event (handled via event listener in init)
        appBtn.addEventListener('click', () => {
          this.OS.emit('taskbar:app:click', { appId: app.id });
        });

        appsContainer.appendChild(appBtn);
      });
    },

    /**
     * Handle click interactions on taskbar app icons (focus/minimize/launch toggles).
     * @param {string} appId - The ID of the clicked application.
     */
    handleAppClick(appId) {
      if (!this.OS.wm) return;

      // Find all running windows for this appId
      const appWindows = Array.from(this.OS.wm.windows.values())
        .filter(win => win.appId === appId);

      if (appWindows.length === 0) {
        // App is not running: launch a new instance
        this.OS.launchApp(appId);
      } else if (appWindows.length === 1) {
        // Single window: toggle focus/minimize
        const win = appWindows[0];
        const isFocused = this.OS.wm.focusedWindowId === win.id;

        if (isFocused) {
          // If focused, minimize it
          this.OS.wm.minimizeWindow(win.id);
        } else {
          // If minimized or unfocused, restore and focus it
          if (win.state === 'minimized') {
            this.OS.wm.restoreWindow(win.id);
          } else {
            this.OS.wm.focusWindow(win.id);
          }
        }
      } else {
        // Multiple windows: check focus states
        // Sort by z-index descending (topmost first)
        appWindows.sort((a, b) => b.zIndex - a.zIndex);

        const focusedWinIndex = appWindows.findIndex(win => this.OS.wm.focusedWindowId === win.id);

        if (focusedWinIndex === -1) {
          // None of this app's windows are focused: focus the topmost one
          const topmost = appWindows[0];
          if (topmost.state === 'minimized') {
            this.OS.wm.restoreWindow(topmost.id);
          } else {
            this.OS.wm.focusWindow(topmost.id);
          }
        } else if (focusedWinIndex === 0) {
          // The topmost window is already focused: minimize it
          this.OS.wm.minimizeWindow(appWindows[0].id);
        } else {
          // Another window of this app is focused: bring the topmost one to focus
          const topmost = appWindows[0];
          if (topmost.state === 'minimized') {
            this.OS.wm.restoreWindow(topmost.id);
          } else {
            this.OS.wm.focusWindow(topmost.id);
          }
        }
      }
    },

    /**
     * Update the taskbar alignment class based on settings (left or center).
     */
    updateAlignment() {
      const alignment = this.OS.settings.get('taskbarAlignment') || 'center';
      
      this.element.classList.remove('os-taskbar--align-center', 'os-taskbar--align-left');
      this.element.classList.add(`os-taskbar--align-${alignment}`);
      console.log(`[Taskbar] Alignment updated to: ${alignment}`);
    }
  };

  // Register in the global OS namespace
  if (window.OS) {
    window.OS.taskbar = taskbar;
  } else {
    console.error('[Taskbar] OS kernel not found.');
  }
})();
