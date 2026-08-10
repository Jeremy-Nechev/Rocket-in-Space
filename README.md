# Rocket Runner

A browser port of a Trinket.io / Python `turtle` game: fly a rocket with real
momentum, collect coins, avoid black holes. No build step, no dependencies —
three static files.

## Play locally

Open `index.html` directly, or serve it:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000

## Deploy to GitHub Pages

```bash
git init && git add -A && git commit -m "Rocket Runner"
git branch -M main
git remote add origin git@github.com:USER/REPO.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch → `main` / `root`**.
The game lands at `https://USER.github.io/REPO/`.

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | thrust |
| `A` `D` / `←` `→` | rotate left / right |
| `S` / `↓` | full stop (costs 1 point) |
| `P` | pause |
| `R` | restart |

On touch screens: hold the left third of the arena to turn left, the right
third to turn right, the middle to thrust.

## Rules — unchanged from the original

- `+3` collect the coin (this also teleports the black hole)
- `−5` enter the black hole (it teleports)
- `−2` drift past the arena edge (rocket is recentred, velocity zeroed)
- `−1` use the full stop
- Reach **20 points** to win; your time is recorded, best time is saved locally

There is exactly one coin and one black hole at a time. Both drift and bounce
off the walls — the coin slowly, the black hole four times faster.

## Physics parity

All the numbers from the turtle version live in the `CFG` object at the top of
[`game.js`](game.js): thrust `0.1` per frame, coin drift `1`, black hole drift
`4`, collision boxes `40` and `50`, arena bound `±400`. The simulation runs on a
fixed 60 Hz step, so the feel is frame-rate independent.

One deliberate change: the original turned `10°` per key *event* and relied on
OS key-repeat, and it also bound `d` to turn left. This version turns `4°` per
frame while the key is held, with `A` left and `D` right. Adjust `CFG.TURN_DEG`
if you want it twitchier.

## Using your own art

Everything is drawn with canvas vectors, so **no image files are required**. To
use your Trinket assets instead, drop them next to `index.html` and fill in the
`ASSETS` object at the top of [`game.js`](game.js):

```js
const ASSETS = {
  ship: 'rocketship.png',
  coin: 'coin1.png',
  hole: 'blackhole.png',
  bg:   'space.jpg'
};
```

Any entry left as `''` keeps the vector shape, so you can mix and match. Sprites
are drawn at 48px (ship), 36px (coin) and 100px (black hole); the ship PNG
should be transparent with its nose pointing **right**, and the background
should be square.
