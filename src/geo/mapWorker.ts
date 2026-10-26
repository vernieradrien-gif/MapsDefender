import { loadConfig } from '../config';
import { moveBase } from './mapBuilder';
import { buildPlaceMap } from './placeMap';
import type { WorkerRequest, WorkerResponse } from './mapBuilderClient';

// Worker : construit les cartes (et déplace leur base) hors du fil principal,
// pour que l'écran de chargement reste animé et que « Annuler » réponde tout de suite.

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}

const scope = self as unknown as WorkerScope;
const config = loadConfig();

scope.onmessage = (event) => {
  const message = event.data;
  if (message.kind === 'build') {
    scope.postMessage({ id: message.id, kind: 'build', result: buildPlaceMap(message.request, config) });
  } else {
    scope.postMessage({ id: message.id, kind: 'moveBase', result: moveBase(message.map, message.buildingId, config) });
  }
};
