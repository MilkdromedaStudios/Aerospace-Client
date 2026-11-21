item replace entity @s armor.head with minecraft:leather_helmet[minecraft:equippable={slot:"head",asset_id:"minecraft:aerospace_martian",equip_sound:"minecraft:item.armor.equip_iron"},minecraft:custom_data={aerospace_item:"martian_gear"}]
item replace entity @s armor.chest with minecraft:leather_chestplate[minecraft:equippable={slot:"chest",asset_id:"minecraft:aerospace_martian",equip_sound:"minecraft:item.armor.equip_iron"},minecraft:custom_data={aerospace_item:"martian_gear"}]
item replace entity @s armor.legs with minecraft:leather_leggings[minecraft:equippable={slot:"legs",asset_id:"minecraft:aerospace_martian",equip_sound:"minecraft:item.armor.equip_iron"},minecraft:custom_data={aerospace_item:"martian_gear"}]
item replace entity @s armor.feet with minecraft:leather_boots[minecraft:equippable={slot:"feet",asset_id:"minecraft:aerospace_martian",equip_sound:"minecraft:item.armor.equip_iron"},minecraft:custom_data={aerospace_item:"martian_gear"}]
data merge entity @s {drop_chances:{head:0.0f,chest:0.0f,legs:0.0f,feet:0.0f}}
data merge entity @s {CustomName:{translate:"entity.aerospace.martian"}}
attribute @s minecraft:movement_speed base set 0.3
attribute @s minecraft:max_health base set 24
