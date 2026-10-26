import type { GameMap } from '../game/types';
import type { PlaceMap, PlaceMapInfo } from '../geo/placeMap';

// Cartes générées gardées sur l'appareil (IndexedDB) : rouvertes sans réseau,
// même adresse = même carte. Les descriptions sont rangées à part pour lister
// les cartes sans charger leur contenu.

export interface MapStore {
  infos(): Promise<PlaceMapInfo[]>;
  getMap(key: string): Promise<GameMap | null>;
  put(place: PlaceMap): Promise<void>;
  putInfo(info: PlaceMapInfo): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Rangement en mémoire (navigation privée, tests) : perdu à la fermeture. */
export function memoryStore(): MapStore {
  const infos = new Map<string, PlaceMapInfo>();
  const maps = new Map<string, GameMap>();
  return {
    infos: async () => [...infos.values()],
    getMap: async (key) => maps.get(key) ?? null,
    put: async ({ info, map }) => {
      infos.set(info.key, info);
      maps.set(info.key, map);
    },
    putInfo: async (info) => {
      infos.set(info.key, info);
    },
    remove: async (key) => {
      infos.delete(key);
      maps.delete(key);
    },
  };
}

const DB_NAME = 'streetdefense';
const DB_VERSION = 1;

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Rangement IndexedDB, ou null s'il est indisponible. */
export async function indexedDbStore(): Promise<MapStore | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('infos')) db.createObjectStore('infos', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('maps')) db.createObjectStore('maps');
    };
    const db = await done(open);
    return {
      infos: () => done(db.transaction('infos').objectStore('infos').getAll() as IDBRequest<PlaceMapInfo[]>),
      getMap: async (key) => ((await done(db.transaction('maps').objectStore('maps').get(key))) as GameMap | undefined) ?? null,
      put: async ({ info, map }) => {
        const tx = db.transaction(['infos', 'maps'], 'readwrite');
        tx.objectStore('maps').put(map, info.key);
        tx.objectStore('infos').put(info);
        await finished(tx);
      },
      putInfo: async (info) => {
        const tx = db.transaction('infos', 'readwrite');
        tx.objectStore('infos').put(info);
        await finished(tx);
      },
      remove: async (key) => {
        const tx = db.transaction(['infos', 'maps'], 'readwrite');
        tx.objectStore('maps').delete(key);
        tx.objectStore('infos').delete(key);
        await finished(tx);
      },
    };
  } catch {
    return null;
  }
}

/** Date de dernière utilisation : dernière partie, sinon création. */
const recency = (info: PlaceMapInfo) => Math.max(info.lastPlayed, info.createdAt);

export class MapCache {
  constructor(
    private readonly store: MapStore,
    private readonly maxMaps: number,
    /** Vrai si les cartes survivent à la fermeture de l'appli. */
    readonly persistent: boolean,
  ) {}

  /** Cartes enregistrées, la plus récemment utilisée d'abord. */
  async list(): Promise<PlaceMapInfo[]> {
    const infos = await this.store.infos();
    return infos.sort((a, b) => recency(b) - recency(a) || a.key.localeCompare(b.key));
  }

  async info(key: string): Promise<PlaceMapInfo | null> {
    return (await this.store.infos()).find((i) => i.key === key) ?? null;
  }

  async byMapId(mapId: string): Promise<PlaceMap | null> {
    const info = (await this.store.infos()).find((i) => i.mapId === mapId);
    return info ? this.get(info.key) : null;
  }

  async get(key: string): Promise<PlaceMap | null> {
    const [info, map] = await Promise.all([this.info(key), this.store.getMap(key)]);
    return info && map ? { info, map } : null;
  }

  /**
   * Enregistre une carte, puis oublie les moins récemment utilisées au-delà du
   * maximum (jamais celle enregistrée, ni celles de `keep`).
   */
  async save(place: PlaceMap, keep: readonly string[] = []): Promise<void> {
    await this.store.put(place);
    const infos = await this.list();
    const protect = new Set([place.info.key, ...keep]);
    let excess = infos.length - this.maxMaps;
    for (const info of [...infos].reverse()) {
      if (excess <= 0) break;
      if (protect.has(info.key)) continue;
      await this.store.remove(info.key);
      excess--;
    }
  }

  /** Note qu'une partie commence sur cette carte. */
  async touch(key: string, time: number): Promise<void> {
    const info = await this.info(key);
    if (info) await this.store.putInfo({ ...info, lastPlayed: time });
  }
}

export async function openMapCache(maxMaps: number): Promise<MapCache> {
  const store = await indexedDbStore();
  return store ? new MapCache(store, maxMaps, true) : new MapCache(memoryStore(), maxMaps, false);
}
