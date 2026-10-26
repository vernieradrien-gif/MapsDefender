import type { PlacesConfig } from '../config';
import { dedupePlaces, placeFromNominatim, type NominatimResult, type PlaceTarget } from './places';
import type { LatLon } from './projection';

// Appels aux services OpenStreetMap depuis l'appli (aucun serveur à nous) :
// Nominatim (une requête par seconde au plus, recherche lancée par un bouton)
// et Overpass (une requête par carte, deux serveurs de secours indépendants :
// overpass.kumi.systems est devenu overpass.private.coffee, ce n'est pas un
// troisième serveur).

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
export const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
] as const;

/** Statut HTTP en erreur (4xx, 5xx). */
export class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/** Accès au réseau, fourni par la plateforme (navigateur, Android, Node). */
export interface HttpClient {
  /** Corps de la réponse en texte ; rejette sur une erreur réseau, un délai dépassé ou un statut en erreur. */
  getText(url: string, options: { signal: AbortSignal; timeoutMs: number }): Promise<string>;
}

export type OsmErrorCode = 'aborted' | 'network' | 'notFound' | 'overpass';

/** Erreur présentée au joueur (le code choisit le message). */
export class OsmError extends Error {
  constructor(
    readonly code: OsmErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const abortError = () => new OsmError('aborted', 'annulé');

/** Attente interruptible. */
export function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Remarque d'erreur qu'Overpass ajoute à la fin d'une réponse incomplète (délai, mémoire). */
export function overpassFailure(text: string): string | null {
  const remark = /"remark"\s*:\s*"([^"]*)"/.exec(text.slice(-2000))?.[1];
  return remark && /error|timed out|out of memory/i.test(remark) ? remark : null;
}

export class OsmClient {
  private lastNominatim = -Infinity;

  constructor(
    private readonly http: HttpClient,
    private readonly config: PlacesConfig,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private get timeoutMs(): number {
    return this.config.requestTimeout * 1000;
  }

  /** Respecte l'écart minimal entre deux requêtes Nominatim. */
  private async nominatim(path: string, params: Record<string, string>, signal: AbortSignal): Promise<unknown> {
    const delay = this.lastNominatim + this.config.nominatimInterval * 1000 - this.now();
    if (delay > 0) await wait(delay, signal);
    this.lastNominatim = this.now();
    const query = new URLSearchParams({ ...params, format: 'jsonv2', addressdetails: '1', 'accept-language': 'fr' });
    try {
      return JSON.parse(await this.http.getText(`${NOMINATIM_URL}/${path}?${query}`, { signal, timeoutMs: this.timeoutMs }));
    } catch (error) {
      if (signal.aborted) throw abortError();
      throw new OsmError('network', `Nominatim : ${describe(error)}`);
    }
  }

  /** Recherche d'adresse : quelques lieux possibles, le plus pertinent d'abord. */
  async search(query: string, signal: AbortSignal): Promise<PlaceTarget[]> {
    const text = query.trim();
    if (!text) throw new OsmError('notFound', 'recherche vide');
    const data = await this.nominatim('search', { q: text, limit: String(this.config.geocodeResults) }, signal);
    const results = Array.isArray(data) ? (data as NominatimResult[]) : [];
    if (results.length === 0) throw new OsmError('notFound', `adresse introuvable : « ${text} »`);
    return dedupePlaces(results.map((r) => placeFromNominatim(r, text)));
  }

  /** Nom du lieu à une position (GPS) ; une position sans adresse connue reste utilisable. */
  async reverse(center: LatLon, signal: AbortSignal): Promise<PlaceTarget | null> {
    const params = { lat: center.lat.toFixed(6), lon: center.lon.toFixed(6), zoom: '17' };
    const data = (await this.nominatim('reverse', params, signal)) as NominatimResult & { error?: string };
    if (!data || data.error || !data.display_name) return null;
    // La carte reste centrée sur la position du joueur, pas sur l'adresse trouvée.
    return { ...placeFromNominatim(data, null), center, precise: false };
  }

  /**
   * Données Overpass (texte JSON), en essayant les miroirs l'un après l'autre ;
   * `onAttempt` reçoit le numéro de l'essai (0 : serveur principal).
   */
  async overpass(query: string, signal: AbortSignal, onAttempt?: (attempt: number) => void): Promise<string> {
    const errors: string[] = [];
    for (const [attempt, mirror] of OVERPASS_MIRRORS.entries()) {
      onAttempt?.(attempt);
      try {
        const text = await this.http.getText(`${mirror}?data=${encodeURIComponent(query)}`, { signal, timeoutMs: this.timeoutMs });
        const failure = overpassFailure(text);
        if (failure) throw new Error(failure);
        return text;
      } catch (error) {
        if (signal.aborted) throw abortError();
        errors.push(`${new URL(mirror).host} : ${describe(error)}`);
      }
    }
    throw new OsmError('overpass', `Overpass : aucun serveur n'a répondu (${errors.join(' ; ')})`);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
