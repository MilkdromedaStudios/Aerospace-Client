execute as @a[scores={aero.died=1..}] run function minecraft:aerospace/rocket/abort
execute as @a[scores={aero.launch=1..}] at @s run function minecraft:aerospace/rocket/request
execute as @a[scores={aero.timer=1..}] at @s run function minecraft:aerospace/rocket/countdown
scoreboard players remove @a[scores={aero.cool=1..}] aero.cool 1
scoreboard players add #tick aero.clock 1
execute if score #tick aero.clock matches 20.. run function minecraft:aerospace/second
