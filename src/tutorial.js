// First-run tutorial as a pure state machine over simulation events:
// flap → gate → perfect → dash → done. main.js feeds it events and shows `tutorial.<step>`.
import { TUTORIAL } from './config.js';

export const TUTORIAL_STEPS = Object.freeze(['flap', 'gate', 'perfect', 'dash', 'done']);

export const startTutorial = () => Object.freeze({ step: 'flap', count: 0 });

const to = step => Object.freeze({ step, count: 0 });
const bump = state => Object.freeze({ ...state, count: state.count + 1 });

/**
 * @param {{ step: string, count: number }} state
 * @param {{ type: string, kind?: string }} event a simulation event
 * @returns {{ step: string, count: number }} the next state (the same object when nothing changed)
 */
export function advanceTutorial(state, event) {
  if (state.step === 'flap' && event.type === 'flap') {
    return state.count + 1 >= TUTORIAL.flaps ? to('gate') : bump(state);
  }
  if (state.step === 'gate' && event.type === 'pass') {
    return state.count + 1 >= TUTORIAL.gates ? to('perfect') : bump(state);
  }
  if (state.step === 'perfect' && event.type === 'pass') {
    // A PERFECT moves on at once; otherwise a few honest tries are enough.
    return event.kind === 'perfect' || state.count + 1 >= TUTORIAL.perfectGrace ? to('dash') : bump(state);
  }
  if (state.step === 'dash' && event.type === 'dash') return to('done');
  return state;
}
