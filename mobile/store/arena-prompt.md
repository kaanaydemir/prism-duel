# New arena — "Sky Temple" concept prompt (ChatGPT), v1

Owner decision 2026-11-14: the whole arena is redesigned (board, floor, walls, background, lighting).
Theme: a floating temple above a sea of clouds at sunset. Nothing of the old arena is kept except the
gameplay layout (zones, pads, duelist spots) and the screen areas the HUD needs.
Upload `board-reference.png` with this prompt so the board layout and camera stay right.

---

Design a complete pixel-art battle arena for a two-player fantasy card-duel video game. Use the attached
image ONLY for the camera angle and the layout of the play zones; everything else is a new design.

THEME — "Sky Temple": a sacred dueling platform floating high above an endless sea of clouds at sunset.
- The board is an ancient floating platform of warm, sun-worn sandstone blocks with crisp carved edges and
  thin gold inlay (NOT marble: no veins, no polished stone). Its underside is rough rock with hanging
  crystal shards, and a few small rocks float beneath it.
- Around it: a vast cloud sea in layered bands, distant floating islands with tiny temple ruins and
  waterfalls that fall into the clouds, slim white spires on the horizon, a few birds.
- Sky: a stepped sunset (deep violet at the top, through magenta and orange, to a golden horizon), a large
  low sun behind the far side of the arena, soft god-rays.
- The "prism" motif: a big floating prism crystal high above the board splits the sunlight into a cyan beam
  (towards the near player) and a crimson beam (towards the far player). Two tall stone pillars with long
  banners (cyan on the near side, crimson on the far side) flank the board.
- Everything should look like it could move: drifting cloud layers, waving banners, glinting crystal shards,
  twinkling sparkles. Draw these as separate, clearly layered elements.

GAMEPLAY LAYOUT (must stay exactly like the attached image):
- 2:1 pixel isometric camera, 64×32 px diamond tiles.
- The board top is a 7×5 tile grid. For each player: a front row of 5 card zones and a back row of 5 card
  zones; the near player's zones glow cyan, the far player's crimson. A plain neutral strip separates the
  two players' front rows.
- Small pads at the ends of the rows: a deck pad, a graveyard pad and a hexagonal field pad per player.
- Zone outlines are crisp inlaid crystal lines (2 px, solid, exact 2:1 steps), interiors dark and calm.
- Two small raised standing spots for the duelists: near player at the front-left corner, far player at the
  back-right corner. The whole board is symmetric under a 180° rotation; outline made of straight isometric
  edges with equal chamfered corners only (no jagged cuts).

COMPOSITION (the game's UI sits on top, so keep these areas calm):
- Wide 780×360 game-pixel frame (show it at 3×: 2340×1080). The board sits in the middle of the frame.
- Keep low detail in: a 36-px strip along the top, a 110-px column along the left edge (from y 40 to 300),
  and a 60-px strip along the bottom. Sky, clouds and soft distant shapes are fine there.

STRICT PIXEL-ART RULES:
- Real pixel art at 780×360 shown with nearest-neighbour upscale: hard square pixels; no anti-aliasing,
  no blur, no smooth gradients, no painterly or 3D-rendered look, no photo textures, no noise.
- Clean 1-px dark outlines (#07070f) on foreground objects; distant layers may drop outlines.
  Flat tone bands (3–5 tones per material); dithering only in small regular patterns (for the sky bands
  and cloud edges).
- Palette only:
  ink #07070f · night #0b0d1f #12163a #1b2352 #28356f #3b4c91 · steel #6578b4 · mist #a3b1da · white #f4f7ff
  stone #1d1c26 #393846 #5d5c6e #8b8a9c #c4c3d1 · earth #28180c #58381a #8b6131 #be9055 #e6cc96
  gold #45290a #875611 #cf971d #ffd447 #fff4b5 · fire #380b05 #8a1c09 #d83f0e #ff8a1e #ffda66
  magenta #370a3b #77197b #c02ec2 #ff69ef #ffc6f8 · violet #130729 #2d1056 #59219f #914fe6 #d3b1ff
  sky #05183d #0a387e #1365c3 #3ea2ff #a9e1ff · cyan #053241 #08627a #0f9db5 #3fe0ea #b6fbff
  crimson #3a0819 #761030 #bd1f3e #ff4d5e #ffb6bb · leaf #0b2911 #1a5823 #2e9839 #6ed759 #c9f7a1

Output: one wide image, the full arena with empty card zones. No UI, no text, no characters, no monsters,
no cards on the board.
