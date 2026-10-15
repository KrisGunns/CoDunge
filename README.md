# Doom and Dungeons

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
* **Find Game** pairs you with another searching player automatically, looking near you first (same time zone, then nearby time zones, then your continent, then worldwide).
* **Lobby:** once connected you can open Characters / Pets / Equipment / Shop from the lobby and come back to it; your friend sees "customizing…" and Start unlocks when you return.
* **Settings → Save Data:** create a save code (copy or download) and load it on another device. Sound and Privacy Policy are placeholders for now.
* The room creator's browser runs the simulation; the other player sends inputs and renders 20 Hz snapshots.
* Multiplayer is direct peer to peer (free STUN only, no relay): the host's device runs the game. If both networks block direct links the
  connection fails; list TURN servers in `turn-config.js` to allow a relay fallback.

## Saving

Character Points found by either player in a multiplayer run are credited to both players. Name, Character Points (each point = +1 ATK or +5 HP, your choice; spend them with the +1 / +5 / Max buttons or type an amount), upgrades, selected character and best level are stored in each player's browser (localStorage).
Clearing site data resets progress.

## Gold, pets, equipment and shop

* Every kill pays gold: `ROUND(base × (1 + 0.15 × (stage − 1)))` with base Rat 2.5 / Goblin 5 / Skeleton Archer 5 / Voidling 7.5 / Sorcerer 10 (bosses and summoned archers pay nothing). Both co-op players get all gold and points.
* Normal enemies drop (per kill) a Character Point 3%, a **Pet Point** 3% and a **health potion** 8% (walk over it to heal 20% of max HP). Bosses give exactly one point (Character or Pet) plus one random piece of equipment.
* **Pets** (5000 gold each in the Shop): Wolf, Panther (Attackers), Turtle (Defender). One pet follows you; a KO'd pet respawns after 20 s. Pet Points: +1 ATK or +5 HP. The Healer's skill also heals pets in range (half amount).
* **Equipment** (Equipment button on the menu, unlocked at best stage 5-1; pieces are shown as a grid, tap one to equip or merge it): Head = passive, Body = HP, Weapon = ATK, 7 rarities (Common … Doomsday); `MERGE_N` (3) identical pieces of the same rarity merge into the next one. It can't be bought directly: the Shop's Equipment tab (also unlocked at 5-1) has a **Buy** page with the single **Treasure Chest** (starts at 1000 gold, 2 random pieces; every purchase counts toward its level, up to level 12, which raises the price and improves the odds — see `CHEST` in game.js) and a **Sell** page. Bosses also drop a piece.
* Starting stage: solo = you choose, from 5 stages below your best up to one below it (best 8 → 3 to 7); co-op = the lower of the two players' best stages, or one stage back if both are equal.
* **Dropped connections:** if your friend's link drops (or they press ✕, or their tab sleeps), the host keeps their hero safe and waits 2 minutes. A dropped guest sees a "reconnecting" banner and retries automatically, or can use **Rejoin your last game** on the menu. If the host leaves, the run ends for both (the host's browser runs the game). Equipment drops from bosses are rolled separately for each player.
* The menu shows the game version; the lobby warns when the two players run different versions.

## Controls

Works in portrait and landscape. On a portrait screen the host gets a tall room (start at the bottom, door on one of the other sides) that fills the screen width; a player on a landscape screen joining a portrait host just sees it scaled to fit.
Touch: floating joystick anywhere on the screen, Attack (bottom right), Special (stacked above Attack).
Revive: a green **Revive** button (left of Attack) appears when you stand next to a downed ally; it takes 5 s and is cancelled if you take damage or move away (keyboard: R or E).
Keyboard: WASD / arrows, Space or J = attack, K / L / Shift = special.

## Enemies

* Rat, Goblin — melee. **Skeleton Archer** (from stage 2-1) — arrows from range, backs away if you get close. **Voidling** (from stage 3-1) — a red laser with very long range that ignores walls.
* **Sorcerer** (from stage 5-1, 20 ATK / 40 HP) — keeps its distance and calls up 3 pillars of fire that erupt one after another in a line toward you (rings on the floor warn you first).
* The last level of a stage is a boss room (everyone in it is hostile the moment you enter). Bosses rotate: **Troll** (stages 1, 4, 7…), **Skeleton King** (2, 5, 8…) and **Cerberus** (3, 6, 9…); new bosses are appended to `BOSS_ORDER` in `game.js`.
* **Hell stages** — every 5th stage (5, 10, 15…) has only 5 levels, a much bigger scrolling room with a hellish look, and twice as many enemies (max 40). An arrow points to the exit once it opens. Doom stages hold only Sorcerers and Voidlings (`DOOM` in game.js).
* **Unlocks:** Pets and Shop appear at best stage 2-1, Equipment at 5-1 (`UNLOCK` in game.js). Points left on the floor are collected automatically when the next level loads.
* **Names & age:** names are checked by a profanity filter (`isBadName`) and players must tick that they are 13+ (`MIN_AGE`). Settings → Developer (code `dev`) is a testing panel; remove its button before release.
* **Troll**: after 1 s of charging (a red circle shows the area) it smashes everything in a wide radius for 3× its ATK, every 10 s.
* **Skeleton King**: mace cleave in front of him; Skill 1 summons 3 skeleton archers (30 s cooldown); Skill 2 charges for 1 s then dashes at you for 3× ATK.
* **Cerberus** (20 ATK / 200 HP): bite; Fireballs (each head spits one in turn, they bounce off walls, 1.5× ATK, last 10 s, 25 s cooldown); Jump (a 1.3 s leap: he travels across the floor with his shadow below, a red landing circle marks the spot and stops following you for the last 0.45 s, 15 s cooldown; he can't be hurt in the air).
* Healer's Healing Ray heals 20% of her max HP + 10% of her current HP (half for herself and pets when someone else is in range). Her ray only reaches allies within range; with nobody in range it heals only the healer. There is no free healing between levels.
