import type { GameConfig } from '../config';
import { buildPlaceMap, type BuildRequest, type BuildResult, type MapBuildFn } from './placeMap';

// Construction des cartes : dans un worker quand le navigateur le permet,
// sinon sur le fil principal (après avoir laissé l'écran se redessiner).

export function createMapBuilder(config: GameConfig): MapBuildFn {
  const onMainThread = (request: BuildRequest) =>
    new Promise<BuildResult>((resolve) => setTimeout(() => resolve(buildPlaceMap(request, config)), 50));

  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('./mapWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    return onMainThread;
  }

  const pending = new Map<number, { request: BuildRequest; resolve: (result: BuildResult) => void }>();
  let nextId = 1;
  worker.onmessage = (event: MessageEvent<{ id: number; result: BuildResult }>) => {
    pending.get(event.data.id)?.resolve(event.data.result);
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
  return (request) => {
    if (!worker) return onMainThread(request);
    const w = worker;
    return new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, { request, resolve });
      w.postMessage({ id, request });
    });
  };
}
