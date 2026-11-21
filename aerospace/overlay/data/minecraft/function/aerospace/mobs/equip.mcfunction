tag @s add aero_seen
execute if dimension minecraft:asteroid_belt if entity @s[type=minecraft:zombie] run return run function minecraft:aerospace/mobs/lost_astronaut
execute if dimension minecraft:moon if entity @s[type=minecraft:zombie] run return run function minecraft:aerospace/mobs/lost_astronaut
execute if dimension minecraft:moon if entity @s[type=minecraft:skeleton] run return run function minecraft:aerospace/mobs/lost_astronaut
execute if dimension minecraft:mars if entity @s[type=minecraft:husk] run return run function minecraft:aerospace/mobs/martian
execute if dimension minecraft:mars if entity @s[type=minecraft:skeleton] run return run function minecraft:aerospace/mobs/martian
execute if dimension minecraft:glacio if entity @s[type=minecraft:stray] run return run function minecraft:aerospace/mobs/frost_wraith
execute if dimension minecraft:vulcan if entity @s[type=minecraft:wither_skeleton] run return run function minecraft:aerospace/mobs/magma_knight
