# Aerospace Client

A space-themed browser client built on **Eaglercraft 26.3** (zeus/master).

Aerospace Client takes the stock single-file Eaglercraft 26.3 build and turns it into its own client: new boot screen, new title screen and panorama, a restyled interface, client mods, shader looks, a HUD, and the **Space Expansion**: rockets, fuel, five new worlds to fly to, gravity, oxygen, new monsters and dungeons. The game code itself (the three WebAssembly images) is passed through byte-for-byte.

## Play

Open [`docs/index.html`](docs/index.html) in a recent Chrome, Edge or Firefox. It is one self-contained file (about 80 MB) and works offline once downloaded.

### Host it on GitHub Pages

The repository builds and publishes itself. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

After that, every push to `main` runs [`.github/workflows/pages.yml`](.github/workflows/pages.yml), which tests, builds `index.html` from the sources and deploys it to your Pages site. You can also start it by hand from the **Actions** tab ("Build and deploy" → "Run workflow"). Pull requests run the same test and build without deploying.

The workflow downloads the pinned upstream build and checks its SHA-256. If that download ever stops working, set a repository variable named `AEROSPACE_UPSTREAM_URL` (Settings → Secrets and variables → Actions → Variables) to another copy of the same file.

`docs/index.html` is a committed copy of the build for offline use. Pages no longer serves it once the source is set to GitHub Actions, and it is not rebuilt automatically, so run `npm run build` before committing if you want it to match your changes.

| Control | Action |
| --- | --- |
| Tap `Right Shift` | Open the command deck: client mods, shaders, HUD, settings |
| Hold `C` | Optical zoom; scroll to change magnification |
| `F9` | Screenshot to the clipboard (or to a file) |

All three keys can be rebound in the command deck.

### Mods

Eaglercraft 26.3 has its own mod loader for `.zip` and `.lua` mods, and Aerospace keeps it unchanged: on the title screen, **Mods** is the button to the right of **Options**. Those mods run in singleplayer only (the game pauses them on servers). Mods are stored per website, so mods you installed on another Eaglercraft site do not appear in Aerospace until you export them there (Mods → pick a mod → Export .zip) and import them here.

## Space Expansion

The Space Expansion is currently **disabled by default** while its world-generation loading issue is investigated. This keeps normal world creation on the stable base game. To build an experimental copy with rockets, planets and dungeons enabled, run `node tools/build.js --enable-space-expansion` (or combine it with the usual `--upstream` and `--out` options). Do not use the experimental build for public play until world creation has been verified.

**Getting started.** The first time you join a world you get the **Flight Manual**, which covers all of this. You can also craft it from a book and a firework rocket.

| Item | Recipe |
| --- | --- |
| Rocket Fuel (×2) | Copper ingot, 2 coal or charcoal, gunpowder, blaze powder (shapeless) |
| Rocket (reusable) | Lightning rod on top; iron block, glass, iron block; iron block, blast furnace, iron block |
| Space Helmet | 5 iron ingots around tinted glass, like a helmet |
| Space Suit, Leggings, Boots | Iron ingots and white wool, in the usual armour shapes |

**Launching.** Hold right click with the Rocket (or open the pause menu) to open **Mission Control** and pick a destination. You need the Rocket in your inventory and enough fuel, which is used up when the countdown starts. After a 3-2-1 countdown you lift off and land near the same X and Z on the destination, with 20 seconds of slow falling. Dying during the countdown cancels the flight. In the Asteroid Belt you land on the nearest rock; if there is none within range, the flight is called off and your fuel is returned.

| Destination | Fuel | Gravity | Air | What is there |
| --- | --- | --- | --- | --- |
| Earth | 1 | normal | yes | Home. Crashed rockets hide fuel, a Flight Manual and sometimes a Rocket |
| Asteroid Belt | 1 | 1/10 | **no** | Floating rocks full of ore, and derelict space stations |
| The Moon | 2 | 1/6 | **no** | Grey regolith and basalt seas, Moon Cows, Lost Astronauts and Lunar Outposts. Monsters spawn there day and night |
| Mars | 3 | 0.38 | yes | Red deserts and canyons, Mars Pigs, Martians and ancient step pyramids |
| Glacio | 4 | 3/4 | yes | Ice spikes, frozen seas, Glacio Chickens, Frost Wraiths and Ice Vaults |
| Vulcan | 4 | 1.25× | yes | Lava seas and basalt deltas, Magma Knights and Magma Forges. You arrive with 90 seconds of fire resistance |

