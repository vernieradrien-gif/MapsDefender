import { describe, expect, it } from 'vitest';
import type { GameConfig } from '../config';
import { testConfig } from '../game/__tests__/helpers';
import { validateMap } from '../game/mapValidation';
import { distance } from '../game/path';
import { FIXTURE_CENTER, gridResponse } from './__tests__/osmFixture';
import { isUnderground, landmarkOf, toBuilding } from './buildings';
import { interiorPoint } from './geometry';
import { OsmError } from './osmClient';
import { moveBase } from './mapBuilder';
import {
  buildPlaceMap,
  generatePlaceMap,
  imaginaryMap,
  withMovedBase,
  type GenerationProgress,
  type MapBuildFn,
} from './placeMap';
import { placeKey, type PlaceTarget } from './places';

// Le damier synthétique a des itinéraires plus courts qu'un vrai quartier :
// les tests qui ne portent pas sur ce seuil l'abaissent.
const config = testConfig((c) => (c.places.minAverageRouteLength = 300));
const grid = JSON.stringify(gridResponse({ halfWidth: 520, halfHeight: 720, spacing: 100, houses: true }));
const empty = JSON.stringify({ elements: [] });

const target = (precise = false): PlaceTarget => ({
  center: FIXTURE_CENTER,
  name: precise ? '12 Rue du Test' : 'Quartier du Test',
  detail: '75000 Paris',
  precise,
  query: precise ? '12 rue du test paris' : 'quartier du test paris',
});

const directBuild =
  (cfg: GameConfig): MapBuildFn =>
  async (request) =>
    buildPlaceMap(request, cfg);

function deps(responses: string[] | ((call: number) => string), cfg = config) {
  const calls: string[] = [];
  const progress: GenerationProgress[] = [];
  const controller = new AbortController();
  return {
    calls,
    progress,
    controller,
    value: {
      config: cfg,
      overpass: async (query: string) => {
        calls.push(query);
        const i = calls.length - 1;
        return typeof responses === 'function' ? responses(i) : responses[Math.min(i, responses.length - 1)]!;
      },
      build: directBuild(cfg),
      onProgress: (p: GenerationProgress) => progress.push(p),
      signal: controller.signal,
      now: () => 1000,
    },
  };
}

