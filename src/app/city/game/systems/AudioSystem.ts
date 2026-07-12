import * as Phaser from "phaser";

/**
 * AudioSystem — owns all procedural music + SFX.
 *
 * Extracted verbatim from WorldScene (Phase 1 of PERFORMANCE_PLAN.md). All
 * music is synthesized at runtime via the Web Audio API (no audio assets
 * ship with the app). The system owns the AudioContext/GainNode lifecycle and
 * exposes them via getters so other subsystems (notably the arena zone's
 * combat SFX) can reuse the shared context.
 *
 * Lifecycle:
 *   - `init()`         — call from the scene's `create()`; creates the context,
 *                         starts the first track, and registers the
 *                         toggle/skip/prev window listeners.
 *   - `cleanup()`      — call from the scene's `shutdown`/`destroy`; tears down
 *                         the context, clears the loop timeout, and removes
 *                         the window listeners.
 */
export class AudioSystem {
  private scene: Phaser.Scene;

  private musicPlaying = false;
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private musicInterval: number | null = null;
  private activeOscillators: OscillatorNode[] = [];
  private currentTrack = 0;
  private readonly trackNames = [
    "Adventure",
    "Bags Anthem",
    "Night Market",
    "Victory March",
    "Route 101",
    "Pokemon Center",
    "Mystery Dungeon",
  ];