**Gravity** changes how high you jump and how fast you fall, and lighter worlds forgive longer falls. Animals and monsters on each world feel the same gravity.

**Oxygen.** The Moon and the Asteroid Belt have no air. Without a Space Helmet you have 30 seconds of oxygen, then you take 1.5 hearts of damage per second that armour does not block.

**Monsters.** Zombies and skeletons on the Moon and in the Asteroid Belt are **Lost Astronauts** in space suits (they can drop suit parts). Mars has fast **Martians**, Glacio has **Frost Wraiths** and Vulcan has hard-hitting **Magma Knights**.

**Dungeons.** Each world has its own structure with a monster spawner, loot chests and a named boss: the Outpost Overseer (Moon), the Martian Warlord (Mars), the Frost Lich (Glacio), the Magma Tyrant (Vulcan) and the Station Warden (Asteroid Belt). Bosses can drop their weapon.

**Advancements.** 16 new ones in the Aerospace Program tab, from Fuel Up and We Have Liftoff to visiting every world (Grand Tour) and finding each dungeon.

Existing worlds get the new worlds as well. Crashed rockets only appear in parts of Earth you have not explored yet.

## What is different from stock Eaglercraft 26.3

**Shell**
- Aerospace boot screen with a starfield, progress bar and rotating tips, replacing the stock splash and the red loading screen
- New page title, icon, crash and rotate-device screens

**Client mods** (command deck → Client Mods)
- Optical zoom, with scroll to change strength
- Motion blur, with adjustable strength
- Screenshot key: copies the frame to the clipboard or saves a PNG
- Space radio: calm, endlessly generated ambient music
- Break reminder every 30 to 90 minutes
- Cosmetic helmet visor overlay and cinematic letterbox bars

**Shaders** (command deck → Shaders)
- Seven looks: Stock, Aerospace, Cinematic, Vibrant, Nebula, Retro CRT, Noir
- Fine-tuning: glow, sharpen, vignette, film grain, colour fringe, scanlines, contrast, warmth (any change becomes a Custom look)
- Visor filters (Night Vision, Solar Shield, Deep Space, Thermal, Lunar Mono), brightness that lifts dark caves without washing out the sky, and saturation

The shader engine replaces the one tiny shader the game uses to put each finished frame on screen, so the looks run on the GPU inside the game's own last draw. It only does this when that shader matches the stock one exactly and the replacement compiles on your device; otherwise the game keeps its own shader, and brightness, saturation and visor filters fall back to CSS. With every effect off it is an exact copy, like the original. Stock 26.3's own **Shader Packs...** button (in the pause menu) still works alongside it.

**HUD** (command deck → HUD)
- FPS, CPS, keystrokes, clock, mission timer, memory, frame-time graph, client badge
- Drag-and-drop layout, HUD scale and opacity, six accent colours

Client mods only read your own keyboard and mouse, and shaders only restyle the finished picture. Nothing reads game memory or changes what is sent to servers.

**Game assets**
- "AEROSPACE" title logo, subtitle and loading logo
- Seamless deep-space title panorama (ringed gas giant, blue world, nebulae)
- Interface skin: buttons, sliders, text fields, tabs, checkboxes, scroll bars, hotbar, crosshair, tooltips, menu backgrounds
- Sky: the Moon is a ringed ice world with all eight phases, new Sun, starfield End sky
- 145 space-themed splash texts, reworded menus ("Solo Mission", "Mission Paused", ...)

