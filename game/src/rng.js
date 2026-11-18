// A small seeded random number generator (mulberry32) plus helpers over it: the same seed gives
// the same city, the same traffic and the same screenshot frames, which is what makes staged
// captures and fresh playthroughs repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random integer in [0, n), from a generator. */
export function intOf(random, n) {
  return Math.floor(random() * n);
}

/** A random element, from a generator. */
export function pickOf(random, list) {
  return list[intOf(random, list.length)];
}

/** A random float in [a, b), from a generator. */
export function rangeOf(random, a, b) {
  return a + random() * (b - a);
}
