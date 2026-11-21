scoreboard players operation #req aero.dest = @s aero.launch
scoreboard players set @s aero.launch 0
scoreboard players enable @s aero.launch
execute if score @s aero.timer matches 1.. run return run title @s actionbar {translate:"aerospace.rocket.busy",color:"yellow"}
scoreboard players operation @s aero.dest = #req aero.dest
execute unless items entity @s container.* *[minecraft:custom_data~{aerospace_item:"rocket"}] unless items entity @s weapon.offhand *[minecraft:custom_data~{aerospace_item:"rocket"}] run return run function minecraft:aerospace/rocket/no_rocket
execute store result score @s aero.fuel run clear @s *[minecraft:custom_data~{aerospace_item:"fuel"}] 0
execute if score @s aero.dest matches 1 run return run function minecraft:aerospace/rocket/plan/overworld
execute if score @s aero.dest matches 2 run return run function minecraft:aerospace/rocket/plan/asteroid_belt
execute if score @s aero.dest matches 3 run return run function minecraft:aerospace/rocket/plan/moon
execute if score @s aero.dest matches 4 run return run function minecraft:aerospace/rocket/plan/mars
execute if score @s aero.dest matches 5 run return run function minecraft:aerospace/rocket/plan/glacio
execute if score @s aero.dest matches 6 run return run function minecraft:aerospace/rocket/plan/vulcan
