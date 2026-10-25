// Accès au stockage local : la progression versionnée est dans progress.ts ;
// le jalon 4 ajoutera le cache des cartes (IndexedDB).
// localStorage peut être indisponible (navigation privée, données bloquées) :
// chaque accès est protégé et le jeu fonctionne sans.

const PREFIX = 'streetdefense:v1:';

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Stockage indisponible : on ignore, ce n'est qu'une préférence.
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}
