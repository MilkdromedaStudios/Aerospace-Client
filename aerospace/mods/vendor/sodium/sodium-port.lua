
-- name: Sodium
-- id: sodium
-- version: 0.3.6
-- author: UserArham
-- description: FPS monitoring and optimization for Eaglercraft

--------------------------------------------------
-- SODIUM v0.3.6
--------------------------------------------------

local MOD_NAME = "Sodium"
local MOD_VERSION = "0.3.6"

--------------------------------------------------
-- SETTINGS
--------------------------------------------------

settings.toggle("enabled", {
    label = "Enable Sodium",
    default = true
})

settings.toggle("fpsHud", {
    label = "Show FPS HUD",
    default = true
})

settings.toggle("fpsBar", {
    label = "Show FPS bar",
    default = true
})

settings.toggle("showBranding", {
    label = "Show Sodium branding",
    default = true
})

settings.toggle("expandedHud", {
    label = "Expanded performance HUD",
    default = true
})

settings.toggle("adaptiveRenderDistance", {
    label = "Adaptive render distance",
    default = false
})

settings.slider("renderDistance", {
    label = "Target render distance",
    min = 2,
    max = 32,
    step = 1,
    default = 12
})

settings.slider("fpsLimit", {
    label = "FPS limit",
    min = 10,
    max = 260,
    step = 10,
    default = 260
})

--------------------------------------------------
-- STATE
--------------------------------------------------

local currentFPS = 0
local displayedFPS = 0

local minimumFPS = nil
local maximumFPS = 0
local totalFPS = 0
local sampleCount = 0

local performanceLog = {}
local fpsHistory = {}

local MAX_LOG_ENTRIES = 600
local MAX_HISTORY = 48

local lastSampleTime = os.clock()
local adaptiveTimer = 0
local adaptiveDistance = 12
local autoOptimize = false

local fpsBar = {
    x = 8,
    y = 8,
    width = 184,
    height = 112,
    maxFPS = 260,
    compact = false
}

--------------------------------------------------
-- SETTINGS HELPERS
--------------------------------------------------

local function getSetting(key, fallback)
    local value = settings.get(key)

    if value == nil then
        return fallback
    end

    return value
end

local function isEnabled()
    return getSetting("enabled", true)
end

--------------------------------------------------
-- FPS COLORS
--------------------------------------------------

local function getFPSColor(fps)
    if fps >= 66 then
        return "#3399FF"
    elseif fps >= 50 then
        return "#55DD55"
    elseif fps >= 25 then
        return "#FFFF00"
    elseif fps >= 18 then
        return "#FF8800"
    else
        return "#FF3333"
    end
end

local function getFPSStatus(fps)
    if fps >= 66 then
        return "SMOOTH"
    elseif fps >= 50 then
        return "GOOD"
    elseif fps >= 25 then
        return "MODERATE"
    elseif fps >= 18 then
        return "LOW"
    else
        return "VERY LOW"
    end
end

--------------------------------------------------
-- STATISTICS
--------------------------------------------------

local function getAverageFPS()
    if sampleCount == 0 then
        return 0
    end

    return math.floor(totalFPS / sampleCount + 0.5)
end

local function getMinimumFPS()
    return minimumFPS or 0
end

local function getMaximumFPS()
    return maximumFPS
end

--------------------------------------------------
-- HISTORY
--------------------------------------------------

local function addHistory(fps)
    table.insert(fpsHistory, fps)

    if #fpsHistory > MAX_HISTORY then
        table.remove(fpsHistory, 1)
    end
end

--------------------------------------------------
-- RECORD FPS
--------------------------------------------------

local function recordFPS()
    if not game.inWorld() then
        return
    end

    local fps = math.max(0, math.floor(currentFPS))

    minimumFPS = math.min(minimumFPS or fps, fps)
    maximumFPS = math.max(maximumFPS, fps)

    totalFPS = totalFPS + fps
    sampleCount = sampleCount + 1

    table.insert(performanceLog, {
        time = os.date("%Y-%m-%d %H:%M:%S"),
        fps = fps
    })

    if #performanceLog > MAX_LOG_ENTRIES then
        table.remove(performanceLog, 1)
    end

    addHistory(fps)
