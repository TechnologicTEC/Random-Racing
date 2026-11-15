/**
 * Milestone 2's check (step 17): seeds 1 to 20 each get a valid winner without
 * the fallback, and their road sits cleanly in a full-size island.
 * The fresh seeds have their own file, so the two run side by side.
 */
import { FIRST_SEEDS } from '../testing/checkSeeds';
import { describeCleanFit } from '../testing/fitChecks';

describeCleanFit('seeds 1 to 20', FIRST_SEEDS);
