import type { GameConfig } from '../config';
import type { GameMap } from '../game/types';
import { moveBase, type MovedBase } from './mapBuilder';
import { buildPlaceMap, type BuildRequest, type BuildResult, type MapBuildFn } from './placeMap';

// Construction des cartes : dans un worker quand le navigateur le permet,
// sinon sur le fil principal (après avoir laissé l'écran se redessiner).

export type WorkerRequest =
  | { id: number; kind: 'build'; request: BuildRequest }
  | { id: number; kind: 'moveBase'; map: GameMap; buildingId: number };

export type WorkerResponse =
  | { id: number; kind: 'build'; result: BuildResult }
  | { id: number; kind: 'moveBase'; result: MovedBase | null };

export interface MapWorker {
  build: MapBuildFn;
  /** Base déplacée sur un autre bâtiment (null si impossible). */
  moveBase(map: GameMap, buildingId: number): Promise<MovedBase | null>;
}

type Job = { request: WorkerRequest; resolve: (response: WorkerResponse) => void };

export function createMapWorker(config: GameConfig): MapWorker {
  const onMainThread = (request: WorkerRequest) =>
    new Promise<WorkerResponse>((resolve) =>
      setTimeout(() => {
        resolve(
          request.kind === 'build'
            ? { id: request.id, kind: 'build', result: buildPlaceMap(request.request, config) }
            : { id: request.id, kind: 'moveBase', result: moveBase(request.map, request.buildingId, config) },
        );
      }, 50),
    );

  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('./mapWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }

  const pending = new Map<number, Job>();
  let nextId = 1;
  if (worker) {
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      pending.get(event.data.id)?.resolve(event.data);
      pending.delete(event.data.id);
    };
    // Worker hors service (navigateur trop ancien…) : on construit sur le fil principal.
    worker.onerror = (event) => {
      event.preventDefault();
      worker?.terminate();
      worker = null;
      for (const { request, resolve } of pending.values()) void onMainThread(request).then(resolve);
      pending.clear();
    };
  }

  const send = (request: WorkerRequest): Promise<WorkerResponse> => {
    if (!worker) return onMainThread(request);
    const w = worker;
    return new Promise((resolve) => {
      pending.set(request.id, { request, resolve });
      w.postMessage(request);
    });
  };

  return {
    build: async (request) => {
      const response = await send({ id: nextId++, kind: 'build', request });
      return response.kind === 'build' ? response.result : { ok: false, error: 'réponse inattendue' };
    },
    moveBase: async (map, buildingId) => {
      const response = await send({ id: nextId++, kind: 'moveBase', map, buildingId });
      return response.kind === 'moveBase' ? response.result : null;
    },
  };
}
