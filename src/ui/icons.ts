// Icônes SVG en ligne (aucune ressource externe).

const svg = (body: string, viewBox = '0 0 24 24') =>
  `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  coin: svg(
    '<circle cx="12" cy="12" r="10" fill="#ffc93c"/><circle cx="12" cy="12" r="7" fill="#ffdb6e" stroke="#e8a920" stroke-width="1.6"/>' +
      '<path d="M10.2 9.2h3.6M10.2 14.8h3.6M12 7.8v8.4" stroke="#e8a920" stroke-width="1.6" stroke-linecap="round"/>',
  ),
  base: svg(
    '<path d="M3 10l9-6 9 6v10H3z" fill="#ffffff" stroke="#9fb3c2" stroke-width="1.2"/>' +
      '<path d="M2 10.5L12 4l10 6.5" fill="none" stroke="#2bb3a6" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<rect x="10.4" y="9" width="3.2" height="9" rx=".6" fill="#2bb3a6"/><rect x="7.5" y="11.9" width="9" height="3.2" rx=".6" fill="#2bb3a6"/>',
  ),
  flag: svg(
    '<path d="M6 21V4" stroke="#6b7088" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M6.5 4.5h11l-2.5 3.5 2.5 3.5h-11z" fill="#2bb3a6"/>',
  ),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1.6" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.6" fill="currentColor"/>'),
  next: svg('<path d="M4 6.2v11.6c0 .8.9 1.3 1.6.8L13 13v4.8c0 .8.9 1.3 1.6.8l7-5.8a1 1 0 0 0 0-1.6l-7-5.8c-.7-.5-1.6 0-1.6.8V11L5.6 5.4C4.9 4.9 4 5.4 4 6.2z" fill="currentColor"/>'),
  speed: svg(
    '<path d="M4.5 16a8 8 0 1 1 15 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M12 15l4.2-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="15" r="1.8" fill="currentColor"/>',
  ),
  entry: svg(
    '<circle cx="12" cy="12" r="9" fill="rgba(232,72,85,.2)" stroke="#e84855" stroke-width="2" stroke-dasharray="3.5 2.5"/>' +
      '<path d="M8 12h8M13 8.5l3.5 3.5-3.5 3.5" fill="none" stroke="#e84855" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  marker: svg(
    '<circle cx="12" cy="12" r="9" fill="rgba(255,255,255,.9)" stroke="#d8dce6" stroke-width="2"/>' +
      '<path d="M12 8v8M8 12h8" stroke="#1f9e93" stroke-width="2.4" stroke-linecap="round"/>',
  ),
  upgrade: svg(
    '<circle cx="12" cy="12" r="10" fill="#2bb3a6"/><path d="M12 17V7.5M7.8 11.5L12 7.3l4.2 4.2" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  maxed: svg(
    '<circle cx="12" cy="12" r="10" fill="#ffc93c"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  sell: svg(
    '<circle cx="12" cy="12" r="10" fill="#f1f2f7" stroke="#d7dae4" stroke-width="1.2"/>' +
      '<circle cx="12" cy="12" r="6" fill="#ffdb6e" stroke="#e8a920" stroke-width="1.4"/><path d="M12 9v6M10 12h4" stroke="#e8a920" stroke-width="1.5" stroke-linecap="round"/>',
  ),
};

/** Icône d'un dispositif sanitaire, même allure que sur la carte. */
export function towerIcon(towerId: string): string {
  const platform = '<ellipse cx="20" cy="32" rx="13" ry="5" fill="#cfd6e2"/><ellipse cx="20" cy="30" rx="13" ry="5" fill="#fff"/>';
  if (towerId === 'diffuseur') {
    return svg(
      platform +
        '<rect x="12" y="18" width="16" height="12" rx="5" fill="#cfe3e1"/><ellipse cx="20" cy="18" rx="8" ry="4" fill="#fff"/>' +
        '<path d="M13 25a7 3 0 0 0 14 0" fill="none" stroke="#3a86c8" stroke-width="2"/>' +
        '<path d="M20 17l8-7" stroke="#1f8f85" stroke-width="5" stroke-linecap="round"/><path d="M20 17l8-7" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>' +
        '<rect x="25.5" y="3.5" width="9" height="5" rx="2.5" fill="#fff" stroke="#2f6fa8" stroke-width="1" transform="rotate(-40 30 6)"/>',
      '0 0 40 40',
    );
  }
  if (towerId === 'laser') {
    return svg(
      platform +
        '<rect x="16" y="13" width="8" height="17" rx="3" fill="#d5dbe8"/><rect x="16.5" y="13" width="7" height="16" rx="3" fill="#fff"/>' +
        '<path d="M16.5 19h7" stroke="#2bb3a6" stroke-width="2"/>' +
        '<ellipse cx="21" cy="10" rx="7" ry="4.5" fill="#fff" stroke="#d5dbe8" stroke-width="1.2" transform="rotate(-25 21 10)"/>' +
        '<circle cx="26" cy="8" r="5" fill="rgba(123,92,255,.3)"/><circle cx="26" cy="8" r="2.8" fill="#7b5cff"/>',
      '0 0 40 40',
    );
  }
  if (towerId === 'purificateur') {
    return svg(
      platform +
        '<rect x="11" y="17" width="18" height="13" rx="6" fill="#cfe3e1"/><ellipse cx="20" cy="17" rx="9" ry="4.5" fill="#fff"/>' +
        '<path d="M15 21v6M18.3 21v6M21.6 21v6M25 21v6" stroke="#36c2b4" stroke-width="1.4" stroke-linecap="round"/>' +
        '<ellipse cx="20" cy="16" rx="7" ry="3.4" fill="#bdeee8"/>' +
        '<path d="M20 16l5-2M20 16l-1 3.4M20 16l-4-1.6" stroke="#36c2b4" stroke-width="2.4" stroke-linecap="round"/>' +
        '<circle cx="20" cy="16" r="9" fill="none" stroke="rgba(54,194,180,.45)" stroke-width="1.2" stroke-dasharray="2 2"/>',
      '0 0 40 40',
    );
  }
  return svg(
    platform +
      '<rect x="14" y="17" width="12" height="13" rx="5" fill="#cfe3e1"/><rect x="14.5" y="17" width="11" height="12" rx="5" fill="#fff"/>' +
      '<path d="M14.6 24a5.4 2.4 0 0 0 10.8 0" fill="none" stroke="#20a99d" stroke-width="2"/>' +
      '<path d="M15 18a5 5 0 0 1 10 0z" fill="#fff" stroke="#cfe3e1" stroke-width="1"/>' +
      '<path d="M20 15l8-5" stroke="#1f8f85" stroke-width="2.6" stroke-linecap="round"/><circle cx="28.5" cy="9.5" r="2.2" fill="#20a99d"/>' +
      '<circle cx="33" cy="6.5" r="1.2" fill="#9fe3db"/><circle cx="34" cy="10.5" r="1" fill="#9fe3db"/>',
    '0 0 40 40',
  );
}

/** Virus stylisé (sphère à pointes) pour les écrans. */
export function virusIcon(body: string, dark: string, spikes = 10): string {
  let parts = '';
  for (let k = 0; k < spikes; k++) {
    const a = (k / spikes) * Math.PI * 2;
    const x1 = 20 + Math.cos(a) * 10;
    const y1 = 20 + Math.sin(a) * 10;
    const x2 = 20 + Math.cos(a) * 15.5;
    const y2 = 20 + Math.sin(a) * 15.5;
    parts +=
      `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${dark}" stroke-width="1.8" stroke-linecap="round"/>` +
      `<circle cx="${(20 + Math.cos(a) * 16.2).toFixed(1)}" cy="${(20 + Math.sin(a) * 16.2).toFixed(1)}" r="2" fill="${dark}"/>`;
  }
  return svg(
    parts +
      `<circle cx="20" cy="20.6" r="12" fill="${dark}"/><circle cx="20" cy="20" r="11.3" fill="${body}"/>` +
      `<circle cx="15" cy="23" r="2" fill="${dark}" opacity=".35"/><circle cx="24" cy="17" r="2.4" fill="${dark}" opacity=".35"/>` +
      '<ellipse cx="15.5" cy="14.5" rx="3.4" ry="2" fill="#fff" opacity=".45" transform="rotate(-30 15.5 14.5)"/>',
    '0 0 40 40',
  );
}

export const viruses = [virusIcon('#e8636f', '#c4404f'), virusIcon('#f2a03d', '#d07b16', 8), virusIcon('#9b6fd6', '#7a4fb8', 12)];
