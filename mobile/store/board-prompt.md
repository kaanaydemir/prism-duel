# Board surface redesign — image prompt (ChatGPT), v2

v1 result: `board-concept-v1.png` (marble + gold inlay: keep). Fixes asked for in v2: a cleaner board
outline, razor-sharp zone outlines, a crisp deck card stack, higher-quality side walls.

How to use: upload `board-concept-v1.png` (and optionally `board-reference.png`) with the prompt below.

---

Refine the attached pixel-art game board. Keep the material and mood exactly as they are (polished
black-indigo marble with fine gold inlay lines, a gold diamond emblem in the centre, cyan zones for the
near player, crimson zones for the far player, dark background). Fix these four things:

1. BOARD SHAPE — make the outline clean, regular and symmetric.
   - The board is one rectangular slab seen in 2:1 isometric. Its outline is built ONLY from straight
     isometric edges (2 px across for every 1 px down) and short 45° chamfers of equal size on every
     corner.
   - Exactly two notches, and they mirror each other under a 180° rotation: one small square step at the
     near-left corner (where the near player's deck pad sits) and an identical one at the far-right corner.
     No other cuts, jags, steps or uneven corners anywhere (remove the sharp extra cut at the top right).
   - The gold trim runs as one continuous, even 2-px line around the whole top edge.

2. ZONES — razor sharp.
   - Every card zone is a perfect isometric diamond outline, all the same size, evenly spaced on one grid.
   - Outlines are SOLID clean pixel lines (2 px wide, exact 2:1 stair steps), with no dotted, broken or
     noisy pixels. One bright core line (#3fe0ea cyan / #ff4d5e crimson) with one darker line inside
     (#0f9db5 / #bd1f3e). A thin stepped glow at most; never a blurry halo.
   - Zone interiors: flat very dark fill (#0b0d1f), clearly separated from the marble.

3. DECK STACKS — crisp and readable.
   - Each deck is a neat stack of 6–8 cards with every card edge visible as its own clean pixel line.
   - The top card shows a sharp, centred card-back emblem (a simple diamond/eye symbol) with a clear
     1-px outline, a cyan frame for the near player's deck and a crimson frame for the far player's deck.
   - The graveyard pads (tombstone icon) and the hexagonal field pads: equally crisp, symmetric icons.

4. SIDE WALLS — high-quality masonry.
   - Even, regular stone blocks in neat courses that follow the isometric angle, each block with a 1-px
     dark outline, a light top-left edge and a darker bottom-right edge (3–4 flat tones of blue-grey stone).
   - Evenly spaced inset vent panels with crisp horizontal slats and a soft cyan light inside (crimson
     vents on the far player's side), all the same size and aligned on the wall.
   - A clean dark base line where the wall meets the floor, and the gold trim crisp at the top.

STRICT PIXEL-ART RULES (very important):
- Real pixel art for a 640×360 game, shown at an integer upscale (nearest-neighbour): every pixel is a hard
  square; no anti-aliasing, no blur, no soft gradients, no painterly or 3D-rendered surfaces, no noise.
- Clean 1-px outlines (#07070f). Flat tone bands, 3–5 tones per material; dithering only in small,
  regular patterns. Lines on the isometric axes always use exact 2:1 steps.
- Palette only: ink #07070f; night #0b0d1f #12163a #1b2352 #28356f #3b4c91; steel #6578b4; mist #a3b1da;
  white #f4f7ff; stone #1d1c26 #393846 #5d5c6e #8b8a9c #c4c3d1; cyan #053241 #08627a #0f9db5 #3fe0ea #b6fbff;
  crimson #3a0819 #761030 #bd1f3e #ff4d5e #ffb6bb; gold #45290a #875611 #cf971d #ffd447 #fff4b5.
- Marble veins, slab joints and gold inlay lines follow the isometric tile grid (64×32 px tiles).

Output: one image, same camera, framing and layout as the attached board; board only (no UI, no text, no
characters or monsters).
