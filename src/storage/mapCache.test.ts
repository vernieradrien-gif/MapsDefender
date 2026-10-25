import { describe, expect, it } from 'vitest';
import { straightMap } from '../game/__tests__/helpers';
import type { PlaceMap } from '../geo/placeMap';
import { MapCache, memoryStore } from './mapCache';

const place = (key: string, createdAt: number, lastPlayed = 0): PlaceMap => ({
  map: { ...straightMap(), id: `place:${key}` },
  info: {
    version: 1,
    key,
    mapId: `place:${key}`,
    name: key,
    detail: '',
    center: { lat: 1, lon: 2 },
    requestedRadius: 400,
    radius: 400,
    imaginary: false,
    createdAt,
    lastPlayed,
    averageRouteLength: 700,
    routes: 5,
    entries: 3,
    slots: 30,
    baseAtAddress: false,
    osmDate: null,
  },
});

describe('cartes en cache', () => {
  it('rend la carte enregistrée, par clé ou par identifiant', async () => {
    const cache = new MapCache(memoryStore(), 5, false);
    await cache.save(place('a', 1));
    expect((await cache.get('a'))?.map.id).toBe('place:a');
    expect((await cache.byMapId('place:a'))?.info.key).toBe('a');
    expect(await cache.get('b')).toBeNull();
  });

  it('liste la plus récemment utilisée d’abord', async () => {
    const cache = new MapCache(memoryStore(), 5, false);
    await cache.save(place('a', 1));
    await cache.save(place('b', 2));
    await cache.save(place('c', 3));
    await cache.touch('a', 10);
    expect((await cache.list()).map((i) => i.key)).toEqual(['a', 'c', 'b']);
  });

  it('oublie les moins récemment utilisées au-delà du maximum, sauf celles à garder', async () => {
    const cache = new MapCache(memoryStore(), 2, false);
    await cache.save(place('a', 1));
    await cache.save(place('b', 2));
    await cache.save(place('c', 3), ['a']);
    expect((await cache.list()).map((i) => i.key).sort()).toEqual(['a', 'c']);
    await cache.save(place('d', 4));
    expect((await cache.list()).map((i) => i.key).sort()).toEqual(['c', 'd']);
  });
});
