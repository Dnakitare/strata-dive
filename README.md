# STRATA // 深層降下

A browser arcade stealth-dive. You fall through nine layers of a fossil
data-stratum toward a signal that sings. Thread the gate discs, watch your
trace, keep your two KODAMA escorts alive, and finish the dive the way it
wants to be finished: quietly.

The trace meter is a detection meter. Everything loud (guns, bullet time,
tucking) buys speed or safety at the cost of being seen. The thing at the
bottom reads your noise when you arrive.

## Play

Any static file server works; there is no build step.

```
python3 -m http.server 8765
# then open http://localhost:8765
```

Controls (rebindable in the pause menu):

- Mouse steers
- `F` fires (hold for chain guns)
- `Left Shift` tucks: faster and worth more, but loud and no guns
- `Space` bullet time
- `Esc` pause, `M` mute

## Notes

- Code, mechanics, models, art, and the soundtrack are original work.
- Rendering is [three.js](https://threejs.org) (MIT), music is live-coded
  [Strudel](https://strudel.cc) (AGPL-3.0). Both are vendored; the game runs
  fully client-side with no network calls.
- The soundtrack is synthesized at runtime, no audio files.
- Chrome is the primary target. Report anything broken elsewhere.

## License

AGPL-3.0. See LICENSE.
