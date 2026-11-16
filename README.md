# Two Dragons, October

You stand on a rock ledge over a Wisconsin valley as the sun goes down on an October day. The
sky is on fire, the lake below is that sky lying on the ground with a road of light across it,
the far ranges stand one behind another in the haze, leaves come down past you, and two dragons
come in out of the sun: over the water, through the gaps in the trees, and, half a minute in,
down over your shoulder with their wings set, the big one's wing passing over your head.

Live: **https://www.grahampaasch.com/vr/dragons**

It is a WebXR page, built for the Oculus Quest 1 and anything newer, with a flat-screen view for
laptops and phones. One static folder, no build step, nothing loaded from anywhere else: three.js
is vendored, and every shape and every sound is made by the code in `src/`.

## Version 2: the look

The first version worked and looked like a toy: a bright flat afternoon, every colour at full
strength, dragons the size of big birds that darted. "Very cartoony, like Roblox." The shapes
and the flight model were fine. What was wrong was the art direction, and that is what this
version changes; there is not one triangle more of detail in the land, the trees or the
dragons. A Quest 1 has no pixels to spare, so all of it is done the way *Journey*, *Sky* and
*Monument Valley* do it on weak hardware: with light, air, scale, silhouette and motion.

- **Light.** One key light, and it is the sun, six degrees up at the far end of the lake and
  drawn nine times its real size, with the sky in bands from white-gold through orange and
  crimson to the indigo of dusk overhead. Everything is lit from there: warm where it strikes,
  the blue of the dusk where it does not, and a harder edge between the two than daylight has.
  Leaves and wing membranes pass it, so a tree or a wing between you and the sun glows like a
  lantern; whatever crosses the sun is a dark shape with a lit rim.
- **Air.** Haze that takes its colour from where you look (blazing toward the sun, rose to the
  sides, violet with the sun behind you), thick enough that each ridge is a shade paler than
  the one in front, with three far ranges painted beyond everything that is built. Shafts of
  sunlight fan out through it. Mist lies on the far half of the lake. Motes hang in the air and
  show when you look toward the sun through them; sparks rise and ash drifts down, more for a
  while after fire; the falling leaves light up as they cross the sun.
- **A grade.** One curve over the whole picture: a soft shoulder so nothing clips, a gamma for
  each channel so that shadows fall cool and lights stay warm, an S-curve for contrast, and a
  gentle vignette. The lake is a dark mirror with the sun's path on it: molten down the middle,
  breaking into glints toward the viewer.
- **Scale.** The dragons are half as big again: Ember is 19.7 m across the wings, the span of a
  small airliner, and Tarn 15.8 m. The valley got bigger without being built bigger: the far
  ranges, and haze enough to hide where the built land ends.
- **Motion with weight.** They beat more slowly, roll more slowly, take their bends at a
  gentler bank, and the figures the two fly together swing a third as fast. Flown for twenty
  minutes, each dragon of the first version rolled from one wing to the other eight times a
  minute, at 27 degrees a second on average, and was banked beyond 50 degrees 14% of the time;
  now four to five times a minute, at 17 degrees a second, and 1.5% of the time.
- **Staging.** The opening is the same every visit, and it is composed. The two come in out of
  the sun from the far end of the lake. Nine seconds in the big one roars, its fire against
  the sunset. They climb past the ledge on its left, go round behind you over the trees (past
  the moon, if you turn to watch them go), and come back down over your right shoulder in
  single file with their wings set and cupped: 12 m/s, the big one first, its body 15 m from
  your head and its wing over it, the other two and a half seconds behind. Then out over the
  valley and across the sun's disc, and for that moment their shadow is on the ledge. A turn
  over the lake, a figure of eight in front of you, a climb into the sun and a stoop through it
  to the water, and up the face of the bluff. After that the lanes are chosen by chance.
