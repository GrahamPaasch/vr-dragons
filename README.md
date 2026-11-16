# Two Dragons, October

You stand on a rock ledge over a Wisconsin valley at the end of an October day. The maples have
turned, there is mist on the lake, leaves come down past you, and two dragons are out flying:
round each other over the water, through the gaps in the trees, low over the lake, and now and
then right over your head.

Live: **https://www.grahampaasch.com/vr/dragons**

It is a WebXR page, built for the Oculus Quest 1 and anything newer, with a flat-screen view for
laptops and phones. One static folder, no build step, nothing loaded from anywhere else: three.js
is vendored, and every shape and every sound is made by the code in `src/`.

## Using it

**In a headset.** Open the page in the headset's browser and press **Enter VR**. You are standing
on the ledge, facing the lake, wherever in your room you happen to stand and whichever way you
face: the valley is set down round you as the session starts (and again if you recentre). Look
around, lean out, look straight down. Pull a trigger to whistle for a dragon: the one that is
best placed answers at once with a short call, turns, lines up over the near end of the lake,
roars on its way in with its head turned so that the fire is seen from the side, and goes by on
your right, a little above your head. If neither can come (one is on its way already) you hear
two grunts and the controller buzzes twice. The line of words on the rim of the ledge about the
trigger comes back when the dragons are far off, until you have called one. You are never moved
after that first moment: there is no thumbstick walking and no teleport, on purpose. The dragons
do the moving.

**On a flat screen.** Press **Watch here**. The view follows the dragons until you drag to look
around (it goes back to following when left alone); on a phone held upright it turns as fast as
they pass and opens its lens when one is close. Tap the picture, or press Space, to call a
dragon. M turns the sound off and on (off, it is not worked out at all).

Sound matters here; headphones are best. It starts with your first tap, as browsers require.

## What is in it

- **The valley.** A quartzite bluff over a lake, in the spirit of the Baraboo hills: sugar maple,
  oak, birch, white pine and tamarack in stands, a gorge on the right where the creek leaves, a
  grassy gap through the trees on the left, a low sun shining down the length of the lake, and a
  few long clouds catching it. About 830 trees in the forest, seven close ones round the ledge
  with real trunks and boughs, and nine big old ones at the mouth of the creek, 50 to 130 m off
  to the front right and a little below eye level, which the dragons fly between.
- **The dragons.** Ember (red, 13.6 m across the wings) and Tarn (teal, smaller, quicker). Each is
  584 triangles on a 24-bone skeleton. They are not on rails: each chases a point that runs ahead
  of it along a hand-drawn lane, with a small flight model in between. It has to bank to turn, it
  loses speed climbing and gains it diving, it beats its wings when it needs the push or is
  flying too slowly to glide, sets them when it has speed to spare, and pulls up for rising
  ground. The wing does not move as a board: elbow and wrist follow the shoulder late, and the
  wing folds on the way up. They have to be told from a valley that is the colour of one of
  them and all in mist, so Tarn's upper side is a light teal and both get six tenths of the
  land's haze; `npm run contrast` draws each of them with and without, at a Quest 1's 16 pixels
  a degree, and says how far their colour is from what is behind them (Tarn, the weaker of the
  two, was in the band that is seen only if looked for in 22% of moments, and is in 9%).
- **Flying together.** A director strings the lanes together by chance (after a scripted opening)
  and has the two fly them as a pair: one trailing the other, weaving, wingtip to wingtip, one
  above the other, corkscrewing round each other, swapping the lead. In front of the ledge it is
  the figures that are flown, not single file; single file is for the tight places and the far
  turns. The one behind watches the one in front; both look at you when they are close. The
  director also paces it: no close lane twice within three, the long ways round kept apart, and
  the stretches with both dragons more than 80 m off kept short (in 150 simulated visits the
  longest in the first six minutes was 34 s in the median and 58 s at worst; before, 59% of
  visits had one of over a minute).
- **Fire.** About once a minute one of them roars, and breathes fire as it does: a jet as long as
  its own neck and tail, head turned a little to one side. A dragon that you call does it on its
  way in.
