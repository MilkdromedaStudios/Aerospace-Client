execute if entity @s[gamemode=spectator] run return 0
execute if dimension minecraft:asteroid_belt run return run function minecraft:aerospace/env/in_asteroid_belt
execute if dimension minecraft:moon run return run function minecraft:aerospace/env/in_moon
execute if dimension minecraft:mars run return run function minecraft:aerospace/env/in_mars
execute if dimension minecraft:glacio run return run function minecraft:aerospace/env/in_glacio
execute if dimension minecraft:vulcan run return run function minecraft:aerospace/env/in_vulcan
scoreboard players set @s aero.o2 30
execute if entity @s[tag=aero_g] run function minecraft:aerospace/env/earth