- **And behind you.** Opposite the sun, over the trees at the back of the ledge, a nearly full
  moon and the first stars. They cost nothing (they are painted on the sky's own mesh), and
  they are there so that turning round is rewarded.

None of this is post-processing. The "bloom" on the sun and on the fire is geometry: soft discs
and fans of added light, one interpolated colour a pixel. The "volumetric" shafts are thirteen
blades of the same, drawn at a depth so that near things stand in front of them. The grade, the
haze and the vignette are worked out per vertex. What it all costs is in the budget below.

## Using it

**In a headset.** Open the page in the headset's browser and press **Enter VR**. You are standing
on the ledge, facing the lake and the sunset, wherever in your room you happen to stand and
whichever way you face: the valley is set down round you as the session starts (and again if you
recentre). Look around, lean out, look straight down, turn round. The first two minutes are the
opening described above. Pull a trigger to whistle for a dragon: the one that is best placed
answers at once with a short call, turns, lines up over the near end of the lake, roars on its
way in with its head turned so that the fire is seen from the side, and glides by on your right
with its wings set, 14 m off and a little above your head. If neither can come (one is on its
way already) you hear two grunts and the controller buzzes twice. The line of words on the rim
of the ledge about the trigger comes back when the dragons are far off, until you have called
one. You are never moved after that first moment: there is no thumbstick walking and no
teleport, on purpose. The dragons do the moving.

**On a flat screen.** Press **Watch here**. The view follows the dragons until you drag to look
around (it goes back to following when left alone); on a phone held upright it turns as fast as
they pass and opens its lens when one is close. Tap the picture, or press Space, to call a
dragon. M turns the sound off and on (off, it is not worked out at all).

Sound matters here; headphones are best. It starts with your first tap, as browsers require.

## What is in it

- **The valley.** A quartzite bluff over a lake, in the spirit of the Baraboo hills: sugar maple,
  oak, birch, white pine and tamarack in stands, a gorge on the right where the creek leaves, a
  grassy gap through the trees on the left, the sun going down at the far end of the lake, long
  bars of cloud lit from below, three far ranges beyond, and the moon behind. About 830 trees in
  the forest, seven close ones round the ledge with real trunks and boughs, and nine big old
  ones at the mouth of the creek, 50 to 130 m off to the front right and a little below eye
  level, which the dragons fly between.
- **The dragons.** Ember (red, 19.7 m across the wings) and Tarn (teal, 15.8 m, quicker). Each is
  584 triangles on a 24-bone skeleton. They are not on rails: each chases a point that runs ahead
  of it along a hand-drawn lane, with a small flight model in between. It has to bank to turn, it
  loses speed climbing and gains it diving, it beats its wings when it needs the push or is
  flying too slowly to glide, sets them when it has speed to spare (and where a lane says so:
  spread, cupped and still, for a slow pass over something close), folds them in a dive, and
  pulls up for rising ground. The wing does not move as a board: elbow and wrist follow the
  shoulder late, and the wing folds on the way up. They have to be told from a valley that is
  the colour of one of them and all in haze, so they get a quarter of the land's haze and stand
  in the glow as dark shapes; `npm run contrast` draws each of them with and without, at a
  Quest 1's 16 pixels a degree, and says how far their colour is from what is behind them.
  (Ember, a red dragon in a red valley, is the weaker of the two: it was in the band that is
  seen only if looked for in 24% of moments with the first version's share of the haze, and is
  in 9%; Tarn in 3%.)
- **Flying together.** A director strings the lanes together by chance (after the staged opening)
  and has the two fly them as a pair: one trailing the other, weaving, wingtip to wingtip, one
  above the other, corkscrewing round each other, swapping the lead. In front of the ledge it is
  the figures that are flown, not single file; single file is for the tight places and the far
  turns. The one behind watches the one in front; both look at you when they are close. The
  director also paces it: no close lane twice within three, the long ways round kept apart, and
  the stretches with both dragons more than 80 m off kept short (in 150 simulated visits the
  longest in the first six minutes was 34 s in the median and 48 s at worst).
- **Fire.** About once a minute one of them roars, and breathes fire as it does: a jet as long as
  its own neck and tail, head turned a little to one side, with a glow round it that lights its
  own head and breast. A dragon that you call does it on its way in.
- **The lanes.** The sweep of the opening, round behind you and down over your right shoulder
  with wings set; the stoop, up into the sun and down through it to the water with wings
  folded; a figure of eight in front of the ledge; straight across the front at eye level; down
  past the foot of the ledge, far enough out that the rim does not hide them, so you look down
  on their backs; through the big trees at the mouth of the creek at the height of their
  crowns, behind one crown and out from behind the next, the one place where they are seen to
  fly *through* the forest; a dive over your right shoulder into the valley; along the meadow
  gap on the left and back along the foot of the bluff; up the creek under the big trees, out
  through the gorge, and back over the trees behind you (that one is partly out of sight: about
  a quarter of it is behind crowns); low over the water and up the face of the bluff; and turns
  over the lake and the hills in between.
- **The place answers.** A dragon going by within 34 m bends the trees by the ledge, rattles the
  maple and carries the leaves and the motes in the air along its path. One that crosses the low
  sun hides its disc (the membranes of the wing light up from behind), dims the glare and the
  shafts of light, and for that moment its shadow is on the ledge. After fire the sparks in the
  air are alight.
- **Sound.** Wind in gusts, the forest's hiss, dry leaves rattling in the maple over your left
  shoulder, chickadees in the trees by the ledge, a white-throated sparrow, a jay, crows far off,
  a woodpecker. The birds fall silent when a dragon is near, and for a while after a roar. Each
  dragon is a point in space: wingbeats that grow as it comes and arrive late from far off (and
  are slower and deeper than they were, for bigger animals), the rush of air round it, which
  swells inside 56 m and swells again when the wings are cupped, so that the swoop of the
  opening, which has no wingbeat in it at all, is heard to come from behind you; a little
  higher in pitch coming than going; a short call when it answers you; and a roar (with the
  rush of its fire) that comes back off the hills a second later. The trees sway harder when a
  gust is heard.

Comfort: the viewer is stationary, nothing is attached to the head, and nothing flies at your
face. The close passes come from behind and go away in front of you, or go by to one side; they
are glides at 12 m/s, not charges. No dragon's body comes within 11 m of your head (flown: 14 m)
and no wingtip within 5.5 m (flown: 6.5 m and more): the tests fly simulated hours, with the
wings posed as the picture poses them, to hold both. The ledge does have a drop on three sides.
If heights bother you, that is the part to know about before you put the headset on.

## The Quest 1 budget

The target is a Snapdragon 835 at 72 frames a second, so the page is built round what that chip
is bad at (pixels, draw calls) and leans on what it has to spare (vertices):

- **Light is worked out per vertex.** Sun, sky, haze, the grade and the vignette are all in the
  vertex shaders; almost every pixel shader writes one interpolated colour. Only the lake reads
  textures (three reads a pixel: the mirror, a swell that nudges it, and the crests the glints
  are cut from). That is why the whole of the new look could be afforded: a sunset costs a
  vertex shader no more than an afternoon does.
- **Nothing is rendered twice.** No shadow maps, no render-to-texture, no post-processing. The
  shadows of the hills and trees are worked out once at start and stored in the vertex colours.
  The lake's mirror image is worked out once for the ledge and kept in a 256 x 256 texture (the
  viewer does not move, so it holds); only the dragons get a real mirror image, as one more draw
  call each while they are low over the water.
