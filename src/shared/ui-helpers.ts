export function createIcon(type = 'brand', size = 'md', tone = 'main'): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = `ah-icon ah-icon--${size} ah-icon--${tone}`;
  span.setAttribute('aria-hidden', 'true');

  const img = document.createElement('img');
  img.alt = '';
  try {
    img.src = chrome?.runtime?.getURL(`icons/${type}.svg`) ?? `icons/${type}.svg`;
  } catch {
    img.src = `icons/${type}.svg`;
  }

  span.appendChild(img);
  return span;
}

export function createSectionHeader(
  iconType: string,
  labelText: string,
  size = 'sm',
  tone = 'muted',
): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'ah-header ah-section-title';
  div.append(createIcon(iconType, size, tone), document.createElement('span'));
  div.lastElementChild!.textContent = labelText;
  return div;
}

export function escapeHtml(str: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str || '').replace(/[&<>"']/g, ch => map[ch] || ch);
}
