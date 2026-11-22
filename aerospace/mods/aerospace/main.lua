-- Aerospace: rockets, landing pads, fuel, planets and gravity for Aerospace Client.
--
-- The worlds, items, recipes and dungeons are game data (built into the client).
-- This mod is the part you interact with:
--   * Landing Pad: right click the ground with it to build a launch pad
--   * Rocket: right click the middle of a pad to stand it there (a 3D model)
--   * right click the rocket to open its panel: load fuel, pick a world, launch
--   * every flight lands on a fresh pad, with the rocket, so you can fly back
--   * gravity changes per world (jump height and falls), and airless worlds
--     need a Space Helmet
--
-- A placed rocket is an invisible marker entity in the world named
-- "AeroRocket:<fuel>", so rockets are saved with the world. Changing the world
-- (placing pads, moving fuel, travel, gravity) uses game commands, which need
-- cheats allowed in the world. Commands stay under the 256-character chat
-- limit: items are given through one-item loot tables.

local VERSION = "3.1.0"
local MAX_FUEL = 8
local MARKER = "AeroRocket:"

settings.toggle("gravity", { label = "Planet gravity", default = true })
settings.toggle("oxygen", { label = "Oxygen on airless worlds", default = true })
settings.toggle("hud", { label = "Aerospace HUD", default = true })
settings.toggle("quiet", { label = "Hide Aerospace command messages", default = true })

-- ------------------------------------------------------------------ planets
local EARTH = "minecraft:overworld"
local PLANETS = {
  { dim = EARTH, name = "Earth", cost = 1, g = 0.08, safe = 3, fall = 1.0, air = true },
  { dim = "minecraft:asteroid_belt", name = "Asteroid Belt", cost = 1, g = 0.008, safe = 48, fall = 0.2, air = false, belt = true },
  { dim = "minecraft:moon", name = "The Moon", cost = 2, g = 0.0133, safe = 16, fall = 0.5, air = false },
  { dim = "minecraft:mars", name = "Mars", cost = 3, g = 0.0304, safe = 8, fall = 0.7, air = true },
  { dim = "minecraft:glacio", name = "Glacio", cost = 4, g = 0.06, safe = 4, fall = 0.9, air = true },
  { dim = "minecraft:vulcan", name = "Vulcan", cost = 4, g = 0.1, safe = 2.5, fall = 1.25, air = true, hot = true },
}
local BY_DIM = {}
for _, p in ipairs(PLANETS) do BY_DIM[p.dim] = p end

-- ------------------------------------------------------------------ helpers
local function say(text) chat.print("\u{00A7}b[Aerospace]\u{00A7}r " .. text) end
local function notify(text) if not pcall(ui.notify, text) then say(text) end end
local function fmt(n) return string.format("%.2f", n) end

local function heldName()
  local ok, item = pcall(player.heldItem)
  if ok and type(item) == "table" then return item.id, item.name end
end

local function countItem(def)
  local ok, inv = pcall(player.inventory)
  local n = 0
  if ok and type(inv) == "table" then
    for _, it in pairs(inv) do
      if type(it) == "table" and it.id == def.id and it.name == def.name then n = n + (it.count or 1) end
    end
  end
  return n
end

-- ------------------------------------------------------------------ commands
-- Commands run as the player. Their feedback is hidden from chat (setting
-- "quiet"); a permission error means cheats are off in this world.
local cheats = nil          -- nil = unknown, true / false once a command answered
local quietUntil = 0
local pendingError = nil

local FEEDBACK = { "^Set base value", "^Reset base value", "^Base value", "^Summoned new", "^Placed template",
  "^Spread %d+ ", "^Modified entity data", "^Removed %d+ item", "^Killed ", "^Gave %d+ ", "^Applied effect",
  "^Teleported ", "^Played sound", "^Displaying particle", "^Cleared the inventory", "^Found %d+ matching",
  "^Could not spread", "^Applied ", "^Gave ", "^Dropped %d+ ", "^Inflicted ", "^Removed every effect", "^Removed effect" }
local ERRORS = { "Unknown or incomplete command", "Unknown command", "permission", "Incorrect argument" }

local function run(cmd)
  quietUntil = util.now() + 2000
  chat.command(cmd)
end

