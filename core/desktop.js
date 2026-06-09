/* core/desktop.js */

(function () {
  const desktop = {
    /**
     * Initialize the Desktop module.
     * @param {Object} OS - The global OS kernel.
     */
    init(OS) {
      this.OS = OS;
      this.element = document.getElementById('os-desktop');

      if (!this.element) {
        console.error('[Desktop] #os-desktop element not found.');
        return;
      }

      // Initialize wallpaper
      this.updateWallpaper();

      // Initialize lasso selection
      this._setupLasso();

      // Initialize shortcuts
      this._setupShortcuts();

      // Listen for settings changes to update wallpaper dynamically
      OS.on('settings:changed', (data) => {
        if (data.key === 'wallpaper') {
          this.updateWallpaper();
        }
      });

      // Track open windows to toggle desktop unfocused visual state
      const hasVisibleWindows = () => {
        if (!this.OS.wm || !this.OS.wm.windows) return false;
        return Array.from(this.OS.wm.windows.values()).some(w => w.state !== 'minimized');
      };

      const updateDesktopFocus = () => {
        if (hasVisibleWindows()) {
          this.element.classList.add('os-desktop--unfocused');
        } else {
          this.element.classList.remove('os-desktop--unfocused');
        }
      };

      OS.on('window:focused', () => updateDesktopFocus());
      OS.on('window:closed', () => updateDesktopFocus());
      OS.on('window:minimized', () => updateDesktopFocus());
      OS.on('window:restored', () => updateDesktopFocus());

      // Focus desktop (remove unfocused status and emit event) on background click
      this.element.addEventListener('pointerdown', (e) => {
        if (e.target === this.element || e.target.classList.contains('os-desktop-shortcuts')) {
          this.element.classList.remove('os-desktop--unfocused');
          this.OS.emit('desktop:focused');
        }
      });

      console.log('[Desktop] Module initialized successfully.');
    },

    /**
     * Apply the correct wallpaper class based on active settings.
     */
    updateWallpaper() {
      const wallpaper = this.OS.settings.get('wallpaper') || 'gradient-blue';
      
      // Remove any existing wallpaper class
      const classesToRemove = Array.from(this.element.classList).filter(cls => cls.startsWith('os-wallpaper--'));
      classesToRemove.forEach(cls => this.element.classList.remove(cls));

      // Add the new wallpaper class
      this.element.classList.add(`os-wallpaper--${wallpaper}`);
      console.log(`[Desktop] Wallpaper updated to: ${wallpaper}`);
    },

    /**
     * Set up the click-and-drag desktop selection lasso box.
     */
    _setupLasso() {
      let isLassoing = false;
      let startX = 0;
      let startY = 0;

      // Create lasso element and append to desktop
      const lasso = document.createElement('div');
      lasso.className = 'os-desktop-lasso';
      this.element.appendChild(lasso);

      this.element.addEventListener('pointerdown', (e) => {
        // Only start lasso if left-clicking directly on empty desktop background or shortcuts container
        if (e.target !== this.element && !e.target.classList.contains('os-desktop-shortcuts')) return;
        if (e.button !== 0) return; // Only primary button

        isLassoing = true;
        
        // Get coordinates relative to the desktop element
        const rect = this.element.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;

        // Position and show the lasso
        lasso.style.left = `${startX}px`;
        lasso.style.top = `${startY}px`;
        lasso.style.width = '0px';
        lasso.style.height = '0px';
        lasso.style.display = 'block';

        this.element.setPointerCapture(e.pointerId);
      });

      this.element.addEventListener('pointermove', (e) => {
        if (!isLassoing) return;

        const rect = this.element.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(startX - currentX);
        const height = Math.abs(startY - currentY);

        lasso.style.left = `${left}px`;
        lasso.style.top = `${top}px`;
        lasso.style.width = `${width}px`;
        lasso.style.height = `${height}px`;
      });

      const endLasso = (e) => {
        if (!isLassoing) return;
        isLassoing = false;
        
        lasso.style.display = 'none';
        this.element.releasePointerCapture(e.pointerId);
        this.OS.emit('desktop:lasso');
      };

      this.element.addEventListener('pointerup', endLasso);
      this.element.addEventListener('pointercancel', endLasso);
    },

    /**
     * Set up desktop shortcut icons.
     */
    _setupShortcuts() {
      // Create shortcuts container if not exists
      this.shortcutsContainer = document.createElement('div');
      this.shortcutsContainer.className = 'os-desktop-shortcuts';
      this.element.appendChild(this.shortcutsContainer);

      // Render initial shortcuts
      this.renderShortcuts();

      // Listen for dynamic app registrations
      this.OS.on('app:registered', () => {
        this.renderShortcuts();
      });
    },

    /**
     * Clear and render all desktop shortcut icons from the app registry.
     */
    renderShortcuts() {
      this.shortcutsContainer.innerHTML = '';
      const apps = this.OS.getAllApps();

      apps.forEach(app => {
        if (app.desktopShortcut) {
          const shortcut = document.createElement('div');
          shortcut.className = 'os-desktop-shortcut';
          shortcut.setAttribute('data-app-id', app.id);
          shortcut.title = app.name;

          shortcut.innerHTML = `
            <div class="os-desktop-shortcut-icon">${app.icon || '📦'}</div>
            <div class="os-desktop-shortcut-name">${app.name}</div>
          `;

          // Launch on double click
          shortcut.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.OS.launchApp(app.id);
          });

          // Single click focus/selection (visual indicator)
          shortcut.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); // Prevent lasso start
            
            // Clear selection on other shortcuts
            const allShortcuts = this.shortcutsContainer.querySelectorAll('.os-desktop-shortcut');
            allShortcuts.forEach(s => s.classList.remove('os-desktop-shortcut--selected'));

            // Select this one
            shortcut.classList.add('os-desktop-shortcut--selected');
          });

          this.shortcutsContainer.appendChild(shortcut);
        }
      });

      // Clear selection when clicking empty desktop area
      this.shortcutsContainer.addEventListener('pointerdown', (e) => {
        if (e.target === this.shortcutsContainer) {
          const allShortcuts = this.shortcutsContainer.querySelectorAll('.os-desktop-shortcut');
          allShortcuts.forEach(s => s.classList.remove('os-desktop-shortcut--selected'));
        }
      });
    }
  };

  // Register in the global OS namespace
  if (window.OS) {
    window.OS.desktop = desktop;
  } else {
    console.error('[Desktop] OS kernel not found.');
  }
})();
