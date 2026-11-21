tag @s add aero_g
execute if dimension minecraft:asteroid_belt run function minecraft:aerospace/env/mob_asteroid_belt
execute if dimension minecraft:moon run function minecraft:aerospace/env/mob_moon
execute if dimension minecraft:mars run function minecraft:aerospace/env/mob_mars
execute if dimension minecraft:glacio run function minecraft:aerospace/env/mob_glacio
execute if dimension minecraft:vulcan run function minecraft:aerospace/env/mob_vulcan
execute if entity @s[type=#minecraft:aerospace_crew,tag=!aero_seen] run function minecraft:aerospace/mobs/equip
