/* apps/welcome/app.js */

/**
 * Initialize the Welcome Guide Application.
 * Renders a clean onboarding tour checklist and updates task states
 * dynamically by listening to OS window events.
 * @param {HTMLElement} container - The DOM element where the app renders.
 * @param {Object} OS - The global OS kernel.
 */
export function init(container, OS) {
  // Clear any existing contents
  container.innerHTML = '';

  const storage = OS.getStorage('welcome');

  const welcomeContainer = document.createElement('div');
  welcomeContainer.className = 'welcome-guide';

  welcomeContainer.innerHTML = `
    <div class="guide-header">
      <h2>Quick Tour & Checklist</h2>
      <p>Perform these standard window operations to get familiar with the system:</p>
    </div>

    <ul class="guide-checklist">
      <li id="task-wallpaper" class="guide-task">
        <span class="task-checkbox"></span>
        <div class="task-info">
          <strong>Change the Wallpaper</strong>
          <div class="task-desc-row">
            <span class="task-desc">Toggle the settings backdrop.</span>
            <button class="guide-action-btn" id="action-wallpaper">Toggle Backdrop</button>
          </div>
        </div>
      </li>
      <li id="task-notepad" class="guide-task">
        <span class="task-checkbox"></span>
        <div class="task-info">
          <strong>Open a Notepad app</strong>
          <div class="task-desc-row">
            <span class="task-desc">Launch a secondary application.</span>
            <button class="guide-action-btn" id="action-notepad">Open Notepad</button>
          </div>
        </div>
      </li>
      <li id="task-resize" class="guide-task">
        <span class="task-checkbox"></span>
        <div class="task-info">
          <strong>Resize this Window</strong>
          <span class="task-desc">Hover over any border edge or corner and drag.</span>
        </div>
      </li>
      <li id="task-maximize" class="guide-task">
        <span class="task-checkbox"></span>
        <div class="task-info">
          <strong>Maximize or Restore a Window</strong>
          <span class="task-desc">Click the maximize button (◻) or double-click the title bar.</span>
        </div>
      </li>
      <li id="task-snap" class="guide-task">
        <span class="task-checkbox"></span>
        <div class="task-info">
          <strong>Snap to a Screen Edge</strong>
          <span class="task-desc">Drag the title bar to the top, left, or right edge.</span>
        </div>
      </li>
      <li id="task-minimize" class="guide-task">
        <span class="task-checkbox"></span>
        <div class="task-info">
          <strong>Minimize a Window</strong>
          <span class="task-desc">Click the minimize button (─) in the title bar.</span>
        </div>
      </li>
    </ul>

    <div class="guide-footer">
      <p>Double-click shortcuts on the desktop background to launch them.</p>
    </div>
  `;

  container.appendChild(welcomeContainer);

  // Load and apply completed tasks from storage on startup
  const completedTasks = storage.get('completed_tasks') || [];
  completedTasks.forEach(taskId => {
    const taskEl = welcomeContainer.querySelector(`#${taskId}`);
    if (taskEl) {
      taskEl.classList.add('task--completed');
    }
  });

  const btnWallpaper = welcomeContainer.querySelector('#action-wallpaper');
  const btnNotepad = welcomeContainer.querySelector('#action-notepad');

  // Action: wallpaper toggle
  btnWallpaper.addEventListener('click', () => {
    const current = OS.settings.get('wallpaper') || 'gradient-blue';
    const next = current === 'gradient-blue' ? 'gradient-dark' : 'gradient-blue';
    OS.settings.set('wallpaper', next);
  });

  // Action: launch notepad
  btnNotepad.addEventListener('click', () => {
    OS.launchApp('notepad');
  });

  // Complete task helper and save state
  const setTaskComplete = (taskId) => {
    const taskEl = welcomeContainer.querySelector(`#${taskId}`);
    if (taskEl && !taskEl.classList.contains('task--completed')) {
      taskEl.classList.add('task--completed');

      // Save to storage
      const current = storage.get('completed_tasks') || [];
      if (!current.includes(taskId)) {
        current.push(taskId);
        storage.set('completed_tasks', current);
      }
    }
  };

  // Event handlers for task tracking
  const onSettingsChanged = (data) => {
    if (data.key === 'wallpaper') {
      setTaskComplete('task-wallpaper');
    }
  };

  const onWindowCreated = (data) => {
    if (data.appId === 'notepad') {
      setTaskComplete('task-notepad');
    }
  };

  const onWindowResized = () => {
    setTaskComplete('task-resize');
  };

  const onWindowMaximized = () => {
    setTaskComplete('task-maximize');
  };

  const onWindowSnapped = () => {
    setTaskComplete('task-snap');
  };

  const onWindowMinimized = () => {
    setTaskComplete('task-minimize');
  };

  // Bind event listeners to event bus and track them for cleanup
  const listeners = [];
  const subscribe = (eventName, callback) => {
    OS.on(eventName, callback);
    listeners.push({ eventName, callback });
  };

  subscribe('settings:changed', onSettingsChanged);
  subscribe('window:created', onWindowCreated);
  subscribe('window:resized', onWindowResized);
  subscribe('window:maximized', onWindowMaximized);
  subscribe('window:snapped', onWindowSnapped);
  subscribe('window:minimized', onWindowMinimized);

  // Listen for window close to detach listeners
  OS.on('window:closed', function cleanup(data) {
    const winId = container.closest('.os-window')?.id;
    if (data.id === winId) {
      listeners.forEach(({ eventName, callback }) => {
        OS.off(eventName, callback);
      });
      OS.off('window:closed', cleanup);
      console.log('[Welcome App] Event bus listeners detached, resources cleaned.');
    }
  });
}
