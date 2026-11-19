// Prism Fusion — a crystal prism splits one white beam into the spectrum, the bands wind into a violet fusion vortex.
// The drawing is the v3 card art's small picture (src/art/cardart-v3/prism_fusion.ts): one picture for both looks.
import type { CardArtwork } from '../types';
import v3 from '../cardart-v3/prism_fusion';
import { renderArt } from '../cardart-v3/_kit';

const art: CardArtwork = {
  id: 'prism_fusion',
  draw(p) {
    p.blit(renderArt(v3, 0).smallPx, 0, 0);
  },
};

export default art;
