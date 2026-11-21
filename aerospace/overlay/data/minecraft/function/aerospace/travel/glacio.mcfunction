scoreboard players set @s aero.ok 0
execute store success score @s aero.ok in minecraft:glacio run spreadplayers ~ ~ 0 24 false @s
execute unless score @s aero.ok matches 1 in minecraft:glacio run tp @s ~ 220 ~
effect give @s minecraft:slow_falling 20 0 true
title @s times 10 70 20
title @s title {translate:"dimension.minecraft.glacio",color:"aqua",bold:true}
title @s subtitle {translate:"aerospace.arrive.glacio",color:"gray"}
execute at @s run playsound minecraft:block.beacon.power_select master @s ~ ~ ~ 1 0.8
execute at @s run function minecraft:aerospace/env/player