end

--------------------------------------------------
-- REFRESH FPS
--------------------------------------------------

local function refreshFPS()
    currentFPS = game.inWorld() and game.fps() or 0
    displayedFPS = currentFPS

    minimumFPS = nil
    maximumFPS = 0
    totalFPS = 0
    sampleCount = 0

    performanceLog = {}
    fpsHistory = {}

    lastSampleTime = os.clock()

    if game.inWorld() then
        local fps = math.max(0, math.floor(currentFPS))

        minimumFPS = fps
        maximumFPS = fps
        totalFPS = fps
        sampleCount = 1

        table.insert(performanceLog, {
            time = os.date("%Y-%m-%d %H:%M:%S"),
            fps = fps
        })

        addHistory(fps)
    end

    chat.print("[Sodium] FPS measurements refreshed.")
end

--------------------------------------------------
-- TXT EXPORT
--------------------------------------------------

local function exportPerformanceLog()
    local lines = {
        "================================",
        "          SODIUM LOG",
        "================================",
        "Version: " .. MOD_VERSION,
        "Date: " .. os.date("%Y-%m-%d %H:%M:%S"),
        "",
        "PERFORMANCE STATISTICS",
        "Current FPS: " .. currentFPS,
        "Minimum FPS: " .. getMinimumFPS(),
        "Average FPS: " .. getAverageFPS(),
        "Maximum FPS: " .. getMaximumFPS(),
        "Samples: " .. sampleCount,
        "",
        "FPS HISTORY",
        "--------------------------------"
    }

    for _, entry in ipairs(performanceLog) do
        table.insert(
            lines,
            entry.time .. " | " .. entry.fps .. " FPS"
        )
    end

    table.insert(lines, "--------------------------------")
    table.insert(lines, "End of Sodium performance log.")

    files.save(
        "Sodium-Performance-Log.txt",
        table.concat(lines, "\n"),
        "text/plain"
    )

    chat.print("[Sodium] TXT log exported.")
end

--------------------------------------------------
-- CLEAR LOG
--------------------------------------------------

local function clearPerformanceLog()
    performanceLog = {}
    fpsHistory = {}

    chat.print("[Sodium] Performance log cleared.")
end

--------------------------------------------------
-- PERFORMANCE STATUS
--------------------------------------------------

