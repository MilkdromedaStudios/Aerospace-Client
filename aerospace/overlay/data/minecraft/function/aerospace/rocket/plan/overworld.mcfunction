execute if dimension minecraft:overworld run return run function minecraft:aerospace/rocket/already_here
execute if score @s aero.fuel matches ..0 run return run function minecraft:aerospace/rocket/no_fuel_1
clear @s *[minecraft:custom_data~{aerospace_item:"fuel"}] 1
function minecraft:aerospace/rocket/start
