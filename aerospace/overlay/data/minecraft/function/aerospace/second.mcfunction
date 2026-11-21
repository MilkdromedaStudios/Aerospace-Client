scoreboard players set #tick aero.clock 0
scoreboard players enable @a aero.launch
execute as @a at @s run function minecraft:aerospace/env/player
execute as @e[type=#minecraft:aerospace_low_gravity,tag=!aero_g] at @s run function minecraft:aerospace/env/mob
