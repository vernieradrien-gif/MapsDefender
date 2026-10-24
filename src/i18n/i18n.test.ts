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

  it('chaque tour et chaque ennemi de la configuration a un nom traduit', () => {
    const config = loadConfig();
    for (const tower of config.towers) expect(hasKey(`tower.${tower.id}.name`)).toBe(true);
    for (const enemy of config.enemies) expect(hasKey(`enemy.${enemy.id}.name`)).toBe(true);
  });
});
