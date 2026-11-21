scoreboard players add @s aero.timer 1
execute if score @s aero.timer matches 2 run title @s title {text:"3",color:"aqua",bold:true}
execute if score @s aero.timer matches 2 run playsound minecraft:block.note_block.pling master @a[distance=..24] ~ ~ ~ 1 1.0
execute if score @s aero.timer matches 22 run title @s title {text:"2",color:"aqua",bold:true}
execute if score @s aero.timer matches 22 run playsound minecraft:block.note_block.pling master @a[distance=..24] ~ ~ ~ 1 1.2
execute if score @s aero.timer matches 42 run title @s title {text:"1",color:"gold",bold:true}
execute if score @s aero.timer matches 42 run playsound minecraft:block.note_block.pling master @a[distance=..24] ~ ~ ~ 1 1.5
execute if score @s aero.timer matches 2..61 run particle minecraft:campfire_cosy_smoke ~ ~0.1 ~ 0.6 0.05 0.6 0.01 3
execute if score @s aero.timer matches 62 run function minecraft:aerospace/rocket/liftoff
execute if score @s aero.timer matches 62..130 run particle minecraft:flame ~ ~-0.3 ~ 0.2 0.1 0.2 0.03 10
execute if score @s aero.timer matches 62..130 run particle minecraft:large_smoke ~ ~-0.9 ~ 0.4 0.3 0.4 0.02 4
execute if score @s aero.timer matches 131.. run function minecraft:aerospace/rocket/arrive
