# Board surface redesign — image prompt (ChatGPT)

Upload `board-reference.png` together with the prompt below. The reference keeps the exact shape and
camera; the prompt only lets the SURFACE MATERIAL change, so the result can be rebuilt in the game.

---

Redesign ONLY the surface material of the game board in the attached image. This is a reference
concept for a pixel-art video game, so it must be real pixel art that can be redrawn by hand.

KEEP EXACTLY (do not move, add or remove anything):
- The same isometric camera (2:1 pixel isometric, tiles are 64×32 px diamonds at 1× scale) and the same
  board outline: a raised rectangular slab with two notched corners (front-left and back-right), stone
  side walls with small vents, and a thin gold trim along the top edge.
- The same layout of play zones: two rows of 5 diamond-shaped card zones per player (cyan glowing
  outlines for the near player, crimson for the far player), a plain neutral strip down the middle
  between the two players, and the small side pads (deck stacks, graveyard pad with a tombstone icon,
  hexagonal field pad).
- The flat background, the lighting direction (warm torchlight from the front corners, cool hologram
  light from the left and right), and the overall dark mood.

CHANGE: the material of the board's top surface (now plain grey stone tiles). Make it
[ polished black-indigo marble slabs with fine gold inlay lines between the zones, and faint mirror
reflections of the glowing zone outlines ]
(other options to try instead of the bracket: "dark glass panels with thin circuit-like light lines that
run between the zones" / "carved ancient dueling-temple stone with engraved runes around each zone" /
"deep obsidian with a large engraved emblem of two facing dragons in the neutral strip").
The surface must stay calm and darker than the zone outlines so cards and monsters remain the focus.

STRICT PIXEL-ART RULES:
- 640×360 game resolution look, upscaled with nearest-neighbour: every pixel is a crisp square; no
  anti-aliasing, no blur, no soft gradients, no painterly or 3D-rendered look.
- Clean 1-pixel dark outlines (#07070f). Shading in flat tone bands (3–5 tones per material),
  dithering allowed for transitions. Reflections and glows as stepped bands, not smooth glow.
- Use only this palette: ink #07070f; night #0b0d1f #12163a #1b2352 #28356f #3b4c91; steel #6578b4;
  mist #a3b1da; white #f4f7ff; stone #1d1c26 #393846 #5d5c6e #8b8a9c #c4c3d1;
  cyan #053241 #08627a #0f9db5 #3fe0ea #b6fbff; crimson #3a0819 #761030 #bd1f3e #ff4d5e #ffb6bb;
  gold #45290a #875611 #cf971d #ffd447 #fff4b5.
- Repeating elements (slab joints, inlay lines, runes) must follow the isometric tile grid so they
  can be drawn as tiles.

Output: one image, same framing and size as the reference, board only (no UI, no text, no characters
or monsters on the board).
