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
      16: 'icons/unlock_16.png',
      32: 'icons/unlock_32.png',
      48: 'icons/unlock_48.png',
      64: 'icons/unlock_64.png',
      128: 'icons/unlock_128.png',
      256: 'icons/unlock_256.png',
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
          strict_min_version: '109.0',
        },
      },
    }),
  }),

  browser: 'chrome',
});
