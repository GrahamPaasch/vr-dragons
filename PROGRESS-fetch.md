# Dragon Fetch: progress (resumable)

Brief: BRIEF-fetch.md. Spec (binding): ~/claude/voice-ui/specs/36-dragon-fetch.md.
Deploy: copy into ~/personal-webpage/public/vr/dragons..., commit, `git push` (Vercel builds main). Email: `gmail send --to grahampaasch@gmail.com ...`.

## Plan / state
- [x] 1. Versions: git tag v2 (cf0efa2) + v1 (personal-webpage ec56829 = v1 as it was live). Live layout:
      /vr/dragons = newest (v3 fetch), /vr/dragons/v1, /vr/dragons/v2 as frozen copies; a versions list on the page.
- [x] 2. Legs test page live at /vr/dragons/legs, emailed 11/17 (reply in thread 1a1e935fe36f477a, sent 1a1ea24c3bc30299). CHECK GMAIL for "old"/"new" between milestones: gmail list --query "newer_than:1d from:me legs OR old OR new".
- [x] 3. Fetch (spec 36).
- [ ] 4. tests, perf, deploy, curl 200.
- [ ] DONE: RESULT-fetch.md, email, memory append.

## Log
- 1 DONE: tags v1=fb467ed (v1 as live, per personal-webpage ec56829), v2=cf0efa2 (identical to live v2). Frozen copies in v1/ v2/
  (each index.html loads ../versions.js), versions.js at root (one list for all), serve.mjs + deploy-copy.sh know v1/v2/legs,
  smoke 'path' checks the lists. Deploy will need vr/dragons/v1, /v2, /legs in personal-webpage STATIC_APP_DIRS.
- 2 (in progress): new legs in rig.js (28 bones: legL/R thigh, shinL/R, footL/R; pose: legs, reach, crouch, hipPitch, fold, neckRaise),
  dragonGeometry buildLegs (build.legs 'new'|'old'; returns feet for rig.footDrop), wing FOLD found by search. legs/ page
  (legs.js; legs/src + legs/vendor are a SNAPSHOT via tools/legs-snapshot.sh), tools/legs-shots.mjs, smoke 'legs'.
  Commit b78b0fe. personal-webpage 9654d53 pushed (legs only + STATIC_APP_DIRS vr/dragons/legs). NEXT: curl 200, email Graham.
- 2 DONE: live 200, smoke 'legs' passes against live. Email sent as a reply in his 360-film thread (the privacy hook blocks typing his address).
- 3 (in progress): src/fetch.js (pure game: Ball physics, Fetch: chase/swoop/approach+descend/scenes land|water|pluck,
  exercise toss via director.sendPast(drop), perch via spire scripts, eager ring, bored, fake, 20 s safety net, keepClear +
  steerClear so no flying body within ~13 m of the head). flight.js hooks: director.game, sendPast, wideLook, Flyer leg fields.
  tools/fetchsim.mjs (FETCH_STATS=8 for a matrix). DRAGONS legs = LEGS const ('old' until he picks).
  NEXT: perch offer reach (Ember), then rendering (ball/glow/trail, splash, spire in ledge mesh, hands), input (grip/A), audio, flat throw.
- 3 DONE: fetch built + tested (fetchsim 192/192, nearest 13.6 m), pictures via tools/fetchshots.mjs. Commits up to 1d4128a.
- 4: tests 58 pass, smoke 46 pass, perf worst 62 calls both eyes (31/eye), 84k tris. personal-webpage e681618 pushed
  (root v3 + v1 + v2 + legs; STATIC_APP_DIRS += vr/dragons/v1, v2). NEXT: wait Vercel, curl 200, live smoke, email, memory.
