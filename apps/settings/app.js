/* apps/settings/app.js */

/**
 * Initialize the Settings Application.
 * Renders a sidebar layout configuration panel allowing user settings management.
 * @param {HTMLElement} container - The DOM element where the app renders.
 * @param {Object} OS - The global OS kernel.
 */
export function init(container, OS) {
  // Clear any existing contents
  container.innerHTML = '';

  const settingsContainer = document.createElement('div');
  settingsContainer.className = 'settings-app';

  settingsContainer.innerHTML = `
    <div class="settings-sidebar">
      <div class="settings-sidebar-item active" data-tab="personalization">🎨 Personalization</div>
      <div class="settings-sidebar-item" data-tab="taskbar">⚙️ Taskbar</div>
      <div class="settings-sidebar-item" data-tab="about">ℹ️ About</div>
    </div>
    <div class="settings-content">
      <div class="settings-panel active" id="panel-personalization">
        <h2>Personalization</h2>
        <div class="settings-section">
          <h3>Desktop Wallpaper</h3>
          <div class="wallpaper-previews">
            <div class="wallpaper-card" data-wallpaper="gradient-blue" id="wp-blue">
              <div class="wp-preview-thumb wp-preview--blue"></div>
              <span>Blue Gradient</span>
            </div>
            <div class="wallpaper-card" data-wallpaper="gradient-dark" id="wp-dark">
              <div class="wp-preview-thumb wp-preview--dark"></div>
              <span>Dark Gradient</span>
            </div>
          </div>
        </div>
        <div class="settings-section">
          <h3>Accent Color</h3>
          <div class="accent-presets">
            <span class="accent-dot" data-color="hsl(210, 100%, 56%)" style="background-color: hsl(210, 100%, 56%);"></span>
            <span class="accent-dot" data-color="hsl(270, 80%, 60%)" style="background-color: hsl(270, 80%, 60%);"></span>
            <span class="accent-dot" data-color="hsl(20, 95%, 55%)" style="background-color: hsl(20, 95%, 55%);"></span>
            <span class="accent-dot" data-color="hsl(140, 70%, 45%)" style="background-color: hsl(140, 70%, 45%);"></span>
            <span class="accent-dot" data-color="hsl(340, 85%, 60%)" style="background-color: hsl(340, 85%, 60%);"></span>
          </div>
        </div>
      </div>
      
      <div class="settings-panel" id="panel-taskbar">
        <h2>Taskbar Configuration</h2>
        <div class="settings-section">
          <h3>Taskbar Alignment</h3>
          <p class="section-desc">Reposition your Start button and pinned applications in the bottom taskbar layer.</p>
          <div class="alignment-options">
            <button class="settings-btn" id="align-center">Center</button>
            <button class="settings-btn" id="align-left">Left</button>
          </div>
        </div>
      </div>
      
      <div class="settings-panel" id="panel-about">
        <h2>System Information</h2>
        <div class="settings-section info-section">
          <p><strong>Operating System:</strong> WebOS Shell Concept</p>
          <p><strong>Kernel API version:</strong> 1.0.0 (Fluent Bus)</p>
          <p><strong>Active Window Instances:</strong> <span id="info-win-count">0</span></p>
          <p><strong>Registered Applications:</strong> <span id="info-apps-count">0</span></p>
        </div>
      </div>
    </div>
  `;

  container.appendChild(settingsContainer);

  const sidebarItems = settingsContainer.querySelectorAll('.settings-sidebar-item');
  const panels = settingsContainer.querySelectorAll('.settings-panel');

  // Tab switching handler
  sidebarItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');

      // Update active sidebar styles
      sidebarItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // Update active panels
      panels.forEach(p => p.classList.remove('active'));
      settingsContainer.querySelector(`#panel-${tab}`).classList.add('active');

      // Update stats if selected
      if (tab === 'about') {
        updateStats();
      }
    });
  });

  // --- Personalization Controls ---
  const wpBlue = settingsContainer.querySelector('#wp-blue');
  const wpDark = settingsContainer.querySelector('#wp-dark');
  const accentDots = settingsContainer.querySelectorAll('.accent-dot');

  const updateWallpaperCardsHighlight = () => {
    const current = OS.settings.get('wallpaper') || 'gradient-blue';
    wpBlue.classList.toggle('selected', current === 'gradient-blue');
    wpDark.classList.toggle('selected', current === 'gradient-dark');
  };

  wpBlue.addEventListener('click', () => {
    OS.settings.set('wallpaper', 'gradient-blue');
    updateWallpaperCardsHighlight();
  });

  wpDark.addEventListener('click', () => {
    OS.settings.set('wallpaper', 'gradient-dark');
    updateWallpaperCardsHighlight();
  });

  updateWallpaperCardsHighlight();

  const updateAccentHighlight = () => {
    const activeAccent = OS.settings.get('accentColor') || 'hsl(210, 100%, 56%)';
    accentDots.forEach(dot => {
      dot.classList.toggle('selected', dot.getAttribute('data-color') === activeAccent);
    });
  };

  accentDots.forEach(dot => {
    dot.addEventListener('click', () => {
      const color = dot.getAttribute('data-color');
      OS.settings.set('accentColor', color);
      updateAccentHighlight();
    });
  });

  updateAccentHighlight();

  // --- Taskbar Controls ---
  const btnAlignCenter = settingsContainer.querySelector('#align-center');
  const btnAlignLeft = settingsContainer.querySelector('#align-left');

  const updateAlignmentButtonsHighlight = () => {
    const align = OS.settings.get('taskbarAlignment') || 'center';
    btnAlignCenter.classList.toggle('selected', align === 'center');
    btnAlignLeft.classList.toggle('selected', align === 'left');
  };

  btnAlignCenter.addEventListener('click', () => {
    OS.settings.set('taskbarAlignment', 'center');
    updateAlignmentButtonsHighlight();
  });

  btnAlignLeft.addEventListener('click', () => {
    OS.settings.set('taskbarAlignment', 'left');
    updateAlignmentButtonsHighlight();
  });

  updateAlignmentButtonsHighlight();

  // --- About / Stats Controls ---
  const winCountEl = settingsContainer.querySelector('#info-win-count');
  const appsCountEl = settingsContainer.querySelector('#info-apps-count');

  const updateStats = () => {
    const openWinsCount = OS.wm ? OS.wm.windows.size : 0;
    const regAppsCount = OS.getAllApps().length;
    winCountEl.textContent = openWinsCount;
    appsCountEl.textContent = regAppsCount;
  };

  // Live update window counts on window create/close events
  const onWinStateChange = () => {
    updateStats();
  };

  OS.on('window:created', onWinStateChange);
  OS.on('window:closed', onWinStateChange);

  // Clean up listeners when Settings app is closed to prevent memory leaks
  OS.on('window:closed', function cleanup(data) {
    const winId = container.closest('.os-window')?.id;
    if (data.id === winId) {
      OS.off('window:created', onWinStateChange);
      OS.off('window:closed', onWinStateChange);
      OS.off('window:closed', cleanup);
    }
  });
}
