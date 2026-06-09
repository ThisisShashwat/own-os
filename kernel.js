/* kernel.js */

(function () {
  // Define central OS namespace
  const OS = {
    // Private event registry store
    _events: {},

    /**
     * Subscribe to an OS system event.
     * @param {string} event - Name of the event to listen for.
     * @param {Function} handler - Callback to execute when the event fires.
     */
    on(event, handler) {
      if (!this._events[event]) {
        this._events[event] = [];
      }
      this._events[event].push(handler);
    },

    /**
     * Unsubscribe from an OS system event.
     * @param {string} event - Name of the event.
     * @param {Function} handler - The specific callback function to remove.
     */
    off(event, handler) {
      if (!this._events[event]) return;
      this._events[event] = this._events[event].filter(h => h !== handler);
    },

    /**
     * Publish/trigger an OS system event across the event bus.
     * @param {string} event - Name of the event to fire.
     * @param {any} data - Associated payload data passed to listeners.
     */
    emit(event, data) {
      if (!this._events[event]) return;
      // Copy array to prevent mutation issues during execution
      const handlers = [...this._events[event]];
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error executing listener for event "${event}":`, error);
        }
      });
    },

    // Private application registry
    _apps: {},

    /**
     * Register an application with the kernel.
     * @param {Object} manifest - The manifest object of the app.
     */
    registerApp(manifest) {
      if (!manifest || !manifest.id) {
        console.error("[Kernel] Invalid app manifest attempted registration:", manifest);
        return false;
      }
      this._apps[manifest.id] = manifest;
      console.log(`[Kernel] Registered app: ${manifest.name} (${manifest.id})`);
      this.emit('app:registered', manifest);
      return true;
    },

    /**
     * Retrieve a registered app's manifest.
     * @param {string} id - The ID of the application.
     * @returns {Object|null}
     */
    getApp(id) {
      return this._apps[id] || null;
    },

    /**
     * Get all currently registered application manifests.
     * @returns {Array<Object>}
     */
    getAllApps() {
      return Object.values(this._apps);
    },

    /**
     * Launch an application by its registered ID.
     * @param {string} id - The ID of the app to launch.
     */
    launchApp(id) {
      const app = this.getApp(id);
      if (!app) {
        console.error(`[Kernel] Cannot launch app "${id}": App is not registered.`);
        return false;
      }
      console.log(`[Kernel] Launching app: ${app.name} (${id})...`);
      this.emit('app:launched', { id, manifest: app });
      return true;
    },

    /**
     * Register a default Welcome app manifest if the filesystem fetch fails.
     */
    _registerWelcomeFallback() {
      const welcomeFallback = {
        id: "welcome",
        name: "Welcome",
        icon: "👋",
        entry: "apps/welcome/app.js",
        styles: "apps/welcome/app.css",
        defaultSize: { width: 500, height: 350 },
        minSize: { width: 300, height: 200 },
        singleton: true,
        pinned: true,
        desktopShortcut: true
      };
      this.registerApp(welcomeFallback);
    },

    /**
     * LocalStorage settings store helper.
     */
    settings: {
      get(key) {
        try {
          const val = localStorage.getItem(`os_settings_${key}`);
          return val ? JSON.parse(val) : null;
        } catch (e) {
          console.error(`[Settings] Error parsing setting "${key}":`, e);
          return null;
        }
      },
      set(key, value) {
        try {
          localStorage.setItem(`os_settings_${key}`, JSON.stringify(value));
          OS.emit('settings:changed', { key, value });
          return true;
        } catch (e) {
          console.error(`[Settings] Error writing setting "${key}":`, e);
          return false;
        }
      }
    },

    /**
     * Retrieve a scoped LocalStorage helper for an app.
     * @param {string} appId - The ID of the application.
     */
    getStorage(appId) {
      return {
        get(key) {
          try {
            const val = localStorage.getItem(`os_app_${appId}_${key}`);
            return val ? JSON.parse(val) : null;
          } catch (e) {
            console.error(`[AppStorage:${appId}] Error parsing key "${key}":`, e);
            return null;
          }
        },
        set(key, value) {
          try {
            localStorage.setItem(`os_app_${appId}_${key}`, JSON.stringify(value));
            return true;
          } catch (e) {
            console.error(`[AppStorage:${appId}] Error writing key "${key}":`, e);
            return false;
          }
        },
        remove(key) {
          localStorage.removeItem(`os_app_${appId}_${key}`);
        }
      };
    },

    /**
     * Initialize WebOS core shell modules.
     * Called on DOMContentLoaded.
     */
    async init() {
      console.log("[Kernel] WebOS system booting...");

      // Default theme configuration fallback values
      let defaults = {
        accentColor: "#0078D4",
        wallpaper: "gradient-blue",
        darkMode: true,
        taskbarPosition: "bottom"
      };

      try {
        const response = await fetch("config/theme.json");
        if (response.ok) {
          const json = await response.json();
          defaults = { ...defaults, ...json };
          console.log("[Kernel] Loaded configuration theme from config/theme.json");
        }
      } catch (e) {
        console.warn("[Kernel] Unable to fetch config/theme.json (possibly running locally via file://). Using built-in fallbacks.");
      }

      // Seed settings in localStorage if they don't already exist
      for (const [key, val] of Object.entries(defaults)) {
        if (OS.settings.get(key) === null) {
          OS.settings.set(key, val);
        }
      }

      // Apply initial accent color setting to DOM root
      const initialAccent = OS.settings.get('accentColor');
      if (initialAccent) {
        document.documentElement.style.setProperty('--color-accent', initialAccent);
      }

      // Listen for settings change to update accent color and dark mode class
      OS.on('settings:changed', (data) => {
        if (data.key === 'accentColor') {
          document.documentElement.style.setProperty('--color-accent', data.value);
        }
      });

      // Dynamic App Discovery and registration
      try {
        const appsResponse = await fetch("config/apps.json");
        if (appsResponse.ok) {
          const appIds = await appsResponse.json();
          console.log(`[Kernel] Discovered ${appIds.length} app(s) in apps.json. Fetching manifests...`);
          for (const id of appIds) {
            try {
              const manifestRes = await fetch(`apps/${id}/manifest.json`);
              if (manifestRes.ok) {
                const manifest = await manifestRes.json();
                this.registerApp(manifest);
              } else {
                console.error(`[Kernel] Failed to load manifest for app "${id}":`, manifestRes.statusText);
              }
            } catch (err) {
              console.error(`[Kernel] Error fetching manifest for app "${id}":`, err);
              if (id === "welcome") {
                this._registerWelcomeFallback();
              }
            }
          }
        }
      } catch (e) {
        console.warn("[Kernel] Unable to fetch config/apps.json (possibly running locally via file://). Seeding default Welcome app.");
        this._registerWelcomeFallback();
      }
      
      // We will initialize shell modules in order of dependencies.
      // If a module exists and has an init function, call it.
      const modules = [
        { name: 'desktop', ref: OS.desktop },
        { name: 'windowManager', ref: OS.wm },
        { name: 'taskbar', ref: OS.taskbar },
        { name: 'systemTray', ref: OS.systemTray },
        { name: 'notifications', ref: OS.notifications }
      ];

      modules.forEach(mod => {
        if (mod.ref && typeof mod.ref.init === 'function') {
          try {
            console.log(`[Kernel] Initializing shell module: ${mod.name}`);
            mod.ref.init(OS);
          } catch (e) {
            console.error(`[Kernel] Failed to initialize module "${mod.name}":`, e);
          }
        }
      });

      console.log("[Kernel] WebOS fluent shell booted successfully.");
      this.emit('system:booted');
    }
  };

  // Bind to global window scope as the only allowed global
  window.OS = OS;

  // Bind boot listener to DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    OS.init();
  });
})();
