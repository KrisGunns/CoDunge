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

## Updating the game (browser cache)

GitHub Pages lets browsers keep their copy of the files for about 10 minutes, and phones can hold on to them much longer, so a plain reload may still show the old version.

* **Settings → Update Game (keeps your save)** re-downloads the page, `game.js`, `style.css` and `turn-config.js` straight from the server, empties any Cache Storage and then restarts the page. Your save (`localStorage`) is never read, cleared or rewritten, so progress stays. Use this instead of clearing the browser's site data (which *does* delete the save; make a save code under **Settings → Save Data** first if you ever need to do that).
* The game checks the server for a newer `GAME_VERSION` shortly after start-up, when you open Settings, and when the tab comes back to the foreground (at most every 10 minutes). If it finds one, an orange **New version available** button appears at the top of the menu. It is disabled while you have a run you can still rejoin, since restarting the page would drop it.
* **For every release:** change `GAME_VERSION` in `game.js` *and* the three `?v=` numbers in `index.html` (`style.css`, `turn-config.js`, `game.js`) to the same value. A new number makes browsers download the file again instead of reusing the cached copy, so after one more manual refresh future updates arrive on their own. If `index.html` is forgotten, the in-game banner and **Update Game** button still fix it.

## Gold, pets, equipment and shop

* Every kill pays gold: `ROUND(base × (1 + 0.15 × (stage − 1)))` with base Rat 2.5 / Goblin 5 / Skeleton Archer 5 / Voidling 7.5 / Sorcerer 10 / Hellguard 12 / Assassin 12 (bosses and summoned archers pay nothing). Both co-op players get all gold and points.
* Each normal kill rolls once and drops at most ONE item: Character Point 3%, **Pet Point** 3% (only once pets are unlocked), **health potion** 8% (walk over it to heal 20% of max HP; if you are already at full health it is used up for **+10% max HP for the rest of the run** instead, compounding and never saved to your character). Bosses give exactly one point (Character or Pet; always a Character Point until pets are unlocked) plus one random piece of equipment (only for a player who has unlocked Equipment).
* **Difficulty:** every enemy's HP and ATK are multiplied by 1 + 0.20·(stage−1) + 0.01·(stage−1)² (`stageMult`); bosses also start with 3× their base HP (`BOSS_HP_MULT`).
* **In-run menu (☰, top right):** Sound (placeholder), **Current run** (mobs defeated, bosses killed, CP/PP and gold earned, equipment collected, elapsed time without menu time) and **Quit run** (Yes/No). Solo runs pause while it is open; in co-op the game keeps running (the clock still skips the menu time). Pets keep their health between rooms, and a KO'd pet's respawn countdown carries on into the next room.
* **Pets** (5000 gold each in the Shop): Wolf, Panther (Attackers), Turtle (Defender). One pet follows you; a KO'd pet respawns after 20 s. Pet Points: +1 ATK or +5 HP. The Healer's skill also heals pets in range (half amount).
* **Equipment** (Equipment button on the menu, unlocked at best stage 5-1; pieces are shown as a grid, tap one to equip or merge it; filter the inventory by All / Head / Body / Weapon): 15 base pieces (5 per slot: Head = passive, Body = HP, Weapon = ATK) in 6 rarities (Common … Mythic); `MERGE_N` (3) identical pieces merge into the next rarity, **Mythic cannot be merged**. From Epic up each piece gains an extra bonus (Epic +1, Legendary +1, Mythic +1; see `bon` in `EQUIP`). **Doomsday** pieces are separate single-rarity items that only drop from chests at the Doomsday tier (they can't be merged). Vampire = % of max HP healed per kill; damage reduction and speed from gear are capped at 50%. Numbers mirror `CoDunge_Enemy_Stats.xlsx`. Each piece has its own drawn icon (border colour per rarity, glow on Legendary/Mythic, burning-cinder look for Doomsday). It can't be bought directly: the Shop's Equipment tab (also unlocked at 5-1) has a **Buy** page with the single **Treasure Chest** (starts at 1000 gold, 2 random pieces; every purchase counts toward its level, up to level 12, which raises the price and improves the odds — see `CHEST` in game.js) and a **Sell** page. Bosses also drop a piece.
* Starting stage: solo = you choose your best stage or any of the 4 before it (best 6 → 6, 5, 4, 3, 2; the one just below your best is marked recommended); co-op = the lower of the two players' best stages, or one stage back if both are equal.
* **Friends** (Friends button on the menu, under Equipment): every player has a permanent 6-character **friend code** (shown on the Friends screen; Copy or Share a `?friend=CODE` link). Type a friend's code and press Add: they get a pop-up to accept or decline, and friendships are mutual. Accepted friends show a green dot while they have the game open (strangers get no answer at all, so they can't see whether you are online). To invite: Start Game > Multiplayer > Create Game Room > **Invite a friend**, then tap Invite on an online friend; they get a "Join game" pop-up. Requests, online checks and invites ride inside ordinary PeerJS connection requests, which the free matchmaking service delivers even when no direct link can be built (no TURN needed for these). The small grey line at the bottom of the Friends screen shows the version, the service state, how often it connected, and message counters, for troubleshooting. Joining the room afterwards still needs the normal link. A friend must have the game open to be reachable (no offline invites). A friend who is in a run or room shows as "In a game" and can't be invited. The friend code and list are part of the save code, so they follow you to another device (don't open the game on two devices at once).
* **Dropped connections:** if your friend's link drops (or they open the ☰ menu and quit, or their tab sleeps), the host keeps their hero safe and waits 5 minutes. A dropped guest sees a "reconnecting" banner and retries automatically, or can use **Rejoin your last game** on the menu. If the host leaves, the run ends for both (the host's browser runs the game). Equipment drops from bosses are rolled separately for each player.
* The menu shows the game version; the lobby warns when the two players run different versions.

