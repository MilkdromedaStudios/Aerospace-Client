title @s title {translate:"aerospace.rocket.liftoff",color:"gold",bold:true}
playsound minecraft:entity.firework_rocket.launch master @a[distance=..32] ~ ~ ~ 2 0.5
playsound minecraft:entity.generic.explode master @a[distance=..32] ~ ~ ~ 0.6 0.7
effect give @s minecraft:levitation 4 12 true
advancement grant @s only minecraft:aerospace/liftoff
