// Icônes SVG en ligne (aucune ressource externe).

const svg = (body: string, viewBox = '0 0 24 24') =>
  `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  coin: svg('<circle cx="12" cy="12" r="9" fill="#ffd84d"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#a37b00" stroke-width="2"/>'),
  heart: svg('<path d="M12 21s-7.5-4.6-9.5-9.3C1.1 8.3 3.3 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.7 0 5.9 3.8 4.5 7.2C19.5 16.4 12 21 12 21z" fill="#ff4d5e"/>'),
  wave: svg('<path d="M2 15c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" fill="none" stroke="#28d7ff" stroke-width="2.4" stroke-linecap="round"/><path d="M2 9c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3" fill="none" stroke="#28d7ff" stroke-width="2.4" stroke-linecap="round" opacity=".5"/>'),
  pause: svg('<rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  next: svg('<path d="M4 5v14l9-7zM13 5v14l9-7z" fill="currentColor"/>'),
  speed: svg('<path d="M12 4a9 9 0 1 0 9 9h-2.2A6.8 6.8 0 1 1 12 6.2zM12 13l6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
};

/** Icône de tour : même silhouette que sur la carte (carré ou cercle). */
export function towerIcon(towerId: string, color: string): string {
  if (towerId === 'canon') {
    return svg(
      `<circle cx="16" cy="16" r="10" fill="#2e1a08" stroke="${color}" stroke-width="2.5"/>` +
        `<line x1="16" y1="16" x2="16" y2="1.5" stroke="${color}" stroke-width="6"/>` +
        `<circle cx="16" cy="16" r="4" fill="${color}"/>`,
      '0 0 32 32',
    );
  }
  return svg(
    `<rect x="7" y="7" width="18" height="18" rx="3" fill="#0c2a22" stroke="${color}" stroke-width="2.5"/>` +
      `<line x1="16" y1="16" x2="16" y2="1.5" stroke="${color}" stroke-width="3"/>` +
      `<circle cx="16" cy="16" r="3" fill="${color}"/>`,
    '0 0 32 32',
  );
}