## Controls

Works in portrait and landscape. On a portrait screen the host gets a tall room (start at the bottom, door on one of the other sides) that fills the screen width; a player on a landscape screen joining a portrait host just sees it scaled to fit.
Touch: floating joystick anywhere on the screen, Attack (bottom right), Special (stacked above Attack).
Revive: a green **Revive** button (left of Attack) appears when you stand next to a downed ally; it takes 5 s and is cancelled if you take damage or move away (keyboard: R or E).
Keyboard: WASD / arrows, Space or J = attack, K / L / Shift = special.

## Enemies

* Rat, Goblin — melee. **Skeleton Archer** (from stage 2-1) — arrows from range, backs away if you get close. **Voidling** (from stage 3-1) — a red laser with very long range that ignores walls.
* **Sorcerer** (from stage 5-1, 20 ATK / 40 HP) — keeps its distance and calls up 3 pillars of fire that erupt one after another in a line toward you (rings on the floor warn you first).
* **Hellguard** (Doom stages only, 15 ATK / 60 HP) — **Target Lock:** once it spots you it never stops chasing, and while locked it wears a barrier worth 50% of its max HP (orange ring + bar). A Wolf's Howl breaks the lock and removes the barrier; it can lock on again the next time it spots you. In a Doom boss room the Hellguards are locked on from the start.
* **Assassin** (from stage 6-1, 25 ATK / 55 HP) — **Teleport Strike:** once it has spotted you it may vanish and reappear right next to you (10 s cooldown). Half a second after landing it strikes once for 2× ATK inside a red circle — step out of it to dodge (`TP` in game.js).
* The last level of a stage is a boss room (everyone in it is hostile the moment you enter). Bosses rotate in a cycle of four: **Troll** (stages 1, 5, 9…), **Skeleton King** (2, 6, 10…), **Cerberus** (3, 7, 11…) and **Vampire Lord** (4, 8, 12…); new bosses are appended to `BOSS_ORDER` in `game.js`.
* **Hell stages** — every 5th stage (5, 10, 15…) has only 5 levels, a much bigger scrolling room with a hellish look, and twice as many enemies (max 40). An arrow points to the exit once it opens. Doom stages hold only Sorcerers (40%), Hellguards (25%) and Voidlings (`DOOM` in game.js). The Doom boss room holds the boss plus 10 escorts: 60% Sorcerers, 40% Hellguards (no Voidlings).
* **Unlocks:** Pets and Shop appear at best stage 2-1, Equipment at 5-1 (`UNLOCK` in game.js). Nothing from a locked feature drops: no Pet Points (normal kills or bosses) before pets are unlocked, no equipment from bosses before Equipment is unlocked, and the Pet Point counter stays hidden. In co-op, Pet Points only drop once both players have pets, and equipment is rolled per player. A "🔓 Pets and Shop unlocked!" / "Equipment unlocked!" notice appears the moment you reach those stages (and again on the Game Over screen). Points left on the floor are collected automatically when the next level loads.
* **Names & age:** names are checked by a profanity filter (`isBadName`) and players must tick that they are 13+ (`MIN_AGE`). Settings → Developer (code `dev`) is a testing panel; remove its button before release.
* **Controls:** heroes attack automatically when an enemy is in reach (Warrior: sword range; Mage and Healer: a clear shot within 300 px). The button on the right is the special skill (`AUTO_ATTACK` in game.js turns the attack button back on). Mage shoots fireballs, Healer dark-green bolts.
* **Warrior Spin** (1.5× ATK to everything within 85 px): heals the Warrior for **25% of the combined damage dealt** to everything it hit and grants a **barrier worth 50% of that lifesteal** for 5 s (the barrier pays nothing back when it runs out; the lifesteal counts the damage numbers shown, including overkill and damage soaked by enemy barriers). `WARRIOR` in game.js.
* **Mage Chain Lightning** (1.3× ATK): first target within 320 px, then it hops to the nearest enemy it hasn't hit yet within 170 px, **with no limit on bounces**. Each hit is 20% weaker for the first four enemies; from the 4th on every enemy takes the same damage as the 4th (1.3 × 0.8³ ≈ 0.67× ATK). `MAGE` in game.js.
* Boss base ATK: Troll 20, Skeleton King 25, Cerberus 35, Vampire Lord 25 (HP: 100 / 150 / 200 / 250, all ×3 as bosses, then ×`stageMult`).
* **Troll**: when someone is within about 108 px, after 1 s of charging (a red circle shows the area) it smashes everything in a wide radius for 3× its ATK, every 10 s.
* **Skeleton King**: mace cleave in front of him; Skill 1 summons 3 skeleton archers (30 s cooldown); Skill 2 charges for 1 s then dashes at you for 3× ATK.
* **Cerberus** (35 ATK / 200 HP): bite; Fireballs (each head spits one in turn, they bounce off walls, 1.5× ATK, last 10 s, 25 s cooldown); Jump (a 2 s leap: he travels across the floor with his shadow below; a red landing circle follows you for the first 0.7 s, then turns solid white and stays put for the last 1.3 s, which is long enough to run out of it (about 0.8 s at normal speed); 15 s cooldown; he can't be hurt in the air).
* **Vampire Lord** (25 ATK / 250 HP): his normal attack is a claw strike with his long nails (1× ATK, three red slashes). **Skill 1 – Bat Transform** (first at 8 s, 30 s cooldown, 0.7 s windup with a purple ring): he bursts into 6 bats that fly around the room on their own and cannot be hit while he is a swarm; each bat has 1 HP (any hit kills it), swoops at the nearest hero now and then and nips for 20% of his ATK, and counts as no kill and drops nothing. While he is a swarm he regenerates **2% of his max HP per second** (a green “REGENERATING” bar follows the swarm); when the **last bat dies he re-forms** where it fell. **Skill 2 – Drain** (first at 3 s, 12 s cooldown): after a 0.7 s windup (a pink lane on the floor shows the line) he charges at a hero and bites the first one he reaches for **2× ATK + 25% of that hero's current HP** and heals himself for **50% of the damage dealt** (damage stopped by a barrier or Iron Helm doesn't count). The numbers live in `VAMP` in game.js.
* Healer's Healing Ray heals 20% of her max HP + 10% of her current HP (half for herself and pets when someone else is in range). Her ray only reaches allies within range; with nobody in range it heals only the healer. There is no free healing between levels.