**Game content**
- The Space Expansion (see above): Rocket, Rocket Fuel, Space Suit and Flight Manual; Mission Control; five new worlds (Asteroid Belt, Moon, Mars, Glacio, Vulcan) with their own terrain, sky, fog and music; gravity and oxygen; Moon Cows, Mars Pigs and Glacio Chickens; four kinds of planet monster; six dungeons with bosses and loot
- New "Aerospace Program" advancement tab with 27 advancements
- Four space paintings (Stellar Nursery, The Ringed Giant, Liftoff, Pale Blue World)
- Craftable Elytra: phantom membranes, a diamond and a Nether Star

## Build it yourself

Requires Node.js 22.2 or newer. There are no npm dependencies.

```bash
npm run build
```

The build downloads the pinned upstream file once into `.cache/` (verified by SHA-256), then writes `docs/index.html`. To build from a file you already have:

```bash
node tools/build.js --upstream path/to/Eaglercraft-26.3.html
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm test` | Tests for the archive and single-file formats, and for the data validator (it must pass the shipped files and catch 21 deliberate mistakes; skipped until the build has downloaded the upstream file) |
| `npm run unpack` | Extracts the stock assets to `.cache/upstream-assets/` so you can see what can be overridden |
| `npm run preview:shell` | Builds a small mock page for working on the boot screen, deck and shaders without the game (its fake game presents frames exactly like 26.3) |
| `npm run check:shell` | Drives that page in headless Chromium and checks the shader engine and command deck (needs Playwright with Chromium) |
| `npm run art` | Regenerates the procedural art (needs Python 3 with Pillow and numpy) |
| `npm run content` | Regenerates advancements, paintings, recipe, splashes and language strings |
| `npm run expansion` | Regenerates the Space Expansion: items, recipes, worlds, terrain, monsters, dungeons, functions, Mission Control, advancements, textures and strings (needs Python 3 and `npm run unpack` first) |

## Customising

| Path | Purpose |
| --- | --- |
| `aerospace/overlay/` | Files copied over the game's assets, using the same relative paths (`assets/...`, `data/...`) |
| `aerospace/lang/en_us*.json` | Language strings merged into the game's language file (`en_us.expansion.json` is generated by `tools/expansion/`) |
| `aerospace/patches*.json` | JSON merges and tag additions |
| `aerospace/shell/` | Boot screen, stylesheet, shader engine (`shaders.js`) and the client layer (`client.js`) |
| `tools/art/` | Procedural art generator |
| `tools/content/` | Generator for the data-driven content |
| `tools/expansion/` | Generator for the Space Expansion. It starts every world-generation file from the matching stock 26.3 file, so the formats match the game |
| `tools/lib/validate.js` | Static checks the build runs on every data and resource pack file it adds |

To change a texture, run `npm run unpack`, copy the file you want from `.cache/upstream-assets/` to the same path under `aerospace/overlay/`, edit it and rebuild. The build fails with a clear message if a replacement texture has the wrong size, a language string has different placeholders, or an advancement or painting points at something that does not exist.

Everything Aerospace adds to the game's data pack goes through a static validator before the build packs it, because one bad entry in the built-in data pack would stop every world from loading. It compares each file's keys and value types with the stock 26.3 files of the same kind, resolves every ID (items, blocks and block states, entities, sounds, particles, effects, attributes, world-generation entries, loot tables, functions, advancements, dialogs, models, textures and translations), lints the command functions and checks the structure templates. It cannot run the game, so a world can still behave differently from what the files intend.

## Credits and legal

Aerospace Client is an unofficial fan project. It is not affiliated with or endorsed by Mojang or Microsoft.

- Minecraft is © Mojang AB.
- The browser port is the work of the Eaglercraft project (lax1dude, ayunami2000 and the 26.x port contributors). The title screen keeps the Eaglercraft build and port credit, and the in-game credits screen is unchanged.
- The Aerospace shell, client layer, tools, art and added content are original to this project and licensed under [Apache-2.0](LICENSE). That licence covers only those files; it grants no rights to Minecraft or Eaglercraft.

`docs/index.html` contains the compiled game and its assets, which belong to their respective owners. If you fork or host this project, you are responsible for making sure you are allowed to distribute it. See [NOTICE.md](NOTICE.md).
