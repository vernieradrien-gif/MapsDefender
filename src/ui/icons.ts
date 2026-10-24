// Icônes SVG en ligne (aucune ressource externe).

const svg = (body: string, viewBox = '0 0 24 24') =>
  `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  coin: svg(
    '<circle cx="12" cy="12" r="10" fill="#ffc93c"/><circle cx="12" cy="12" r="7" fill="#ffdb6e" stroke="#e8a920" stroke-width="1.6"/>' +
      '<path d="M10.2 9.2h3.6M10.2 14.8h3.6M12 7.8v8.4" stroke="#e8a920" stroke-width="1.6" stroke-linecap="round"/>',
  ),
  cake: svg(
    '<path d="M3 13l16-6 2 4v6H3z" fill="#e9a96b"/><path d="M3 13l16-6 2 4H3z" fill="#ff9ec4"/>' +
      '<path d="M3 15.5h18" stroke="#fff6ea" stroke-width="1.6"/><circle cx="17" cy="6.2" r="2.3" fill="#e83f5b"/>',
  ),
  flag: svg(
    '<path d="M6 21V4" stroke="#6b7088" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M6.5 4.5h11l-2.5 3.5 2.5 3.5h-11z" fill="#4fa3ff"/>',
  ),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1.6" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.6" fill="currentColor"/>'),
  next: svg('<path d="M4 6.2v11.6c0 .8.9 1.3 1.6.8L13 13v4.8c0 .8.9 1.3 1.6.8l7-5.8a1 1 0 0 0 0-1.6l-7-5.8c-.7-.5-1.6 0-1.6.8V11L5.6 5.4C4.9 4.9 4 5.4 4 6.2z" fill="currentColor"/>'),
  speed: svg(
    '<path d="M4.5 16a8 8 0 1 1 15 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M12 15l4.2-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="15" r="1.8" fill="currentColor"/>',
  ),
  arrow: svg('<path d="M5 7l6 5-6 5M12 7l6 5-6 5" fill="none" stroke="#ffb648" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  marker: svg(
    '<circle cx="12" cy="12" r="9" fill="rgba(255,255,255,.9)" stroke="#d8dce6" stroke-width="2"/>' +
      '<path d="M12 8v8M8 12h8" stroke="#ff7a59" stroke-width="2.4" stroke-linecap="round"/>',
  ),
};

/** Icône de tourelle, même allure que sur la carte. */
export function towerIcon(towerId: string): string {
  if (towerId === 'ballons') {
    return svg(
      '<ellipse cx="20" cy="31" rx="13" ry="5" fill="#cfd6e2"/><ellipse cx="20" cy="29" rx="13" ry="5" fill="#fff"/>' +
        '<rect x="12" y="18" width="16" height="11" rx="5" fill="#e08e2b"/><ellipse cx="20" cy="18" rx="8" ry="4" fill="#ffb648"/>' +
        '<path d="M20 18l7-8" stroke="#e08e2b" stroke-width="3" stroke-linecap="round"/>' +
        '<ellipse cx="28" cy="7.5" rx="4.4" ry="5" fill="#4fa3ff"/><path d="M28 12.4l-1.4 2h2.8z" fill="#2f7fe0"/>' +
        '<ellipse cx="26.6" cy="5.8" rx="1.1" ry="1.6" fill="#fff" opacity=".8"/>',
      '0 0 40 40',
    );
  }
  return svg(
    '<ellipse cx="20" cy="31" rx="13" ry="5" fill="#cfd6e2"/><ellipse cx="20" cy="29" rx="13" ry="5" fill="#fff"/>' +
      '<path d="M11 28a9 9 0 0 1 18 0z" fill="#3cc6cc"/><circle cx="16.5" cy="22.5" r="2" fill="#bff0f2"/>' +
      '<path d="M20 20l7-8" stroke="#2a9aa5" stroke-width="2.2" stroke-linecap="round"/>' +
      '<circle cx="28.5" cy="10" r="4" fill="none" stroke="#ff8fbf" stroke-width="2.2"/>' +
      '<circle cx="31" cy="4" r="2.4" fill="rgba(200,245,255,.6)" stroke="#78c8ff" stroke-width="1"/>' +
      '<circle cx="35" cy="9" r="1.6" fill="rgba(200,245,255,.6)" stroke="#78c8ff" stroke-width="1"/>',
    '0 0 40 40',
  );
}

/** Petit Glouton pour l'écran d'accueil. */
export function gloutonIcon(body: string, dark: string, extra = ''): string {
  return svg(
    `<ellipse cx="20" cy="35" rx="12" ry="3.5" fill="rgba(41,64,90,.18)"/>${extra}` +
      `<ellipse cx="20" cy="22" rx="14" ry="12.5" fill="${dark}"/><ellipse cx="20" cy="21" rx="13.6" ry="12" fill="${body}"/>` +
      '<ellipse cx="13" cy="14" rx="4" ry="2.4" fill="#fff" opacity=".45" transform="rotate(-25 13 14)"/>' +
      '<circle cx="15" cy="20" r="4" fill="#fff"/><circle cx="25" cy="20" r="4" fill="#fff"/>' +
      '<circle cx="15.8" cy="21" r="2.2" fill="#2b2d42"/><circle cx="25.8" cy="21" r="2.2" fill="#2b2d42"/>' +
      '<path d="M16 27q4 3.5 8 0" fill="none" stroke="#2b2d42" stroke-width="1.8" stroke-linecap="round"/>',
    '0 0 40 40',
  );
}

export const mascots = [
  gloutonIcon('#74d36b', '#4fb04a'),
  gloutonIcon(
    '#b083f0',
    '#8a5fd0',
    '<ellipse cx="11" cy="9" rx="3" ry="6" fill="#8a5fd0" transform="rotate(-20 11 9)"/><ellipse cx="29" cy="9" rx="3" ry="6" fill="#8a5fd0" transform="rotate(20 29 9)"/>',
  ),
  gloutonIcon('#ffa24c', '#e57f25'),
];
