export interface StoreInfo {
  url: string;
  icon: string;
  label: string;
}

const STORES: Record<string, StoreInfo> = {
  chrome: {
    url: 'https://chromewebstore.google.com/detail/ldimjibdnbccpjgndkealkhojebhjdbh/reviews',
    icon: '/icons/chrome.svg',
    label: 'Chrome Web Store',
  },
  edge: {
    url: 'https://microsoftedge.microsoft.com/addons/detail/apmjcckdjbblamplalcnnapejapjaobe',
    icon: '/icons/edge.svg',
    label: 'Edge Add-ons',
  },
};

export function getStoreInfo(): StoreInfo | null {
  return STORES[import.meta.env.BROWSER] ?? null;
}
