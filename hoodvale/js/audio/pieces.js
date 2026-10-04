// Hoodvale's music: one procedural composition per zone music key (data/zones.js `music`) plus
// wilds, dungeon, boss and login. Pure data, read by music.js. Owner: audio builder.
//
// Piece: root (MIDI tonic), mode (kit.MODES), bpm, beats per bar, sub (steps per beat: 2 = eighths,
// 3 = compound 6/8), swing (fraction of a step that off-steps are delayed), gain.
//   ch:    channels { name: { inst, oct, level, pan, strum?, p? (sprinkle chance), vowel?, combat? } }
//          (inst 'drums' = percussion letters; see instruments.js drum()).
//   leads: lead instruments rotated on each pass of a melody section (channel 'lead').
//   pat:   named patterns. Arp/bass strings: one token per step — chord-tone index (0 root, 1 third,
//          2 fifth, 3 octave...), ' = octave up, , = octave down, ! accent, ? ghost, . rest.
//          Strum strings (channels with strum): x down, X accent, u up, . rest.
//          Drum objects: { letter: 'x . X o' } (x hit, X accent, o ghost).
//   sec:   sections { bars, chords (scale degree per bar; 'M'/'m' force major/minor, '7' adds the
//          seventh, '0 4' splits a bar), mel: [variants] ('deg:dur' tokens, bars split by '|',
//          'r' rest, '#'/'b' alteration), lead: [instruments], play: { channel: value | [choices] } }
//          play values: 'mel' (melody), 'harm' (a third below), 'oct' (octave below), 'improv',
//          'drone', 'pad', 'sprinkle', or a pattern name.
//   forms: section orders; one is chosen per cycle (never the same twice in a row).
//   rest:  optional breathing interlude between cycles; combat: { play } layer faded in during fights.
//
// The Hood's motif (forest, login bridge): tonic, fifth, fourth, third, fourth — a hunting-horn call.

