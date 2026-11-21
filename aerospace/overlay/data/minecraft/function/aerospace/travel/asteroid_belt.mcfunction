scoreboard players set @s aero.ok 0
execute store success score @s aero.ok in minecraft:asteroid_belt run spreadplayers ~ ~ 0 64 under 200 false @s
execute unless score @s aero.ok matches 1 run return run function minecraft:aerospace/rocket/no_landing_site
effect give @s minecraft:slow_falling 20 0 true
title @s times 10 70 20
title @s title {translate:"dimension.minecraft.asteroid_belt",color:"aqua",bold:true}
title @s subtitle {translate:"aerospace.arrive.asteroid_belt",color:"gray"}
execute at @s run playsound minecraft:block.beacon.power_select master @s ~ ~ ~ 1 0.8
execute at @s run function minecraft:aerospace/env/player
