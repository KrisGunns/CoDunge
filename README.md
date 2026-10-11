# CoDunge

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

Character Points found by either player in a multiplayer run are credited to both players. Name, Character Points (each point = +1 ATK or +5 HP, your choice), upgrades, selected character and best level are stored in each player's browser (localStorage).
Clearing site data resets progress.

## Controls

Works in portrait and landscape. On a portrait screen the host gets a tall room (start at the bottom, door on one of the other sides) that fills the screen width; a player on a landscape screen joining a portrait host just sees it scaled to fit.
Touch: floating joystick anywhere on the screen, Attack (bottom right), Special (stacked above Attack).
Revive: a green **Revive** button (left of Attack) appears when you stand next to a downed ally (keyboard: R or E).
Keyboard: WASD / arrows, Space or J = attack, K / L / Shift = special.

## Enemies

* Rat, Goblin — melee. **Skeleton Archer** (from stage 2-1 on) — shoots arrows from range and backs away if you get close.
* Level 10 boss, the **Troll**: after 2 s of charging (a red circle shows the area) it smashes everything in a wide radius for 3× its ATK, every 10 s.
* Healer's ray only reaches allies within range; with nobody in range it heals only the healer. There is no free healing between levels.