describe('carte générée depuis un lieu', () => {
  it('une seule requête Overpass donne une carte jouable, au rayon demandé', async () => {
    const d = deps([grid]);
    const { place, fallbackReason } = await generatePlaceMap(target(), 400, d.value);
    expect(fallbackReason).toBeNull();
    expect(d.calls).toHaveLength(1);
    expect(d.progress.map((p) => p.step)).toEqual(['download', 'build']);
    expect(validateMap(place.map, config.mapRules)).toEqual([]);
    expect(place.info).toMatchObject({
      key: placeKey(FIXTURE_CENTER, 400),
      mapId: `place:${placeKey(FIXTURE_CENTER, 400)}`,
      name: 'Quartier du Test',
      radius: 400,
      requestedRadius: 400,
      imaginary: false,
      createdAt: 1000,
    });
    expect(place.map.id).toBe(place.info.mapId);
    expect(place.map.attribution).toContain('OpenStreetMap');
    // Zone de jeu à la taille du rayon (500 × 900 m pour 400 m).
    expect(place.map.bounds).toEqual({ minX: -250, minY: -450, maxX: 250, maxY: 450 });
  });

  it('même lieu et même rayon : même carte ; un autre rayon change la zone', async () => {
    const a = await generatePlaceMap(target(), 400, deps([grid]).value);
    const b = await generatePlaceMap(target(), 400, deps([grid]).value);
    expect(JSON.stringify(b.place.map)).toBe(JSON.stringify(a.place.map));
    const small = await generatePlaceMap(target(), 300, deps([grid]).value);
    expect(small.place.map.bounds.maxX).toBeCloseTo(187.5, 5);
    expect(small.place.info.key).not.toBe(a.place.info.key);
  });

  it('adresse précise : la base est le bâtiment à l’adresse, sinon le plus imposant', async () => {
    const baseCenter = async (precise: boolean) => {
      const { place } = await generatePlaceMap(target(precise), 400, deps([grid]).value);
      const base = place.map.buildings.find((b) => b.id === place.map.baseBuildingId)!;
      return { at: interiorPoint(base.footprint), info: place.info };
    };
    const precise = await baseCenter(true);
    expect(distance(precise.at, { x: 0, y: 0 })).toBeLessThan(2);
    expect(precise.info.baseAtAddress).toBe(true);
    const plain = await baseCenter(false);
    expect(distance(plain.at, { x: 100, y: 100 })).toBeLessThan(2);
    expect(plain.info.baseAtAddress).toBe(false);
  });

  it('base déplacée par le joueur : carte refaite sans réseau autour du bâtiment choisi', async () => {
    const { place } = await generatePlaceMap(target(), 400, deps([grid]).value);
    // Une maison au bord d'une rue, loin du grand magasin choisi d'abord.
    const house = place.map.buildings.find((b) => {
      const p = interiorPoint(b.footprint);
      return b.kind === 'house' && Math.abs(p.x - -64) < 1 && Math.abs(p.y - 110) < 1;
    })!;
    expect(house).toBeDefined();
    const moved = moveBase(place.map, house.id, config)!;
    expect(moved.map.baseBuildingId).toBe(house.id);
    expect(moved.map.id).toBe(place.map.id);
    expect(validateMap(moved.map, config.mapRules)).toEqual([]);
    // Mêmes rues et bâtiments ; la maison choisie n'a plus d'emplacement, l'ancienne base en a un.
    expect(moved.map.buildings).toEqual(place.map.buildings);
    expect(moved.map.slots.some((s) => s.buildingId === house.id)).toBe(false);
    expect(moved.map.slots.some((s) => s.buildingId === place.map.baseBuildingId)).toBe(true);
    expect(distance(moved.map.base, interiorPoint(house.footprint))).toBeLessThan(40);
    expect(withMovedBase(place.info, moved.report)).toMatchObject({ baseChosen: true, key: place.info.key, routes: moved.report.routes });
    // Un abri ou un bâtiment inconnu ne peut pas être la base.
    expect(moveBase(place.map, 123456, config)).toBeNull();
  });

  it('lieu sans assez de rues : la zone est agrandie, avec une nouvelle requête', async () => {
    const d = deps([empty, grid]);
    const { place, fallbackReason } = await generatePlaceMap(target(), 400, d.value);
    expect(fallbackReason).toBeNull();
    expect(d.calls).toHaveLength(2);
    expect(place.info.radius).toBe(500);
    expect(place.info.requestedRadius).toBe(400);
    expect(place.info.key).toBe(placeKey(FIXTURE_CENTER, 400));
    expect(d.progress[2]).toEqual({ step: 'download', radius: 500, enlarged: true });
  });

  it('itinéraires trop courts : la zone est agrandie aussi', async () => {
    const strict = testConfig((c) => (c.places.minAverageRouteLength = 100000));
    const d = deps([grid], strict);
    const { place, fallbackReason } = await generatePlaceMap(target(), 400, d.value);
    expect(d.calls).toHaveLength(3); // 400, 500, 600 m
    expect(fallbackReason).toMatch(/itinéraires trop courts/);
    expect(place.info.imaginary).toBe(true);
  });

  it('rien de jouable même agrandi : carte imaginaire de secours, jouable, avec la raison', async () => {
    const d = deps([empty]);
    const { place, fallbackReason } = await generatePlaceMap(target(), 400, d.value);
    expect(d.calls).toHaveLength(3);
    expect(d.progress.at(-1)).toEqual({ step: 'fallback' });
    expect(fallbackReason).toMatch(/aucune rue/);
    expect(place.info.imaginary).toBe(true);
    expect(place.info.mapId).toMatch(/^generated:/);
    expect(place.info.center).toEqual(FIXTURE_CENTER);
    expect(validateMap(place.map, config.mapRules)).toEqual([]);
  });

  it('les erreurs réseau remontent (le joueur peut réessayer) et l’annulation arrête tout', async () => {
    const failing = deps([grid]);
    failing.value.overpass = async () => {
      throw new OsmError('overpass', 'aucun serveur');
    };
    await expect(generatePlaceMap(target(), 400, failing.value)).rejects.toMatchObject({ code: 'overpass' });

    const cancelled = deps([grid]);
    cancelled.controller.abort();
    await expect(generatePlaceMap(target(), 400, cancelled.value)).rejects.toMatchObject({ code: 'aborted' });
    expect(cancelled.calls).toHaveLength(0);
  });

  it('une réponse illisible n’est pas une carte', () => {
    const result = buildPlaceMap({ place: { id: 'x', name: 'x', center: FIXTURE_CENTER }, responseText: '<html>' }, config);
    expect(result.ok).toBe(false);
  });
});

