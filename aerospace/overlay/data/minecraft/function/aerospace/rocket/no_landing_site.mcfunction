give @s minecraft:heart_of_the_sea[minecraft:item_name={translate:"item.minecraft.aerospace_fuel"},minecraft:item_model="minecraft:aerospace_fuel",minecraft:max_stack_size=16,minecraft:rarity="uncommon",minecraft:lore=[{translate:"item.minecraft.aerospace_fuel.lore.0",color:"gray",italic:false}],minecraft:custom_data={aerospace_item:"fuel"}] 1
effect give @s minecraft:slow_falling 20 0 true
tellraw @s {translate:"aerospace.rocket.no_landing_site",color:"yellow"}
