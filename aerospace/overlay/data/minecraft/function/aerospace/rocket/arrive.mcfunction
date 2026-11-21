scoreboard players set @s aero.timer 0
effect clear @s minecraft:levitation
execute if score @s aero.dest matches 1 run function minecraft:aerospace/travel/overworld
execute if score @s aero.dest matches 2 run function minecraft:aerospace/travel/asteroid_belt
execute if score @s aero.dest matches 3 run function minecraft:aerospace/travel/moon
execute if score @s aero.dest matches 4 run function minecraft:aerospace/travel/mars
execute if score @s aero.dest matches 5 run function minecraft:aerospace/travel/glacio
execute if score @s aero.dest matches 6 run function minecraft:aerospace/travel/vulcan
