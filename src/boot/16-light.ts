import type { BootStep } from './types';

/**
 * Light layer textures (arena v2 only): soft radial / ring / line falloffs and the water
 * caustic frames. The monster glow sheets (halos) are prewarmed in the background once every
 * monster sheet is painted, one monster per slice (~10 ms each); a monster that appears before
 * its slice simply builds its sheet on the spot.
 */
const step: BootStep = {
  name: 'light',
  order: 16,
  build: (scene) => {
    return;
  },
};
export default step;
