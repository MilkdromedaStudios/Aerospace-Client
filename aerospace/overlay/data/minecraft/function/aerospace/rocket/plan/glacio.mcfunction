execute if dimension minecraft:glacio run return run function minecraft:aerospace/rocket/already_here
execute if score @s aero.fuel matches ..3 run return run function minecraft:aerospace/rocket/no_fuel_4
clear @s *[minecraft:custom_data~{aerospace_item:"fuel"}] 4
function minecraft:aerospace/rocket/start