on("chat_receive", function(e)
  local msg = e.message or ""
  if util.now() > quietUntil then return end
  for _, pat in ipairs(ERRORS) do
    if msg:find(pat, 1, true) then
      if cheats ~= false then
        cheats = false
        say("\u{00A7}eRockets, landing pads, fuel and gravity need cheats allowed in this world. " ..
          "Create the world with \u{00A7}fAllow Cheats: ON\u{00A7}e, or use \u{00A7}fOpen to LAN\u{00A7}e with cheats on.")
      end
      pendingError = msg
      pcall(function() e:cancel() end)
      return
    end
  end
  for _, pat in ipairs(FEEDBACK) do
    if msg:find(pat) then
      cheats = true
      if pat == "^Could not spread" then pendingError = msg end
      if settings.quiet then pcall(function() e:cancel() end) end
      return
    end
  end
end)

local function needCheats()
  if cheats == false then
    say("\u{00A7}eThis needs cheats allowed in the world (Allow Cheats, or Open to LAN with cheats on).")
    return true
  end
  return false
end

-- ------------------------------------------------------------------ rockets
local rockets = {}           -- uuid -> { uuid, x, y, z, fuel }
local launch = nil           -- the flight in progress
local arrival = nil          -- waiting to land after a flight

local function scanRockets()
  local found = {}
  local ok, list = pcall(world.entities)
  if ok and type(list) == "table" then
    for _, e in ipairs(list) do
      local name = e.name or ""
      if e.type == "minecraft:armor_stand" and name:sub(1, #MARKER) == MARKER then
        found[e.uuid] = { uuid = e.uuid, x = e.x, y = e.y, z = e.z, fuel = tonumber(name:sub(#MARKER + 1)) or 0 }
      end
    end
  end
  rockets = found
end

local function summonRocket(x, y, z, fuel)
  run(string.format('summon minecraft:armor_stand %s %s %s {Invisible:1b,Marker:1b,NoGravity:1b,Invulnerable:1b,Silent:1b,'
    .. 'CustomName:"%s%d",Tags:["aero_rocket"]}', fmt(x), fmt(y), fmt(z), MARKER, fuel))
end

local function setFuel(r, fuel)
  r.fuel = fuel
  run(string.format('data merge entity %s {CustomName:"%s%d"}', r.uuid, MARKER, fuel))
end

-- The block the player is looking at, whatever shape lookingAt() reports it in.
local function lookBlock()
  local r = table.pack(pcall(player.lookingAt))
  if not r[1] then return nil end
  local a = r[2]
  if type(a) == "table" then
    if a.type and a.type ~= "block" then return nil end
    local x = a.x or (a.pos and a.pos.x) or a[1]
    local y = a.y or (a.pos and a.pos.y) or a[2]
    local z = a.z or (a.pos and a.pos.z) or a[3]
    if x and y and z then return math.floor(x), math.floor(y), math.floor(z), a.block or a.id, a.face or a.side end
  elseif type(a) == "number" then
    return math.floor(a), math.floor(r[3]), math.floor(r[4]), r[5], r[6]
  end
  return nil
end

local function blockAt(x, y, z)
  local ok, b = pcall(world.block, x, y, z)
  if ok then return type(b) == "table" and (b.id or b.name) or b end
end

-- the centre of the landing pad that block (x, y, z) belongs to
local function padCentre(x, y, z)
  for dy = 0, -1, -1 do
    for dx = -2, 2 do
      for dz = -2, 2 do
        local cx, cy, cz = x + dx, y + dy, z + dz
        if blockAt(cx, cy, cz) == "minecraft:polished_blackstone"
          and blockAt(cx - 2, cy, cz - 2) == "minecraft:redstone_lamp"
          and blockAt(cx + 2, cy, cz + 2) == "minecraft:redstone_lamp" then
          return cx, cy, cz
        end
      end
    end
  end
end

local function rocketOnPad(cx, cy, cz)
  for _, r in pairs(rockets) do
    if math.abs(r.x - (cx + 0.5)) < 0.6 and math.abs(r.z - (cz + 0.5)) < 0.6 and math.abs(r.y - (cy + 1)) < 1.5 then return r end
  end
end

-- the rocket the player's crosshair is on (a cylinder around each rocket)
local function rocketInSight()
  local ok, ex, ey, ez = pcall(player.eyePos)
  if not ok or not ex then return nil end
  local yaw, pitch = math.rad(player.yaw()), math.rad(player.pitch())
  local dx, dy, dz = -math.sin(yaw) * math.cos(pitch), -math.sin(pitch), math.cos(yaw) * math.cos(pitch)
  local best, bestT = nil, 7
  for _, r in pairs(rockets) do
    for t = 0, 7, 0.1 do
      local px, py, pz = ex + dx * t, ey + dy * t, ez + dz * t
      if t < bestT and (px - r.x) ^ 2 + (pz - r.z) ^ 2 < 1.1 and py >= r.y - 0.2 and py <= r.y + 6.2 then
        best, bestT = r, t
        break
      end
    end
  end
  return best
end

-- ------------------------------------------------------------------ 3D model
-- The rocket is drawn with raw WebGL during the game's world pass, using the
-- camera matrices the game hands to render_world.
local mesh = { vbo = nil, vao = nil, count = 0, flameVbo = nil, flameVao = nil, flameCount = 0, prog = nil, failed = false }

local function addTri(out, a, b, c, col)
  local ux, uy, uz = b[1] - a[1], b[2] - a[2], b[3] - a[3]
  local vx, vy, vz = c[1] - a[1], c[2] - a[2], c[3] - a[3]
  local nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
  local l = math.sqrt(nx * nx + ny * ny + nz * nz); if l == 0 then l = 1 end
  nx, ny, nz = nx / l, ny / l, nz / l
  for _, p in ipairs({ a, b, c }) do
    out[#out + 1] = p[1]; out[#out + 1] = p[2]; out[#out + 1] = p[3]
    out[#out + 1] = nx; out[#out + 1] = ny; out[#out + 1] = nz
    out[#out + 1] = col[1]; out[#out + 1] = col[2]; out[#out + 1] = col[3]
  end
end
local function quad(out, a, b, c, d, col) addTri(out, a, b, c, col); addTri(out, a, c, d, col) end

-- a ring between (r0, y0) and (r1, y1); colour by segment index
local function lathe(out, r0, y0, r1, y1, seg, colfn)
  for i = 0, seg - 1 do
    local a0, a1 = i / seg * math.pi * 2, (i + 1) / seg * math.pi * 2
    local p1 = { math.cos(a0) * r0, y0, math.sin(a0) * r0 }
    local p2 = { math.cos(a1) * r0, y0, math.sin(a1) * r0 }
    local p3 = { math.cos(a1) * r1, y1, math.sin(a1) * r1 }
    local p4 = { math.cos(a0) * r1, y1, math.sin(a0) * r1 }
    quad(out, p1, p4, p3, p2, colfn(i))
  end
end

local function box(out, x0, y0, z0, x1, y1, z1, col)
  local c = { { x0, y0, z0 }, { x1, y0, z0 }, { x1, y1, z0 }, { x0, y1, z0 }, { x0, y0, z1 }, { x1, y0, z1 }, { x1, y1, z1 }, { x0, y1, z1 } }
  quad(out, c[1], c[2], c[3], c[4], col); quad(out, c[6], c[5], c[8], c[7], col)
  quad(out, c[5], c[1], c[4], c[8], col); quad(out, c[2], c[6], c[7], c[3], col)
  quad(out, c[4], c[3], c[7], c[8], col); quad(out, c[5], c[6], c[2], c[1], col)
end

local WHITE, RED, GLASS, DARK, METAL, BAND = { .93, .94, .96 }, { .82, .16, .14 }, { .35, .75, .95 }, { .16, .17, .2 }, { .55, .58, .62 }, { .2, .45, .85 }

local function buildRocket()
  local v = {}
  local seg = 20
  lathe(v, 0.38, 0.05, 0.5, 0.55, seg, function() return DARK end)                   -- engine bell
  lathe(v, 0.5, 0.55, 0.62, 0.7, seg, function() return METAL end)
  lathe(v, 0.62, 0.7, 0.62, 3.9, seg, function(i) return WHITE end)                -- body
  lathe(v, 0.625, 1.6, 0.625, 1.9, seg, function() return BAND end)                -- blue band
  lathe(v, 0.625, 3.3, 0.625, 3.6, seg, function() return RED end)                 -- red band
  lathe(v, 0.62, 3.9, 0.36, 4.9, seg, function() return RED end)                   -- nose
  lathe(v, 0.36, 4.9, 0.0, 5.6, seg, function() return RED end)
  for i = 0, 2 do                                                                    -- windows
    local a = i / 3 * math.pi * 2 + 0.4
    local cx, cz = math.cos(a) * 0.63, math.sin(a) * 0.63
    local tx, tz = -math.sin(a) * 0.17, math.cos(a) * 0.17
    quad(v, { cx - tx, 2.55, cz - tz }, { cx + tx, 2.55, cz + tz }, { cx + tx, 2.9, cz + tz }, { cx - tx, 2.9, cz - tz }, GLASS)
  end
  for i = 0, 3 do                                                                    -- fins
    local a = i / 4 * math.pi * 2 + math.pi / 4
    local ca, sa = math.cos(a), math.sin(a)
    local function p(r, y, side) return { ca * r - sa * side, y, sa * r + ca * side } end
    for _, side in ipairs({ -0.04, 0.04 }) do
      quad(v, p(0.6, 0.2, side), p(1.3, 0.05, side), p(1.15, 0.9, side), p(0.6, 1.8, side), RED)
    end
    quad(v, p(1.3, 0.05, -0.04), p(1.3, 0.05, 0.04), p(1.15, 0.9, 0.04), p(1.15, 0.9, -0.04), RED)
    quad(v, p(1.15, 0.9, -0.04), p(1.15, 0.9, 0.04), p(0.6, 1.8, 0.04), p(0.6, 1.8, -0.04), RED)
  end
  return v
end

local function buildFlame()
  local v = {}
  lathe(v, 0.36, 0.05, 0.0, -1.0, 12, function(i) return { 1.0, 0.85, 0.3 } end)
  lathe(v, 0.5, 0.05, 0.0, -1.8, 12, function(i) return { 1.0, 0.45, 0.1 } end)
  return v
end

local VS = [[#version 300 es
in vec3 aPos; in vec3 aNormal; in vec3 aColor;
uniform mat4 uProj; uniform mat4 uView; uniform vec3 uOffset; uniform float uYaw; uniform float uScaleY;
out vec3 vColor; out vec3 vNormal;
void main() {
  float c = cos(uYaw), s = sin(uYaw);
  vec3 p = vec3(c * aPos.x - s * aPos.z, aPos.y * uScaleY, s * aPos.x + c * aPos.z);
  vNormal = vec3(c * aNormal.x - s * aNormal.z, aNormal.y, s * aNormal.x + c * aNormal.z);
  vColor = aColor;
  gl_Position = uProj * uView * vec4(p + uOffset, 1.0);
}]]
local FS = [[#version 300 es
precision mediump float;
in vec3 vColor; in vec3 vNormal;
uniform float uLight; uniform float uGlow;
out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  float d = abs(dot(n, normalize(vec3(0.35, 0.9, 0.25))));
  float shade = mix(0.55 + 0.45 * d, 1.0, uGlow) * uLight;
  fragColor = vec4(vColor * shade, 1.0);
}]]

local function compile(kind, src)
  local sh = gl.createShader(kind)
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if not gl.getShaderParameter(sh, gl.COMPILE_STATUS) then error("shader: " .. tostring(gl.getShaderInfoLog(sh))) end
  return sh
end

local function upload(data)
  local vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  local vbo = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
  local stride = 9 * 4
  for i, loc in ipairs({ 0, 1, 2 }) do
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, stride, (i - 1) * 12)
  end
  gl.bindVertexArray(nil)
  return vao, vbo, #data // 9
end

local function initGl()
  local p = gl.createProgram()
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VS))
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FS))
  gl.bindAttribLocation(p, 0, "aPos"); gl.bindAttribLocation(p, 1, "aNormal"); gl.bindAttribLocation(p, 2, "aColor")
  gl.linkProgram(p)
  if not gl.getProgramParameter(p, gl.LINK_STATUS) then error("link: " .. tostring(gl.getProgramInfoLog(p))) end
  mesh.prog = p
  mesh.u = {}
  for _, n in ipairs({ "uProj", "uView", "uOffset", "uYaw", "uScaleY", "uLight", "uGlow" }) do mesh.u[n] = gl.getUniformLocation(p, n) end
  mesh.vao, mesh.vbo, mesh.count = upload(buildRocket())
  mesh.flameVao, mesh.flameVbo, mesh.flameCount = upload(buildFlame())
end

local function drawRocket(e, x, y, z, yaw, light, flame, t)
  gl.uniform3f(mesh.u.uOffset, x - e.x, y - e.y, z - e.z)
  gl.uniform1f(mesh.u.uYaw, yaw)
  gl.uniform1f(mesh.u.uScaleY, 1.0)
  gl.uniform1f(mesh.u.uLight, light)
  gl.uniform1f(mesh.u.uGlow, 0.0)
  gl.bindVertexArray(mesh.vao)
  gl.drawArrays(gl.TRIANGLES, 0, mesh.count)
  if flame then
    gl.uniform1f(mesh.u.uScaleY, 0.8 + 0.35 * math.sin(t * 1.7) + 0.2 * math.sin(t * 4.1))
    gl.uniform1f(mesh.u.uLight, 1.0)
    gl.uniform1f(mesh.u.uGlow, 1.0)
    gl.bindVertexArray(mesh.flameVao)
    gl.drawArrays(gl.TRIANGLES, 0, mesh.flameCount)
  end
end

local frameT = 0
on("render_world", function(e)
  if mesh.failed or not game.inWorld() then return end
  frameT = frameT + 1
  local list = {}
  for _, r in pairs(rockets) do list[#list + 1] = r end
  if launch and launch.lifted then list[#list + 1] = { x = launch.x, y = launch.y + launch.alt, z = launch.z, flying = true } end
  if launch and not launch.lifted and launch.t > 20 then
    for _, r in ipairs(list) do if r.uuid == launch.uuid then r.flame = true end end
  end
  if #list == 0 then return end
  local ok, err = pcall(function()
    if not mesh.prog then initGl() end
    -- remember the game's GL state and put it back afterwards
    local prevProg = gl.getParameter(gl.CURRENT_PROGRAM)
    local prevVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING or 34229)
    local depth, cull, blend = gl.isEnabled(gl.DEPTH_TEST), gl.isEnabled(gl.CULL_FACE), gl.isEnabled(gl.BLEND)
    local depthFunc = gl.getParameter(gl.DEPTH_FUNC or 2932)
    local depthMask = gl.getParameter(gl.DEPTH_WRITEMASK or 2930)
    gl.useProgram(mesh.prog)
    gl.uniformMatrix4fv(mesh.u.uProj, false, e.projection)
    gl.uniformMatrix4fv(mesh.u.uView, false, e.view)
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(e.depthFunc or gl.LEQUAL)
    gl.depthMask(true)
    gl.disable(gl.CULL_FACE)
    gl.disable(gl.BLEND)
    local daylight = 1.0
    local okT, tod = pcall(world.timeOfDay)
    if okT and type(tod) == "number" then daylight = 0.45 + 0.55 * math.max(0, math.cos((tod - 0.25) * math.pi * 2) * 0.5 + 0.5) end
    for _, r in ipairs(list) do
      local light = daylight
      local okL, l = pcall(world.light, math.floor(r.x), math.floor(r.y + 1), math.floor(r.z))
      if okL and type(l) == "number" then light = math.max(0.35, math.max(l / 15, daylight * 0.6)) end
      drawRocket(e, r.x, r.y, r.z, 0.0, light, r.flying or r.flame, frameT)
    end
    gl.bindVertexArray(prevVao)
    gl.useProgram(prevProg)
    if not depth then gl.disable(gl.DEPTH_TEST) end
    if cull then gl.enable(gl.CULL_FACE) end
    if blend then gl.enable(gl.BLEND) end
    if depthFunc then gl.depthFunc(depthFunc) end
    if depthMask ~= nil then gl.depthMask(depthMask) end
  end)
  if not ok then
    mesh.failed = true
    print("rocket model disabled: " .. tostring(err))
  end
end)

-- ------------------------------------------------------------------ panel
local panel
local startLaunch
local function openPanel(r)
  local here = player.dimension()
  local fuelInBag = countItem(ITEMS.fuel)
  panel = ui.screen({
    title = "Rocket",
    init = function(screen)
      local bar = string.rep("\u{25A0}", r.fuel) .. string.rep("\u{25A1}", MAX_FUEL - r.fuel)
      screen:label({ text = "Fuel  " .. bar .. "  " .. r.fuel .. " / " .. MAX_FUEL, centered = true })
      screen:label({ text = "Rocket Fuel in your inventory: " .. fuelInBag, centered = true })
      screen:button({ text = "Load 1 fuel", onClick = function()
        if needCheats() then return end
        if r.fuel >= MAX_FUEL then notify("The tank is full.") return end
        if countItem(ITEMS.fuel) < 1 then notify("You have no Rocket Fuel. Craft it from copper, coal, gunpowder and blaze powder.") return end
        run("clear @s " .. ITEMS.fuel.match .. " 1")
        setFuel(r, r.fuel + 1)
        fuelInBag = fuelInBag - 1
        screen:rebuild()
      end })
      screen:button({ text = "Fill the tank", onClick = function()
        if needCheats() then return end
        local n = math.min(MAX_FUEL - r.fuel, countItem(ITEMS.fuel))
        if n < 1 then notify(r.fuel >= MAX_FUEL and "The tank is full." or "You have no Rocket Fuel.") return end
        run("clear @s " .. ITEMS.fuel.match .. " " .. n)
        setFuel(r, r.fuel + n)
        fuelInBag = fuelInBag - n
        screen:rebuild()
      end })
      screen:label({ text = "Fly to:", centered = true })
      for _, p in ipairs(PLANETS) do
        local label = p.name .. "  (" .. p.cost .. " fuel)"
        if p.dim == here then label = p.name .. "  (you are here)" end
        screen:button({ text = label, onClick = function()
          if p.dim == here then notify("You are already on " .. p.name .. ".") return end
          if r.fuel < p.cost then notify("Not enough fuel: " .. p.name .. " needs " .. p.cost .. ", the tank has " .. r.fuel .. ".") return end
          if needCheats() then return end
          screen:close()
          startLaunch(r, p)
        end })
      end
      screen:button({ text = "Pick up the rocket", onClick = function()
        if needCheats() then return end
        run("kill " .. r.uuid)
        run("loot give @s loot " .. ITEMS.rocket.loot)
        for _ = 1, r.fuel do run("loot give @s loot " .. ITEMS.fuel.loot) end
        rockets[r.uuid] = nil
        screen:close()
      end })
      screen:button({ text = "Close", onClick = function() screen:close() end })
    end,
  })
  ui.open(panel)
end

-- ------------------------------------------------------------------ launch
startLaunch = function(r, dest)
  local ox, oy, oz = player.pos()
  if (ox - r.x) ^ 2 + (oz - r.z) ^ 2 > 64 then notify("Stand next to the rocket to launch.") return end
  launch = { uuid = r.uuid, x = r.x, y = r.y, z = r.z, fuel = r.fuel - dest.cost, dest = dest, t = 0, alt = 0, lifted = false }
  notify("Launch to " .. dest.name .. " in 3...")
end

local function particles(x, y, z, kind, spread, count)
  run(string.format("particle %s %s %s %s %s 0.1 %s 0.02 %d force", kind, fmt(x), fmt(y), fmt(z), spread, spread, count))
end

local function tickLaunch()
  local L = launch
  L.t = L.t + 1
  if not L.lifted then
    if L.t % 20 == 0 and L.t <= 60 then
      run(string.format("playsound minecraft:block.note_block.pling master @s ~ ~ ~ 1 %s", L.t == 60 and "2" or "1"))
    end
    if L.t > 20 and L.t % 4 == 0 then particles(L.x, L.y + 0.2, L.z, "minecraft:campfire_cosy_smoke", 0.6, 4) end
    if L.t >= 70 then
      L.lifted = true
      run("kill " .. L.uuid)
      rockets[L.uuid] = nil
      run("playsound minecraft:entity.firework_rocket.launch master @a ~ ~ ~ 2 0.5")
      run("playsound minecraft:entity.generic.explode master @a ~ ~ ~ 0.6 0.6")
      run("effect give @s minecraft:levitation 5 6 true")
      run("effect give @s minecraft:resistance 15 4 true")
    end
    return
  end
  local lt = L.t - 70
  L.alt = 0.02 * lt * lt
  if lt % 3 == 0 then particles(L.x, L.y + L.alt - 0.5, L.z, "minecraft:flame", 0.25, 6) end
  if lt % 3 == 0 then particles(L.x, L.y + L.alt - 1.2, L.z, "minecraft:large_smoke", 0.4, 3) end
  if lt == 80 then
    local d = L.dest
    run("effect clear @s minecraft:levitation")
    run("effect give @s minecraft:slow_falling 20 0 true")
    if d.hot then run("effect give @s minecraft:fire_resistance 120 0 true") end
    run(string.format("execute in %s run spreadplayers %s %s 0 %d %sfalse @s", d.dim, fmt(L.x), fmt(L.z),
      d.belt and 64 or 24, d.belt and "under 200 " or ""))
    arrival = { dest = d, fuel = L.fuel, t = 0, x = L.x, z = L.z }
    pendingError = nil
    launch = nil
  end
end

local function tickArrival()
  local A = arrival
  A.t = A.t + 1
  local here = player.dimension()
  if here ~= A.dest.dim then
    -- the Asteroid Belt has open space: with no rock in range, come down at y 101 and build the pad in the air
    if A.t == 40 and pendingError and A.dest.belt then
      run(string.format("execute in %s run tp @s %s 101 %s", A.dest.dim, fmt(A.x), fmt(A.z)))
      A.floating = true
    end
    if A.t > 600 then say("\u{00A7}cThe flight did not arrive. " .. (pendingError or "")) arrival = nil end
    return
  end
  local onGround = player.isOnGround()
  if A.t < 30 or (not onGround and not A.floating and A.t < 400) then return end
  local x, y, z = player.blockPos()
  if not x then local px, py, pz = player.pos(); x, y, z = math.floor(px), math.floor(py), math.floor(pz) end
  -- build the pad under the player, stand the rocket on it and step aside
  run(string.format("place template minecraft:aerospace/landing_pad %d %d %d", x - 2, y - 1, z - 2))
  summonRocket(x + 0.5, y, z + 0.5, A.fuel)
  run(string.format("tp @s %s %s %s", fmt(x + 0.5), fmt(y + 0.1), fmt(z + 2.5)))
  run("playsound minecraft:block.beacon.power_select master @s ~ ~ ~ 1 0.8")
  notify("Welcome to " .. A.dest.name .. ". Fuel left: " .. A.fuel)
  arrival = nil
end

-- ------------------------------------------------------------------ input
on("mouse_click", function(e)
  if e.button ~= "right" or e.action ~= "press" then return end
  if game.screen() ~= nil or not game.inWorld() or launch or arrival then return end
  local r = rocketInSight()
  if r then
    pcall(function() e:cancel() end)
    openPanel(r)
    return
  end
  local id, name = heldName()
  if id == ITEMS.pad.id and name == ITEMS.pad.name then
    local x, y, z = lookBlock()
    if not x then notify("Look at the ground where the pad should go.") return end
    if needCheats() then return end
    run(string.format("place template minecraft:aerospace/landing_pad %d %d %d", x - 2, y, z - 2))
    run("clear @s " .. ITEMS.pad.match .. " 1")
    run("playsound minecraft:block.stone.place master @s ~ ~ ~ 1 0.8")
    return
  end
  if id == ITEMS.rocket.id and name == ITEMS.rocket.name then
    local x, y, z = lookBlock()
    local cx, cy, cz
    if x then cx, cy, cz = padCentre(x, y, z) end
    if not cx then notify("Place the Rocket on the middle of a Landing Pad.") return end
    if rocketOnPad(cx, cy, cz) then notify("There is already a rocket on this pad.") return end
    if needCheats() then return end
    summonRocket(cx + 0.5, cy + 1, cz + 0.5, 0)
    run("clear @s " .. ITEMS.rocket.match .. " 1")
    run("playsound minecraft:block.anvil.place master @s ~ ~ ~ 0.6 1.4")
    pcall(function() e:cancel() end)
  end
end)

-- ------------------------------------------------------------------ gravity and oxygen
local applied = nil          -- dimension whose gravity is applied
local oxygen, maxOxygen = 30, 30

local function wearingHelmet()
  local ok, armor = pcall(player.armor)
  if ok and type(armor) == "table" then
    for _, it in pairs(armor) do
      if type(it) == "table" and it.name == ITEMS.helmet.name then return true end
    end
    return false
  end
  local okI, inv = pcall(player.inventory)
  if okI and type(inv) == "table" then
    for _, it in pairs(inv) do
      if type(it) == "table" and it.name == ITEMS.helmet.name and (it.slot or 0) >= 36 then return true end
    end
  end
  return false
end

local function applyGravity(dim)
  local p = BY_DIM[dim] or BY_DIM[EARTH]
  if p.dim == EARTH or not BY_DIM[dim] then
    run("attribute @s minecraft:gravity base reset")
    run("attribute @s minecraft:safe_fall_distance base reset")
    run("attribute @s minecraft:fall_damage_multiplier base reset")
  else
    run("attribute @s minecraft:gravity base set " .. p.g)
    run("attribute @s minecraft:safe_fall_distance base set " .. p.safe)
    run("attribute @s minecraft:fall_damage_multiplier base set " .. p.fall)
  end
  applied = dim
end

local ticks = 0
local joinedAt = nil
on("world_join", function() joinedAt = ticks; applied = nil; cheats = nil; rockets = {}; launch = nil; arrival = nil end)
on("world_leave", function() applied = nil; rockets = {}; launch = nil; arrival = nil end)

on("tick", function()
  ticks = ticks + 1
  if not game.inWorld() or not player.exists() then return end
  if not joinedAt then joinedAt = ticks end
  if ticks - joinedAt < 60 then return end
  if ticks % 10 == 0 then scanRockets() end
  if launch then tickLaunch() end
  if arrival then tickArrival() end
  local dim = player.dimension()
  if ticks % 20 == 0 then
    if settings.gravity and applied ~= dim and cheats ~= false then applyGravity(dim) end
    if not settings.gravity and applied and applied ~= "off" then applyGravity(EARTH); applied = "off" end
    local p = BY_DIM[dim]
    local mode = player.gamemode()
    if settings.oxygen and p and not p.air and mode ~= "creative" and mode ~= "spectator" then
      if wearingHelmet() then
        oxygen = math.min(maxOxygen, oxygen + 5)
      else
        oxygen = oxygen - 1
        if oxygen <= 0 then
          oxygen = 0
          if cheats ~= false then run("damage @s 2 minecraft:drown") end
        end
      end
    else
      oxygen = math.min(maxOxygen, oxygen + 5)
    end
  end
end)

-- ------------------------------------------------------------------ HUD
hud.add("aerospace", function(ctx)
  if not settings.hud or not game.inWorld() then return end
  local dim = player.dimension()
  local p = BY_DIM[dim]
  if p and p.dim ~= EARTH and not game.screen() then
    local label = p.name .. "  \u{00B7}  gravity " .. string.format("%.2f", p.g / 0.08) .. "g"
    ctx:text(label, ctx.width - ctx:textWidth(label) - 6, ctx.height - 54, 0xFF9EEBFF)
  end
  if p and not p.air and settings.oxygen then
    local w = 82
    local x, y = ctx.width // 2 + 10, ctx.height - 62
    ctx:rect(x, y, w, 5, 0x90000000)
    local col = oxygen > 10 and 0xFF7DF9FF or 0xFFFF5555
    ctx:rect(x, y, math.floor(w * oxygen / maxOxygen), 5, col)
    ctx:text(wearingHelmet() and "O\u{2082} helmet" or ("O\u{2082} " .. oxygen .. "s"), x, y - 10, col)
  end
  if launch and not launch.lifted then
    local n = 3 - math.floor(launch.t / 20)
    local s = n > 0 and tostring(n) or "LIFTOFF"
    ctx:centeredText(s, ctx.width // 2, ctx.height // 2 - 40, 0xFFFFD23F)
  end
  local fade = 0
  if launch and launch.lifted then fade = math.min(1, math.max(0, (launch.t - 120) / 30)) end
  if arrival then fade = math.max(0, 1 - arrival.t / 40) end
  if fade > 0 then
    ctx:rect(0, 0, ctx.width, ctx.height, (math.floor(fade * 255) << 24))
    if arrival then ctx:centeredText(arrival.dest.name, ctx.width // 2, ctx.height // 2, 0xFF9EEBFF) end
  end
end)

-- ------------------------------------------------------------------ supplies
-- The creative inventory's tabs are built into the game and a mod cannot add
-- to them, so the space items come from this menu instead (press J, or
-- /aerospace items). Giving items is a game command: creative worlds allow it.
local LOOT = "minecraft:aerospace/item/"
local SUPPLIES = {
  { "Rocket", { { "rocket", 1 } } },
  { "Rocket Fuel x8", { { "fuel", 8 } } },
  { "Landing Pad x4", { { "landing_pad", 4 } } },
  { "Space Suit (full set)", { { "space_helmet", 1 }, { "space_chestplate", 1 }, { "space_leggings", 1 }, { "space_boots", 1 } } },
  { "Flight Manual", { { "flight_manual", 1 } } },
  { "Everything above", nil },
}
local function giveSupply(entries)
  for _, e in ipairs(entries) do
    for _ = 1, e[2] do run("loot give @s loot " .. LOOT .. e[1]) end
  end
end
local function openSupplies()
  if not game.inWorld() then return end
  ui.open(ui.screen({
    title = "Space Supplies",
    init = function(screen)
      screen:label({ text = "Take what you need for a flight.", centered = true })
      for _, s in ipairs(SUPPLIES) do
        screen:button({ text = s[1], onClick = function()
          if needCheats() then return end
          if s[2] then giveSupply(s[2])
          else for _, all in ipairs(SUPPLIES) do if all[2] then giveSupply(all[2]) end end end
          notify("Supplies added to your inventory.")
        end })
      end
      screen:button({ text = "Close", onClick = function() screen:close() end })
    end,
  }))
end
keys.bind({ id = "supplies", label = "Space Supplies menu", default = "j", onPress = function()
  if game.screen() == nil then openSupplies() end
end })

commands.register("aerospace", function(args)
  if args and args[1] == "items" then openSupplies() return end
  say("Aerospace " .. VERSION .. ": build a Landing Pad, place a Rocket on it, right click the rocket to fuel and launch. " ..
    "Press J (or /aerospace items) for Space Supplies. " ..
    "Rockets: " .. (function() local n = 0 for _ in pairs(rockets) do n = n + 1 end return n end)() ..
    "  Cheats: " .. (cheats == nil and "not checked yet" or (cheats and "on" or "off")))
end, "Aerospace help and status")

print("Aerospace " .. VERSION .. " loaded")