local function showPerformanceStatus()
    chat.print("----- Sodium Performance -----")
    chat.print("Version: " .. MOD_VERSION)
    chat.print("Current FPS: " .. currentFPS)
    chat.print("Minimum FPS: " .. getMinimumFPS())
    chat.print("Average FPS: " .. getAverageFPS())
    chat.print("Maximum FPS: " .. getMaximumFPS())
    chat.print("Samples: " .. sampleCount)
    chat.print("Log entries: " .. #performanceLog)
    chat.print("------------------------------")
end

--------------------------------------------------
-- GAME OPTIONS
--------------------------------------------------

local function setGameOption(name, value)
    local ok = pcall(function()
        game.setOption(name, value)
    end)

    return ok
end

--------------------------------------------------
-- OPTIMIZATION PRESETS
--------------------------------------------------

local function applyPreset(name)
    local distance
    local limit
    local bobbing
    local fovEffects

    if name == "low" then
        distance = 4
        limit = 60
        bobbing = false
        fovEffects = 0

    elseif name == "balanced" then
        distance = 8
        limit = 120
        bobbing = false
        fovEffects = 0

    elseif name == "high" then
        distance = 16
        limit = 260
        bobbing = true
        fovEffects = 1

    elseif name == "apply" then
        distance = getSetting("renderDistance", 12)
        limit = getSetting("fpsLimit", 260)
        bobbing = true
        fovEffects = 1

    else
        chat.print("[Sodium] Unknown preset.")
        return
    end

    setGameOption("renderDistance", distance)
    setGameOption("framerateLimit", limit)
    setGameOption("viewBobbing", bobbing)
    setGameOption("fovEffects", fovEffects)

    adaptiveDistance = distance

    chat.print("[Sodium] " .. name .. " preset applied.")
end

--------------------------------------------------
-- RESET OPTIMIZATIONS
--------------------------------------------------

local function resetOptimizations()
    setGameOption("renderDistance", 12)
    setGameOption("framerateLimit", 260)
    setGameOption("viewBobbing", true)
    setGameOption("fovEffects", 1)

    adaptiveDistance = 12

    chat.print("[Sodium] Options reset.")
end

--------------------------------------------------
-- ADAPTIVE RENDER DISTANCE
--------------------------------------------------

local function updateAdaptiveRenderDistance()
    if not getSetting("adaptiveRenderDistance", false) then
        return
    end

    local newDistance = adaptiveDistance

    if currentFPS < 25 then
        newDistance = math.max(2, adaptiveDistance - 2)
    elseif currentFPS < 40 then
        newDistance = math.max(2, adaptiveDistance - 1)
    elseif currentFPS >= 90 then
        newDistance = math.min(32, adaptiveDistance + 1)
    end

    if newDistance ~= adaptiveDistance then
        adaptiveDistance = newDistance
        setGameOption("renderDistance", newDistance)
    end
end

local function updateAutomaticOptimization()
    if not autoOptimize then
        return
    end

    if currentFPS < 25 then
        setGameOption("renderDistance", 4)
    elseif currentFPS < 40 then
        setGameOption("renderDistance", 6)
    elseif currentFPS < 60 then
        setGameOption("renderDistance", 8)
    elseif currentFPS >= 100 then
        setGameOption("renderDistance", 12)
    end
end

--------------------------------------------------
-- FPS BAR DRAWING
-- PRESERVED FROM SODIUM 0.3.3-0.3.4
--------------------------------------------------

local function drawPanel(ctx, x, y, width, height)
    ctx:rect(
        x + 2,
        y + 3,
        width,
        height,
        "#70000000"
    )

    ctx:gradient(
        x,
        y,
        x + width,
        y + height,
        "#F0192435",
        "#E90B1220"
    )

    ctx:outline(
        x,
        y,
        width,
        height,
        "#526783"
    )

    ctx:rect(
        x + 1,
        y + 1,
        width - 2,
        1,
        "#806FA6D8"
    )
end

local function drawFPSBar(ctx, x, y, width, height)
    local color = getFPSColor(currentFPS)

    local ratio = math.min(
        1,
        math.max(0, displayedFPS / fpsBar.maxFPS)
    )

    local fillWidth = math.floor(width * ratio)

    ctx:rect(
        x,
        y,
        width,
        height,
        "#FF111827"
    )

    if fillWidth > 0 then
        ctx:rect(
            x,
            y - 2,
            fillWidth,
            height + 4,
            "#263399FF"
        )

        ctx:gradient(
            x,
            y,
            x + fillWidth,
            y + height,
            color,
            color
        )

        ctx:rect(
            x,
            y,
            fillWidth,
            2,
            "#70FFFFFF"
        )
    end

    for i = 1, 4 do
        local markX = x + width * i / 5

        ctx:rect(
            markX,
            y + 1,
            1,
            height - 2,
            "#60405060"
        )
    end

    ctx:outline(
        x,
        y,
        width,
        height,
        "#FF64748B"
    )
end

--------------------------------------------------
-- FPS HISTORY GRAPH
-- PRESERVED FROM SODIUM 0.3.3-0.3.4
--------------------------------------------------

local function drawHistoryGraph(ctx, x, y, width, height)
    ctx:rect(
        x,
        y,
        width,
        height,
        "#70101827"
    )

    ctx:outline(
        x,
        y,
        width,
        height,
        "#40516A"
    )

    if #fpsHistory < 2 then
        ctx:text(
            "Collecting FPS history...",
            x + 5,
            y + 5,
            "#94A3B8"
        )

        return
    end

    local previousX = nil
    local previousY = nil

    for i, fps in ipairs(fpsHistory) do
        local graphX =
            x + ((i - 1) / math.max(1, MAX_HISTORY - 1)) * width

        local normalized =
            math.min(1, math.max(0, fps / fpsBar.maxFPS))

        local graphY =
            y + height - (normalized * (height - 4)) - 2

        if previousX then
            ctx:line(
                previousX,
                previousY,
                graphX,
                graphY,
                getFPSColor(fps),
                2
            )
        end

        previousX = graphX
        previousY = graphY
    end
end

--------------------------------------------------
-- STATISTICS DRAWING
--------------------------------------------------

local function drawStat(ctx, label, value, x, y, color)
    ctx:text(label, x, y, "#91A3BA")
    ctx:text(tostring(value), x, y + 11, color)
end

--------------------------------------------------
-- MAIN HUD
-- LAYOUT AND DRAWING PRESERVED
--------------------------------------------------

hud.add("sodium_main_hud", function(ctx)
    if not isEnabled() or not game.inWorld() then
        return
    end

    local x = fpsBar.x
    local y = fpsBar.y
    local width = fpsBar.width

    local color = getFPSColor(currentFPS)

    if fpsBar.compact or not getSetting("expandedHud", true) then
        drawPanel(ctx, x, y, width, 34)

        if getSetting("showBranding", true) then
            ctx:text(
                "SODIUM",
                x + 8,
                y + 6,
                "#FFFFFF"
            )
        end

        if getSetting("fpsHud", true) then
            ctx:text(
                tostring(currentFPS) .. " FPS",
                x + 83,
                y + 6,
                color
            )
        end

        if getSetting("fpsBar", true) then
            drawFPSBar(ctx, x + 8, y + 23, width - 16, 5)
        end

        return
    end

    drawPanel(ctx, x, y, width, 112)

    if getSetting("showBranding", true) then
        ctx:text("SODIUM", x + 9, y + 7, "#FFFFFF")
        ctx:text("PERFORMANCE", x + 66, y + 7, "#8EA4C1")
    end

    ctx:circle(
        x + width - 12,
        y + 11,
        3,
        "#55DD55"
    )

    if getSetting("fpsHud", true) then
        ctx:text(
            tostring(currentFPS),
            x + 9,
            y + 23,
            color
        )

        ctx:text("FPS", x + 49, y + 29, "#B7C7D9")

        ctx:text(
            getFPSStatus(currentFPS),
            x + width - 64,
            y + 29,
            color
        )
    end

    if getSetting("fpsBar", true) then
        drawFPSBar(ctx, x + 9, y + 44, width - 18, 9)
    end

    drawStat(ctx, "MIN", getMinimumFPS(), x + 10, y + 61, "#FF8800")
    drawStat(ctx, "AVG", getAverageFPS(), x + 69, y + 61, "#55DD55")
    drawStat(ctx, "MAX", getMaximumFPS(), x + 130, y + 61, "#3399FF")

    drawHistoryGraph(ctx, x + 9, y + 86, width - 18, 17)
end)

--------------------------------------------------
-- FRAME EVENT
--------------------------------------------------

on("frame", function(dt)
    if not isEnabled() or not game.inWorld() then
        return
    end

    local measured = game.fps()

    if type(measured) == "number" then
        currentFPS = math.max(0, math.floor(measured))
    end

    local delta = math.max(0, math.min(dt or 0.05, 0.25))
    local smoothing = math.min(1, delta * 10)

    displayedFPS =
        displayedFPS +
        (currentFPS - displayedFPS) * smoothing
end)

--------------------------------------------------
-- TICK EVENT
--------------------------------------------------

on("tick", function()
    if not isEnabled() or not game.inWorld() then
        return
    end

    local now = os.clock()

    if now - lastSampleTime >= 1 then
        lastSampleTime = now

        recordFPS()
        updateAutomaticOptimization()
    end

    adaptiveTimer = adaptiveTimer + 1

    if adaptiveTimer >= 40 then
        adaptiveTimer = 0
        updateAdaptiveRenderDistance()
    end
end)

--------------------------------------------------
-- COMMAND SYSTEM
-- SODIUM 0.3.6
-- MAIN COMMAND: /lithium
--------------------------------------------------

local function normalize(value)
    if value == nil then
        return ""
    end

    return tostring(value)
        :lower()
        :match("^%s*(.-)%s*$")
end

--------------------------------------------------
-- HELP
--------------------------------------------------

local function showSodiumHelp()
    chat.print("===== SODIUM 0.3.6 COMMANDS =====")
    chat.print("/lithium help")
    chat.print("/lithium commands")
    chat.print("/lithium sodium on|off|settings|version|apply")
    chat.print("/lithium performance log|clear|status")
    chat.print("/lithium performance auto on|off")
    chat.print("/lithium optimize apply|low|balanced|high|reset|status")
    chat.print("/lithium fpsbar on|off|compact|expanded|reset|status")
    chat.print("/lithium refresh fps")
    chat.print("=================================")
end

local function showRegisteredCommands()
    chat.print("===== SODIUM COMMANDS =====")
    chat.print("/lithium")
    chat.print("/lithium help")
    chat.print("/lithium commands")
    chat.print("/lithium sodium")
    chat.print("/lithium performance")
    chat.print("/lithium optimize")
    chat.print("/lithium fpsbar")
    chat.print("/lithium refresh")
    chat.print("===========================")
end

--------------------------------------------------
-- MAIN COMMAND DISPATCHER
--------------------------------------------------

commands.register("lithium", function(args)
    local category = normalize(args[1])
    local action = normalize(args[2])
    local argument = normalize(args[3])

    if category == "" or category == "help" then
        showSodiumHelp()
        return
    end

    if category == "commands" then
        showRegisteredCommands()
        return
    end

    --------------------------------------------------
    -- SODIUM
    --------------------------------------------------

    if category == "sodium" then
        if action == "on" then
            settings.set("enabled", true)
            chat.print("[Sodium] Enabled.")

        elseif action == "off" then
            settings.set("enabled", false)
            chat.print("[Sodium] Disabled.")

        elseif action == "settings" then
            settings.open()

        elseif action == "version" then
            chat.print("Sodium " .. MOD_VERSION)

        elseif action == "apply" then
            applyPreset("apply")

        elseif action == "help" then
            chat.print("/lithium sodium on")
            chat.print("/lithium sodium off")
            chat.print("/lithium sodium settings")
            chat.print("/lithium sodium version")
            chat.print("/lithium sodium apply")

        else
            chat.print("[Sodium] Unknown sodium command.")
            chat.print("Use /lithium sodium help")
        end

        return
    end

    --------------------------------------------------
    -- PERFORMANCE
    --------------------------------------------------

    if category == "performance" then
        if action == "log" then
            exportPerformanceLog()

        elseif action == "clear" then
            clearPerformanceLog()

        elseif action == "status" or action == "" then
            showPerformanceStatus()

        elseif action == "auto" then
            if argument == "on" then
                autoOptimize = true
                chat.print("[Sodium] Auto optimization enabled.")

            elseif argument == "off" then
                autoOptimize = false
                chat.print("[Sodium] Auto optimization disabled.")

            else
                chat.print("Usage: /lithium performance auto on|off")
            end

        elseif action == "help" then
            chat.print("/lithium performance log")
            chat.print("/lithium performance clear")
            chat.print("/lithium performance status")
            chat.print("/lithium performance auto on|off")

        else
            chat.print("[Sodium] Unknown performance command.")
        end

        return
    end

    --------------------------------------------------
    -- OPTIMIZE
    --------------------------------------------------

    if category == "optimize" then
        if action == "apply" then
            applyPreset("apply")

        elseif action == "low" then
            applyPreset("low")

        elseif action == "balanced" then
            applyPreset("balanced")

        elseif action == "high" then
            applyPreset("high")

        elseif action == "reset" then
            resetOptimizations()

        elseif action == "status" or action == "" then
            chat.print("Render distance: " ..
                tostring(game.option("renderDistance")))
            chat.print("FPS limit: " ..
                tostring(game.option("framerateLimit")))

        elseif action == "help" then
            chat.print("/lithium optimize apply")
            chat.print("/lithium optimize low")
            chat.print("/lithium optimize balanced")
            chat.print("/lithium optimize high")
            chat.print("/lithium optimize reset")

        else
            chat.print("[Sodium] Unknown optimization command.")
        end

        return
    end

    --------------------------------------------------
    -- FPS BAR
    --------------------------------------------------

    if category == "fpsbar" then
        if action == "on" then
            settings.set("fpsBar", true)
            chat.print("[Sodium] FPS bar enabled.")

        elseif action == "off" then
            settings.set("fpsBar", false)
            chat.print("[Sodium] FPS bar disabled.")

        elseif action == "compact" then
            fpsBar.compact = true
            chat.print("[Sodium] Compact HUD enabled.")

        elseif action == "expanded" then
            fpsBar.compact = false
            chat.print("[Sodium] Expanded HUD enabled.")

        elseif action == "reset" then
            fpsBar.x = 8
            fpsBar.y = 8
            fpsBar.width = 184
            fpsBar.height = 112
            fpsBar.maxFPS = 260
            fpsBar.compact = false

            chat.print("[Sodium] FPS bar reset.")

        elseif action == "status" or action == "" then
            chat.print("FPS bar: " ..
                tostring(getSetting("fpsBar", true)))
            chat.print("Compact: " .. tostring(fpsBar.compact))

        elseif action == "help" then
            chat.print("/lithium fpsbar on")
            chat.print("/lithium fpsbar off")
            chat.print("/lithium fpsbar compact")
            chat.print("/lithium fpsbar expanded")
            chat.print("/lithium fpsbar reset")

        else
            chat.print("[Sodium] Unknown FPS bar command.")
        end

        return
    end

    --------------------------------------------------
    -- REFRESH
    --------------------------------------------------

    if category == "refresh" then
        if action == "fps" then
            refreshFPS()
        else
            chat.print("Usage: /lithium refresh fps")
        end

        return
    end

    --------------------------------------------------
    -- UNKNOWN COMMAND
    --------------------------------------------------

    chat.print("[Sodium] Unknown command: " .. category)
    chat.print("Use /lithium help")
end, "Sodium command dispatcher")

--------------------------------------------------
-- SETTINGS CHANGES
--------------------------------------------------

settings.onChange(function(key, value)
    if key == "enabled" then
        chat.print(
            value and "[Sodium] Enabled." or "[Sodium] Disabled."
        )
    end

    if key == "renderDistance" then
        adaptiveDistance = value
    end
end)

--------------------------------------------------
-- EXPORT
--------------------------------------------------

mod.export = {
    name = MOD_NAME,
    version = MOD_VERSION,

    getFPS = function()
        return currentFPS
    end,

    getAverageFPS = function()
        return getAverageFPS()
    end,

    getMinimumFPS = function()
        return getMinimumFPS()
    end,

    getMaximumFPS = function()
        return getMaximumFPS()
    end,

    refreshFPS = function()
        refreshFPS()
    end
}

--------------------------------------------------
-- INITIALIZATION
--------------------------------------------------

adaptiveDistance = getSetting("renderDistance", 12)

if game.inWorld() then
    currentFPS = game.fps()
    displayedFPS = currentFPS
end

lastSampleTime = os.clock()

chat.print("[Sodium] v" .. MOD_VERSION .. " loaded.")
chat.print("[Sodium] Main command: /lithium")
chat.print("[Sodium] Type /lithium help")
