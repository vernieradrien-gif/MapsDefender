import { describe, expect, it } from 'vitest';
import { testConfig } from '../game/__tests__/helpers';
import { HttpStatusError, mirrorsFor, OsmClient, overpassFailure, type HttpClient, type OverpassProgress } from './osmClient';
import { dedupePlaces, hasHouseNumber, normalizeQuery, placeFromNominatim, placeKey, radiusSteps, type PlaceTarget } from './places';

// Un seul tour de serveurs par défaut ; le nouvel essai automatique a son propre test.
const places = testConfig((c) => Object.assign(c.places, { nominatimInterval: 0.05, overpassRounds: 1 })).places;

type FakeHttp = HttpClient & { urls: string[]; times: number[]; forms: (Record<string, string> | null)[] };

function fakeHttp(answer: (url: string) => string | Error): FakeHttp {
  const urls: string[] = [];
  const times: number[] = [];
  const forms: (Record<string, string> | null)[] = [];
  const respond = async (url: string, form: Record<string, string> | null, signal: AbortSignal) => {
    urls.push(url);
    times.push(Date.now());
    forms.push(form);
    if (signal.aborted) throw new Error('aborted');
    const a = answer(url);
    if (a instanceof Error) throw a;
    return a;
  };
  return {
    urls,
    times,
    forms,
    getText: (url, { signal }) => respond(url, null, signal),
    postForm: (url, form, { signal }) => respond(url, form, signal),
  };
}

const villagexpo = {
  lat: '48.6297865',
  lon: '2.3249138',
  display_name: "Hall du Villagexpo, Rue de l'Île de France, Saint-Michel-sur-Orge, Essonne, France",
  name: 'Hall du Villagexpo',
  address: { road: "Rue de l'Île de France", town: 'Saint-Michel-sur-Orge', postcode: '91240' },
};

describe('recherche d’adresse (Nominatim)', () => {
  it('une requête identifiée en français, quelques résultats lisibles', async () => {
    const http = fakeHttp(() => JSON.stringify([villagexpo]));
    const results = await new OsmClient(http, places).search('  Villagexpo, Saint-Michel-sur-Orge ', new AbortController().signal);
    const url = new URL(http.urls[0]!);
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(url.searchParams.get('q')).toBe('Villagexpo, Saint-Michel-sur-Orge');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('limit')).toBe(String(places.geocodeResults));
    expect(url.searchParams.get('accept-language')).toBe('fr');
    expect(results).toEqual([
      {
        center: { lat: 48.6297865, lon: 2.3249138 },
        name: 'Hall du Villagexpo',
        detail: '91240 Saint-Michel-sur-Orge',
        precise: false,
        query: 'villagexpo saint michel sur orge',
      },
    ]);
  });

  it('adresse introuvable : erreur claire', async () => {
    const client = new OsmClient(fakeHttp(() => '[]'), places);
    await expect(client.search('zzzz', new AbortController().signal)).rejects.toMatchObject({ code: 'notFound' });
    await expect(client.search('   ', new AbortController().signal)).rejects.toMatchObject({ code: 'notFound' });
  });

  it('au plus une requête par intervalle (règle d’usage de Nominatim)', async () => {
    const http = fakeHttp(() => JSON.stringify([villagexpo]));
    const client = new OsmClient(http, places);
    const signal = new AbortController().signal;
    await client.search('a', signal);
    await client.search('b', signal);
    expect(http.times[1]! - http.times[0]!).toBeGreaterThanOrEqual(places.nominatimInterval * 1000 - 5);
  });

  it('réseau en panne : erreur réseau ; annulation : erreur d’annulation', async () => {
    const down = new OsmClient(fakeHttp(() => new TypeError('Failed to fetch')), places);
    await expect(down.search('a', new AbortController().signal)).rejects.toMatchObject({ code: 'network' });
    const controller = new AbortController();
    controller.abort();
    const ok = new OsmClient(fakeHttp(() => '[]'), places);
    await expect(ok.search('a', controller.signal)).rejects.toMatchObject({ code: 'aborted' });
  });

  it('position GPS : le nom vient de l’adresse, la carte reste centrée sur la position', async () => {
    const http = fakeHttp(() => JSON.stringify({ ...villagexpo, address: { ...villagexpo.address, house_number: '3' } }));
    const center = { lat: 48.63, lon: 2.325 };
    const place = await new OsmClient(http, places).reverse(center, new AbortController().signal);
    expect(new URL(http.urls[0]!).pathname).toBe('/reverse');
    expect(place).toMatchObject({ center, precise: false, query: null, name: 'Hall du Villagexpo' });
    const nowhere = new OsmClient(fakeHttp(() => JSON.stringify({ error: 'Unable to geocode' })), places);
    expect(await nowhere.reverse(center, new AbortController().signal)).toBeNull();
  });
});

// Lieu inconnu : les serveurs mondiaux seulement.
const OVERPASS_MIRRORS = mirrorsFor();

