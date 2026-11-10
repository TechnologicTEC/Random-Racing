/**
 * The one tuning file. Car handling, drift timings and generator limits all
 * live here so they can be tweaked without hunting through code.
 *
 * Generation code never reads this file directly: the values are passed in as
 * an argument, which keeps generation pure and easy to test.
 */

/**
 * Bumped whenever the generator changes what a seed produces. It stays at 0
 * during development and becomes 1 at release.
 */
export const GENERATOR_VERSION = 0;

export interface TrackConfig {
  /** Candidate layouts generated per round for each seed. */
  candidatesPerRound: number;
  /** Road width in metres (brief: 12 to 14). */
  roadWidth: number;
  /** Shortest and longest allowed lap, in metres. */
  lapLengthMin: number;
  lapLengthMax: number;
}

export interface GameConfig {
  track: TrackConfig;
}

export const config: GameConfig = {
  track: {
    candidatesPerRound: 30,
    roadWidth: 13,
    lapLengthMin: 1400,
    lapLengthMax: 2400,
  },
};
