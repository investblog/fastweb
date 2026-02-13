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

    permissions: browser === 'firefox'
      ? ['bookmarks', 'storage', 'tabs']
      : ['bookmarks', 'storage', 'tabs', 'sidePanel'],

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
          id: 'fastweb@unlock.sbs',
          strict_min_version: '140.0',
        },
      },
    }),
  }),

  hooks: {
    'build:manifestGenerated': (_wxt, manifest) => {
      // Firefox AMO requires data_collection_permissions (mandatory H1 2026).
      // Injected via hook because WXT types don't include it yet.
      if (manifest.browser_specific_settings?.gecko) {
        (manifest.browser_specific_settings.gecko as Record<string, unknown>)
          .data_collection_permissions = { required: ['none'] };
      }
    },
  },

  browser: 'chrome',
});
