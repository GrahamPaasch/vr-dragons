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
on the ledge. Look around, lean out, look straight down. Pull a trigger to whistle for a dragon:
the nearer one that is free turns, roars as it comes in, and goes by with a wing over your head.
You are never moved: there is no thumbstick walking and no teleport, on purpose. The dragons do
the moving.

**On a flat screen.** Press **Watch here**. The view follows the dragons until you drag to look
around (it goes back to following when left alone). Tap the picture, or press Space, to call a
dragon. M turns the sound off and on.

Sound matters here; headphones are best. It starts with your first tap, as browsers require.

## What is in it

- **The valley.** A quartzite bluff over a lake, in the spirit of the Baraboo hills: sugar maple,
  oak, birch, white pine and tamarack in stands, a gorge on the right where the creek leaves, a
  grassy gap through the trees on the left, a low sun shining down the length of the lake, and a
  few long clouds catching it. About 840 trees in the forest, and seven close ones round the ledge
  with real trunks and boughs.
- **The dragons.** Ember (red, 13.6 m across the wings) and Tarn (teal, smaller, quicker). Each is
  584 triangles on a 24-bone skeleton. They are not on rails: each chases a point that runs ahead
  of it along a hand-drawn lane, with a small flight model in between. It has to bank to turn, it
  loses speed climbing and gains it diving, it beats its wings when it needs the push and glides
  when it does not, and it pulls up for rising ground. The wing does not move as a board: elbow
  and wrist follow the shoulder late, and the wing folds on the way up.
- **Flying together.** A director strings the lanes together by chance (after a scripted opening)
  and has the two fly them as a pair: one trailing the other, weaving, wingtip to wingtip, one
  above the other, corkscrewing round each other, swapping the lead. The one behind watches the
  one in front; both look at you when they are close.
- **Fire.** About once a minute one of them roars, and breathes fire as it does: straight out
  ahead, a jet as long as its own neck and tail. A dragon that you call does it on its way in.
- **The lanes.** A figure of eight in front of the ledge; straight across the front at eye level;
  under the ledge, so you look down on their backs; round behind and down over your right
  shoulder; through the meadow gap; through the gorge under the treetops; low over the water and
  up the face of the bluff; and wide turns over the lake and the hills in between.
- **Sound.** Wind in gusts, the forest's hiss, dry leaves rattling in the maple over your left
  shoulder, chickadees in the trees by the ledge, a white-throated sparrow, a jay, crows far off,
  a woodpecker. The birds fall silent when a dragon is near, and for a while after a roar. Each
  dragon is a point in space: wingbeats that grow as it comes and arrive late from far off, the
  hiss of a glide, a little higher in pitch coming than going, and a roar (with the rush of its
  fire) that comes back off the hills a second later. The trees sway harder when a gust is heard.

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
- **A governor.** If frames keep coming late in VR, the forest and the leaves are thinned one step
  at a time (to 45% at the last step) and the dragons' mirror images go. It never steps back up
  within a session.

Measured by `npm run perf` over four minutes of flight with the head turned every way, both eyes
of an emulated Quest 1 together:

| | draw calls | triangles |
|---|---|---|
| mean | 33 to 38 | 54,000 to 58,000 |
| worst frame | 48 (24 an eye) | 69,000 (35,000 an eye) |
| everything at once, nothing culled | 34 an eye | 37,000 an eye |

The brief's limit was 150 draw calls. Two textures, eleven shader programs, all compiled while
the page loads so that the first roar does not cost a dropped frame.

**What has not been measured** is the frame rate on a real Quest 1: the tests run in headless
Chromium, which draws in software, so they can count but cannot time. After every VR session the
page says how it went ("Last VR session: 72 frames a second on average (the headset asks for 72),
0.3% of frames late, ..."), on the page and in `window.__dragons.state.vr.last`. If it does not
hold 72, the address takes `?scale=0.8` (a smaller picture), `?aa=0`, `?trees=0.6`, `?hrtf=0`
and `?reverb=0` to find out which part costs.

## Running it

```
npm install          # only for the tools: playwright-core and iwer
npm run serve        # http://localhost:8080
npm test             # 39 unit tests of the pure modules
npm run smoke        # the real page in headless Chromium: flat, phone, /vr/dragons, emulated Quest 1, no WebGL
SMOKE_URL=https://www.grahampaasch.com/vr/dragons npm run smoke    # the same against the deployed page
npm run perf         # draw calls and triangles per frame
npm run sound        # renders every sound offline and measures it (add -- --wav to write files)
npm run fly -- 60 7 --calls --map    # fly an hour on seed 7 with calls, report clearances, draw the paths
npm run shots        # pictures from the ledge into test-results/
npm run sheet -- 15 64.5 144.5       # pictures of the flight at those seconds
npm run map          # the valley from above
```

For a headset on USB: `adb reverse tcp:8080 tcp:8080`, then open http://localhost:8080 in the
headset's browser (WebXR needs a secure page; localhost counts).

The smoke test uses Meta's Immersive Web Emulation Runtime (iwer) as a stand-in Quest 1. It checks
that the WebXR path works: the session starts on a floor-level space, both eyes are drawn, the
picture follows the head, a trigger calls a dragon, and leaving VR brings the page back. It is not
a substitute for the headset.

Nobody can listen to a headless test, so `npm run sound` renders each sound through the page's own
audio graph on an OfflineAudioContext and measures it: level, left against right, and where the
energy lies. The levels in `src/audio.js` were set from those numbers (wind about -35 dB in a
calm and -23 in a gust, a wingbeat at 15 m about -20, a far roar -18, a called one -15, birds
-26 to -31, all relative to full scale). It also renders the opening and a called pass as they
are really flown, the director and the page's own per-frame code driving the sound 72 times a
second, and fails on silence, clipping or a sample that is not a number. None of it has been
tuned by ear yet.

### Things in the address

| | |
|---|---|
| `?seed=7` | the same flight every time (otherwise every visit flies differently after the opening) |
| `?scale=0.8` | VR picture size relative to the headset's own |
| `?foveation=0.5` | how much the edges of the VR picture are coarsened, 0 to 1 |
| `?layers=off` | draw VR through a plain XRWebGLLayer |
| `?aa=0` | no anti-aliasing |
| `?trees=0.6` | draw only this fraction of the forest |
| `?hrtf=0` | place the dragons' sound with plain left/right panning |
| `?reverb=0` | no echo off the hills |
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
| `src/governor.js` | holding the frame rate |
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
  counts, not timings.
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
