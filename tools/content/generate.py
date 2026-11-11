#!/usr/bin/env python3
"""Write Aerospace Client's data-driven content into aerospace/overlay.

    python3 tools/content/generate.py

Advancements, painting variants and the recipe are plain vanilla-format JSON in
the `minecraft` namespace (the built-in pack only exposes known namespaces).
Formats mirror the 26.3 data files exactly.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OVERLAY = os.path.join(ROOT, "aerospace", "overlay")
LANG = {}


def write(path, obj):
    full = os.path.join(OVERLAY, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(obj, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


# ------------------------------------------------------------ advancements --
def advancement(name, title, description, icon, criteria, parent=None, frame=None, xp=None, root=False):
    key = "advancements.aerospace.%s" % name
    LANG[key + ".title"] = title
    LANG[key + ".description"] = description
    display = {
        "description": {"translate": key + ".description"},
        "icon": {"id": "minecraft:" + icon},
        "title": {"translate": key + ".title"},
    }
    if frame:
        display["frame"] = frame
    if root:
        display["announce_to_chat"] = False
        display["show_toast"] = False
        display["background"] = "minecraft:gui/advancements/backgrounds/aerospace"
    data = {}
    if parent:
        data["parent"] = "minecraft:aerospace/" + parent
    data["criteria"] = criteria
    data["display"] = display
    data["requirements"] = [[name] for name in criteria]
    if xp:
        data["rewards"] = {"experience": xp}
    write("data/minecraft/advancement/aerospace/%s.json" % name, data)


def has_item(item):
    return {"conditions": {"items": [{"items": "minecraft:" + item}]}, "trigger": "minecraft:inventory_changed"}


def above(y):
    return {
        "conditions": {
            "player": {
                "type": "minecraft:entity_properties",
                "entity": "this",
                "predicate": {"minecraft:location": {"position": {"y": {"min": float(y)}}}},
            }
        },
        "trigger": "minecraft:location",
    }


def advancements():
    advancement("root", "Aerospace Program", "Every mission starts on the ground", "firework_rocket",
                {"enlisted": {"trigger": "minecraft:location"}}, root=True)
    advancement("stargazer", "Stargazer", "Survey the sky through a Spyglass", "spyglass",
                {"used_spyglass": {"conditions": {"item": {"items": "minecraft:spyglass"}},
                                   "trigger": "minecraft:using_item"}}, parent="root")
    advancement("rocket_fuel", "Rocket Fuel", "Acquire Gunpowder, the first ingredient of spaceflight", "gunpowder",
                {"gunpowder": has_item("gunpowder")}, parent="root")
    advancement("ignition", "Ignition Sequence", "Build your first Firework Rocket", "firework_rocket",
                {"rocket": has_item("firework_rocket")}, parent="rocket_fuel")
    advancement("flight_certified", "Flight Certified", "Earn your wings: obtain an Elytra", "elytra",
                {"elytra": has_item("elytra")}, parent="ignition", frame="goal")
    advancement("karman_line", "Above the Clouds", "Climb past the build limit (Y 320)", "phantom_membrane",
                {"altitude": above(320)}, parent="flight_certified", frame="goal")
    advancement("low_orbit", "Low Orbit", "Reach an altitude of Y 1000", "nether_star",
                {"altitude": above(1000)}, parent="karman_line", frame="challenge", xp=100)
    advancement("moonwalker", "Moonwalker", "Experience low gravity with Slow Falling", "feather",
                {"slow_falling": {"conditions": {"effects": {"minecraft:slow_falling": {}}},
                                  "trigger": "minecraft:effects_changed"}}, parent="root")
    advancement("zero_g", "Zero-G Training", "Levitate 30 blocks straight up", "shulker_shell",
                {"levitated": {"conditions": {"distance": {"y": {"min": 30.0}}},
                               "trigger": "minecraft:levitation"}}, parent="moonwalker", frame="goal", xp=30)
    advancement("deep_space", "Deep Space", "Leave the Overworld behind and enter the End", "end_stone",
                {"entered_end": {"conditions": {"to": "minecraft:the_end"},
                                 "trigger": "minecraft:changed_dimension"}}, parent="root", frame="goal")
    advancement("reentry", "Re-entry", "Fall at least 100 blocks and walk away from the landing", "water_bucket",
                {"long_fall": {"conditions": {"distance": {"y": {"min": 100.0}}},
                               "trigger": "minecraft:fall_from_height"}}, parent="root")


# ---------------------------------------------------------------- paintings --
PAINTINGS = [
    ("aerospace_nebula", "Stellar Nursery", 2, 2),
    ("aerospace_ringed_giant", "The Ringed Giant", 2, 2),
    ("aerospace_liftoff", "Liftoff", 2, 2),
    ("aerospace_blue_marble", "Pale Blue World", 2, 2),
]


def paintings():
    for name, title, w, h in PAINTINGS:
        LANG["painting.minecraft.%s.title" % name] = title
        LANG["painting.minecraft.%s.author" % name] = "Aerospace Client"
        write("data/minecraft/painting_variant/%s.json" % name, {
            "asset_id": "minecraft:" + name,
            "author": {"color": "gray", "translate": "painting.minecraft.%s.author" % name},
            "height": h,
            "title": {"color": "yellow", "translate": "painting.minecraft.%s.title" % name},
            "width": w,
        })


# ------------------------------------------------------------------- recipe --
def recipes():
    # Elytra become craftable, gated behind a Nether Star (i.e. a Wither kill).
    write("data/minecraft/recipe/aerospace_elytra.json", {
        "type": "minecraft:crafting_shaped",
        "category": "equipment",
        "key": {"M": "minecraft:phantom_membrane", "N": "minecraft:nether_star", "D": "minecraft:diamond"},
        "pattern": ["MNM", "MDM", "M M"],
        "result": {"id": "minecraft:elytra"},
    })
    write("data/minecraft/advancement/recipes/tools/aerospace_elytra.json", {
        "parent": "minecraft:recipes/root",
        "criteria": {
            "has_nether_star": has_item("nether_star"),
            "has_the_recipe": {"conditions": {"recipes": "minecraft:aerospace_elytra"},
                               "trigger": "minecraft:recipe_unlocked"},
        },
        "requirements": [["has_the_recipe", "has_nether_star"]],
        "rewards": {"recipes": ["minecraft:aerospace_elytra"]},
    })


# --------------------------------------------------------------------- lang --
BRAND_LANG = {
    # title screen (both keys take the Eaglercraft build / port author as %s, so upstream stays credited)
    "eagler.menu.brand": "Aerospace Client · Eaglercraft %s",
    "eagler.menu.rewrittenBy": "Eaglercraft port by %s",
    "menu.singleplayer": "Solo Mission",
    "menu.multiplayer": "Multiplayer Fleet",
    "menu.paused": "Mission Paused",
    "menu.returnToGame": "Resume Mission",
    "menu.preparingSpawn": "Preparing launch site: %s%%",
    "multiplayer.downloadingTerrain": "Scanning terrain...",
    "connect.connecting": "Opening comms channel...",
    "deathScreen.title": "Mission Failed!",
    "deathScreen.respawn": "Relaunch",
    "multiplayer.player.joined": "%s came aboard",
    "multiplayer.player.left": "%s departed",
    "accessibility.onboarding.screen.title":
        "Welcome to Aerospace Client!\n\nWould you like to enable the Narrator or visit the Accessibility Settings?",
    "resourcePack.vanilla.description": "The default look and feel of Aerospace Client",
}

SPLASHES = """Aerospace Client!
Ad astra!
Per aspera ad astra!
T-minus 10!
We have liftoff!
Main engine start!
Go for launch!
Max Q!
Stage separation confirmed!
Houston, we have a block!
One small step for a creeper!
The Eagle has landed!
In space, no one can hear you mine!
To infinity and one more block!
Delta-v approved!
Orbital mechanics included!
Now with 100% more vacuum!
Low Earth Orbit!
Escape velocity!
Apogee!
Perigee!
Retrograde burn!
Prograde!
Gravity assist!
Slingshot maneuver!
Check your staging!
Mind the Kraken!
Space is big!
Really big!
Mostly harmless!
Don't panic!
42!
Bring a towel!
Ringed ice world sold separately!
Look up at night!
That's no moon!
That's a moon now!
Second star to the right!
Billions and billions!
Pale blue dot!
We are made of star stuff!
The cosmos is within us!
Somewhere, something incredible is waiting!
Rocket science!
It IS rocket science!
Elytra certified!
Fireworks are just small rockets!
Gunpowder is rocket fuel!
Phantoms hate this one trick!
Glide ratio: yes!
Terminal velocity!
Re-entry is the hard part!
Heat shield not included!
Parachutes recommended!
Water bucket clutch!
Zero-G!
Microgravity!
Levitation is free flight!
Shulkers run the space program!
The End is just the beginning!
Chorus fruit: astronaut food!
Space helmets look like pumpkins!
Spyglass = telescope!
Stargazer!
Constellations!
Nebulae!
Supernova!
Red giant!
White dwarf!
Neutron star!
Event horizon!
Spaghettification!
Hawking radiation!
Dark matter!
Dark energy!
Redshift!
Parallax!
Light speed is too slow!
Ludicrous speed!
Warp factor nine!
Engage!
Make it so!
Live long and prosper!
Set phasers to mine!
Resistance is futile!
May the blocks be with you!
A long time ago in a chunk far, far away!
The sky calls to us!
Ground control to Major Steve!
Rocket block!
Space oddity!
Fly me to the moon!
Starman!
Across the universe!
Satellite of love!
Countdown!
Mission control approves!
Telemetry nominal!
All systems go!
Signal acquired!
Loss of signal!
Docking complete!
Airlock sealed!
Cabin pressure nominal!
EVA in progress!
Tether yourself!
Watch your oxygen!
Space junk!
Asteroid mining!
Regolith!
Tranquility Base!
Sea of Tranquility!
Olympus Mons!
Valles Marineris!
Great Red Spot!
Cassini Division!
Europa: attempt no landing!
Titan has lakes!
Pluto is a planet in our hearts!
Voyager is still out there!
Golden record!
Hello from the children of planet Earth!
Hubble!
Webb!
First light!
Aurora borealis!
Solar wind!
Coronal mass ejection!
Total eclipse!
Blood moon!
Blue moon!
Perihelion!
Light-year!
Parsec is a distance!
Kessel Run not included!
Runs in a browser tab!
Runs on a spaceship!
Runs on a Chromebook!
WebAssembly-powered!
Tap Right Shift!
Hold C to zoom!
Open the command deck!
Visor down!
Space-themed since 26.3!
Made of pixels and stardust!
"""


def texts():
    full = os.path.join(OVERLAY, "assets/minecraft/texts/splashes.txt")
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(SPLASHES)


def main():
    advancements()
    paintings()
    recipes()
    texts()
    lang = dict(BRAND_LANG)
    lang.update(LANG)
    path = os.path.join(ROOT, "aerospace", "lang", "en_us.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(lang, fh, indent=2, ensure_ascii=False, sort_keys=True)
        fh.write("\n")
    patches = {
        "merge": {
            "pack.mcmeta": {"pack": {"description": "Aerospace Client"}},
        },
        "appendValues": {
            "data/minecraft/tags/painting_variant/placeable.json": ["minecraft:" + p[0] for p in PAINTINGS],
        },
    }
    with open(os.path.join(ROOT, "aerospace", "patches.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(patches, fh, indent=2)
        fh.write("\n")
    print("content written: %d lang keys, %d splashes" % (len(lang), SPLASHES.count("\n")))


if __name__ == "__main__":
    main()