  // Stored bound handlers for safe removal on cleanup.
  private boundToggleMusic: (() => void) | null = null;
  private boundSkipTrack: (() => void) | null = null;
  private boundPrevTrack: (() => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // ── Public accessors for shared audio context ───────────────────────────

  /** Shared AudioContext — created on init(); null after cleanup. */
  get context(): AudioContext | null {
    return this.audioContext;
  }

  /** Shared master gain node — created on init(); null after cleanup. */
  get masterGain(): GainNode | null {
    return this.gainNode;
  }

  /**
   * Lazily ensure a shared AudioContext + master gain exist, then return the
   * context. Used by the arena zone's combat SFX, which may run before/after
   * the music engine boots. Returns null if the platform blocks AudioContext.
   */
  ensureContext(): AudioContext | null {
    if (this.audioContext) return this.audioContext;
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = 0.3;
    } catch {
      return null;
    }
    return this.audioContext;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /** Boot music: create the AudioContext + master gain and start track 0. */
  init(): void {
    this.startPokemonMusic();

    this.boundToggleMusic = () => this.toggleMusic();
    window.addEventListener("agencity-toggle-music", this.boundToggleMusic);

    this.boundSkipTrack = () => this.skipTrack();
    window.addEventListener("agencity-skip-track", this.boundSkipTrack);

    this.boundPrevTrack = () => this.prevTrack();
    window.addEventListener("agencity-prev-track", this.boundPrevTrack);
  }

  /** Tear down everything: listeners, loop timeout, oscillators, context. */
  cleanup(): void {
    if (this.boundToggleMusic) {
      window.removeEventListener("agencity-toggle-music", this.boundToggleMusic);
      this.boundToggleMusic = null;
    }
    if (this.boundSkipTrack) {
      window.removeEventListener("agencity-skip-track", this.boundSkipTrack);
      this.boundSkipTrack = null;
    }
    if (this.boundPrevTrack) {
      window.removeEventListener("agencity-prev-track", this.boundPrevTrack);
      this.boundPrevTrack = null;
    }

    if (this.musicInterval) {
      clearTimeout(this.musicInterval);
      this.musicInterval = null;
    }
    if (this.audioContext) {
      this.stopAllOscillators();
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  // ── Music engine ────────────────────────────────────────────────────────

  private startPokemonMusic(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = 0.08; // Very low volume for ambient background

      this.playCurrentTrack();
      this.musicPlaying = true;
      this.emitTrackChange();
    } catch {
      // Audio not supported
    }
  }

  private emitTrackChange(): void {
    window.dispatchEvent(
      new CustomEvent("agencity-track-changed", {
        detail: { trackName: this.trackNames[this.currentTrack], trackIndex: this.currentTrack },
      })
    );
  }

  private stopAllOscillators(): void {
    // Stop all active oscillators immediately to prevent overlap
    this.activeOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Oscillator may have already stopped
      }
    });
    this.activeOscillators = [];
  }

  private playCurrentTrack(): void {
    // Clear any existing scheduled track to prevent overlapping
    if (this.musicInterval) {
      clearTimeout(this.musicInterval);
      this.musicInterval = null;
    }

    // Stop all currently playing oscillators
    this.stopAllOscillators();

    switch (this.currentTrack) {
      case 0:
        this.playPokemonMelody();
        break;
      case 1:
        this.playBagsAnthem();
        break;
      case 2:
        this.playNightMarket();
        break;
      case 3:
        this.playVictoryMarch();
        break;
      case 4:
        this.playRoute101();
        break;
      case 5:
        this.playPokemonCenter();
        break;
      case 6:
        this.playMysteryDungeon();
        break;
      default:
        this.playPokemonMelody();
    }
  }

  private skipTrack(): void {
    // Stop current melody
    if (this.musicInterval) {
      clearTimeout(this.musicInterval);
      this.musicInterval = null;
    }

    // Move to next track
    this.currentTrack = (this.currentTrack + 1) % this.trackNames.length;
    this.emitTrackChange();

    // Play new track if music is on
    if (this.musicPlaying && this.audioContext && this.gainNode) {
      this.playCurrentTrack();
    }
  }

  private prevTrack(): void {
    // Stop current melody
    if (this.musicInterval) {
      clearTimeout(this.musicInterval);
      this.musicInterval = null;
    }

    // Move to previous track (wrap around)
    this.currentTrack = (this.currentTrack - 1 + this.trackNames.length) % this.trackNames.length;
    this.emitTrackChange();

    // Play new track if music is on
    if (this.musicPlaying && this.audioContext && this.gainNode) {
      this.playCurrentTrack();
    }
  }

  private playPokemonMelody(): void {
    if (!this.audioContext || !this.gainNode) return;

    // Ambient, relaxed pentatonic melody - much longer and less repetitive
    // Slower tempo, longer notes, more space between phrases
    const notes = [
      // Phrase 1 - gentle opening
      { freq: 392.0, duration: 0.8 }, // G4
      { freq: 440.0, duration: 0.6 }, // A4
      { freq: 523.25, duration: 1.0 }, // C5
      { freq: 0, duration: 0.8 }, // Rest
      { freq: 440.0, duration: 0.6 }, // A4
      { freq: 392.0, duration: 0.8 }, // G4
      { freq: 329.63, duration: 1.2 }, // E4
      { freq: 0, duration: 1.0 }, // Long rest

      // Phrase 2 - variation
      { freq: 329.63, duration: 0.6 }, // E4
      { freq: 392.0, duration: 0.8 }, // G4
      { freq: 440.0, duration: 1.0 }, // A4
      { freq: 0, duration: 0.6 }, // Rest
      { freq: 523.25, duration: 0.8 }, // C5
      { freq: 440.0, duration: 0.6 }, // A4
      { freq: 392.0, duration: 1.2 }, // G4
      { freq: 0, duration: 1.2 }, // Long rest

      // Phrase 3 - descending
      { freq: 523.25, duration: 0.8 }, // C5
      { freq: 440.0, duration: 0.8 }, // A4
      { freq: 392.0, duration: 0.8 }, // G4
      { freq: 329.63, duration: 1.0 }, // E4
      { freq: 0, duration: 0.8 }, // Rest
      { freq: 293.66, duration: 0.6 }, // D4
      { freq: 261.63, duration: 1.4 }, // C4
      { freq: 0, duration: 1.5 }, // Long rest

      // Phrase 4 - resolution
      { freq: 261.63, duration: 0.8 }, // C4
      { freq: 329.63, duration: 0.6 }, // E4
      { freq: 392.0, duration: 1.0 }, // G4
      { freq: 0, duration: 0.5 }, // Rest
      { freq: 440.0, duration: 0.8 }, // A4
      { freq: 392.0, duration: 1.2 }, // G4
      { freq: 0, duration: 2.0 }, // Very long rest before loop
    ];

    // Soft, sustained bass notes (much quieter)
    const bass = [
      { freq: 130.81, duration: 3.0 }, // C3
      { freq: 0, duration: 1.0 },
      { freq: 110.0, duration: 3.0 }, // A2
      { freq: 0, duration: 1.0 },
      { freq: 98.0, duration: 3.0 }, // G2
      { freq: 0, duration: 1.0 },
      { freq: 130.81, duration: 4.0 }, // C3
      { freq: 0, duration: 2.0 },
      { freq: 110.0, duration: 3.0 }, // A2
      { freq: 0, duration: 1.5 },
      { freq: 98.0, duration: 3.0 }, // G2
      { freq: 0, duration: 2.5 },
    ];

    let time = this.audioContext.currentTime + 0.1;
    const totalDuration = notes.reduce((sum, n) => sum + n.duration, 0);

    // Play melody with sine waves
    notes.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, time, note.duration * 0.85, 0.08, "sine");
      }
      time += note.duration;
    });

    // Play bass with triangle waves (very quiet)
    let bassTime = this.audioContext.currentTime + 0.1;
    bass.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, bassTime, note.duration * 0.9, 0.04, "triangle");
      }
      bassTime += note.duration;
    });

    // Loop with extra pause
    this.musicInterval = window.setTimeout(
      () => {
        if (this.musicPlaying) {
          this.playCurrentTrack();
        }
      },
      (totalDuration + 2) * 1000
    );
  }

  // Track 2: Bags Anthem - Gentle, uplifting
  private playBagsAnthem(): void {
    if (!this.audioContext || !this.gainNode) return;

    // Gentle uplifting melody - longer phrases, more space
    const notes = [
      { freq: 329.63, duration: 0.8 }, // E4
      { freq: 392.0, duration: 0.6 }, // G4
      { freq: 493.88, duration: 1.0 }, // B4
      { freq: 0, duration: 0.6 }, // Rest
      { freq: 440.0, duration: 0.8 }, // A4
      { freq: 392.0, duration: 0.6 }, // G4
      { freq: 329.63, duration: 1.2 }, // E4
      { freq: 0, duration: 1.0 }, // Long rest

      { freq: 392.0, duration: 0.6 }, // G4
      { freq: 440.0, duration: 0.8 }, // A4
      { freq: 493.88, duration: 0.8 }, // B4
      { freq: 523.25, duration: 1.0 }, // C5
      { freq: 0, duration: 0.8 }, // Rest
      { freq: 493.88, duration: 0.6 }, // B4
      { freq: 440.0, duration: 0.8 }, // A4
      { freq: 392.0, duration: 1.2 }, // G4
      { freq: 0, duration: 1.2 }, // Long rest

      { freq: 329.63, duration: 0.8 }, // E4
      { freq: 293.66, duration: 0.6 }, // D4
      { freq: 329.63, duration: 1.0 }, // E4
      { freq: 392.0, duration: 1.2 }, // G4
      { freq: 0, duration: 2.0 }, // Very long rest
    ];

    const bass = [
      { freq: 164.81, duration: 3.5 }, // E3
      { freq: 0, duration: 1.0 },
      { freq: 130.81, duration: 3.5 }, // C3
      { freq: 0, duration: 1.0 },
      { freq: 146.83, duration: 3.0 }, // D3
      { freq: 0, duration: 1.0 },
      { freq: 164.81, duration: 3.5 }, // E3
      { freq: 0, duration: 2.0 },
    ];

    let time = this.audioContext.currentTime + 0.1;
    const totalDuration = notes.reduce((sum, n) => sum + n.duration, 0);

    notes.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, time, note.duration * 0.85, 0.07, "sine");
      }
      time += note.duration;
    });

    let bassTime = this.audioContext.currentTime + 0.1;
    bass.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, bassTime, note.duration * 0.9, 0.03, "triangle");
      }
      bassTime += note.duration;
    });

    this.musicInterval = window.setTimeout(
      () => {
        if (this.musicPlaying) {
          this.playCurrentTrack();
        }
      },
      (totalDuration + 2) * 1000
    );
  }

  // Track 3: Night Market - Chill, ambient
  private playNightMarket(): void {
    if (!this.audioContext || !this.gainNode) return;

    // Chill ambient melody - very spacious and relaxed
    const notes = [
      { freq: 293.66, duration: 1.2 }, // D4
      { freq: 0, duration: 0.8 }, // Rest
      { freq: 329.63, duration: 1.0 }, // E4
      { freq: 392.0, duration: 1.4 }, // G4
      { freq: 0, duration: 1.2 }, // Long rest

      { freq: 440.0, duration: 1.0 }, // A4
      { freq: 392.0, duration: 0.8 }, // G4
      { freq: 329.63, duration: 1.4 }, // E4
      { freq: 0, duration: 1.0 }, // Rest

      { freq: 293.66, duration: 0.8 }, // D4
      { freq: 261.63, duration: 1.2 }, // C4
      { freq: 0, duration: 1.5 }, // Long rest

      { freq: 329.63, duration: 1.0 }, // E4
      { freq: 293.66, duration: 0.8 }, // D4
      { freq: 261.63, duration: 1.6 }, // C4
      { freq: 0, duration: 2.0 }, // Very long rest

      { freq: 392.0, duration: 1.2 }, // G4
      { freq: 329.63, duration: 1.0 }, // E4
      { freq: 293.66, duration: 1.4 }, // D4
      { freq: 0, duration: 2.5 }, // Extra long rest before loop
    ];

    const pad = [
      { freq: 130.81, duration: 4.0 }, // C3
      { freq: 0, duration: 1.5 },
      { freq: 110.0, duration: 4.0 }, // A2
      { freq: 0, duration: 1.5 },
      { freq: 98.0, duration: 4.0 }, // G2
      { freq: 0, duration: 1.5 },
      { freq: 130.81, duration: 5.0 }, // C3
      { freq: 0, duration: 2.0 },
    ];

    let time = this.audioContext.currentTime + 0.1;
    const totalDuration = notes.reduce((sum, n) => sum + n.duration, 0);

    notes.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, time, note.duration * 0.9, 0.06, "sine");
      }
      time += note.duration;
    });

    let padTime = this.audioContext.currentTime + 0.1;
    pad.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, padTime, note.duration * 0.95, 0.03, "sine");
      }
      padTime += note.duration;
    });

    this.musicInterval = window.setTimeout(
      () => {
        if (this.musicPlaying) {
          this.playCurrentTrack();
        }
      },
      (totalDuration + 2) * 1000
    );
  }

  // Track 4: Victory March - Gentle, hopeful
  private playVictoryMarch(): void {
    if (!this.audioContext || !this.gainNode) return;

    // Gentle hopeful melody - uplifting but calm
    const notes = [
      { freq: 392.0, duration: 1.0 }, // G4
      { freq: 440.0, duration: 0.8 }, // A4
      { freq: 493.88, duration: 1.2 }, // B4
      { freq: 0, duration: 0.8 }, // Rest

      { freq: 523.25, duration: 1.0 }, // C5
      { freq: 493.88, duration: 0.8 }, // B4
      { freq: 440.0, duration: 1.2 }, // A4
      { freq: 0, duration: 1.0 }, // Long rest

      { freq: 392.0, duration: 0.8 }, // G4
      { freq: 329.63, duration: 0.8 }, // E4
      { freq: 392.0, duration: 1.0 }, // G4
      { freq: 440.0, duration: 1.4 }, // A4
      { freq: 0, duration: 1.2 }, // Long rest

      { freq: 493.88, duration: 1.0 }, // B4
      { freq: 523.25, duration: 1.2 }, // C5
      { freq: 0, duration: 0.6 }, // Rest
      { freq: 493.88, duration: 0.8 }, // B4
      { freq: 440.0, duration: 1.0 }, // A4
      { freq: 392.0, duration: 1.6 }, // G4
      { freq: 0, duration: 2.5 }, // Very long rest before loop
    ];

    const bass = [
      { freq: 196.0, duration: 4.0 }, // G3
      { freq: 0, duration: 1.0 },
      { freq: 130.81, duration: 4.0 }, // C3
      { freq: 0, duration: 1.0 },
      { freq: 164.81, duration: 3.5 }, // E3
      { freq: 0, duration: 1.5 },
      { freq: 196.0, duration: 5.0 }, // G3
      { freq: 0, duration: 2.0 },
    ];

    let time = this.audioContext.currentTime + 0.1;
    const totalDuration = notes.reduce((sum, n) => sum + n.duration, 0);

    notes.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, time, note.duration * 0.85, 0.07, "sine");
      }
      time += note.duration;
    });

    let bassTime = this.audioContext.currentTime + 0.1;
    bass.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, bassTime, note.duration * 0.9, 0.03, "triangle");
      }
      bassTime += note.duration;
    });

    this.musicInterval = window.setTimeout(
      () => {
        if (this.musicPlaying) {
          this.playCurrentTrack();
        }
      },
      (totalDuration + 2) * 1000
    );
  }

  // Track 5: Route 101 - Cheerful walking/exploration theme
  private playRoute101(): void {
    if (!this.audioContext || !this.gainNode) return;

    // Cheerful, bouncy melody - reminiscent of Pokemon routes
    const notes = [
      // Opening phrase - bright and cheerful
      { freq: 523.25, duration: 0.4 }, // C5
      { freq: 587.33, duration: 0.4 }, // D5
      { freq: 659.25, duration: 0.6 }, // E5
      { freq: 0, duration: 0.3 }, // Rest
      { freq: 587.33, duration: 0.4 }, // D5
      { freq: 523.25, duration: 0.6 }, // C5
      { freq: 0, duration: 0.5 }, // Rest

      // Second phrase - playful variation
      { freq: 440.0, duration: 0.4 }, // A4
      { freq: 523.25, duration: 0.4 }, // C5
      { freq: 587.33, duration: 0.5 }, // D5
      { freq: 659.25, duration: 0.7 }, // E5
      { freq: 0, duration: 0.6 }, // Rest

      // Third phrase - descending
      { freq: 659.25, duration: 0.4 }, // E5
      { freq: 587.33, duration: 0.4 }, // D5
      { freq: 523.25, duration: 0.4 }, // C5
      { freq: 440.0, duration: 0.6 }, // A4
      { freq: 0, duration: 0.8 }, // Rest

      // Resolution phrase
      { freq: 392.0, duration: 0.5 }, // G4
      { freq: 440.0, duration: 0.4 }, // A4
      { freq: 523.25, duration: 0.8 }, // C5
      { freq: 0, duration: 1.5 }, // Long rest before loop
    ];

    const bass = [
      { freq: 130.81, duration: 2.0 }, // C3
      { freq: 0, duration: 0.5 },
      { freq: 110.0, duration: 2.0 }, // A2
      { freq: 0, duration: 0.5 },
      { freq: 146.83, duration: 2.0 }, // D3
      { freq: 0, duration: 0.5 },
      { freq: 130.81, duration: 2.5 }, // C3
      { freq: 0, duration: 1.5 },
    ];

    let time = this.audioContext.currentTime + 0.1;
    const totalDuration = notes.reduce((sum, n) => sum + n.duration, 0);

    notes.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, time, note.duration * 0.85, 0.08, "sine");
      }
      time += note.duration;
    });

    let bassTime = this.audioContext.currentTime + 0.1;
    bass.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, bassTime, note.duration * 0.9, 0.04, "triangle");
      }
      bassTime += note.duration;
    });

    this.musicInterval = window.setTimeout(
      () => {
        if (this.musicPlaying) {
          this.playCurrentTrack();
        }
      },
      (totalDuration + 2) * 1000
    );
  }

  // Track 6: Pokemon Center - Healing/rest theme
  private playPokemonCenter(): void {
    if (!this.audioContext || !this.gainNode) return;

    // Soothing, comforting melody - the classic healing feel
    const notes = [
      // Iconic opening
      { freq: 659.25, duration: 0.5 }, // E5
      { freq: 783.99, duration: 0.5 }, // G5
      { freq: 880.0, duration: 0.7 }, // A5
      { freq: 0, duration: 0.4 }, // Rest
      { freq: 783.99, duration: 0.4 }, // G5
      { freq: 659.25, duration: 0.6 }, // E5
      { freq: 0, duration: 0.8 }, // Rest

      // Gentle continuation
      { freq: 523.25, duration: 0.5 }, // C5
      { freq: 587.33, duration: 0.4 }, // D5
      { freq: 659.25, duration: 0.6 }, // E5
      { freq: 0, duration: 0.5 }, // Rest
      { freq: 587.33, duration: 0.4 }, // D5
      { freq: 523.25, duration: 0.8 }, // C5
      { freq: 0, duration: 1.0 }, // Rest

      // Resolving phrase
      { freq: 440.0, duration: 0.5 }, // A4
      { freq: 523.25, duration: 0.5 }, // C5
      { freq: 659.25, duration: 0.7 }, // E5
      { freq: 0, duration: 0.4 }, // Rest
      { freq: 523.25, duration: 0.5 }, // C5
      { freq: 440.0, duration: 0.8 }, // A4
      { freq: 0, duration: 2.0 }, // Long rest
    ];

    const pad = [
      { freq: 220.0, duration: 3.0 }, // A3
      { freq: 0, duration: 1.0 },
      { freq: 261.63, duration: 3.0 }, // C4
      { freq: 0, duration: 1.0 },
      { freq: 220.0, duration: 3.5 }, // A3
      { freq: 0, duration: 2.0 },
    ];

    let time = this.audioContext.currentTime + 0.1;
    const totalDuration = notes.reduce((sum, n) => sum + n.duration, 0);

    notes.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, time, note.duration * 0.9, 0.07, "sine");
      }
      time += note.duration;
    });

    let padTime = this.audioContext.currentTime + 0.1;
    pad.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, padTime, note.duration * 0.95, 0.03, "sine");
      }
      padTime += note.duration;
    });

    this.musicInterval = window.setTimeout(
      () => {
        if (this.musicPlaying) {
          this.playCurrentTrack();
        }
      },
      (totalDuration + 2) * 1000
    );
  }

  // Track 7: Mystery Dungeon - Mysterious exploration theme
  private playMysteryDungeon(): void {
    if (!this.audioContext || !this.gainNode) return;

    // Mysterious, slightly tense but adventurous melody
    const notes = [
      // Opening - mysterious
      { freq: 329.63, duration: 0.8 }, // E4
      { freq: 0, duration: 0.4 }, // Rest
      { freq: 311.13, duration: 0.6 }, // Eb4
      { freq: 329.63, duration: 0.8 }, // E4
      { freq: 0, duration: 0.6 }, // Rest

      // Building tension
      { freq: 392.0, duration: 0.6 }, // G4
      { freq: 369.99, duration: 0.5 }, // F#4
      { freq: 329.63, duration: 0.7 }, // E4
      { freq: 0, duration: 0.8 }, // Rest

      // Mysterious phrase
      { freq: 293.66, duration: 0.6 }, // D4
      { freq: 329.63, duration: 0.5 }, // E4
      { freq: 392.0, duration: 0.8 }, // G4
      { freq: 0, duration: 0.5 }, // Rest
      { freq: 369.99, duration: 0.6 }, // F#4
      { freq: 329.63, duration: 1.0 }, // E4
      { freq: 0, duration: 1.0 }, // Rest

      // Resolution with minor feel
      { freq: 261.63, duration: 0.7 }, // C4
      { freq: 293.66, duration: 0.5 }, // D4
      { freq: 329.63, duration: 1.2 }, // E4
      { freq: 0, duration: 2.0 }, // Long rest before loop
    ];

    const bass = [
      { freq: 82.41, duration: 3.0 }, // E2
      { freq: 0, duration: 1.0 },
      { freq: 98.0, duration: 3.0 }, // G2
      { freq: 0, duration: 1.0 },
      { freq: 73.42, duration: 3.0 }, // D2
      { freq: 0, duration: 1.0 },
      { freq: 82.41, duration: 3.5 }, // E2
      { freq: 0, duration: 2.0 },
    ];

    let time = this.audioContext.currentTime + 0.1;
    const totalDuration = notes.reduce((sum, n) => sum + n.duration, 0);

    notes.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, time, note.duration * 0.85, 0.07, "sine");
      }
      time += note.duration;
    });

    let bassTime = this.audioContext.currentTime + 0.1;
    bass.forEach((note) => {
      if (note.freq > 0) {
        this.playNote(note.freq, bassTime, note.duration * 0.9, 0.04, "triangle");
      }
      bassTime += note.duration;
    });

    this.musicInterval = window.setTimeout(
      () => {
        if (this.musicPlaying) {
          this.playCurrentTrack();
        }
      },
      (totalDuration + 2) * 1000
    );
  }

  // ── SFX ─────────────────────────────────────────────────────────────────

  playSpawnSfx(): void {
    if (!this.audioContext || !this.gainNode) return;

    const t = this.audioContext.currentTime + 0.05;
    // 4-note ascending arpeggio: C5→E5→G5→C6 (square wave)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      this.playNote(freq, t + i * 0.1, 0.1, 0.05, "square");
    });

    // Subtle sine sweep underneath (200→800 Hz over 0.3s)
    const sweep = this.audioContext.createOscillator();
    const sweepGain = this.audioContext.createGain();
    sweep.type = "sine";
    sweep.frequency.setValueAtTime(200, t);
    sweep.frequency.exponentialRampToValueAtTime(800, t + 0.3);
    sweepGain.gain.setValueAtTime(0.03, t);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    sweep.connect(sweepGain);
    sweepGain.connect(this.gainNode);
    sweep.start(t);
    sweep.stop(t + 0.35);
  }

  playExitSfx(): void {
    if (!this.audioContext || !this.gainNode) return;

    const t = this.audioContext.currentTime + 0.05;
    // 3-note descending: G5→E5→C5
    const notes = [783.99, 659.25, 523.25];
    notes.forEach((freq, i) => {
      this.playNote(freq, t + i * 0.1, 0.12, 0.04, "square");
    });
  }

  // Short 2-note ascending blip for NPC/building interaction confirm
  playInteractSfx(): void {
    if (!this.audioContext || !this.gainNode) return;
    const t = this.audioContext.currentTime + 0.02;
    // E5 → A5 — bright, friendly confirm
    this.playNote(659.25, t, 0.06, 0.05, "square");
    this.playNote(880.0, t + 0.07, 0.08, 0.05, "square");
  }

  // Filtered noise sweep for zone transitions — whoosh feel
  playZoneTransitionSfx(): void {
    if (!this.audioContext || !this.gainNode) return;
    const t = this.audioContext.currentTime + 0.02;

    // White noise burst shaped by a bandpass filter sweep
    const bufferSize = this.audioContext.sampleRate * 0.4;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;

    const filter = this.audioContext.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(200, t);
    filter.frequency.exponentialRampToValueAtTime(2000, t + 0.15);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.35);
    filter.Q.value = 1.5;

    const noiseGain = this.audioContext.createGain();
    noiseGain.gain.setValueAtTime(0, t);
    noiseGain.gain.linearRampToValueAtTime(0.06, t + 0.05);
    noiseGain.gain.linearRampToValueAtTime(0.04, t + 0.2);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.gainNode);
    noise.start(t);
    noise.stop(t + 0.4);
  }

  // Dramatic 3-note sting for wild creature encounters — tension chord
  playEncounterSfx(): void {
    if (!this.audioContext || !this.gainNode) return;
    const t = this.audioContext.currentTime + 0.02;
    // C4 → Eb4 → G4 (minor triad, staccato, loud) — danger feel
    this.playNote(261.63, t, 0.08, 0.06, "square");
    this.playNote(311.13, t + 0.09, 0.08, 0.06, "square");
    this.playNote(392.0, t + 0.18, 0.15, 0.07, "square");
    // Low bass hit underneath
    this.playNote(130.81, t, 0.25, 0.04, "triangle");
  }

  // Soft confirmation tone for building modal open
  playBuildingClickSfx(): void {
    if (!this.audioContext || !this.gainNode) return;
    const t = this.audioContext.currentTime + 0.02;
    // Single warm note with slight vibrato — C5 sine
    const osc = this.audioContext.createOscillator();
    const oscGain = this.audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, t);
    // Gentle vibrato
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    lfo.frequency.value = 6;
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + 0.25);

    oscGain.gain.setValueAtTime(0, t);
    oscGain.gain.linearRampToValueAtTime(0.04, t + 0.02);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(oscGain);
    oscGain.connect(this.gainNode);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  // One-shot gold star burst at a world point — visual companion to
  // playBuildingClickSfx so building clicks read as "the world reacted."
  // Uses the existing `star` texture from weather-ui.ts (gold 16x16).
  // Self-destroys 100ms after particles finish so no leak.
  playBuildingClickBurst(worldX: number, worldY: number): void {
    const burst = this.scene.add.particles(worldX, worldY, "star", {
      speed: { min: 70, max: 170 },
      angle: { min: 0, max: 360 },
      lifespan: 450,
      scale: { start: 0.9, end: 0 },
      alpha: { start: 1, end: 0 },
      rotate: { min: 0, max: 360 },
      gravityY: 80, // gentle fall — sparks arc instead of flying flat
      emitting: false,
    });
    // Depth 20: above buildings (5–8) and characters (10–12), below
    // interactPrompt (150) and zone-transition overlays (50).
    burst.setDepth(20);
    burst.explode(8);
    this.scene.time.delayedCall(550, () => burst.destroy());
  }

  private playNote(
    frequency: number,
    startTime: number,
    duration: number,
    volume: number,
    waveType: OscillatorType = "sine"
  ): void {
    if (!this.audioContext || !this.gainNode) return;

    const oscillator = this.audioContext.createOscillator();
    const noteGain = this.audioContext.createGain();

    // Add a low-pass filter for smoother sound
    const filter = this.audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2000;
    filter.Q.value = 0.5;

    oscillator.connect(filter);
    filter.connect(noteGain);
    noteGain.connect(this.gainNode);

    // Use sine wave for clean, smooth sound (triangle for slight warmth)
    oscillator.type = waveType;
    oscillator.frequency.value = frequency;

    // Smooth envelope with longer attack/release for ambient feel
    const attackTime = Math.min(0.08, duration * 0.15);
    const releaseTime = Math.min(0.15, duration * 0.3);

    noteGain.gain.setValueAtTime(0, startTime);
    noteGain.gain.linearRampToValueAtTime(volume, startTime + attackTime);
    noteGain.gain.setValueAtTime(volume * 0.8, startTime + duration - releaseTime);
    noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.01);

    // Track oscillator for cleanup on track switch
    this.activeOscillators.push(oscillator);

    // Remove from array when it ends naturally
    oscillator.onended = () => {
      const index = this.activeOscillators.indexOf(oscillator);
      if (index > -1) {
        this.activeOscillators.splice(index, 1);
      }
    };
  }

  private toggleMusic(): void {
    if (this.musicPlaying) {
      this.musicPlaying = false;
      if (this.musicInterval) {
        clearTimeout(this.musicInterval);
        this.musicInterval = null;
      }
      // Stop all active oscillators when muting
      this.stopAllOscillators();
      if (this.gainNode) {
        this.gainNode.gain.value = 0;
      }
    } else {
      this.musicPlaying = true;
      if (this.gainNode) {
        this.gainNode.gain.value = 0.08;
      }
      this.playCurrentTrack();
    }
  }
}