- **The lanes.** A figure of eight in front of the ledge; straight across the front at eye level;
  down past the foot of the ledge, far enough out that the rim does not hide them, so you look
  down on their backs; through the big trees at the mouth of the creek at the height of their
  crowns, behind one crown and out from behind the next, the one place where they are seen to
  fly *through* the forest; round behind you and down over your right shoulder; along the meadow
  gap on the left and back along the foot of the bluff; up the creek under the big trees, out
  through the gorge, and back over the trees behind you (that one is partly out of sight: about
  a quarter of it is behind crowns); low over the water and up the face of the bluff; and turns
  over the lake and the hills in between.
- **The place answers.** A dragon going by within 25 m bends the trees by the ledge, rattles the
  maple and carries the leaves in the air along its path. One that crosses the low sun hides its
  disc (the membranes of the wing light up from behind), dims the glare, and for that moment its
  shadow is on the ledge.
- **Sound.** Wind in gusts, the forest's hiss, dry leaves rattling in the maple over your left
  shoulder, chickadees in the trees by the ledge, a white-throated sparrow, a jay, crows far off,
  a woodpecker. The birds fall silent when a dragon is near, and for a while after a roar. Each
  dragon is a point in space: wingbeats that grow as it comes and arrive late from far off, the
  rush of air round it, which swells inside 45 m so that even a dive with the wings set is heard
  to come, a little higher in pitch coming than going, a short call when it answers you, and a
  roar (with the rush of its fire) that comes back off the hills a second later. The trees sway
  harder when a gust is heard.

Comfort: the viewer is stationary, nothing is attached to the head, and no dragon's body comes
within 9 m of your head (the tests fly simulated hours to hold that; a wingtip can come to about
6 m). The ledge does have a drop on three sides. If heights bother you, that is the part to know
about before you put the headset on.

## The Quest 1 budget

The target is a Snapdragon 835 at 72 frames a second, so the page is built round what that chip
is bad at (pixels, draw calls) and leans on what it has to spare (vertices):

- **Light is worked out per vertex.** Sun, sky, haze and the tone curve are all in the vertex
  shaders; almost every pixel shader writes one interpolated colour. Only the lake reads textures.
- **Nothing is rendered twice.** No shadow maps, no render-to-texture, no post-processing. The
  shadows of the hills and trees are worked out once at start and stored in the vertex colours.
  The lake's mirror image is worked out once for the ledge and kept in a 256 x 256 texture (the
  viewer does not move, so it holds); only the dragons get a real mirror image, as one more draw
  call each while they are low over the water.
- **Instancing.** The forest is 21 instanced batches, split into six slices of the compass so
  the ones behind you are not drawn. The leaves in the air are one instanced draw call whose
  falling, drifting and tumbling is all in its vertex shader.
- **Skinning in the shader.** Each dragon's 24 bones are posed on the CPU (about 0.01 ms) and
  applied in the vertex shader; a dragon is one draw call. Its fire is one more, 66 triangles
  animated in their vertex shader, and only while it is breathing.
- **Overdraw.** The sky is drawn last and only where nothing else is; there is no large
  see-through surface anywhere.
- **Sound is processor time.** A panner or a filter whose settings are being ramped is worked
  out sample by sample; one that is merely set is worked out once per block. So the listener and
  the dragons are *placed* (36 times a second), filters are stepped a few times a second and
  only when they have moved, and nothing is left ramping. Rendered offline as the page drives
  it, the sound took 5.0% of one desktop core before this and takes 2.9% now (the graph alone,
  never driven: 1.4%); `?sound=lite` makes it 2.3%. With the sound switched off the audio
  context is suspended and costs nothing; it used to cost the same muted as heard.
- **A governor.** If frames keep coming late in VR (a two-second window that ran 12% slow, or in
  which one frame in fourteen was late, twice), the page does less, one step at a time: first the
  cheaper sound and a fifth of the forest, then more of the forest, the leaves and the dragons'
  mirror images (45% of the forest is left at the last step). The first step comes within about
  6 s of the trouble starting and the last within 20 s, whatever the frame rate. It never steps
  back up within a session. None of that makes the picture smaller, and pixels are what a
  Quest 1 runs out of first, so a session that went badly is remembered (in the browser's local
  storage, for two weeks): the next one starts at 0.8 of the picture size, the one after that
  without anti-aliasing, then at 0.65. The line shown after a session says which step was
  reached and what the next session will change; `?scale=1&aa=1` in the address overrules what
  was remembered.