describe('bâtiments souterrains', () => {
  it('un parking ou une station souterraine n’est ni dessiné ni choisi comme base', () => {
    const square = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 40 }, { x: 0, y: 40 }];
    expect(isUnderground({ building: 'yes', layer: '-1' })).toBe(true);
    expect(isUnderground({ building: 'parking', parking: 'underground' })).toBe(true);
    expect(isUnderground({ building: 'train_station', location: 'underground' })).toBe(true);
    expect(isUnderground({ building: 'yes', layer: '1' })).toBe(false);
    expect(toBuilding(1, { building: 'yes', layer: '-2' }, square, config.osm, 4)).toBeNull();
    expect(toBuilding(1, { building: 'yes' }, square, config.osm, 4)).not.toBeNull();
  });
});

describe('bâtiments publics reconnaissables', () => {
  it('lieu de culte, mairie, école : d’après les étiquettes ou le nom', () => {
    expect(landmarkOf({ building: 'church' })).toBe('worship');
    expect(landmarkOf({ building: 'yes', amenity: 'place_of_worship' })).toBe('worship');
    expect(landmarkOf({ building: 'yes', name: 'Mosquée de Lyon' })).toBe('worship');
    expect(landmarkOf({ building: 'yes', name: 'Église Saint-Pierre' })).toBe('worship');
    expect(landmarkOf({ building: 'yes', name: 'Mairie' })).toBe('townhall');
    expect(landmarkOf({ building: 'yes', amenity: 'townhall' })).toBe('townhall');
    expect(landmarkOf({ building: 'school' })).toBe('school');
    expect(landmarkOf({ building: 'yes', name: 'Groupe scolaire Jules Ferry' })).toBe('school');
    expect(landmarkOf({ building: 'yes', name: 'Ecolettes' })).toBeNull();
    expect(landmarkOf({ building: 'house' })).toBeNull();
  });

  it('une église presque rectangulaire a un toit à deux pans', () => {
    const nave = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 15 }, { x: 0, y: 15 }];
    const church = toBuilding(1, { building: 'church' }, nave, config.osm, 4)!;
    expect(church).toMatchObject({ landmark: 'worship', roof: 'gable', kind: 'public' });
    expect(toBuilding(2, { building: 'church', 'roof:shape': 'flat' }, nave, config.osm, 4)!.roof).toBe('flat');
  });
});

describe('quartier imaginaire', () => {
  it('jouable, déterminé par la graine', () => {
    const real = testConfig();
    const a = imaginaryMap(1234, 400, 'Quartier imaginaire', real, 5);
    const b = imaginaryMap(1234, 400, 'Quartier imaginaire', real, 5);
    expect(validateMap(a.map, real.mapRules)).toEqual([]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.info).toMatchObject({ imaginary: true, mapId: 'generated:1234', name: 'Quartier imaginaire' });
    expect(a.map.trees.length).toBeGreaterThan(0);
  });
});
