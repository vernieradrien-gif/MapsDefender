import { loadConfig } from '../config';
import { buildPlaceMap, type BuildRequest, type BuildResult } from './placeMap';

// Worker : construit la carte hors du fil principal, pour que l'écran de
// chargement reste animé et que « Annuler » réponde tout de suite.

interface WorkerScope {
  onmessage: ((event: MessageEvent<{ id: number; request: BuildRequest }>) => void) | null;
  postMessage(message: { id: number; result: BuildResult }): void;
}

const scope = self as unknown as WorkerScope;
const config = loadConfig();

scope.onmessage = (event) => {
  const { id, request } = event.data;
  scope.postMessage({ id, result: buildPlaceMap(request, config) });
};
