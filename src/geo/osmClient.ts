import type { PlacesConfig } from '../config';
import { dedupePlaces, placeFromNominatim, type NominatimResult, type PlaceTarget } from './places';
import type { LatLon } from './projection';

// Appels aux services OpenStreetMap depuis l'appli (aucun serveur à nous) :
// Nominatim (une requête par seconde au plus, recherche lancée par un bouton)
// et Overpass (une requête par carte, plusieurs serveurs publics en relais).

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';

// Diagnostic du 8/11/2026 (navigateur de téléphone, scripts/check-servers.ts) :
// OpenStreetMap France répond en 1 à 8 s (monde entier : mêmes rues que le
// serveur principal à Paris, Bruxelles, New York, Tokyo), le serveur principal
// en 25 à 50 s (ou « at capacity »), VK Maps en 15 à 20 s ou 504,
// private.coffee jamais (gardé en dernier recours).
export const OVERPASS_MIRRORS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
] as const;

/** Progression d'un téléchargement Overpass, pour l'écran de chargement. */
export type OverpassProgress = { kind: 'attempt'; attempt: number; round: number } | { kind: 'pause'; seconds: number };

/** Statut HTTP en erreur (4xx, 5xx). */
export class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

export interface HttpOptions {
  signal: AbortSignal;
  timeoutMs: number;
}

/** Accès au réseau, fourni par la plateforme (navigateur, Android, Node). */
export interface HttpClient {
  /** Corps de la réponse en texte ; rejette sur une erreur réseau, un délai dépassé ou un statut en erreur. */
  getText(url: string, options: HttpOptions): Promise<string>;
  /**
   * POST d'un formulaire (application/x-www-form-urlencoded) : requête « simple »
   * pour le navigateur (pas de pré-vérification CORS), réponse en texte.
   */
  postForm(url: string, form: Record<string, string>, options: HttpOptions): Promise<string>;
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
   * Données Overpass (texte JSON). Un tour : les serveurs dans l'ordre, en relais ;
   * s'ils échouent tous, pause (règle d'usage : 30 s) puis nouveau tour.
   */
  async overpass(query: string, signal: AbortSignal, onProgress?: (progress: OverpassProgress) => void): Promise<string> {
    const errors: string[] = [];
    for (let round = 0; round < this.config.overpassRounds; round++) {
      if (round > 0) {
        onProgress?.({ kind: 'pause', seconds: this.config.overpassRetryPause });
        await wait(this.config.overpassRetryPause * 1000, signal);
      }
      const text = await this.overpassRound(query, round, signal, errors, onProgress);
      if (text !== null) return text;
    }
    throw new OsmError('overpass', `Overpass : aucun serveur n'a répondu (${errors.join(' ; ')})`);
  }

  /**
   * Un tour de serveurs en relais : le suivant est interrogé dès que le serveur en
   * cours échoue, ou s'il n'a pas répondu après overpassHedgeDelay (un serveur
   * saturé peut se taire jusqu'au délai d'attente) ; les requêtes déjà parties
   * continuent. La première réponse complète gagne, les autres sont annulées.
   * Null si tous ont échoué.
   */
  private overpassRound(
    query: string,
    round: number,
    signal: AbortSignal,
    errors: string[],
    onProgress?: (progress: OverpassProgress) => void,
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const requests = new AbortController();
      let next = 0;
      let running = 0;
      let done = false;
      let hedge: ReturnType<typeof setTimeout> | undefined;
      const finish = (settle: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(hedge);
        signal.removeEventListener('abort', onAbort);
        requests.abort();
        settle();
      };
      const onAbort = () => finish(() => reject(abortError()));
      const launch = () => {
        clearTimeout(hedge);
        if (done) return;
        if (next >= OVERPASS_MIRRORS.length) {
          if (running === 0) finish(() => resolve(null));
          return;
        }
        const attempt = next++;
        const mirror = OVERPASS_MIRRORS[attempt]!;
        running++;
        onProgress?.({ kind: 'attempt', attempt, round });
        hedge = setTimeout(launch, this.config.overpassHedgeDelay * 1000);
        // POST (méthode recommandée par Overpass) : la requête voyage dans le corps.
        this.http
          .postForm(mirror, { data: query }, { signal: requests.signal, timeoutMs: this.timeoutMs })
          .then((text) => {
            const failure = overpassFailure(text);
            if (failure) throw new Error(failure);
            finish(() => resolve(text));
          })
          .catch((error: unknown) => {
            if (done) return;
            running--;
            errors.push(`${new URL(mirror).host} : ${describe(error)}`);
            launch();
          });
      };
      if (signal.aborted) return reject(abortError());
      signal.addEventListener('abort', onAbort, { once: true });
      launch();
    });
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
