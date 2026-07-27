/**
 * Admin alert sound — Web Audio chime (no asset file needed).
 * Browsers block audio until a user gesture; call unlockAdminAlertAudio() on first click.
 */

let audioCtx = null;
let unlocked = false;

function getCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new Ctx();
  }
  return audioCtx;
}

/** Call once after any admin click/key so later alerts can autoplay. */
export async function unlockAdminAlertAudio() {
  try {
    const ctx = getCtx();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    // Silent tick so Safari marks the context as user-activated
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const osc = ctx.createOscillator();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    unlocked = true;
    return true;
  } catch {
    return false;
  }
}

function tone(ctx, { freq, start, duration, volume = 0.22, type = 'sine' }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/**
 * Clear 3-beep alert (deposit/withdrawal). Louder + distinct.
 * @param {'deposit'|'withdrawal'|'default'} [kind]
 */
export async function playAdminAlertSound(kind = 'default') {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const t0 = ctx.currentTime + 0.02;
    const isWithdraw = kind === 'withdrawal';

    // Pattern: high-high-low for withdraw, mid-high-mid for deposit
    if (isWithdraw) {
      tone(ctx, { freq: 988, start: t0, duration: 0.14, volume: 0.28, type: 'triangle' });
      tone(ctx, { freq: 988, start: t0 + 0.16, duration: 0.14, volume: 0.26, type: 'triangle' });
      tone(ctx, { freq: 740, start: t0 + 0.34, duration: 0.28, volume: 0.3, type: 'sine' });
    } else {
      tone(ctx, { freq: 880, start: t0, duration: 0.12, volume: 0.26, type: 'sine' });
      tone(ctx, { freq: 1175, start: t0 + 0.14, duration: 0.12, volume: 0.28, type: 'sine' });
      tone(ctx, { freq: 1319, start: t0 + 0.3, duration: 0.22, volume: 0.3, type: 'triangle' });
    }

    unlocked = true;
  } catch {
    /* ignore */
  }
}

export function isAdminAlertAudioUnlocked() {
  return unlocked && audioCtx?.state === 'running';
}
