# Video generation prompts (landing and sign-in)

Light, bright, calm. Matches [DESIGN_DIRECTION.md](../DESIGN_DIRECTION.md): a voice crosses a classroom.
No sign-up clips: the product has no sign-up page (accounts are seeded).

## Files to make
| Use | Clips | Save as |
|---|---|---|
| Landing hero | 3 x 8 s, one story in three acts | `app/public/media/signin-a.mp4 (re-edited)`, `landing-2.mp4`, `landing-3.mp4` |
| Sign-in background | 2 x 8 s, seamless loops | `app/public/media/signin-1.mp4`, `signin-2.mp4` |

Specs for every clip: 16:9, 1920x1080 or higher, 24 or 30 fps, 8 seconds, no audio, slow steady camera with smooth easing.

## Style prefix (paste at the start of every prompt)
```
Bright, premium daylight photography grade, soft natural window light, clean airy look. Colour palette: warm chalk-paper off-white #F8F6EF, ink green-black #172524 for shadows, one marigold yellow accent #F4B23E, a small touch of teal #3FB8A0. Light and pleasant, not dark, no neon, no heavy contrast. Shallow depth of field, slow smooth camera movement, cinematic but calm. Absolutely no text, letters, numbers, logos, watermarks, captions or readable writing anywhere. No visible faces: show children and the teacher from behind, as soft silhouettes, or only hands.
```

## Landing, act 1 (the problem): `landing-1.mp4`
```
[style prefix] A bright rural Indian village school room in morning light, seen from a high wide angle. One teacher stands at a plain chalkboard (the board has only abstract chalk smudges, no writing) teaching a small group of younger children sitting on the floor, while two other groups of older children in different corners wait with their hands in their laps, looking restless. The teacher's attention is stretched thin between the groups. Warm dust motes float in sunbeams. Slow gentle push-in toward the room. 8 seconds.
```

## Landing, act 2 (the transformation): `landing-2.mp4`
```
[style prefix] Close, soft-focus shot of a small simple round speaker sitting on a wooden school desk, a phone leaning against it. From the speaker, thin concentric rings of warm marigold light #F4B23E expand gently outward across the room like ripples of sound, passing over the children, who sit up and raise small hands. Small abstract glowing shapes, like soft bubbles of speech with no letters, drift from the speaker and settle near different groups of children. Camera glides slowly sideways. Light and hopeful, no darkness. 8 seconds.
```

## Landing, act 3 (the resolved state, seamless loop): `landing-3.mp4`
```
[style prefix] The same bright village classroom, now calm and busy: the teacher kneels beside one group of children, while another group listens attentively to a small round speaker on a desk, soft marigold light rings faintly pulsing around it. Hands raise, pebbles and seeds are counted on the floor. Warm sunlight streams through a window. Very slow gentle camera drift. The final frame must match the first frame exactly so the video loops seamlessly. 8 seconds.
```

## Sign-in, loop 1: `signin-1.mp4` (trustworthy and quiet)
```
[style prefix] A tidy wooden desk by a window in soft morning light: a small round speaker, a phone and a pencil resting beside a stack of plain paper, a thin curtain moving very slightly in a breeze. The centre of the frame is the brightest and quietest part, mostly empty soft off-white light, so a form can sit on top of it. Almost still, a barely perceptible slow push-in. Seamless loop: first frame equals last frame. 8 seconds.
```

## Sign-in, loop 2: `signin-2.mp4` (a calm second angle)
```
[style prefix] Soft out-of-focus classroom with a blackboard and wooden benches in warm daylight, golden dust motes drifting slowly in sunbeams, a single thin ring of marigold light #F4B23E fading in and out in the distance. The centre stays bright, empty and calm. Extremely slow lateral camera drift. Seamless loop: first frame equals last frame. 8 seconds.
```

## After you generate them
Drop the six files in `app/public/media/`. I will:
- convert them to `.webm` + `.mp4` and make a `.jpg` poster per clip,
- load only the first clip eagerly, and show static posters under `prefers-reduced-motion`,
- keep the media on the landing and sign-in pages only. The offline teacher app never loads it.

Budget: keep the six clips under about 12 MB total (the 2G reality of the audience). If the generator gives you large files, tell me and I will re-encode them smaller.
