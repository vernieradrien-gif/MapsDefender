import { Capacitor, CapacitorHttp, type HttpResponse } from '@capacitor/core';
import { HttpStatusError, type HttpClient, type HttpOptions } from './osmClient';

// Accès au réseau selon la plateforme. Sur le web, le navigateur envoie la page
// d'origine (Referer) qui identifie l'appli auprès de Nominatim ; sur Android,
// la requête passe par le système avec un User-Agent StreetDefense.

export const USER_AGENT = 'StreetDefense (+https://github.com/vernieradrien-gif/MapsDefender)';

const FORM = 'application/x-www-form-urlencoded';

/** fetch, interrompu par l'annulation du joueur ou au bout du délai. */
export function fetchHttp(headers: Record<string, string> = {}): HttpClient {
  async function request(url: string, init: RequestInit, { signal, timeoutMs }: HttpOptions): Promise<string> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!res.ok) throw new HttpStatusError(res.status);
      return await res.text();
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
  return {
    getText: (url, options) => request(url, { headers }, options),
    postForm: (url, form, options) =>
      request(url, { method: 'POST', headers: { ...headers, 'Content-Type': FORM }, body: new URLSearchParams(form) }, options),
  };
}

/** Requêtes natives d'Android (Capacitor) ; l'annulation abandonne la réponse. */
function nativeHttp(version: string): HttpClient {
  const userAgent = `${USER_AGENT.replace('StreetDefense', `StreetDefense/${version}`)} Android`;
  async function request(options: HttpOptions, send: (timeoutMs: number) => Promise<HttpResponse>): Promise<string> {
    const { signal, timeoutMs } = options;
    const aborted = new Promise<never>((_, reject) => {
      if (signal.aborted) reject(new Error('annulé'));
      signal.addEventListener('abort', () => reject(new Error('annulé')), { once: true });
    });
    const res = await Promise.race([send(timeoutMs), aborted]);
    if (res.status < 200 || res.status >= 300) throw new HttpStatusError(res.status);
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  }
  const common = (timeoutMs: number) => ({ responseType: 'text' as const, connectTimeout: timeoutMs, readTimeout: timeoutMs });
  return {
    getText: (url, options) =>
      request(options, (t) => CapacitorHttp.get({ url, headers: { 'User-Agent': userAgent }, ...common(t) })),
    // Objet encodé en formulaire par Capacitor (clé=valeur échappées).
    postForm: (url, form, options) =>
      request(options, (t) =>
        CapacitorHttp.post({ url, headers: { 'User-Agent': userAgent, 'Content-Type': FORM }, data: form, ...common(t) }),
      ),
  };
}

export function createHttp(version: string): HttpClient {
  return Capacitor.isNativePlatform() ? nativeHttp(version) : fetchHttp();
}
