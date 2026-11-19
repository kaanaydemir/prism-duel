// placeholder (replaced below)
import { paintBackdrop } from './_kit';
import type { ArtLayers, CardArtV3 } from './_types';
const art: CardArtV3 = { id: 'trinity_crystal_wyrm', focus: [44, 30], big(l: ArtLayers) { paintBackdrop(l.backdrop, 'LIGHT', { focus: [44, 30] }); } };
export default art;
