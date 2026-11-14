import { supabase } from "./supabase";

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isGeinstalleerd = () => window.matchMedia("(display-mode: standalone)").matches
  || window.navigator.standalone === true;
export const pushKan = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/* "aan" | "uit" | "geblokkeerd" | "eerst-installeren" | "niet-mogelijk" */
export async function pushStatus() {
  if (!pushKan()) return isIOS() && !isGeinstalleerd() ? "eerst-installeren" : "niet-mogelijk";
  if (Notification.permission === "denied") return "geblokkeerd";
  if (Notification.permission !== "granted") return "uit";
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ? "aan" : "uit";
}

const naarBytes = (b64) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function bewaar(sub) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc("bewaar_push",
    { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  if (error) throw error;
}

export async function zetPushAan() {
  if (!pushKan()) throw new Error("Meldingen werken op dit toestel pas nadat je de app hebt geïnstalleerd.");
  const toestemming = await Notification.requestPermission();
  if (toestemming !== "granted") throw new Error("Je hebt meldingen niet toegestaan.");
  const { data: sleutel, error } = await supabase.rpc("vapid_public_key");
  if (error || !sleutel) throw new Error("Meldingen zijn nog niet ingesteld.");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: naarBytes(sleutel) });
  await bewaar(sub);
}

export async function zetPushUit() {
  if (!pushKan()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc("verwijder_push", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}

/* Bij elke start: staat de toestemming aan, zorg dat de server het actuele adres kent. */
export async function syncPush() {
  try {
    if (!pushKan() || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await bewaar(sub);
  } catch { /* geen ramp */ }
}
