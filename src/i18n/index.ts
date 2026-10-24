import fr from './fr.json';

// Textes de l'interface. Français d'abord ; ajouter une langue = ajouter
// un fichier JSON avec les mêmes clés et l'enregistrer dans `dictionaries`.

type Dictionary = Record<string, string>;

const dictionaries: Record<string, Dictionary> = { fr };

let current: Dictionary = fr;

export function setLocale(locale: string): void {
  current = dictionaries[locale] ?? fr;
}

/** Traduit une clé ; `{nom}` est remplacé par params.nom. Clé inconnue : renvoie la clé. */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = current[key] ?? fr[key as keyof typeof fr] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function hasKey(key: string): boolean {
  return key in current;
}
