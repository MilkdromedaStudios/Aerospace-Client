execute if dimension minecraft:mars run return run function minecraft:aerospace/rocket/already_here
execute if score @s aero.fuel matches ..2 run return run function minecraft:aerospace/rocket/no_fuel_3
clear @s *[minecraft:custom_data~{aerospace_item:"fuel"}] 3
function minecraft:aerospace/rocket/start
