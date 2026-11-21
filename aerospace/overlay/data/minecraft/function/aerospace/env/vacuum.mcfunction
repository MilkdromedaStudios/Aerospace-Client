execute if entity @s[gamemode=creative] run return 0
execute if items entity @s armor.head *[minecraft:custom_data~{aerospace_item:"space_helmet"}] run return run scoreboard players set @s aero.o2 30
scoreboard players remove @s aero.o2 1
execute if score @s aero.o2 matches ..0 run damage @s 3 minecraft:aerospace_vacuum
execute if score @s aero.o2 matches ..0 run scoreboard players set @s aero.o2 0
execute if score @s aero.o2 matches 1.. run title @s actionbar {translate:"aerospace.oxygen.low",color:"gold",with:[{score:{name:"@s",objective:"aero.o2"}}]}
execute if score @s aero.o2 matches ..0 run title @s actionbar {translate:"aerospace.oxygen.empty",color:"red",bold:true}
