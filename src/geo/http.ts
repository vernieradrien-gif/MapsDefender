import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { HttpStatusError, type HttpClient } from './osmClient';

// Accès au réseau selon la plateforme. Sur le web, le navigateur envoie la page
// d'origine (Referer) qui identifie l'appli auprès de Nominatim ; sur Android,
// la requête passe par le système avec un User-Agent StreetDefense.

export const USER_AGENT = 'StreetDefense (+https://github.com/vernieradrien-gif/MapsDefender)';

/** fetch, interrompu par l'annulation du joueur ou au bout du délai. */
export function fetchHttp(headers: Record<string, string> = {}): HttpClient {
  return {
    async getText(url, { signal, timeoutMs }) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      const timer = setTimeout(abort, timeoutMs);
      signal.addEventListener('abort', abort, { once: true });
      try {
        const res = await fetch(url, { headers, signal: controller.signal });
        if (!res.ok) throw new HttpStatusError(res.status);
        return await res.text();
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      }
    },
  };
}

/** Requêtes natives d'Android (Capacitor) ; l'annulation abandonne la réponse. */
function nativeHttp(version: string): HttpClient {
  return {
    async getText(url, { signal, timeoutMs }) {
      const request = CapacitorHttp.get({
        url,
        headers: { 'User-Agent': `${USER_AGENT.replace('StreetDefense', `StreetDefense/${version}`)} Android` },
        responseType: 'text',
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });
      const aborted = new Promise<never>((_, reject) => {
        if (signal.aborted) reject(new Error('annulé'));
        signal.addEventListener('abort', () => reject(new Error('annulé')), { once: true });
      });
      const res = await Promise.race([request, aborted]);
      if (res.status < 200 || res.status >= 300) throw new HttpStatusError(res.status);
      return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    },
  };
}

export function createHttp(version: string): HttpClient {
  return Capacitor.isNativePlatform() ? nativeHttp(version) : fetchHttp();
}