- **Instancing.** The forest is 20 instanced batches, split into six slices of the compass so
  the ones behind you are not drawn. The leaves in the air are one instanced draw call whose
  falling, drifting and tumbling is all in its vertex shader.
- **Skinning in the shader.** Each dragon's 24 bones are posed on the CPU (about 0.01 ms) and
  applied in the vertex shader; a dragon is one draw call. Its fire is one more, 174 triangles
  (66 of flame and 108 of the glow round it) animated in their vertex shader, and only while it
  is breathing.
- **Glow without a second pass.** What a camera would call bloom is drawn as what it is: light
  added round a bright thing. The sun's glow and the light that spills over the edge of
  whatever stands in front of it are rings of triangles; the shafts of sunlight are thirteen
  soft blades; the fire's glow is three discs that face the eye. Each is vertex-coloured to
  nothing at its edge, so none has an outline, and none reads a texture.
- **Overdraw, counted.** The sky is drawn last and only where nothing else is. The see-through
  things are what cost a headset pixels, so `npm run perf` draws each of them alone, as one eye
  of a headset sees it, looking 48 ways, and counts the pixels it is blended into (below). The
  first time that was run it found the mist on the lake covering half of the picture for a
  veil that could hardly be told from the haze that costs nothing; it now lies where it is
  seen. What hangs in the air is capped at 240 specks, each a few pixels. The governor takes
  the see-through things away first.
- **Sound is processor time.** A panner or a filter whose settings are being ramped is worked
  out sample by sample; one that is merely set is worked out once per block. So the listener and
  the dragons are *placed* (36 times a second), filters are stepped a few times a second and
  only when they have moved, and nothing is left ramping. Rendered offline as the page drives
  it, the sound took 5.0% of one desktop core before this and takes 2.9% now (the graph alone,
  never driven: 1.4%); `?sound=lite` makes it 2.3%. With the sound switched off the audio
  context is suspended and costs nothing; it used to cost the same muted as heard.
- **A governor.** If frames keep coming late in VR (a two-second window that ran 12% slow, or in
  which one frame in fourteen was late, twice), the page does less, one step at a time: first the
  cheaper sound, a fifth of the forest and two fifths of what is see-through (motes, shafts of
  light, mist), then more of the forest, the leaves and the dragons' mirror images (45% of the
  forest and none of the mist, motes or shafts are left at the last step). The first step comes within about
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

| | draw calls | triangles | version 1 |
|---|---|---|---|
| mean | 36 to 43 | 67,000 to 72,000 | 34 to 40; 57,000 to 63,000 |
| worst frame | 52 (26 an eye) | 82,000 (41,000 an eye) | 50; 76,000 |
| everything at once, nothing culled | 37 an eye | 45,000 an eye | 35; 40,000 |

