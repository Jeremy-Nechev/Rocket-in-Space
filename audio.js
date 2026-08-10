/* Sound effects, synthesised with the Web Audio API so the game still ships as
   plain static files with no audio assets to load.

   Browsers refuse to start audio until the user interacts with the page, so
   nothing is built until Sound.unlock() is called from a real click or keypress. */

'use strict';

const Sound = (() => {
  let ctx = null;
  let master = null;
  let noise = null;          // shared white-noise buffer
  let thrustGain = null;     // envelope for the looping rocket rumble
  let thrusting = false;
  let muted = localStorage.getItem('rocket.muted') === '1';

  const VOL = 0.85;
  const now = () => ctx.currentTime;

  function build() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    // a limiter keeps a coin ping on top of a thrust loop from clipping
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;

    master = ctx.createGain();
    master.gain.value = muted ? 0 : VOL;
    master.connect(limiter);
    limiter.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 2);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    buildThrust();
  }

  // Rocket: filtered noise for the exhaust hiss plus a low sawtooth for the
  // engine rumble. Runs continuously and is faded in and out by its envelope,
  // which is far cheaper than restarting nodes on every keypress.
  function buildThrust() {
    thrustGain = ctx.createGain();
    thrustGain.gain.value = 0;
    thrustGain.connect(master);

    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.7;
    const tame = ctx.createBiquadFilter();
    tame.type = 'lowpass';
    tame.frequency.value = 1400;
    hiss.connect(band);
    band.connect(tame);
    tame.connect(thrustGain);
    hiss.start();

    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.value = 56;
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 220;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.5;
    rumble.connect(soften);
    soften.connect(rumbleGain);
    rumbleGain.connect(thrustGain);
    rumble.start();
  }

  function tone(t, freq, dur, vol, type = 'triangle', endFreq = null) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  // noise through a sweeping bandpass — the basis of both the woosh and the
  // strike transient on the bong
  function swept(t, dur, fromHz, toHz, vol, q, attack) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = q;
    band.frequency.setValueAtTime(fromHz, t);
    band.frequency.exponentialRampToValueAtTime(toHz, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(band);
    band.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 1.5);   // random offset so repeats differ
    src.stop(t + dur + 0.05);
  }

  return {
    get muted() { return muted; },

    unlock() {
      build();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },

    // called every frame; only touches the envelope when the state changes
    thrust(on) {
      if (!ctx || on === thrusting) return;
      thrusting = on;
      const t = now();
      thrustGain.gain.cancelScheduledValues(t);
      thrustGain.gain.setValueAtTime(thrustGain.gain.value, t);
      thrustGain.gain.linearRampToValueAtTime(on ? 0.16 : 0.0001, t + (on ? 0.07 : 0.16));
    },

    // bright two-note arcade ping
    coin() {
      if (!ctx) return;
      const t = now();
      tone(t, 1318.5, 0.08, 0.2, 'square');          // E6
      tone(t + 0.07, 1975.5, 0.26, 0.2, 'square');   // B6
    },

    // long descending woosh with a falling tone under it
    woosh() {
      if (!ctx) return;
      const t = now();
      swept(t, 0.9, 2600, 90, 0.45, 3.5, 0.12);
      tone(t, 320, 0.85, 0.22, 'sine', 38);
    },

    // struck bell: inharmonic partials at roughly 1 : 2.76 : 5.4, long decay
    bong() {
      if (!ctx) return;
      const t = now();
      tone(t, 146, 1.5, 0.26, 'sine');
      tone(t, 403, 1.1, 0.1, 'sine');
      tone(t, 789, 0.7, 0.05, 'sine');
      swept(t, 0.06, 2600, 700, 0.18, 1, 0.002);   // hammer strike
    },

    toggleMute() {
      muted = !muted;
      localStorage.setItem('rocket.muted', muted ? '1' : '0');
      if (master) {
        const t = now();
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(master.gain.value, t);
        master.gain.linearRampToValueAtTime(muted ? 0.0001 : VOL, t + 0.08);
      }
      return muted;
    }
  };
})();
