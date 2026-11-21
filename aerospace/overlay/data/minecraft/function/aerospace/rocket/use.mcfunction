advancement revoke @s only minecraft:aerospace/internal/use_rocket
execute if score @s aero.cool matches 1.. run return run scoreboard players set @s aero.cool 10
scoreboard players set @s aero.cool 10
execute if score @s aero.timer matches 1.. run return run title @s actionbar {translate:"aerospace.rocket.busy",color:"yellow"}
scoreboard players enable @s aero.launch
dialog show @s minecraft:aerospace/mission_control