So the whole of version 2 is two draw calls an eye (the mist, and what hangs in the air) and
about 5,400 triangles: the far ranges, the moon and stars, the shafts of light, the specks in
the air, and the glow of the fire. The brief's limit was 150 draw calls. Three textures and
fourteen shader programs (there were twelve), all of them made while the page loads, the line of
words shown in the headset included, so that neither the first roar nor the first seconds of a
session cost a dropped frame.

How much of one eye's picture each see-through thing is blended into, drawn alone and counted,
at most (looking the worst way) and on average over every way a head can face:

| | at most | on average |
|---|---|---|
| the glow round the sun, and its light over the edge of things | 13.1% | 3.1% |
| shafts of sunlight | 3.5% | 0.8% |
| mist on the lake | 5.2% | 1.0% |
| motes, sparks and ash (240 at most) | 0.2% | 0.1% |

All of them together are a fifth of a picture of extra pixels looking straight into the sunset,
each a single added colour, and a twentieth on average.

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
npm run perf         # draw calls and triangles per frame, and the pixels the see-through things cover
npm run sound        # renders every sound offline and measures it (add -- --wav to write files)
npm run fly -- 60 7 --calls --map    # fly an hour on seed 7 with calls: clearances, wingtips, restlessness; draw the paths
npm run shots        # pictures from the ledge into test-results/
npm run sheet -- 15 64.5 144.5       # pictures of the flight at those seconds
SHEET_ROAR=0 npm run sheet -- 58     # the same with the big dragon breathing fire
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
each: wind about -33 dB in a calm and -20 in a gust, wingbeats at 15 m -16, a far roar -18, a
called one -15, birds -24 to -29, all relative to full scale). It also renders the opening, a
called pass and three close lanes as they are really flown, the director and the page's own
per-frame code driving the sound 72 times a second, and fails on silence, clipping, a sample
that is not a number, or a close pass on which the dragons do not stand 6 dB clear of the wind
at their nearest. (The swoop of the opening is a glide, with no wingbeat in it: the rush of
the cupped wings alone comes out at -16 dB, as loud as a beating pass at the same distance.) And it flies a pure tone past the ledge in place of a dragon, to hear whether
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
| `src/world.js` | the valley as functions of position: ground, lake, forest, where the trees stand; and the look as numbers: the light, the haze, the sky, the far ranges, the moon, the grade |
| `src/terrain.js` | the land as one mesh: rings round the viewer, fine underfoot and coarse far off, lit once |
| `src/reflection.js` | what the lake mirrors, worked out once for the ledge |
| `src/ledge.js` | the trees, boulders and fallen leaves close to the viewer |
| `src/meshbuilder.js` | flat-shaded triangles into arrays: lofts, tubes, lumps |
| `src/rig.js`, `src/dragonGeometry.js` | the dragons' skeleton, how it moves, and their shape |
| `src/flight.js` | the lanes, the flight model, the director (and the staged opening), calling |
| `src/audio.js` | everything heard |
| `src/governor.js` | holding the frame rate, within a session and from one to the next |
| `src/shaders.js`, `src/scene.js`, `src/dragons.js` | three.js: materials (where the light, the haze and the grade are applied), the stage, drawing the dragons |
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
- Look at it in the headset. Version 2's look was judged from pictures drawn on a desktop, at a
  Quest 1's field of view but not on its screen: its colours, its black level and its lenses
  have not been seen. The grade is three numbers in `src/world.js` (`GRADE`) if it wants
  changing, and the vignette two in `src/shaders.js`.
- Listen to it. The sounds are built from descriptions of the real ones and balanced by
  measurement; the roar and the birds in particular want an ear, and so does the rush of the
  swoop, which is new.
- Hands. In VR there is nothing where your controllers are.
- The dragons never land, and they do not react to where you look.
- The lanes were drawn for the first, smaller pair. These two fly them more slowly and with
  more room round the ledge, but a figure of eight 58 m across is a tight thing for an animal
  20 m across: wider lanes would suit them better.
- The flight floor keeps bodies clear of everything and wings clear of the trees by the ledge
  and of the viewer's head, but it does not know about wings elsewhere: out in the forest a low
  pass can brush a treetop, and between the big trees by the creek the room left for a wing is
  what it was for the smaller pair.
- The stars do not twinkle and the moon does not light anything.
- The gorge has a creek bed but no water in it.

## Credits

Inspired by a video of two dragons flying through a forest, and by October in Wisconsin.

- [three.js](https://threejs.org) r160, MIT licence, vendored in `vendor/` with its licence.
- For the tools only (never loaded by the page): [playwright-core](https://playwright.dev)
  (Apache 2.0) and [iwer](https://github.com/meta-quest/immersive-web-emulation-runtime) (MIT).
- No models, textures, sound files or fonts: all of it is generated by the code here.
