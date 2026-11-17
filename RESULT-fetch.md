# Dragon Fetch: result

**Play it:** https://www.grahampaasch.com/vr/dragons (Quest browser, Enter VR).
Grip to pick up the ball (it's on the rock beside you), let go to throw. A switches how they bring
it back. Trigger calls a dragon, as before.

## What's there (spec 36)

- The ball: a glowing amber orb, 1 m across, with a soft glow that stays visible 200 m out, and a
  faint trail.
- Throws are about 4x the hand speed (less for the hardest ones): a lob drops just off the ledge,
  an easy throw lands 40 to 70 m out on the grass, a hard one 80 to 100 m out in the lake.
- Both dragons race for every throw. In 192 simulated throws Tarn won most short ones and Ember
  most long ones. About half of easy-to-hard throws were caught in the air (a swoop).
- Missed catches: in the lake there's a splash, the ball floats, and a dragon beats at the water
  and scoops it out. On grass it lands, breathes fire at the sky, and picks the ball up. In trees
  or on a slope it hovers down and plucks it out.
- Exercise mode (the default): it flies past the ledge and tosses the ball so it rolls to your
  feet. Perch mode (A): it lands on a new rock spire beside the ledge, turns, and holds the ball
  out at chest height; take it out of its jaws with the grip.
- Between throws they circle in front of the ledge with their heads following the ball. After
  45 s with no throw they get bored and go back to the old flyover. Pick the ball up, or hold it
  over your head, to bring them back.
- Fake throw (swing without letting go): both lunge, pull up, and look back at you with a grunt.
- Safety net: if the ball sits uncollected for 20 s, a fresh one appears in your hand.
- No score, nothing counted.
- Versions: /vr/dragons always opens the newest (v3, fetch). The list of versions is on the
  opening card. v2 (dusk) is at /vr/dragons/v2 and v1 (the bright first one, as it was live) is
  at /vr/dragons/v1.

## Legs

The side-by-side test is at https://www.grahampaasch.com/vr/dragons/legs, and was emailed at
9:33 am. No answer yet, so fetch uses the **old** legs. When he picks, set `LEGS` in
`src/dragonGeometry.js` to `'new'` (or leave it `'old'`), then run tests and smoke, deploy-copy,
and push.

## Checked

- Unit tests: 58 pass (9 of them are new fetch tests).
- Smoke: 46 checks pass (flat, phone, versions, emulated Quest 1, legs page). These include
  grip, swing and release in the emulated Quest, the A button, and T to throw on a flat screen.
- Perf: the worst frame is 62 draw calls for both eyes (31 an eye) and 84k triangles, against
  52 and 82k for v2. The limit is 150.
- Simulator: 192 of 192 throws came back. No flying dragon came nearer than 13.6 m to your head
  (the rule is 11 m). The perched dragon comes close on purpose.

## Not checked

- A real arm on a real Quest 1. How hard people actually throw with a Touch controller decides
  how far the ball goes; `throwSpeed` in `src/fetch.js` is the knob.
- Frame rate on the headset (the counts are inside the budget, but nothing has been timed there).
- The new sounds (splash, thud, the snap of jaws) haven't been heard or measured.
- A soft lob that drops down the cliff is always fetched from the ground, never caught in the
  air. Snatching it there would bring a dragon too close to the cliff and to you.
