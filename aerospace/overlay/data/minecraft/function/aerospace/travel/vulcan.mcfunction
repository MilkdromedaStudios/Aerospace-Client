scoreboard players set @s aero.ok 0
execute store success score @s aero.ok in minecraft:vulcan run spreadplayers ~ ~ 0 64 false @s
execute unless score @s aero.ok matches 1 in minecraft:vulcan run tp @s ~ 220 ~
effect give @s minecraft:slow_falling 20 0 true
title @s times 10 70 20
title @s title {translate:"dimension.minecraft.vulcan",color:"aqua",bold:true}
title @s subtitle {translate:"aerospace.arrive.vulcan",color:"gray"}
execute at @s run playsound minecraft:block.beacon.power_select master @s ~ ~ ~ 1 0.8
effect give @s minecraft:fire_resistance 90 0 true
execute at @s run function minecraft:aerospace/env/player
