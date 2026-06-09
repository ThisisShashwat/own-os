/* apps/taskmanager/app.js */

/**
 * Initialize the Task Manager Application.
 * Renders CPU/RAM processes table and storage memory cards with category filtering.
 * @param {HTMLElement} container - The DOM element where the app renders.
 * @param {Object} OS - The global OS kernel.
 */
export function init(container, OS) {
  container.innerHTML = '';

  const managerContainer = document.createElement('div');
  managerContainer.className = 'taskmanager-app';

  managerContainer.innerHTML = `
    <div class="taskmanager-header">
      <div class="taskmanager-tabs">
        <button class="tm-tab active" data-tab="processes">Processes</button>
        <button class="tm-tab" data-tab="storage">Storage Memory</button>
      </div>
      <div class="taskmanager-perf-summary" id="perf-summary">
        <span class="perf-metric">CPU: <span id="summary-cpu">0%</span></span>
        <span class="perf-metric">RAM: <span id="summary-ram">0 MB</span></span>
      </div>
    </div>
    
    <div class="taskmanager-content">
      <!-- Tab 1: Processes -->
      <div class="taskmanager-panel active" id="panel-processes">
        <table class="tm-table">
          <thead>
            <tr>
              <th style="width: 40%;">Name</th>
              <th style="width: 15%;">Status</th>
              <th style="width: 10%;">CPU</th>
              <th style="width: 15%;">Memory</th>
              <th style="width: 20%; text-align: center;">Actions</th>
            </tr>
          </thead>
          <tbody id="processes-list">
            <!-- Dynamically populated -->
          </tbody>
        </table>
      </div>

      <!-- Tab 2: Storage -->
      <div class="taskmanager-panel" id="panel-storage">
        <div class="storage-limit-bar">
          <div class="storage-text-row">
            <span>Disk Usage (LocalStorage)</span>
            <span id="storage-summary-text">0 B / 5.0 MB</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" id="storage-progress-fill" style="width: 0%;"></div>
          </div>
        </div>
        
        <!-- Filter Chips Section -->
        <div class="storage-filters" id="storage-filters-bar">
          <!-- Dynamically populated categories -->
        </div>

        <div class="storage-cards-container" id="storage-list">
          <!-- Dynamically populated card items -->
        </div>
      </div>
    </div>
  `;

  container.appendChild(managerContainer);

  const tabs = managerContainer.querySelectorAll('.tm-tab');
  const panels = managerContainer.querySelectorAll('.taskmanager-panel');
  const tbodyProcesses = managerContainer.querySelector('#processes-list');
  const divStorageList = managerContainer.querySelector('#storage-list');
  const divFiltersBar = managerContainer.querySelector('#storage-filters-bar');

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      panels.forEach(p => p.classList.remove('active'));
      managerContainer.querySelector(`#panel-${target}`).classList.add('active');

      refreshAll();
    });
  });

  // Track mock RAM and CPU
  const processMemory = new Map();

  const getMockMetrics = (winId, appId) => {
    if (!processMemory.has(winId)) {
      let baseRam = 10;
      if (appId === 'welcome') baseRam = 12;
      if (appId === 'settings') baseRam = 18;
      if (appId === 'taskmanager') baseRam = 24;
      if (appId === 'notepad') baseRam = 14;

      processMemory.set(winId, {
        ram: baseRam + Math.random() * 4,
        cpu: Math.random() * 2
      });
    }

    const metrics = processMemory.get(winId);
    metrics.cpu = Math.max(0.1, Math.min(15, metrics.cpu + (Math.random() - 0.5) * 1.5));
    metrics.ram = Math.max(4, metrics.ram + (Math.random() - 0.5) * 0.4);

    return metrics;
  };

  // Render processes list
  const renderProcesses = () => {
    tbodyProcesses.innerHTML = '';
    
    if (!OS.wm || !OS.wm.windows || OS.wm.windows.size === 0) {
      tbodyProcesses.innerHTML = `<tr><td colspan="5" class="tm-empty">No active processes.</td></tr>`;
      updateSummary(0, 0);
      return;
    }

    let totalCpu = 0;
    let totalRam = 0;

    const activeWins = Array.from(OS.wm.windows.values());
    activeWins.forEach(win => {
      const metrics = getMockMetrics(win.id, win.appId);
      totalCpu += metrics.cpu;
      totalRam += metrics.ram;

      // Status visual text
      let statusLabel = 'Background';
      if (win.state === 'minimized') statusLabel = 'Minimized';
      else if (OS.wm.focusedWindowId === win.id) statusLabel = 'Active';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-name">
          <span class="tm-icon">${win.manifest.icon || '📦'}</span>
          <div class="tm-name-col">
            <strong>${win.manifest.name}</strong>
            <span class="tm-subtext">${win.id}</span>
          </div>
        </td>
        <td><span class="status-pill status-${statusLabel.toLowerCase()}">${statusLabel}</span></td>
        <td>${metrics.cpu.toFixed(1)}%</td>
        <td>${metrics.ram.toFixed(1)} MB</td>
        <td style="text-align: center;">
          <div class="tm-actions-cell">
            ${win.state === 'minimized' ? `<button class="tm-action-btn tm-action-btn--primary" data-action="restore" data-win-id="${win.id}">Restore</button>` : ''}
            <button class="tm-action-btn tm-action-btn--danger" data-action="close" data-win-id="${win.id}">End Task</button>
          </div>
        </td>
      `;

      // End Task click
      tr.querySelector('[data-action="close"]').addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-win-id');
        OS.emit('window:close:request', id);
        setTimeout(refreshAll, 100);
      });

      // Restore click (only visible if minimized)
      const btnRestore = tr.querySelector('[data-action="restore"]');
      if (btnRestore) {
        btnRestore.addEventListener('click', (e) => {
          const id = e.target.getAttribute('data-win-id');
          OS.emit('window:restore:request', id);
          setTimeout(refreshAll, 100);
        });
      }

      tbodyProcesses.appendChild(tr);
    });

    updateSummary(totalCpu, totalRam);
  };

  const updateSummary = (cpu, ram) => {
    managerContainer.querySelector('#summary-cpu').textContent = `${cpu.toFixed(1)}%`;
    managerContainer.querySelector('#summary-ram').textContent = `${ram.toFixed(1)} MB`;
  };

  // Metadata translation for LocalStorage keys
  const keyMetadata = {
    'os_settings_wallpaper': { name: 'Wallpaper Setting', icon: '🖼️', desc: 'The active desktop gradient background name.' },
    'os_settings_accentColor': { name: 'Theme Accent Color', icon: '🎨', desc: 'Dynamic system-wide accent styling color.' },
    'os_settings_taskbarAlignment': { name: 'Taskbar Alignment', icon: '⚙️', desc: 'Taskbar icons alignment setting (Center/Left).' },
    'os_settings_session_windows': { name: 'Window Layout Session', icon: '🗔', desc: 'Serialized coordinates and layouts of open windows.' },
    'os_app_notepad_draft': { name: 'Notepad Text Draft', icon: '📝', desc: 'Auto-saved text workspace contents in Notepad.' },
    'os_app_welcome_completed_tasks': { name: 'Welcome Checklist', icon: '👋', desc: 'Completed tasks in the OS onboarding tour.' }
  };

  const getKeyDetails = (key) => {
    if (keyMetadata[key]) return keyMetadata[key];

    if (key.startsWith('os_settings_')) {
      const cleanName = key.replace('os_settings_', '').replace(/([A-Z])/g, ' $1').trim();
      return {
        name: `Setting: ${cleanName.charAt(0).toUpperCase() + cleanName.slice(1)}`,
        icon: '⚙️',
        desc: 'System settings parameters.'
      };
    } else if (key.startsWith('os_app_')) {
      const parts = key.replace('os_app_', '').split('_');
      const app = parts[0];
      const sub = parts.slice(1).join(' ');
      return {
        name: `App Data: ${app.toUpperCase()} (${sub})`,
        icon: '📦',
        desc: `Persistent application state.`
      };
    }

    return { name: key, icon: '💾', desc: 'Generic storage item.' };
  };

  // Group resolver helper
  const getKeyGroup = (key) => {
    if (key.startsWith('os_settings_')) return 'system';
    if (key.startsWith('os_app_')) {
      return key.replace('os_app_', '').split('_')[0]; // Extract appId (e.g. welcome, notepad)
    }
    return 'other';
  };

  // Map group ID to English clean name
  const groupNames = {
    'all': 'All Data',
    'system': 'System Settings',
    'welcome': 'Welcome App',
    'notepad': 'Notepad App',
    'other': 'Other Data'
  };

  // Store active storage filter tab
  let activeStorageFilter = 'all';

  // Render storage tab (Fluent cards)
  const renderStorage = () => {
    divStorageList.innerHTML = '';
    divFiltersBar.innerHTML = '';
    let totalBytes = 0;

    // 1. Gather all keys and groups
    const osKeys = [];
    const foundGroups = new Set(['all']); // Always have 'all'

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('os_')) {
        osKeys.push(key);
        foundGroups.add(getKeyGroup(key));
      }
    }

    if (osKeys.length === 0) {
      divStorageList.innerHTML = `<div class="tm-empty">No application data or system config keys found.</div>`;
      updateStorageProgress(0);
      return;
    }

    // Reset filter if active one is no longer present
    if (!foundGroups.has(activeStorageFilter)) {
      activeStorageFilter = 'all';
    }

    // 2. Render filter chips
    Array.from(foundGroups).forEach(group => {
      const chip = document.createElement('button');
      chip.className = `filter-chip ${activeStorageFilter === group ? 'active' : ''}`;
      chip.textContent = groupNames[group] || (group.charAt(0).toUpperCase() + group.slice(1));
      chip.addEventListener('click', () => {
        activeStorageFilter = group;
        renderStorage();
      });
      divFiltersBar.appendChild(chip);
    });

    // 3. Filter keys and accumulate total size
    const filteredKeys = osKeys.filter(key => {
      const value = localStorage.getItem(key) || '';
      const sizeBytes = key.length + value.length;
      totalBytes += sizeBytes; // Sum total for limit calculation

      if (activeStorageFilter === 'all') return true;
      return getKeyGroup(key) === activeStorageFilter;
    });

    if (filteredKeys.length === 0) {
      divStorageList.innerHTML = `<div class="tm-empty">No keys found in this category.</div>`;
    } else {
      // Sort and render filtered cards
      filteredKeys.sort().forEach(key => {
        const value = localStorage.getItem(key) || '';
        const sizeBytes = key.length + value.length;
        const details = getKeyDetails(key);
        
        const card = document.createElement('div');
        card.className = 'storage-card';
        card.innerHTML = `
          <div class="storage-card-main">
            <span class="storage-card-icon">${details.icon}</span>
            <div class="storage-card-text">
              <div class="storage-card-header">
                <strong>${details.name}</strong>
                <span class="storage-card-size">${formatBytes(sizeBytes)}</span>
              </div>
              <p class="storage-card-desc">${details.desc}</p>
              <span class="storage-card-rawkey">${key}</span>
            </div>
          </div>
          <button class="storage-card-delete-btn" data-key="${key}">Delete</button>
        `;

        // Delete storage key
        card.querySelector('.storage-card-delete-btn').addEventListener('click', (e) => {
          const targetKey = e.target.getAttribute('data-key');
          localStorage.removeItem(targetKey);
          
          if (targetKey.startsWith('os_settings_')) {
            const configKey = targetKey.replace('os_settings_', '');
            OS.emit('settings:changed', { key: configKey, value: null });
          }

          renderStorage();
        });

        divStorageList.appendChild(card);
      });
    }

    updateStorageProgress(totalBytes);
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const updateStorageProgress = (bytes) => {
    const limit = 5 * 1024 * 1024; // 5MB
    const pct = Math.min(100, (bytes / limit) * 100);
    managerContainer.querySelector('#storage-summary-text').textContent = `${formatBytes(bytes)} / 5.0 MB`;
    managerContainer.querySelector('#storage-progress-fill').style.width = `${pct}%`;
  };

  const refreshAll = () => {
    const activeTab = managerContainer.querySelector('.tm-tab.active').getAttribute('data-tab');
    if (activeTab === 'processes') {
      renderProcesses();
    } else {
      renderStorage();
    }
  };

  refreshAll();

  // Polling loop
  const intervalId = setInterval(refreshAll, 2000);

  const onWinChange = () => {
    refreshAll();
  };

  OS.on('window:created', onWinChange);
  OS.on('window:closed', onWinChange);

  // Cleanup
  OS.on('window:closed', function cleanup(data) {
    const winId = container.closest('.os-window')?.id;
    if (data.id === winId) {
      clearInterval(intervalId);
      OS.off('window:created', onWinChange);
      OS.off('window:closed', onWinChange);
      OS.off('window:closed', cleanup);
    }
  });
}
