export function _(id: string, fallback = '', subs?: string[]): string {
  try {
    return chrome.i18n.getMessage(id, subs) || fallback;
  } catch {
    return fallback;
  }
}

export function applyI18n(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const val = _(key);
    if (val) el.textContent = val;
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) return;
    const val = _(key);
    if (val) el.setAttribute('placeholder', val);
  });
}