describe('téléchargement (Overpass)', () => {
  it('serveur d’OpenStreetMap France en tête pour un lieu en France, pas ailleurs', () => {
    const france = mirrorsFor({ lat: 48.6298, lon: 2.3249 });
    expect(france[0]).toBe('https://overpass.openstreetmap.fr/api/interpreter');
    expect(france.slice(1)).toEqual(OVERPASS_MIRRORS);
    expect(mirrorsFor({ lat: 40.758, lon: -73.986 })).toEqual(OVERPASS_MIRRORS);
    expect(OVERPASS_MIRRORS[0]).toBe('https://overpass-api.de/api/interpreter');
    expect(OVERPASS_MIRRORS.some((url) => url.includes('openstreetmap.fr'))).toBe(false);
  });


  it('essaie les miroirs l’un après l’autre', async () => {
    const http = fakeHttp((url) =>
      url === OVERPASS_MIRRORS[0] ? new HttpStatusError(504) : '{"elements":[]}',
    );
    const text = await new OsmClient(http, places).overpass('[out:json];way;out geom;', new AbortController().signal);
    expect(text).toBe('{"elements":[]}');
    expect(http.urls).toHaveLength(2);
    expect(http.urls[1]).toBe(OVERPASS_MIRRORS[1]);
    // POST : la requête est dans le corps (formulaire), pas dans l'adresse.
    expect(http.forms[1]).toEqual({ data: '[out:json];way;out geom;' });
  });

  it('une réponse incomplète (délai dépassé côté serveur) compte comme un échec', async () => {
    const partial = '{"elements":[],"remark":"runtime error: Query timed out in \\"query\\" at line 1 after 26 seconds."}';
    expect(overpassFailure(partial)).toMatch(/timed out/);
    expect(overpassFailure('{"elements":[]}')).toBeNull();
    const http = fakeHttp((url) => (url === OVERPASS_MIRRORS[0] ? partial : '{"elements":[1]}'));
    expect(await new OsmClient(http, places).overpass('q', new AbortController().signal)).toBe('{"elements":[1]}');
  });

  it('tous les serveurs en panne : erreur Overpass (bouton Réessayer)', async () => {
    const http = fakeHttp(() => new HttpStatusError(429));
    await expect(new OsmClient(http, places).overpass('q', new AbortController().signal)).rejects.toMatchObject({
      code: 'overpass',
    });
    expect(http.urls).toHaveLength(OVERPASS_MIRRORS.length);
  });

  it('tous saturés : pause, puis un nouveau tour des serveurs', async () => {
    const retry = { ...places, overpassRounds: 2, overpassRetryPause: 0.02 };
    let calls = 0;
    const http = fakeHttp(() => (++calls <= OVERPASS_MIRRORS.length ? new HttpStatusError(502) : '{"elements":[]}'));
    const progress: string[] = [];
    const text = await new OsmClient(http, retry).overpass('q', new AbortController().signal, (p) =>
      progress.push(p.kind === 'pause' ? `pause ${p.seconds}` : `${p.round}:${p.attempt}`),
    );
    expect(text).toBe('{"elements":[]}');
    expect(http.urls).toHaveLength(OVERPASS_MIRRORS.length + 1);
    expect(progress).toEqual(['0:0', '0:1', '0:2', 'pause 0.02', '1:0']);
    expect(http.times[3]! - http.times[2]!).toBeGreaterThanOrEqual(15);
  });

  /** Serveurs simulés : réponse après un délai (ms), ou jamais (null) ; note les requêtes annulées. */
  function timedHttp(delays: (number | null)[], body = (i: number) => `{"elements":[${i}]}`) {
    const aborted: number[] = [];
    const http: HttpClient = {
      getText: () => Promise.reject(new Error('inutile')),
      postForm: (url, _form, { signal }) =>
        new Promise((resolve, reject) => {
          const i = OVERPASS_MIRRORS.indexOf(url);
          const delay = delays[i];
          let settled = false;
          const timer =
            delay == null
              ? undefined
              : setTimeout(() => {
                  settled = true;
                  resolve(body(i));
                }, delay);
          signal.addEventListener('abort', () => {
            if (settled) return;
            clearTimeout(timer);
            aborted.push(i);
            reject(new Error('aborted'));
          });
        }),
    };
    return { http, aborted };
  }
  const relay = { ...places, overpassHedgeDelay: 0.05 };
  const attempts = (list: string[]) => (p: OverpassProgress) => list.push(p.kind === 'attempt' ? `${p.round}:${p.attempt}` : p.kind);

  it('relais : un serveur muet n’empêche pas le suivant de répondre', async () => {
    const { http, aborted } = timedHttp([null, 5, null]);
    const progress: string[] = [];
    const start = Date.now();
    const text = await new OsmClient(http, relay).overpass('q', new AbortController().signal, attempts(progress));
    expect(text).toBe('{"elements":[1]}');
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
    expect(progress).toEqual(['0:0', '0:1']);
    // La requête restée sans réponse est annulée.
    expect(aborted).toEqual([0]);
  });

  it('relais : le premier serveur, lent mais pas muet, peut encore gagner', async () => {
    // Réponse à 75 ms : le relais est parti à 50 ms, le troisième serveur partirait à 100 ms.
    const { http, aborted } = timedHttp([75, null, null]);
    const progress: string[] = [];
    const text = await new OsmClient(http, relay).overpass('q', new AbortController().signal, attempts(progress));
    expect(text).toBe('{"elements":[0]}');
    expect(progress).toEqual(['0:0', '0:1']);
    expect(aborted).toEqual([1]);
  });

  it('relais : annulé par le joueur, toutes les requêtes en cours sont arrêtées', async () => {
    const { http, aborted } = timedHttp([null, null, null]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 75);
    await expect(new OsmClient(http, relay).overpass('q', controller.signal)).rejects.toMatchObject({ code: 'aborted' });
    expect(aborted.sort()).toEqual([0, 1]);
  });

  it('relais : tous muets jusqu’au délai d’attente, erreur Overpass', async () => {
    const quick = { ...relay, requestTimeout: 0.08 };
    const http: HttpClient = {
      getText: () => Promise.reject(new Error('inutile')),
      postForm: (_url, _form, { timeoutMs }) => new Promise((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), timeoutMs)),
    };
    await expect(new OsmClient(http, quick).overpass('q', new AbortController().signal)).rejects.toMatchObject({
      code: 'overpass',
      message: expect.stringMatching(/délai dépassé/),
    });
  });

  it('annulé : on n’essaie pas les autres miroirs', async () => {
    const controller = new AbortController();
    const http = fakeHttp(() => {
      controller.abort();
      return new Error('aborted');
    });
    await expect(new OsmClient(http, places).overpass('q', controller.signal)).rejects.toMatchObject({ code: 'aborted' });
    expect(http.urls).toHaveLength(1);
  });
});

