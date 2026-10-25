import { describe, expect, it } from 'vitest';
import { testConfig } from '../game/__tests__/helpers';
import { HttpStatusError, OsmClient, OVERPASS_MIRRORS, overpassFailure, type HttpClient } from './osmClient';
import { dedupePlaces, normalizeQuery, placeFromNominatim, placeKey, radiusSteps, type PlaceTarget } from './places';

const places = testConfig((c) => (c.places.nominatimInterval = 0.05)).places;

function fakeHttp(answer: (url: string) => string | Error): HttpClient & { urls: string[]; times: number[] } {
  const urls: string[] = [];
  const times: number[] = [];
  return {
    urls,
    times,
    async getText(url, { signal }) {
      urls.push(url);
      times.push(Date.now());
      if (signal.aborted) throw new Error('aborted');
      const a = answer(url);
      if (a instanceof Error) throw a;
      return a;
    },
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

describe('téléchargement (Overpass)', () => {
  it('essaie les miroirs l’un après l’autre', async () => {
    const http = fakeHttp((url) =>
      url.startsWith(OVERPASS_MIRRORS[0]) ? new HttpStatusError(504) : '{"elements":[]}',
    );
    const text = await new OsmClient(http, places).overpass('[out:json];way;out geom;', new AbortController().signal);
    expect(text).toBe('{"elements":[]}');
    expect(http.urls).toHaveLength(2);
    expect(http.urls[1]!.startsWith(OVERPASS_MIRRORS[1])).toBe(true);
    expect(new URL(http.urls[1]!).searchParams.get('data')).toBe('[out:json];way;out geom;');
  });

  it('une réponse incomplète (délai dépassé côté serveur) compte comme un échec', async () => {
    const partial = '{"elements":[],"remark":"runtime error: Query timed out in \\"query\\" at line 1 after 26 seconds."}';
    expect(overpassFailure(partial)).toMatch(/timed out/);
    expect(overpassFailure('{"elements":[]}')).toBeNull();
    const http = fakeHttp((url) => (url.startsWith(OVERPASS_MIRRORS[0]) ? partial : '{"elements":[1]}'));
    expect(await new OsmClient(http, places).overpass('q', new AbortController().signal)).toBe('{"elements":[1]}');
  });

  it('tous les serveurs en panne : erreur Overpass (bouton Réessayer)', async () => {
    const http = fakeHttp(() => new HttpStatusError(429));
    await expect(new OsmClient(http, places).overpass('q', new AbortController().signal)).rejects.toMatchObject({
      code: 'overpass',
    });
    expect(http.urls).toHaveLength(OVERPASS_MIRRORS.length);
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

  it('clé de cache à environ 10 m près, et rayons essayés', () => {
    expect(placeKey({ lat: 48.62978654, lon: 2.32491381 }, 400)).toBe('48.6298,2.3249,400');
    const c = testConfig();
    expect(radiusSteps(300, c)).toEqual([300, 400, 500, 600]);
    expect(radiusSteps(500, c)).toEqual([500, 600]);
  });
});
