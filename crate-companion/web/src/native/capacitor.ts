import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

/**
 * The Android (and later iOS) app's bridge: gives the core a native network function
 * (Discogs blocks writes from web pages), storage on the device, the system browser for
 * "Connect with Discogs", the barcode scanner and keep-awake. Must be imported before
 * anything that imports ../api (see main.tsx).
 */

/** Where Discogs sends the user back after approving. Matches the intent filter in AndroidManifest.xml. */
export const CALLBACK = 'cratecompanion://auth';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** fetch() on top of the native HTTP client. Enough for the core: method, headers, text or image bodies. */
async function nativeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const headers: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => { headers[k] = v; });
  const image = new URL(url).hostname === 'i.discogs.com';
  const json = (headers['content-type'] ?? '').includes('application/json');
  const res = await CapacitorHttp.request({
    url, method: init?.method ?? 'GET', headers,
    data: typeof init?.body === 'string' ? (json ? JSON.parse(init.body) : init.body) : undefined,
    responseType: image ? 'blob' : 'text',
  });
  let body: BodyInit | null = image && typeof res.data === 'string'
    ? base64ToBytes(res.data) as unknown as BodyInit
    : typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
  if (res.status === 204 || res.status === 304) body = null;
  return new Response(body, { status: res.status, headers: res.headers });
}

async function scanBarcode(): Promise<string | null> {
  const { supported } = await BarcodeScanner.isSupported();
  if (!supported) throw new Error('This phone has no camera that can scan barcodes. Type the numbers instead.');
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    await BarcodeScanner.installGoogleBarcodeScannerModule();
    throw new Error('Getting the barcode scanner from Google Play. Try again in a moment.');
  }
  const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.Ean13, BarcodeFormat.UpcA, BarcodeFormat.Ean8, BarcodeFormat.UpcE] });
  return barcodes[0]?.rawValue ?? barcodes[0]?.displayValue ?? null;
}

/** Back from discogs.com: reload the app with the sign-in parameters; main.tsx finishes it. */
function handleReturn(url: string) {
  if (!url.startsWith(CALLBACK)) return;
  void Browser.close().catch(() => undefined);
  const q = url.slice(url.indexOf('?'));
  window.location.href = `/${q.startsWith('?') ? q : ''}`;
}

if (Capacitor.isNativePlatform()) {
  window.crateNative = {
    fetch: nativeFetch as typeof fetch,
    store: {
      get: async (key) => (await Preferences.get({ key })).value,
      set: async (key, value) => { await Preferences.set({ key, value }); },
      remove: async (key) => { await Preferences.remove({ key }); },
    },
    openExternal: (url) => { void Browser.open({ url }); },
    callbackUrl: CALLBACK,
    scanBarcode,
    keepAwake: (on) => { void (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()).catch(() => undefined); },
  };
  void App.addListener('appUrlOpen', ({ url }) => handleReturn(url));
  // If Android closed the app while the user was on discogs.com, it starts again with the link.
  void App.getLaunchUrl().then((r) => { if (r?.url && !window.location.search.includes('oauth_')) handleReturn(r.url); });
}
