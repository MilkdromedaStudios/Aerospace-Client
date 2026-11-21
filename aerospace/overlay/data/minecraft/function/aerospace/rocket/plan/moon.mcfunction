execute if dimension minecraft:moon run return run function minecraft:aerospace/rocket/already_here
execute if score @s aero.fuel matches ..1 run return run function minecraft:aerospace/rocket/no_fuel_2
clear @s *[minecraft:custom_data~{aerospace_item:"fuel"}] 2
function minecraft:aerospace/rocket/start
