# Coop Quest

Co-op top-down dungeon crawler (Warrior / Mage / Healer). Single player or 2-player online.
Pure static site (HTML5 Canvas + vanilla JS) — runs on GitHub Pages, no server of your own.

## Play / host on GitHub Pages

1. Push this folder to a GitHub repository (files at the repo root).
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
3. After a minute the game is live at `https://<your-username>.github.io/<repo-name>/`.

To test locally: `python3 -m http.server 8000` and open http://localhost:8000.

## How multiplayer works

* Peer-to-peer WebRTC through [PeerJS](https://peerjs.com) (loaded from a CDN). PeerJS's free cloud broker
  is only used to introduce the two browsers; game data then flows directly between them.
* **Create Game Room** gives a 5-character code; your friend uses **Join** with it, or just taps the **Share invite link** (`?room=CODE`) and the game joins automatically.
* Keep the host's game tab in the foreground until your friend has joined. If the browser drops the room while backgrounded, it re-registers the same code when you come back.
* **Find Game** pairs you with another searching player automatically.
* The room creator's browser runs the simulation; the other player sends inputs and renders 20 Hz snapshots.
* Free STUN servers plus a best-effort free TURN relay (openrelay.metered.ca) are configured in `PJ_OPTS` at the top of the
  networking section of `game.js`. The relay is shared and may be slow or rate-limited; put your own TURN server there for reliability.

## Saving

Name, Character Points, upgrades, selected character and best level are stored in each player's browser (localStorage).
Clearing site data resets progress.

## Controls

Touch: floating joystick anywhere on the screen, Attack (bottom right), Special (above-left of Attack).
Keyboard: WASD / arrows, Space or J = attack, K / L / Shift = special.
