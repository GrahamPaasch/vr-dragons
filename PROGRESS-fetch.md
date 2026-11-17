# Dragon Fetch: progress (resumable)

Brief: BRIEF-fetch.md. Spec (binding): ~/claude/voice-ui/specs/36-dragon-fetch.md.
Deploy: copy into ~/personal-webpage/public/vr/dragons..., commit, `git push` (Vercel builds main). Email: `gmail send --to grahampaasch@gmail.com ...`.

## Plan / state
- [x] 1. Versions: git tag v2 (cf0efa2) + v1 (personal-webpage ec56829 = v1 as it was live). Live layout:
      /vr/dragons = newest (v3 fetch), /vr/dragons/v1, /vr/dragons/v2 as frozen copies; a versions list on the page.
- [ ] 2. Legs test page (/vr/dragons/legs-test), emailed; check Gmail for his pick between milestones.
- [ ] 3. Fetch (spec 36).
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