export const PIECES = {
  // ------------------------------------------------------------------ Brightwater (start village)
  village: {
    title: 'Brightwater Green', root: 55, mode: 'ionian', bpm: 96, beats: 4, sub: 2, swing: 0.07, gain: 1,
    ch: {
      lead: { inst: 'recorder', oct: 1, level: 1, pan: 0.12 },
      lead2: { inst: 'fiddle', oct: 1, level: 0.75, pan: -0.2 },
      arp: { inst: 'lute', oct: 0, level: 1, pan: -0.25 },
      bass: { inst: 'bass', oct: -1, level: 0.9, pan: 0 },
      pad: { inst: 'strings', oct: 0, level: 0.55, pan: 0.2 },
      perc: { inst: 'drums', level: 0.6, pan: 0.05 },
      cperc: { inst: 'drums', level: 0.75, combat: true },
      cbass: { inst: 'bass', oct: -1, level: 0.8, combat: true },
    },
    leads: ['recorder', 'fiddle', 'flute'],
    pat: {
      arpA: '0 2 3 2 1 2 3 2', arpB: '0 . 2 3 1 . 2 3', arpC: '0 . 2 . 3 . 2 .',
      bassA: '0 . . . 2, . . .', bassB: '0 . . 0 2, . 1 .',
      drA: { K: 'x . . . o . . .', t: '. . x . . . x .' },
      drB: { K: 'x . . o x . . .', t: '. . x . . . x .', h: '. x . x . x . x' },
      cdr: { K: 'X . x . X . x x', S: '. . x . . . x .' }, cb: '0 0 . 0 0 0 . 0',
    },
    sec: {
      intro: { bars: 2, chords: [0, 4], play: { arp: 'arpC', bass: 'bassA' } },
      A: {
        bars: 8, chords: [0, 3, 4, 0, 5, 3, 4, 0],
        mel: [
          '4:2 2:1 4:1 7:3 6:1 | 5:2 4:1 3:1 2:2 3:2 | 4:3 5:1 4:2 1:2 | 2:2 1:1 2:1 0:4 | 4:2 4:1 5:1 7:2 5:2 | 4:2 3:1 2:1 3:4 | 2:1 3:1 4:2 5:2 6:2 | 7:6 r:2',
          '4:2 2:1 4:1 7:3 6:1 | 5:2 4:1 3:1 2:2 3:2 | 4:2 5:1 6:1 7:2 4:2 | 5:2 4:1 2:1 0:4 | 4:2 4:1 5:1 7:2 5:2 | 4:2 3:1 2:1 3:4 | 2:1 3:1 4:2 5:2 6:2 | 7:4 4:2 7:2',
        ],
        play: { lead: 'mel', lead2: [null, null, 'harm'], arp: ['arpA', 'arpB'], bass: 'bassA', perc: ['drA', 'drB'] },
      },
      B: {
        bars: 8, chords: [5, 2, 3, 0, 3, 0, 1, 4],
        mel: ['7:3 9:1 8:2 7:2 | 6:3 5:1 4:4 | 5:2 7:2 9:4 | 8:3 7:1 7:4 | 9:3 8:1 7:2 5:2 | 4:2 7:2 6:1 5:1 4:2 | 3:2 5:2 4:2 3:2 | 1:4 2:2 3:2'],
        lead: ['fiddle', 'recorder'],
        play: { lead: 'mel', arp: 'arpB', bass: 'bassB', pad: [null, 'pad'], perc: 'drB' },
      },
      air: { bars: 4, chords: [0, 3, 0, 4], play: { arp: 'arpC', lead2: 'improv', bass: 'bassA' } },
    },
    forms: [['intro', 'A', 'B', 'A'], ['A', 'B', 'air', 'A'], ['A', 'A', 'B', 'air']],
    rest: { bars: 2, chords: [0, 0], play: { arp: 'arpC' } },
    combat: { play: { cperc: 'cdr', cbass: 'cb' } },
  },

  // ------------------------------------------------------------------ Millbrook Farms: lilting 6/8
  pastoral: {
    title: 'Millbrook Furrows', root: 53, mode: 'ionian', bpm: 64, beats: 2, sub: 3, swing: 0, gain: 1,
    ch: {
      lead: { inst: 'flute', oct: 1, level: 1, pan: 0.1 },
      lead2: { inst: 'fiddle', oct: 1, level: 0.7, pan: -0.25 },
      arp: { inst: 'harp', oct: 0, level: 1, pan: -0.15 },
      bass: { inst: 'bass', oct: -1, level: 0.85 },
      perc: { inst: 'drums', level: 0.5, pan: 0.2 },
      cperc: { inst: 'drums', level: 0.75, combat: true },
      cbass: { inst: 'bass', oct: -1, level: 0.8, combat: true },
    },
    leads: ['flute', 'recorder'],
    pat: {
      arp6: '0 2 3 4 3 2', arp6b: '0 2 3 . 3 2', arp6c: '0 . . 2 . .',
      bass6: '0 . . 2, . .',
      dr6: { t: 'x . . o . .', K: 'x . . . . .' }, dr6b: { t: 'x . o x . o', K: 'x . . o . .' },
      cdr: { K: 'X . x X . x', S: '. . . x . .' }, cb: '0 . 0 0 . 0',
    },
    sec: {
      A: {
        bars: 8, chords: [0, 3, 0, 4, 0, 3, 4, 0],
        mel: ['2:2 4:1 7:2 4:1 | 5:2 3:1 5:2 7:1 | 4:3 2:2 4:1 | 1:2 -1:1 1:2 4:1 | 2:2 4:1 7:2 9:1 | 8:2 7:1 5:2 3:1 | 4:2 6:1 8:2 6:1 | 7:5 r:1'],
        play: { lead: 'mel', lead2: [null, 'harm'], arp: ['arp6', 'arp6b'], bass: 'bass6', perc: [null, 'dr6'] },
      },
      B: {
        bars: 8, chords: [5, 2, 3, 0, 5, 3, 1, 4],
        mel: ['9:3 8:2 7:1 | 6:2 4:1 6:3 | 5:2 7:1 8:2 7:1 | 7:3 4:3 | 5:2 7:1 9:2 7:1 | 8:2 7:1 5:3 | 4:2 3:1 1:2 3:1 | 4:3 6:2 r:1'],
        lead: ['recorder', 'fiddle'],
        play: { lead: 'mel', arp: 'arp6', bass: 'bass6', perc: 'dr6b' },
      },
      field: { bars: 4, chords: [0, 3, 4, 0], play: { arp: 'arp6c', lead2: 'improv', bass: 'bass6' } },
    },
    forms: [['A', 'B', 'A'], ['A', 'A', 'B', 'field'], ['field', 'A', 'B']],
    rest: { bars: 2, chords: [0, 4], play: { arp: 'arp6c' } },
    combat: { play: { cperc: 'cdr', cbass: 'cb' } },
  },

  // ------------------------------------------------------------------ Saltreach Docks: sea shanty
  coast: {
    title: 'Saltreach Shanty', root: 57, mode: 'dorian', bpm: 94, beats: 4, sub: 2, swing: 0.14, gain: 1,
    ch: {
      lead: { inst: 'concertina', oct: 1, level: 1, pan: -0.1 },
      lead2: { inst: 'fiddle', oct: 1, level: 0.7, pan: 0.25 },
      strum: { inst: 'lute', oct: 0, level: 0.9, pan: -0.3, strum: true },
      bass: { inst: 'bass', oct: -1, level: 0.95 },
      crew: { inst: 'choir', oct: 0, level: 0.7, vowel: 'oh', pan: 0.15 },
      perc: { inst: 'drums', level: 0.65 },
      cperc: { inst: 'drums', level: 0.8, combat: true },
      cbass: { inst: 'bass', oct: -1, level: 0.8, combat: true },
    },
    leads: ['concertina', 'fiddle'],
    pat: {
      st1: 'x . u . x . u .', st2: 'x . u u . u x u',
      bassA: '0 . . . 2, . . .', bassB: '0 . 2, . 0 . 2, .',
      drA: { x: 'X . . . x . . .', c: '. . x . . . x .' },
      drB: { x: 'X . . . X . . .', c: '. . x . . . x .', t: '. x . x . x . x' },
      cdr: { x: 'X . x . X x x .', S: '. . x . . . x x' }, cb: '0 0 2, 0 0 0 2, 0',
    },
    sec: {
      A: {
        bars: 8, chords: [0, 6, 0, 4, 0, 6, 3, 0],
        mel: ['4:2 4:1 4:1 7:2 4:2 | 6:3 5:1 6:2 4:2 | 4:2 2:1 2:1 4:2 7:2 | 6:2 5:2 4:4 | 4:2 4:1 4:1 7:2 9:2 | 8:2 7:1 6:1 4:4 | 3:2 5:2 4:1 3:1 2:2 | 0:6 r:2'],
        play: { lead: 'mel', strum: ['st1', 'st2'], bass: 'bassA', perc: ['drA', 'drB'] },
      },
      B: {
        bars: 8, chords: [2, 6, 0, 0, 2, 6, 4, 0],
        mel: ['7:3 7:1 9:2 7:2 | 6:2 8:2 6:4 | 4:2 7:2 4:2 2:2 | 0:4 r:4 | 7:3 7:1 9:2 11:2 | 10:2 9:2 8:4 | 6:2 4:2 5:2 6:2 | 7:6 r:2'],
        lead: ['fiddle', 'concertina'],
        play: { lead: 'mel', lead2: [null, 'oct'], strum: 'st2', bass: 'bassB', crew: 'pad', perc: 'drB' },
      },
      tide: { bars: 4, chords: [0, 6, 3, 0], play: { strum: 'st1', lead2: 'improv', bass: 'bassA', perc: 'drA' } },
    },
    forms: [['A', 'B', 'A'], ['A', 'B', 'tide', 'B'], ['tide', 'A', 'B']],
    rest: { bars: 2, chords: [0, 0], play: { bass: 'bassA' } },
    combat: { play: { cperc: 'cdr', cbass: 'cb' } },
  },

  // ------------------------------------------------------------------ Hoodwood: modal harp + flute
  forest: {
    title: 'Under the Hood', root: 52, mode: 'aeolian', bpm: 70, beats: 3, sub: 2, swing: 0, gain: 1,
    ch: {
      lead: { inst: 'flute', oct: 1, level: 1, pan: 0.15 },
      lead2: { inst: 'recorder', oct: 1, level: 0.6, pan: -0.2 },
      arp: { inst: 'harp', oct: 0, level: 1, pan: -0.15 },
      drone: { inst: 'drone', oct: -1, level: 0.6 },
      pad: { inst: 'strings', oct: 0, level: 0.5, pan: 0.2 },
      perc: { inst: 'drums', level: 0.45 },
      cperc: { inst: 'drums', level: 0.8, combat: true },
      cbass: { inst: 'bass', oct: -1, level: 0.85, combat: true },
    },
    leads: ['flute', 'recorder'],
    pat: {
      h1: '0 2 3 4 3 2', h2: '0 2 4 3 2 1', h3: '0 . 2 . 4 .',
      drA: { K: 'x . . . . .' }, drB: { K: 'x . . . o .', t: '. . . x . .' },
      cdr: { K: 'X . x . X x', B: 'x . . . . .' }, cb: '0 0 . 0 2, .',
    },
    sec: {
      A: {
        bars: 8, chords: [0, 0, 5, 6, 0, 3, 5, 4],
        mel: [
          '0:2 4:2 3:1 2:1 | 3:4 2:1 1:1 | 0:6 | r:2 1:1 2:1 3:2 | 4:3 5:1 4:1 3:1 | 3:3 2:1 0:2 | 2:2 4:2 7:2 | 6:4 4:2',
          '0:2 4:2 3:1 2:1 | 3:4 2:1 1:1 | 0:6 | r:2 1:1 2:1 3:2 | 4:3 5:1 4:1 3:1 | 3:3 2:1 0:2 | 2:2 4:2 7:2 | 6:2 5:2 4:2',
        ],
        play: { lead: 'mel', arp: ['h1', 'h2'], drone: 'drone', perc: [null, 'drA'] },
      },
      B: {
        bars: 8, chords: [5, 6, 0, 0, 5, 6, 4, 4],
        mel: ['7:4 9:2 | 8:3 7:1 6:2 | 7:6 | r:6 | 9:2 8:2 7:2 | 8:2 6:2 4:2 | 6:3 5:1 4:2 | 4:4 r:2'],
        lead: ['recorder', 'flute'],
        play: { lead: 'mel', lead2: [null, 'harm'], arp: 'h1', pad: 'pad', drone: 'drone', perc: 'drB' },
      },
      glade: { bars: 8, chords: [0, 3, 0, 5, 0, 3, 6, 4], play: { arp: 'h3', lead2: 'improv', drone: 'drone', perc: 'drA' } },
    },
    forms: [['A', 'B', 'A'], ['A', 'glade', 'B', 'A'], ['glade', 'A', 'B']],
    rest: { bars: 2, chords: [0, 0], play: { drone: 'drone', arp: 'h3' } },
    combat: { play: { cperc: 'cdr', cbass: 'cb' } },
  },

  // ------------------------------------------------------------------ Copperhollow: drones + plucked work rhythm
  mines: {
    title: 'Copperhollow Hammers', root: 45, mode: 'aeolian', bpm: 88, beats: 4, sub: 2, swing: 0.05, gain: 1.1,
    ch: {
      lead: { inst: 'horn', oct: 1, level: 0.9, pan: 0.1 },
      pluck: { inst: 'dulcimer', oct: 1, level: 1, pan: -0.25 },
      bass: { inst: 'bass', oct: 0, level: 1 },
      drone: { inst: 'drone', oct: 0, level: 0.55 },
      perc: { inst: 'drums', level: 0.6, pan: 0.15 },
      imp: { inst: 'dulcimer', oct: 1, level: 0.7, pan: 0.3 },
      cperc: { inst: 'drums', level: 0.85, combat: true },
      cbass: { inst: 'bass', oct: 0, level: 0.8, combat: true },
    },
    leads: ['horn', 'clarinet'],
    pat: {
      ost1: '0 . 0 2 . 0 3 .', ost2: '0 . 2 . 0 2 3 2', ost3: '0 . . 2 . . 3 .',
      bassA: '0 . . 0 . . 0 .', bassB: '0 . . . 0 . 2, .',
      drA: { K: 'x . . x . . x .', a: '. . x . . . . x' }, drB: { K: 'x . . x . . x .', a: '. . x . . x . x', h: 'x . x . x . x .' },
      cdr: { K: 'X . x X . x X x', a: 'x . x . x . x .' }, cb: '0 0 0 0 0 0 2, 2,',
    },
    sec: {
      A: {
        bars: 8, chords: [0, 0, 5, 4, 0, 0, 3, 4],
        mel: ['r:4 4:2 3:2 | 2:4 0:4 | 2:2 3:2 4:4 | 4:6 r:2 | r:4 7:2 6:2 | 4:4 2:4 | 3:3 2:1 0:4 | -1:6 r:2'],
        play: { lead: 'mel', pluck: ['ost1', 'ost2'], bass: 'bassA', drone: 'drone', perc: ['drA', 'drB'] },
      },
      B: {
        bars: 8, chords: [0, 5, 3, 4, 0, 5, 3, 4],
        play: { pluck: 'ost3', imp: 'improv', bass: 'bassB', drone: 'drone', perc: 'drB' },
      },
      deep: { bars: 4, chords: [0, 0, 5, 4], play: { drone: 'drone', pluck: 'ost3', perc: 'drA' } },
    },
    forms: [['A', 'B', 'A'], ['deep', 'A', 'B'], ['A', 'deep', 'B', 'A']],
    rest: { bars: 2, chords: [0, 0], play: { drone: 'drone' } },
    combat: { play: { cperc: 'cdr', cbass: 'cb' } },
  },

  // ------------------------------------------------------------------ Mistfen: eerie
  swamp: {
    title: 'Mistfen Lantern', root: 50, mode: 'phrygian', bpm: 56, beats: 4, sub: 2, swing: 0, gain: 1.15,
    ch: {
      lead: { inst: 'clarinet', oct: 1, level: 1, pan: -0.1 },
      pad: { inst: 'glass', oct: 0, level: 0.75, pan: 0.15 },
      drone: { inst: 'drone', oct: -1, level: 0.6 },
      spr: { inst: 'bell', oct: 2, level: 0.5, pan: 0.35, p: 0.09 },
      bass: { inst: 'bass', oct: -1, level: 0.8 },
      perc: { inst: 'drums', level: 0.45 },
      cperc: { inst: 'drums', level: 0.8, combat: true },
      cbass: { inst: 'bass', oct: -1, level: 0.8, combat: true },
    },
    leads: ['clarinet', 'flute'],
    pat: {
      boing: '0 . . . . . . .', boing2: '0 . . . . 1 . .',
      beat: { k: 'x . . . . . . .' },
      cdr: { K: 'x . . x . . x .', s: '. . . . x . . .' }, cb: '0 . 0 . 0 . 1 .',
    },
    sec: {
      A: {
        bars: 8, chords: [0, 0, 1, 0, 6, 6, 1, 0],
        mel: ['4:4 3:2 4:2 | 1:6 r:2 | 2:2 1:2 0:4 | r:8 | 6:3 5:1 4:4 | 3:4 r:4 | 1:3 2:1 1:2 0:2 | 0:8'],
        play: { lead: 'mel', pad: 'pad', drone: 'drone', bass: [null, 'boing'] },
      },
      B: { bars: 8, chords: [0, 1, 0, 1, 0, 1, 6, 0], play: { pad: 'pad', spr: 'sprinkle', drone: 'drone', bass: 'boing2', perc: 'beat' } },
    },
    forms: [['A', 'B'], ['B', 'A'], ['A', 'B', 'B']],
    rest: { bars: 2, chords: [0, 1], play: { pad: 'pad' } },
    combat: { play: { cperc: 'cdr', cbass: 'cb' } },
  },

  // ------------------------------------------------------------------ Gildmoor: brass fanfare + market bustle
  town: {
    title: 'Gildmoor Gates', root: 50, mode: 'mixolydian', bpm: 112, beats: 4, sub: 2, swing: 0.05, gain: 0.95,
    ch: {
      lead: { inst: 'shawm', oct: 1, level: 1, pan: 0.1 },
      lead2: { inst: 'shawm', oct: 1, level: 0.65, pan: -0.25 },
      strum: { inst: 'lute', oct: 0, level: 0.85, pan: -0.3, strum: true },
      bass: { inst: 'bass', oct: -1, level: 0.95 },
      imp: { inst: 'fiddle', oct: 1, level: 0.8, pan: 0.3 },
      tim: { inst: 'timpani', oct: -1, level: 0.6 },
      perc: { inst: 'drums', level: 0.6 },
      cperc: { inst: 'drums', level: 0.8, combat: true },
      cbass: { inst: 'bass', oct: -1, level: 0.8, combat: true },
    },
    leads: ['shawm', 'fiddle'],
    pat: {
      st1: 'x . x u . u x u', st2: 'X . u . x . u .',
      bassA: '0 . 2, . 0 . 2, .', timA: '0 . . . . . . .', timF: '0 . . 0 0 . . .',
      drA: { K: 'x . . . x . . .', S: '. . x . . . x .', t: '. x . x . x . x' },
      drF: { K: 'X . . . X . . .', S: 'x . o x x . o o' },
      cdr: { S: 'x . o x . o x o', K: 'X . . x X . . .' }, cb: '0 0 2, 0 0 0 2, 0',
    },
    sec: {
      fanfare: {
        bars: 4, chords: [0, 6, 0, '4M'],
        mel: ['0:1 0:1 4:2 4:1 4:1 7:2 | 6:3 5:1 4:2 6:2 | 4:2 7:2 9:2 7:2 | 8:6 r:2'],
        lead: ['horn'],
        play: { lead: 'mel', lead2: 'mel', tim: 'timF', bass: 'bassA', perc: 'drF' },
      },
      A: {
        bars: 8, chords: [0, 3, 6, 0, 0, 3, 4, 0],
        mel: ['4:2 4:1 5:1 4:2 2:2 | 3:2 5:2 7:2 5:2 | 6:3 7:1 6:2 4:2 | 4:4 0:4 | 7:2 7:1 8:1 9:2 7:2 | 8:2 7:2 5:2 3:2 | 4:2 8:2 7:1 6:1 4:2 | 7:6 r:2'],
        play: { lead: 'mel', lead2: [null, 'harm'], strum: ['st1', 'st2'], bass: 'bassA', tim: [null, 'timA'], perc: 'drA' },
      },
      B: { bars: 8, chords: [3, 0, 3, 4, 3, 0, 6, 0], play: { imp: 'improv', strum: 'st1', bass: 'bassA', perc: 'drA' } },
    },
    forms: [['fanfare', 'A', 'B', 'A'], ['A', 'B', 'A'], ['fanfare', 'B', 'A']],
    rest: { bars: 2, chords: [0, 0], play: { strum: 'st2' } },
    combat: { play: { cperc: 'cdr', cbass: 'cb' } },
  },

  // ------------------------------------------------------------------ Orbio Spire: glassy pads and bells
  oracle: {
    title: 'The Spire Listens', root: 53, mode: 'lydian', bpm: 64, beats: 4, sub: 2, swing: 0, gain: 1.8,
    ch: {
      lead: { inst: 'bell', oct: 2, level: 1, pan: 0.15 },
      lead2: { inst: 'glass', oct: 1, level: 0.6, pan: -0.2 },
      pad: { inst: 'glass', oct: 0, level: 0.8 },
      arp: { inst: 'celesta', oct: 1, level: 0.55, pan: -0.3 },
      spr: { inst: 'bell', oct: 2, level: 0.45, pan: 0.4, p: 0.1 },
      bass: { inst: 'bass', oct: -1, level: 0.6 },
      cperc: { inst: 'drums', level: 0.7, combat: true },
      cbass: { inst: 'bass', oct: -1, level: 0.8, combat: true },
    },
    leads: ['bell', 'celesta'],
    pat: {
      dig: '0 1 2 3 4 3 2 1', dig2: '0 2 4 6 4 2 . .', bassA: '0 . . . . . . .',
      cdr: { b: 'x . . x . . x .', h: '. x . x . x . x' }, cb: '0 0 0 0 0 0 0 0',
    },
    sec: {
      A: {
        bars: 8, chords: [0, 1, 0, 1, 5, 4, 1, 0],
        mel: ['4:4 7:4 | 8:4 5:4 | 6:4 4:4 | 3:6 r:2 | 5:4 2:4 | 4:4 6:4 | 3:4 1:4 | 0:8'],
        play: { lead: 'mel', lead2: [null, 'mel'], pad: 'pad', bass: 'bassA', spr: [null, 'sprinkle'] },
      },
      B: { bars: 8, chords: [5, 1, 0, 0, 2, 1, 4, 0], play: { pad: 'pad', arp: ['dig', 'dig2'], spr: 'sprinkle', bass: 'bassA' } },
    },
    forms: [['A', 'B'], ['B', 'A', 'B'], ['A', 'A', 'B']],
    rest: { bars: 2, chords: [0, 1], play: { pad: 'pad' } },
    combat: { play: { cperc: 'cdr', cbass: 'cb' } },
  },

  // ------------------------------------------------------------------ Ashen Highlands: drone + horn
  highlands: {
    title: 'Ashen Cairns', root: 50, mode: 'aeolian', bpm: 58, beats: 3, sub: 2, swing: 0, gain: 1.1,
    ch: {
      lead: { inst: 'horn', oct: 1, level: 1, pan: 0.05 },
      drone: { inst: 'drone', oct: 0, level: 0.55, bright: true },
      pad: { inst: 'strings', oct: -1, level: 0.6, pan: -0.15 },
      arp: { inst: 'harp', oct: 0, level: 0.75, pan: 0.25 },
      perc: { inst: 'drums', level: 0.55 },
      cperc: { inst: 'drums', level: 0.85, combat: true },
      cbass: { inst: 'bass', oct: -1, level: 0.85, combat: true },
    },
    leads: ['horn', 'fiddle'],
    pat: {
      hp: '0 . 2 . 3 .', hp2: '0 2 3 . 2 .',
      drA: { K: 'x . . . o .' }, drB: { K: 'x . . . x .', B: 'x . . . . .' },
      cdr: { K: 'X . x . X x', B: 'x . . . . .' }, cb: '0 0 0 2, 0 0',
    },
    sec: {
      A: {
        bars: 8, chords: [0, 0, 6, 6, 5, 5, 4, 0],
        mel: ['0:2 4:3 3:1 | 2:4 0:2 | -1:2 2:3 1:1 | -1:6 | -2:2 0:2 2:2 | 3:3 2:1 1:2 | 1:2 0:2 -1:2 | 0:6'],
        play: { lead: 'mel', drone: 'drone', perc: [null, 'drA'], arp: [null, 'hp'] },
      },
      B: {
        bars: 8, chords: [5, 6, 0, 0, 5, 6, '4M', '4M'],
        mel: ['4:2 5:2 7:2 | 6:4 4:2 | 7:6 | r:6 | 9:2 8:2 7:2 | 6:2 4:2 6:2 | 4:3 1:1 4:2 | 4:6'],
        play: { lead: 'mel', drone: 'drone', pad: 'pad', arp: 'hp2', perc: 'drB' },
      },
      cairn: { bars: 4, chords: [0, 6, 5, 0], play: { drone: 'drone', arp: 'hp', perc: 'drA' } },
    },
    forms: [['A', 'B', 'A'], ['cairn', 'A', 'B'], ['A', 'cairn', 'B']],
    rest: { bars: 2, chords: [0, 0], play: { drone: 'drone' } },
    combat: { play: { cperc: 'cdr', cbass: 'cb' } },
  },

  // ------------------------------------------------------------------ Dungeons (Warrens, Vault, Lair)
  dungeon: {
    title: 'Below the Vale', root: 45, mode: 'harmonic', bpm: 54, beats: 4, sub: 2, swing: 0, gain: 1.2,
    ch: {
      lead: { inst: 'clarinet', oct: 1, level: 0.9, pan: -0.1 },
      drone: { inst: 'drone', oct: 0, level: 0.6 },
      choir: { inst: 'choir', oct: 1, level: 0.55, vowel: 'oo', pan: 0.2 },
      arp: { inst: 'harp', oct: 0, level: 0.75, pan: 0.25 },
      spr: { inst: 'bell', oct: 1, level: 0.35, pan: -0.35, p: 0.05 },
      perc: { inst: 'drums', level: 0.5 },
      cperc: { inst: 'drums', level: 0.85, combat: true },
      cbass: { inst: 'bass', oct: 0, level: 0.85, combat: true },
    },
    leads: ['clarinet', 'flute'],
    pat: {
      dh: '0 . . 2 . . 1 .', dh2: '0 . . . 2 . . .',
      beat: { k: 'x . . . . . . .' }, gong: { g: 'x . . . . . . .' },
      cdr: { K: 'X . . x X . x .', S: '. . . . . . o o' }, cb: '0 0 . 0 0 . 1 .',
    },
    sec: {
      A: {
        bars: 8, chords: [0, 0, 5, 5, 0, 0, '4M', '4M'],
        mel: ['r:8 | 4:3 5:1 4:4 | 2:4 1:4 | 0:8 | r:8 | 7:3 6:1 7:2 5:2 | 4:8 | r:8'],
        play: { lead: 'mel', drone: 'drone', arp: ['dh', 'dh2'], perc: 'beat' },
      },
      B: { bars: 8, chords: [0, 1, 0, 1, 5, '4M', 0, 0], play: { drone: 'drone', choir: 'pad', arp: 'dh2', spr: 'sprinkle' } },
    },
    forms: [['A', 'B'], ['B', 'A'], ['A', 'B', 'B']],
    rest: { bars: 2, chords: [0, 0], play: { drone: 'drone', perc: 'gong' } },
    combat: { play: { cperc: 'cdr', cbass: 'cb' } },
  },

  // ------------------------------------------------------------------ Boss fights: driving percussion
  boss: {
    title: 'The Ashen Wyrm', root: 38, mode: 'harmonic', bpm: 138, beats: 4, sub: 2, swing: 0, gain: 0.75, alwaysCombat: true,
    ch: {
      lead: { inst: 'horn', oct: 2, level: 1, pan: 0.05 },
      ost: { inst: 'fiddle', oct: 1, level: 0.75, pan: -0.25 },
      bass: { inst: 'bass', oct: 0, level: 1 },
      tim: { inst: 'timpani', oct: 1, level: 0.7 },
      choir: { inst: 'choir', oct: 2, level: 0.6, vowel: 'ah', pan: 0.2 },
      brass: { inst: 'horn', oct: 1, level: 0.55, pan: 0.3 },
      perc: { inst: 'drums', level: 0.8 },
      cperc: { inst: 'drums', level: 0.7, combat: true },
    },
    leads: ['horn'],
    pat: {
      ost1: '0 0 2 0 0 3 0 2', ost2: '0 0 1 0 0 2 1 0',
      bassA: '0 . 0 0 . 0 0 .', timA: '0 . . . 0 . . .', stab: '0 . . 0 . . 0 .',
      drA: { B: 'x . . x . . x .', S: '. . x . . . x .', b: '. . . . . x . x' },
      drB: { B: 'X . x x . x X .', S: '. . x . . . x x', T: 'x . x . x . x .' },
      cdr: { b: 'x x . x x . x x', S: '. . . . . . o o' },
    },
    sec: {
      A: {
        bars: 8, chords: [0, 0, 5, '4M', 0, 0, 5, '4M'],
        mel: ['0:4 4:4 | 5:3 4:1 3:2 4:2 | 5:4 7:4 | 6:4 4:4 | 7:4 9:4 | 8:3 7:1 5:2 7:2 | 5:2 4:2 5:2 7:2 | 6:6 r:2'],
        play: { lead: 'mel', ost: ['ost1', 'ost2'], bass: 'bassA', tim: 'timA', perc: 'drA' },
      },
      B: { bars: 8, chords: [0, 5, 3, '4M', 0, 5, '4M', '4M'], play: { choir: 'pad', brass: 'stab', ost: 'ost1', bass: 'bassA', tim: 'timA', perc: 'drB' } },
    },
    forms: [['A', 'B'], ['A', 'A', 'B'], ['B', 'A']],
    combat: { play: { cperc: 'cdr' } },
  },

  // ------------------------------------------------------------------ Login: the main theme
  login: {
    title: 'Hoodvale', root: 50, mode: 'dorian', bpm: 76, beats: 4, sub: 2, swing: 0.04, gain: 1,
    ch: {
      lead: { inst: 'recorder', oct: 1, level: 1, pan: 0.1 },
      lead2: { inst: 'strings', oct: 1, level: 0.5, pan: -0.2 },
      arp: { inst: 'harp', oct: 0, level: 1, pan: -0.2 },
      bass: { inst: 'bass', oct: -1, level: 0.85 },
      pad: { inst: 'strings', oct: 0, level: 0.6, pan: 0.2 },
      tim: { inst: 'timpani', oct: -1, level: 0.55 },
      perc: { inst: 'drums', level: 0.55 },
    },
    leads: ['recorder'],
    pat: {
      hA: '0 2 3 4 5 4 3 2', hB: '0 . 2 3 4 . 3 2', bassA: '0 . . . 2, . . .', timA: '0 . . . . . . .',
      drA: { K: 'x . . . o . . .', t: '. . . . x . . .' }, drB: { K: 'x . . o x . . .', t: '. . x . . . x .' },
    },
    sec: {
      intro: { bars: 4, chords: [0, 6, 3, 0], play: { arp: 'hA', pad: 'pad' } },
      A: {
        bars: 8, chords: [0, 6, 3, 0, 2, 6, 3, 4],
        mel: ['4:3 3:1 2:2 4:2 | 6:3 4:1 1:4 | 3:2 5:2 7:3 6:1 | 4:6 r:2 | 4:3 2:1 4:2 7:2 | 8:3 7:1 6:2 4:2 | 5:2 7:2 3:2 5:2 | 4:6 r:2'],
        lead: ['recorder', 'flute'],
        play: { lead: 'mel', arp: 'hA', bass: 'bassA', pad: [null, 'pad'] },
      },
      A2: {
        bars: 8, chords: [0, 6, 3, 0, 2, 6, 3, 0],
        mel: ['4:3 3:1 2:2 4:2 | 6:3 4:1 1:4 | 3:2 5:2 7:3 6:1 | 4:6 r:2 | 4:3 2:1 4:2 7:2 | 8:3 7:1 6:2 4:2 | 5:2 4:2 3:2 1:2 | 0:6 r:2'],
        lead: ['fiddle', 'horn'],
        play: { lead: 'mel', lead2: 'harm', arp: 'hB', bass: 'bassA', pad: 'pad', perc: 'drA' },
      },
      B: {
        bars: 8, chords: [0, 3, 2, 6, 0, 4, 3, '4M'],
        mel: ['0:2 4:2 3:1 2:1 3:2 | 3:6 r:2 | 2:2 4:2 7:4 | 6:6 r:2 | 7:2 9:2 8:1 7:1 8:2 | 8:6 r:2 | 7:2 5:2 3:2 5:2 | 4:4 6#:4'],
        lead: ['horn'],
        play: { lead: 'mel', arp: 'hA', bass: 'bassA', pad: 'pad', tim: 'timA', perc: 'drB' },
      },
    },
    forms: [['intro', 'A', 'A2', 'B', 'A2'], ['A', 'B', 'A2']],
    rest: { bars: 2, chords: [0, 6], play: { arp: 'hB' } },
  },

  // ------------------------------------------------------------------ Wilderness between zones: travelling
  wilds: {
    title: 'The Long Road', root: 57, mode: 'mixolydian', bpm: 90, beats: 4, sub: 2, swing: 0.06, gain: 1,
    ch: {
      lead: { inst: 'recorder', oct: 1, level: 1, pan: 0.1 },
      lead2: { inst: 'fiddle', oct: 1, level: 0.7, pan: -0.25 },
      arp: { inst: 'lute', oct: 0, level: 1, pan: -0.2 },
      bass: { inst: 'bass', oct: -1, level: 0.85 },
      perc: { inst: 'drums', level: 0.45 },
      cperc: { inst: 'drums', level: 0.8, combat: true },
      cbass: { inst: 'bass', oct: -1, level: 0.8, combat: true },
    },
    leads: ['recorder', 'flute', 'fiddle'],
    pat: {
      arpA: '0 2 3 2 1 2 3 2', arpB: '0 . 2 . 3 . 2 .', bassA: '0 . . . 2, . . .',
      drA: { t: '. . x . . . x .' }, cdr: { K: 'X . x . X . x x', S: '. . x . . . x .' }, cb: '0 0 . 0 0 0 . 0',
    },
    sec: {
      A: {
        bars: 8, chords: [0, 6, 3, 0, 0, 6, 4, 0],
        mel: ['4:2 2:2 4:2 7:2 | 6:4 4:2 3:2 | 3:2 5:2 7:2 5:2 | 4:6 r:2 | 2:2 4:2 7:3 8:1 | 8:2 6:2 3:4 | 4:3 3:1 1:4 | 0:6 r:2'],
        play: { lead: 'mel', lead2: [null, 'harm'], arp: ['arpA', 'arpB'], bass: 'bassA', perc: [null, 'drA'] },
      },
      B: { bars: 8, chords: [3, 0, 3, 4, 3, 0, 6, 0], play: { lead2: 'improv', arp: 'arpA', bass: 'bassA', perc: 'drA' } },
    },
    forms: [['A', 'B'], ['B', 'A'], ['A', 'B', 'A']],
    rest: { bars: 4, chords: [0, 6, 0, 0], play: { arp: 'arpB' } },
    combat: { play: { cperc: 'cdr', cbass: 'cb' } },
  },
};

export const MUSIC_KEYS = Object.keys(PIECES);
