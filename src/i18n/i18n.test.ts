import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import { hasKey, t } from './index';

describe('i18n', () => {
  it('traduit une clé et remplace les paramètres', () => {
    expect(t('end.replay')).toBe('Rejouer');
    expect(t('hud.waveValue', { current: 3, total: 30 })).toBe('3/30');
  });

  it('renvoie la clé si elle est inconnue', () => {
    expect(t('cle.inexistante')).toBe('cle.inexistante');
  });

  it('chaque tour, ennemi et amélioration de la configuration a ses textes', () => {
    const config = loadConfig();
    for (const tower of config.towers) {
      expect(hasKey(`tower.${tower.id}.name`)).toBe(true);
      expect(hasKey(`tower.${tower.id}.role`)).toBe(true);
    }
    for (const enemy of config.enemies) expect(hasKey(`enemy.${enemy.id}.name`)).toBe(true);
    for (const u of config.progression.upgrades) {
      expect(hasKey(`upgrade.${u.id}.name`)).toBe(true);
      expect(hasKey(`upgrade.${u.id}.desc`)).toBe(true);
    }
  });

  it('chaque clé écrite en toutes lettres dans le code existe dans fr.json', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) files.push(path);
      }
    };
    walk('src');
    const missing: string[] = [];
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9.-]+)'/g)) {
        if (!hasKey(match[1]!)) missing.push(`${file} : ${match[1]}`);
      }
    }
    expect(files.length).toBeGreaterThan(30);
    expect(missing).toEqual([]);
  });
});
