/**
 * utils/keyFeedback.ts — Fase V, Módulo V0 (spec_rediseno_visual.md §8).
 *
 * Feedback táctil/sonoro al presionar una tecla del teclado virtual.
 * Mismo mecanismo de persistencia que el resto de Ajustes (localStorage),
 * pero SIN atributo en <html> — a diferencia de tema/densidad/tamaño de
 * texto, la única consumidora de estas dos preferencias es esta misma
 * función, invocada directamente en cada pulsación, no un selector CSS.
 *
 * Vibración: DEDUCIBLE — el spec no fija un default explícito (solo dice
 * "verificar soporte antes de invocar, degradar silenciosamente si no
 * está disponible"). Se asume activada por defecto, patrón estándar de
 * teclados físicos/apps de calculadora móvil — el usuario la apaga si no
 * la quiere. Se exige ADEMÁS soporte de la Vibration API Y dispositivo
 * táctil real (`maxTouchPoints`/`ontouchstart`) antes de invocar — nunca
 * vibra en desktop con mouse, aunque el navegador exponga `vibrate()`.
 *
 * Sonido: apagado por defecto, EXPLÍCITO en el spec ("no debe sonar sin
 * que el usuario lo active"). Clic sintetizado con Web Audio API (blip
 * corto) — sin archivo de audio que cargar ni empaquetar.
 */

const VIBRATION_STORAGE_KEY = "precision-lab-key-vibration";
const SOUND_STORAGE_KEY = "precision-lab-key-sound";

export function isTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.maxTouchPoints > 0 || (typeof window !== "undefined" && "ontouchstart" in window);
}

export function readVibrationEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  const stored = localStorage.getItem(VIBRATION_STORAGE_KEY);
  // Ausente = nunca tocado por el usuario → default "activado" (ver
  // comentario de cabecera). Solo "false" explícito lo desactiva.
  return stored === null ? true : stored === "true";
}

export function setVibrationEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(VIBRATION_STORAGE_KEY, String(enabled));
}

export function readSoundEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(SOUND_STORAGE_KEY) === "true";
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
}

let sharedAudioCtx: AudioContext | null = null;

function playClick(): void {
  try {
    const AudioCtxCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxCtor) return;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtxCtor();
    if (sharedAudioCtx.state === "suspended") void sharedAudioCtx.resume();
    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();
    osc.type = "square";
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.06, sharedAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, sharedAudioCtx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(sharedAudioCtx.destination);
    osc.start();
    osc.stop(sharedAudioCtx.currentTime + 0.04);
  } catch {
    // Degradación silenciosa — el sonido nunca debe romper la pulsación.
  }
}

/**
 * Llamar una vez por cada botón del teclado virtual que el usuario
 * presiona (delegación de eventos en el contenedor de cada teclado — ver
 * `handleKeyboardClickCapture` en NaturalMathKeyboard.tsx,
 * KeyboardBasicPanel.tsx y SimpleKeyboard.tsx). No sabe ni le importa qué
 * tecla fue ni si la acción tuvo éxito (ej. tecla "unavailable") — el
 * spec pide feedback físico de la pulsación en sí, no del resultado.
 */
export function triggerKeyFeedback(): void {
  if (isTouchDevice() && typeof navigator !== "undefined" && "vibrate" in navigator && readVibrationEnabled()) {
    try {
      navigator.vibrate(15);
    } catch {
      // Degradación silenciosa — algunos navegadores exponen `vibrate`
      // sin soporte real, o lo rechazan fuera de un gesto de usuario.
    }
  }
  if (readSoundEnabled()) playClick();
}