describe('lieux', () => {
  it('recherche normalisée (graine de la carte)', () => {
    expect(normalizeQuery('  12, Rue de l’Église — SAINT-ÉTIENNE ')).toBe('12 rue de l eglise saint etienne');
  });

  it('libellé : numéro et rue pour une adresse précise', () => {
    const place = placeFromNominatim(
      {
        lat: '45.43',
        lon: '4.39',
        display_name: '12, Rue de la Paix, Saint-Étienne, Loire, France',
        address: { house_number: '12', road: 'Rue de la Paix', city: 'Saint-Étienne', postcode: '42000' },
      },
      '12 rue de la Paix Saint-Étienne',
    );
    expect(place).toMatchObject({ name: '12 Rue de la Paix', detail: '42000 Saint-Étienne', precise: true });
    // Sans adresse détaillée : le premier morceau du nom complet.
    expect(placeFromNominatim({ lat: '1', lon: '2', display_name: 'Lieu-dit, Commune, Pays' }, 'x')).toMatchObject({
      name: 'Lieu-dit',
      detail: 'Commune, Pays',
      precise: false,
    });
  });

  it('une place, sa rue et sa station ne font qu’un résultat', () => {
    const at = (lat: number, lon: number, name = 'Place Bellecour'): PlaceTarget => ({
      center: { lat, lon },
      name,
      detail: '69002 Lyon',
      precise: false,
      query: 'place bellecour lyon',
    });
    const list = [at(45.7577, 4.8324), at(45.7575, 4.832), at(45.7582, 4.8304), at(45.7577, 4.8324, 'Rue Bellecour'), at(45.78, 4.8324)];
    expect(dedupePlaces(list).map((p) => `${p.name} ${p.center.lat}`)).toEqual([
      'Place Bellecour 45.7577',
      'Rue Bellecour 45.7577',
      'Place Bellecour 45.78',
    ]);
  });

  it('numéro de rue inconnu d’OpenStreetMap : signalé (le joueur placera la base)', () => {
    expect(hasHouseNumber('8 rue Victor Hugo, Saint-Michel-sur-Orge')).toBe(true);
    expect(hasHouseNumber('12bis avenue Foch')).toBe(true);
    expect(hasHouseNumber('3, place du Marché')).toBe(true);
    expect(hasHouseNumber('75004 Paris')).toBe(false);
    expect(hasHouseNumber('Rue Victor Hugo')).toBe(false);
    const street = {
      lat: '48.6379',
      lon: '2.3091',
      display_name: 'Rue Victor Hugo, Saint-Michel-sur-Orge, France',
      name: 'Rue Victor Hugo',
      address: { road: 'Rue Victor Hugo', town: 'Saint-Michel-sur-Orge', postcode: '91240' },
    };
    expect(placeFromNominatim(street, '8 rue Victor Hugo, Saint-Michel-sur-Orge')).toMatchObject({
      name: 'Rue Victor Hugo',
      precise: false,
      numberMissing: true,
    });
    expect(placeFromNominatim(street, 'Rue Victor Hugo').numberMissing).toBeUndefined();
  });

  it('clé de cache à environ 10 m près, et rayons essayés', () => {
    expect(placeKey({ lat: 48.62978654, lon: 2.32491381 }, 400)).toBe('48.6298,2.3249,400');
    const c = testConfig();
    expect(radiusSteps(300, c)).toEqual([300, 400, 500, 600]);
    expect(radiusSteps(500, c)).toEqual([500, 600]);
  });
});
