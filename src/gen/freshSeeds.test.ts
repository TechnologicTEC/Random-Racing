/**
 * Milestone 2's check (step 17): 20 fresh random seeds each get a valid winner
 * without the fallback, and their road sits cleanly in a full-size island.
 */
import { FRESH_SEEDS } from '../testing/checkSeeds';
import { describeCleanFit } from '../testing/fitChecks';

describeCleanFit('20 fresh random seeds', FRESH_SEEDS);