- **One failure does not freeze the picture.** Each part of a frame (the flight, the skeletons,
  the governor, the words on the rim, the sound) is tried on its own; if one throws it is
  reported once and left out, and the picture is still drawn and still follows the head.

Measured by `npm run perf` over four minutes of flight with the head turned every way, both eyes
of an emulated Quest 1 together:

| | draw calls | triangles |
|---|---|---|
| mean | 34 to 40 | 57,000 to 63,000 |
| worst frame | 50 (25 an eye) | 76,000 (38,000 an eye) |
| everything at once, nothing culled | 35 an eye | 40,000 an eye |

The brief's limit was 150 draw calls. Three textures and twelve shader programs, all of them
made while the page loads, the line of words shown in the headset included, so that neither the
first roar nor the first seconds of a session cost a dropped frame.

**What has not been measured** is the frame rate on a real Quest 1: the tests run in headless
Chromium, which draws in software, so they can count but cannot time. After every VR session the
page says how it went ("Last VR session: 72 frames a second on average (the headset asks for 72),
0.3% of frames late, ... detail step 0 of 3 ..."), on the page and in
`window.__dragons.state.vr.last`. If it does not hold 72 the page tries the smaller picture by
itself next time (above), and the address takes `?scale=0.8`, `?aa=0`, `?trees=0.6` and
`?sound=lite` to find out which part costs. (`?hrtf=0` and `?reverb=0` together are what
`?sound=lite` does: a fifth off what the sound costs, not more.) The estimate that the sound
takes a sixth of one of a Quest 1's fast cores is scaled from desktop timings, not measured.

## Running it

```
npm install          # only for the tools: playwright-core and iwer
npm run serve        # http://localhost:8080
npm test             # 47 unit tests of the pure modules
npm run smoke        # the real page in headless Chromium: flat, phone, /vr/dragons, emulated Quest 1, no WebGL
SMOKE_URL=https://www.grahampaasch.com/vr/dragons npm run smoke    # the same against the deployed page
npm run perf         # draw calls and triangles per frame
npm run sound        # renders every sound offline and measures it (add -- --wav to write files)
npm run fly -- 60 7 --calls --map    # fly an hour on seed 7 with calls, report clearances, draw the paths
npm run shots        # pictures from the ledge into test-results/
npm run sheet -- 15 64.5 144.5       # pictures of the flight at those seconds
npm run contrast     # how well each dragon stands out from what is behind it, along the flight
npm run map          # the valley from above
```

For a headset on USB: `adb reverse tcp:8080 tcp:8080`, then open http://localhost:8080 in the
headset's browser (WebXR needs a secure page; localhost counts).

The smoke test uses Meta's Immersive Web Emulation Runtime (iwer) as a stand-in Quest 1. It checks
that the WebXR path works: the session starts on a floor-level space, both eyes are drawn, the
picture follows the head, a person who starts 2 m from the middle of their room and turned away
is on the ledge facing the lake, nothing new is compiled when the words appear, an exception
thrown inside a frame does not stop the picture, a trigger calls a dragon, a slow session is
remembered, and leaving VR brings the page back. It is not a substitute for the headset.

Nobody can listen to a headless test, so `npm run sound` renders each sound through the page's own
audio graph on an OfflineAudioContext and measures it: level, left against right, and where the
energy lies. The levels in `src/audio.js` were set from those numbers (the loudest 0.4 s of
each: wind about -33 dB in a calm and -20 in a gust, wingbeats at 15 m -17, a far roar -18, a
called one -15, birds -24 to -29, all relative to full scale). It also renders the opening, a
called pass and three close lanes as they are really flown, the director and the page's own
per-frame code driving the sound 72 times a second, and fails on silence, clipping, a sample
that is not a number, or a close pass on which the dragons do not stand 6 dB clear of the wind
at their nearest. And it flies a pure tone past the ledge in place of a dragon, to hear whether
placing a sound in steps clicks: what comes out that is not the tone must be 30 dB down. None
of it has been tuned by ear yet.

### Things in the address

| | |
|---|---|
| `?seed=7` | the same flight every time (otherwise every visit flies differently after the opening) |
| `?scale=0.8` | VR picture size relative to the headset's own (overrules what was remembered from the last session) |
| `?foveation=0.5` | how much the edges of the VR picture are coarsened, 0 to 1 |
| `?layers=off` | draw VR through a plain XRWebGLLayer |
| `?aa=0` | no anti-aliasing (`?aa=1` puts it back if a slow session switched it off) |
| `?trees=0.6` | draw only this fraction of the forest |
| `?hrtf=0` | place the dragons' sound with plain left/right panning |
| `?reverb=0` | no echo off the hills |
| `?sound=lite` | both of those: a fifth off what the sound costs (the governor's first step does the same) |
| `?governor=off` | never thin the picture, whatever the frame rate (the tools count with this) |

## How it is put together

Everything that can be is a plain function with no three.js and no DOM in it, so that it runs in
the tests as well as in the page.

| file | |
|---|---|
| `src/world.js` | the valley as functions of position: ground, lake, forest, light, haze, where the trees stand |
| `src/terrain.js` | the land as one mesh: rings round the viewer, fine underfoot and coarse far off, lit once |
| `src/reflection.js` | what the lake mirrors, worked out once for the ledge |
| `src/ledge.js` | the trees, boulders and fallen leaves close to the viewer |
| `src/meshbuilder.js` | flat-shaded triangles into arrays: lofts, tubes, lumps |
| `src/rig.js`, `src/dragonGeometry.js` | the dragons' skeleton, how it moves, and their shape |
| `src/flight.js` | the lanes, the flight model, the director, calling |
| `src/audio.js` | everything heard |
| `src/governor.js` | holding the frame rate, within a session and from one to the next |
| `src/shaders.js`, `src/scene.js`, `src/dragons.js` | three.js: materials, the stage, drawing the dragons |
| `src/view.js`, `src/xr.js`, `src/main.js` | the flat view, WebXR, and the wiring |

The frame is metres, y up, the viewer at the origin with the ledge at y = 0, looking along -z;
the lake is 46 m down.

## Deploying

The site is `index.html`, `src/` and `vendor/`. `tools/deploy-copy.sh <folder>` copies exactly
those. The page finds its own files from wherever it is served, with or without a trailing slash
(the smoke test serves it at `/vr/dragons` the way the live site does). On grahampaasch.com it
lives in `public/vr/dragons/`, with `vr/dragons` in `STATIC_APP_DIRS` in `next.config.mjs`.

## Not done yet

- Run on the real Quest 1 and read back the frame-rate line. Everything about speed above is
  counts, not timings, and what the sound costs there is an estimate.
- Where a real Quest 1 puts the origin of its floor space has not been looked at. The page no
  longer depends on it (the valley is placed from the first head pose), but that too has only
  been seen in the emulator.
- Listen to it. The sounds are built from descriptions of the real ones and balanced by
  measurement; the roar and the birds in particular want an ear.
- Hands. In VR there is nothing where your controllers are.
- The dragons never land, and they do not react to where you look.
- The flight floor keeps bodies clear of everything and wings clear of the trees by the ledge,
  but it does not know about wings elsewhere: in simulated hours of constant calling a wingtip
  is inside a crown by the ledge for about a second an hour, and out in the forest a low pass
  can brush a treetop.
- The gorge has a creek bed but no water in it.

## Credits

Inspired by a video of two dragons flying through a forest, and by October in Wisconsin.

- [three.js](https://threejs.org) r160, MIT licence, vendored in `vendor/` with its licence.
- For the tools only (never loaded by the page): [playwright-core](https://playwright.dev)
  (Apache 2.0) and [iwer](https://github.com/meta-quest/immersive-web-emulation-runtime) (MIT).
- No models, textures, sound files or fonts: all of it is generated by the code here.
