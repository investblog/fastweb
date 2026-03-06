import { defineConfig } from 'wxt';
import { resolve } from 'node:path';

export default defineConfig({
  srcDir: 'src',
  outDir: 'dist',

  vite: () => ({
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'src/shared'),
      },
    },
  }),

  manifest: ({ browser }) => ({
    name: '__MSG_appName__',
    description: '__MSG_appDesc__',
    default_locale: 'en',
    homepage_url: 'https://fastweb.cam',

    permissions: (browser === 'firefox' || browser === 'opera')
      ? ['alarms', 'bookmarks', 'storage', 'tabs']
      : ['alarms', 'bookmarks', 'storage', 'tabs', 'sidePanel'],

    host_permissions: ['*://*/*'],

    icons: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      64: 'icons/icon-64.png',
      128: 'icons/icon-128.png',
      256: 'icons/icon-256.png',
    },

    action: {
      default_icon: {
        16: 'icons/icon-16.png',
        32: 'icons/icon-32.png',
        48: 'icons/icon-48.png',
        64: 'icons/icon-64.png',
        128: 'icons/icon-128.png',
      },
    },

    web_accessible_resources: [
      {
        resources: ['icons/*.svg', 'bundle.json'],
        matches: ['<all_urls>'],
      },
    ],

    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'fastweb@fastweb.cam',
          strict_min_version: '142.0',
        },
      },
    }),
  }),

  hooks: {
    'build:manifestGenerated': (wxt, manifest) => {
      // Chrome/Edge: remove popup — icon click opens sidePanel natively via onClicked
      if (wxt.config.browser === 'chrome') {
        if (manifest.action) {
          delete manifest.action.default_popup;
        }
        // Tag sidepanel path so JS can distinguish sidebar from popup mode
        const sp = (manifest as unknown as Record<string, any>).side_panel;
        if (sp) sp.default_path = 'sidepanel.html#sidebar';
      }
      // Firefox AMO requires data_collection_permissions (mandatory H1 2026).
      if (manifest.browser_specific_settings?.gecko) {
        (manifest.browser_specific_settings.gecko as Record<string, unknown>)
          .data_collection_permissions = { required: ['none'] };
      }
      // Firefox: no sidePanel — sidepanel.html doubles as popup + sidebar
      if (wxt.config.browser === 'firefox') {
        if (manifest.action) {
          manifest.action.default_popup = 'sidepanel.html';
        }
        const sidebar = (manifest as unknown as Record<string, any>).sidebar_action;
        if (sidebar) {
          sidebar.default_icon = 'icons/icon-48.png';
          sidebar.default_panel = 'sidepanel.html#sidebar';
        }
      }
      // Opera: no sidePanel support — use sidebar_action + action popup fallback
      if (wxt.config.browser === 'opera') {
        delete (manifest as unknown as Record<string, unknown>).side_panel;
        if (manifest.permissions) {
          manifest.permissions = manifest.permissions.filter(p => p !== 'sidePanel');
        }
        // Left sidebar panel (Opera proprietary)
        (manifest as unknown as Record<string, unknown>).sidebar_action = {
          default_panel: 'sidepanel.html#sidebar',
          default_icon: 'icons/icon-48.png',
          default_title: 'FastWeb',
        };
        // Toolbar icon opens sidepanel.html as popup; sidebar icon opens panel automatically
        if (manifest.action) {
          manifest.action.default_popup = 'sidepanel.html';
        }
      }
    },
  },

  browser: 'chrome',
});
