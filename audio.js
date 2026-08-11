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
  let musicBus = null;       // master fader for the ambient bed
  let voiceOut = null;       // everything musical goes in here, dry + reverb
  let twinkleTimer = null;
  let muted = localStorage.getItem('rocket.muted') === '1';

  const VOL = 0.85;
  const MUSIC_VOL = 0.5;
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
    buildMusic();
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

  // -------------------------------------------------------------------------
  // Ambient music. Generated rather than looped: a low drone, a slow-breathing
  // chord, and occasional bell notes from one scale. Nothing repeats exactly,
  // because every layer drifts on its own timer.
  // -------------------------------------------------------------------------

  // A minor pentatonic — no semitone clashes, so notes can overlap freely in
  // the long reverb tail without ever sounding wrong together.
  const SCALE = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
  const CHORD = [110, 164.81, 261.63, 329.63];   // Am spread wide

  // convolution reverb from an exponentially decaying noise burst — this is what
  // makes it read as "space" rather than "four oscillators"
  function reverb(seconds, decay) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  function buildMusic() {
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.0001;
    musicBus.connect(master);

    voiceOut = ctx.createGain();

    const dry = ctx.createGain();
    dry.gain.value = 0.5;
    voiceOut.connect(dry);
    dry.connect(musicBus);

    const wet = ctx.createGain();
    wet.gain.value = 0.85;                       // heavy on the reverb
    const conv = reverb(4.5, 2.2);
    voiceOut.connect(conv);
    conv.connect(wet);
    wet.connect(musicBus);

    droneVoice(55, 0.05);                        // A1
    droneVoice(82.41, 0.035);                    // E2, a fifth up
    for (let i = 0; i < CHORD.length; i++) padVoice(CHORD[i], 0.05, 0.017 + i * 0.011);
  }

  // low sustained rumble with a slowly wandering filter
  function droneVoice(freq, vol) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 150;
    const g = ctx.createGain();
    g.gain.value = vol;
    o.connect(lp);
    lp.connect(g);
    g.connect(voiceOut);
    o.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.02 + Math.random() * 0.03;   // one sweep per ~40s
    const amt = ctx.createGain();
    amt.gain.value = 70;
    lfo.connect(amt);
    amt.connect(lp.frequency);
    lfo.start();
  }

  // one chord note that fades in and out on its own very slow cycle, so the
  // chord is never fully present and never fully gone
  function padVoice(freq, vol, lfoHz) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    o.detune.value = (Math.random() * 2 - 1) * 6;        // gentle beating
    const g = ctx.createGain();
    g.gain.value = vol / 2;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = lfoHz;                         // 60s+ per cycle
    const amt = ctx.createGain();
    amt.gain.value = vol / 2;                            // swings the gain 0..vol
    lfo.connect(amt);
    amt.connect(g.gain);
    lfo.start();

    o.connect(g);
    g.connect(voiceOut);
    o.start();
  }

  // a single bell note, swelling in and ringing out into the reverb
  function twinkle() {
    const t = now() + 0.05;
    const f = SCALE[Math.floor(Math.random() * SCALE.length)];
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1, t + 1.1);        // slow swell, no attack click
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    o.connect(g);
    g.connect(voiceOut);
    o.start(t);
    o.stop(t + 5.1);
  }

  function scheduleTwinkle() {
    clearTimeout(twinkleTimer);
    twinkleTimer = setTimeout(() => {
      twinkle();
      scheduleTwinkle();
    }, 3500 + Math.random() * 6000);
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
      const first = !ctx;
      build();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (first) this.music(true);   // ambience starts with the first interaction
    },

    // fades the music bed in or out; also parks the bell scheduler
    music(on) {
      if (!ctx) return;
      const t = now();
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setValueAtTime(musicBus.gain.value, t);
      musicBus.gain.linearRampToValueAtTime(on ? MUSIC_VOL : 0.0001, t + (on ? 3 : 0.5));
      if (on) scheduleTwinkle();
      else clearTimeout(twinkleTimer);
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
