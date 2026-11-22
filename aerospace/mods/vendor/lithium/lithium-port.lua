
-- name: Lithium
-- id: lithium
-- version: 0.1.3
-- author: UserArham
-- description: FPS monitoring, TPS display and performance optimization for Eaglercraft

--------------------------------------------------
-- LITHIUM v0.1.3
--------------------------------------------------

local MOD_NAME = "Lithium"
local MOD_VERSION = "0.1.3"

--------------------------------------------------
-- SAFE HELPERS
--------------------------------------------------

local function safeString(value, fallback)
    if value == nil then
        return fallback or "Unknown"
    end

    return tostring(value)
end

local function safeNumber(value, fallback)
    local number = tonumber(value)

    if number == nil then
        return fallback or 0
    end

    return number
end

local function printMessage(message)
    pcall(function()
        chat.print("[Lithium] " .. safeString(message, ""))
    end)
end

local function inWorld()
    local result = false

    pcall(function()
        result = game.inWorld()
    end)

    return result == true
end

local function getFPS()
    local fps = 0

    pcall(function()
        fps = safeNumber(game.fps(), 0)
    end)

    return math.max(0, math.floor(fps))
end

--------------------------------------------------
-- SETTINGS
--------------------------------------------------

settings.toggle("lithium_enabled", {
    label = "Enable Lithium",
    default = true
})

settings.toggle("lithium_fpsHud", {
    label = "Show FPS counter",
    default = true
})

settings.toggle("lithium_tpsHud", {
    label = "Show TPS bar",
    default = true
})

settings.toggle("lithium_expandedHud", {
    label = "Expanded Lithium HUD",
    default = true
})

settings.toggle("lithium_showBranding", {
    label = "Show Lithium branding",
    default = true
})

settings.toggle("lithium_fpsHistory", {
    label = "Show FPS history",
    default = true
})

settings.slider("lithium_targetFPS", {
    label = "Target FPS",
    min = 30,
    max = 260,
    step = 10,
    default = 120
})

settings.slider("lithium_renderDistance", {
    label = "Target render distance",
    min = 2,
    max = 32,
    step = 1,
    default = 12
})

--------------------------------------------------
-- SETTINGS HELPERS
--------------------------------------------------

local function getSetting(key, fallback)
    local value = nil

    pcall(function()
        value = settings.get("lithium_" .. key)
    end)

    if value == nil then
        return fallback
    end

    return value
end

local function isEnabled()
    return getSetting("enabled", true) == true
end

--------------------------------------------------
-- STATE
--------------------------------------------------

local currentFPS = 0
local displayedFPS = 0

local currentTPS = nil
local displayedTPS = 0

local minimumFPS = nil
local maximumFPS = 0
local totalFPS = 0
local sampleCount = 0

local fpsHistory = {}
local performanceLog = {}

local MAX_HISTORY = 48
local MAX_LOG_ENTRIES = 600

local lastSampleTime = os.clock()
local adaptiveTimer = 0
local adaptiveDistance = 12

local autoOptimize = false

--------------------------------------------------
-- HUD CONFIGURATION
--------------------------------------------------

local hudConfig = {
    x = 8,
    y = 130,
    width = 190,
    height = 112,
    maxFPS = 260,
    maxTPS = 20,
    compact = false
}

--------------------------------------------------
-- TPS PROVIDER
--------------------------------------------------

-- Replace this function with the verified Zeus API
-- TPS accessor when available.
--
-- Do not substitute FPS for TPS:
-- they measure different things.

local function getTPS()
    return nil
end

--------------------------------------------------
-- TPS COLORS
--------------------------------------------------

local function getTPSColor(tps)
    if tps == nil then
        return "#94A3B8"
    elseif tps >= 18 then
        return "#3399FF"
    elseif tps >= 15 then
        return "#FFFF00"
    elseif tps >= 10 then
        return "#FF8800"
    else
        return "#FF3333"
    end
end

local function getTPSStatus(tps)
    if tps == nil then
        return "UNAVAILABLE"
    elseif tps >= 18 then
        return "STABLE"
    elseif tps >= 15 then
        return "MODERATE"
    elseif tps >= 10 then
        return "LOW"
    else
        return "VERY LOW"
    end
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
    end

    return "#FF3333"
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
    end

    return "VERY LOW"
end

--------------------------------------------------
-- STATISTICS
--------------------------------------------------

local function getAverageFPS()
    if sampleCount <= 0 then
        return 0
    end

    return math.floor(totalFPS / sampleCount + 0.5)
end

local function getMinimumFPS()
    return minimumFPS or 0
end

local function getMaximumFPS()
    return maximumFPS or 0
end

--------------------------------------------------
-- FPS HISTORY
--------------------------------------------------

local function addHistory(fps)
    table.insert(fpsHistory, fps)

    if #fpsHistory > MAX_HISTORY then
        table.remove(fpsHistory, 1)
    end
end

--------------------------------------------------
-- PERFORMANCE LOG
--------------------------------------------------

local function recordFPS()
    local fps = currentFPS

    minimumFPS = math.min(minimumFPS or fps, fps)
    maximumFPS = math.max(maximumFPS, fps)

    totalFPS = totalFPS + fps
    sampleCount = sampleCount + 1

    table.insert(performanceLog, {
        time = os.date("%Y-%m-%d %H:%M:%S"),
        fps = fps,
        tps = currentTPS
    })

    if #performanceLog > MAX_LOG_ENTRIES then
        table.remove(performanceLog, 1)
    end

    addHistory(fps)
end

--------------------------------------------------
-- REFRESH STATISTICS
--------------------------------------------------

local function refreshFPS()
    currentFPS = getFPS()
    displayedFPS = currentFPS
    currentTPS = getTPS()

    minimumFPS = nil
    maximumFPS = 0
    totalFPS = 0
    sampleCount = 0

    performanceLog = {}
    fpsHistory = {}

    lastSampleTime = os.clock()

    if inWorld() then
        recordFPS()
    end

    printMessage("Measurements refreshed.")
end

--------------------------------------------------
-- EXPORT PERFORMANCE LOG
--------------------------------------------------

local function exportPerformanceLog()
    local lines = {
        "================================",
        "          LITHIUM LOG",
        "================================",
        "Version: " .. MOD_VERSION,
        "Date: " .. os.date("%Y-%m-%d %H:%M:%S"),
        "",
        "PERFORMANCE STATISTICS",
        "Current FPS: " .. safeString(currentFPS, "0"),
        "Current TPS: " .. safeString(currentTPS, "Unavailable"),
        "Minimum FPS: " .. safeString(getMinimumFPS(), "0"),
        "Average FPS: " .. safeString(getAverageFPS(), "0"),
        "Maximum FPS: " .. safeString(getMaximumFPS(), "0"),
        "Samples: " .. safeString(sampleCount, "0"),
        "",
        "FPS HISTORY",
        "--------------------------------"
    }

    for _, entry in ipairs(performanceLog) do
        table.insert(
            lines,
            safeString(entry.time, "Unknown") ..
            " | " ..
            safeString(entry.fps, "0") ..
            " FPS | " ..
            safeString(entry.tps, "Unavailable") ..
            " TPS"
        )
    end

    table.insert(lines, "--------------------------------")
    table.insert(lines, "End of Lithium performance log.")

    local ok = pcall(function()
        files.save(
            "Lithium-Performance-Log.txt",
            table.concat(lines, "\n"),
            "text/plain"
        )
    end)

    if ok then
        printMessage("Performance log exported.")
    else
        printMessage("Could not export performance log.")
    end
end

--------------------------------------------------
-- CLEAR PERFORMANCE LOG
--------------------------------------------------

local function clearPerformanceLog()
    performanceLog = {}
    fpsHistory = {}

    minimumFPS = nil
    maximumFPS = 0
    totalFPS = 0
    sampleCount = 0

    printMessage("Performance log cleared.")
end

--------------------------------------------------
-- PERFORMANCE STATUS
--------------------------------------------------

local function showPerformanceStatus()
    printMessage("----- Performance -----")
    printMessage("Current FPS: " .. currentFPS)
    printMessage("Current TPS: " .. safeString(currentTPS, "Unavailable"))
    printMessage("Minimum FPS: " .. getMinimumFPS())
    printMessage("Average FPS: " .. getAverageFPS())
    printMessage("Maximum FPS: " .. getMaximumFPS())
    printMessage("Samples: " .. sampleCount)
    printMessage("Log entries: " .. #performanceLog)
    printMessage("-----------------------")
end

--------------------------------------------------
-- GAME OPTIONS
--------------------------------------------------

local function setGameOption(name, value)
    return pcall(function()
        game.setOption(name, value)
    end)
end

--------------------------------------------------
-- OPTIMIZATION PRESETS
--------------------------------------------------

local function applyPreset(name)
    local distance
    local limit

    if name == "low" then
        distance = 4
        limit = 60

    elseif name == "balanced" then
        distance = 8
        limit = 120

    elseif name == "high" then
        distance = 16
        limit = 260

    elseif name == "custom" then
        distance = safeNumber(
            getSetting("renderDistance", 12),
            12
        )

        limit = safeNumber(
            getSetting("targetFPS", 120),
            120
        )

    else
        printMessage("Unknown optimization preset.")
        return
    end

    setGameOption("renderDistance", distance)
    setGameOption("framerateLimit", limit)

    adaptiveDistance = distance

    printMessage(name .. " preset applied.")
end

--------------------------------------------------
-- RESET OPTIMIZATION
--------------------------------------------------

local function resetOptimizations()
    setGameOption("renderDistance", 12)
    setGameOption("framerateLimit", 260)

    adaptiveDistance = 12
    autoOptimize = false

    printMessage("Optimization settings reset.")
end

--------------------------------------------------
-- ADAPTIVE RENDER DISTANCE
--------------------------------------------------

local function updateAdaptiveRenderDistance()
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

--------------------------------------------------
-- AUTOMATIC OPTIMIZATION
--------------------------------------------------

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
-- HUD PANEL
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

--------------------------------------------------
-- TPS BAR
--------------------------------------------------

local function drawTPSBar(ctx, x, y, width, height)
    local tps = currentTPS
    local color = getTPSColor(tps)

    ctx:rect(
        x,
        y,
        width,
        height,
        "#FF111827"
    )

    if tps ~= nil then
        local ratio = math.min(
            1,
            math.max(0, tps / hudConfig.maxTPS)
        )

        local fillWidth = math.floor(width * ratio)

        if fillWidth > 0 then
            ctx:gradient(
                x,
                y,
                x + fillWidth,
                y + height,
                color,
                color
            )
        end
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
            math.min(1, math.max(0, fps / hudConfig.maxFPS))

        local graphY =
            y + height - (normalized * (height - 4)) - 2

        if previousX ~= nil then
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
-- STATISTICS HUD
--------------------------------------------------

local function drawStat(ctx, label, value, x, y, color)
    ctx:text(
        safeString(label, ""),
        x,
        y,
        "#91A3BA"
    )

    ctx:text(
        safeString(value, "0"),
        x,
        y + 11,
        color
    )
end

--------------------------------------------------
-- MAIN HUD
--------------------------------------------------

hud.add("lithium_main_hud", function(ctx)
    if not isEnabled() or not inWorld() then
        return
    end

    local x = hudConfig.x
    local y = hudConfig.y
    local width = hudConfig.width

    local color = getFPSColor(currentFPS)

    if hudConfig.compact or
       not getSetting("expandedHud", true) then

        drawPanel(ctx, x, y, width, 42)

        if getSetting("showBranding", true) then
            ctx:text(
                "LITHIUM",
                x + 8,
                y + 5,
                "#FFFFFF"
            )
        end

        if getSetting("fpsHud", true) then
            ctx:text(
                tostring(currentFPS) .. " FPS",
                x + 90,
                y + 5,
                color
            )
        end

        if getSetting("tpsHud", true) then
            drawTPSBar(ctx, x, y + 25, width - 16, 7)
        end

        return
    end

    drawPanel(ctx, x, y, width, 112)

    if getSetting("showBranding", true) then
        ctx:text(
            "LITHIUM",
            x + 9,
            y + 7,
            "#FFFFFF"
        )

        ctx:text(
            "PERFORMANCE",
            x + 73,
            y + 7,
            "#8EA4C1"
        )
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

        ctx:text(
            "FPS",
            x + 49,
            y + 29,
            "#B7C7D9"
        )

        ctx:text(
            getFPSStatus(currentFPS),
            x + width - 64,
            y + 29,
            color
        )
    end

    -- TPS label and bar on the LEFT side.
    if getSetting("tpsHud", true) then
        ctx:text(
            "TPS",
            x + 9,
            y + 43,
            "#B7C7D9"
        )

        ctx:text(
            currentTPS == nil and "--" or
            string.format("%.1f", currentTPS),
            x + 42,
            y + 43,
            getTPSColor(currentTPS)
        )

        drawTPSBar(
            ctx,
            x + 9,
            y + 57,
            width - 18,
            8
        )
    end

    drawStat(
        ctx,
        "MIN",
        getMinimumFPS(),
        x + 10,
        y + 70,
        "#FF8800"
    )

    drawStat(
        ctx,
        "AVG",
        getAverageFPS(),
        x + 69,
        y + 70,
        "#55DD55"
    )

    drawStat(
        ctx,
        "MAX",
        getMaximumFPS(),
        x + 130,
        y + 70,
        "#3399FF"
    )

    if getSetting("fpsHistory", true) then
        drawHistoryGraph(
            ctx,
            x + 9,
            y + 94,
            width - 18,
            12
        )
    end
end)

--------------------------------------------------
-- FRAME EVENT
--------------------------------------------------

on("frame", function(dt)
    if not isEnabled() or not inWorld() then
        return
    end

    currentFPS = getFPS()

    local tps = getTPS()

    if tps ~= nil then
        currentTPS = math.max(
            0,
            math.min(hudConfig.maxTPS, safeNumber(tps, 0))
        )
    end

    local delta = math.max(
        0,
        math.min(safeNumber(dt, 0.05), 0.25)
    )

    local smoothing = math.min(1, delta * 10)

    displayedFPS =
        displayedFPS +
        (currentFPS - displayedFPS) * smoothing

    if currentTPS ~= nil then
        displayedTPS =
            displayedTPS +
            (currentTPS - displayedTPS) * smoothing
    end
end)

--------------------------------------------------
-- TICK EVENT
--------------------------------------------------

on("tick", function()
    if not isEnabled() or not inWorld() then
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

        if getSetting("adaptiveRenderDistance", false) then
            updateAdaptiveRenderDistance()
        end
    end
end)

--------------------------------------------------
-- COMMAND HELP
--------------------------------------------------

local function normalize(value)
    if value == nil then
        return ""
    end

    return tostring(value)
        :lower()
        :match("^%s*(.-)%s*$")
end

local function showHelp()
    printMessage("===== LITHIUM COMMANDS =====")
    printMessage("/lithium_status help")
    printMessage("/lithium_status version")
    printMessage("/lithium_status performance")
    printMessage("/lithium_status log")
    printMessage("/lithium_status clear")
    printMessage("/lithium_status refresh")
    printMessage("/lithium_status optimize low|balanced|high|custom")
    printMessage("/lithium_status optimize reset")
    printMessage("/lithium_status auto on|off")
    printMessage("/lithium_status hud compact|expanded")
    printMessage("/lithium_status hud on|off")
    printMessage("============================")
end

--------------------------------------------------
-- COMMAND DISPATCHER
--------------------------------------------------

commands.register(
    "lithium_status",
    function(args)
        args = args or {}

        local category = normalize(args[1])
        local action = normalize(args[2])

        if category == "" or category == "help" then
            showHelp()
            return
        end

        if category == "version" then
            printMessage("Version " .. MOD_VERSION)
            return
        end

        if category == "performance" then
            showPerformanceStatus()
            return
        end

        if category == "log" then
            exportPerformanceLog()
            return
        end

        if category == "clear" then
            clearPerformanceLog()
            return
        end

        if category == "refresh" then
            refreshFPS()
            return
        end

        if category == "auto" then
            if action == "on" then
                autoOptimize = true
                printMessage("Automatic optimization enabled.")

            elseif action == "off" then
                autoOptimize = false
                printMessage("Automatic optimization disabled.")

            else
                printMessage("Usage: /lithium_status auto on|off")
            end

            return
        end

        if category == "optimize" then
            if action == "reset" then
                resetOptimizations()
            else
                applyPreset(action)
            end

            return
        end

        if category == "hud" then
            if action == "compact" then
                hudConfig.compact = true
                printMessage("Compact HUD enabled.")

            elseif action == "expanded" then
                hudConfig.compact = false
                printMessage("Expanded HUD enabled.")

            elseif action == "on" then
                settings.set("lithium_fpsHud", true)
                settings.set("lithium_tpsHud", true)
                printMessage("HUD enabled.")

            elseif action == "off" then
                settings.set("lithium_fpsHud", false)
                settings.set("lithium_tpsHud", false)
                printMessage("HUD disabled.")

            else
                printMessage("Usage: /lithium_status hud compact|expanded|on|off")
            end

            return
        end

        printMessage("Unknown command: " .. category)
        printMessage("Use /lithium_status help")
    end,
    "Lithium performance commands"
)

--------------------------------------------------
-- SETTINGS CHANGES
--------------------------------------------------

settings.onChange(function(key, value)
    if key == "lithium_renderDistance" then
        adaptiveDistance = safeNumber(value, 12)
    end

    if key == "lithium_enabled" then
        printMessage(
            value and "Enabled." or "Disabled."
        )
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

    getTPS = function()
        return currentTPS
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

adaptiveDistance = safeNumber(
    getSetting("renderDistance", 12),
    12
)

if inWorld() then
    currentFPS = getFPS()
    displayedFPS = currentFPS
    currentTPS = getTPS()
end

lastSampleTime = os.clock()

printMessage("v" .. MOD_VERSION .. " loaded.")
printMessage("TPS bar: left side.")
printMessage("Command: /lithium_status")
printMessage("Type /lithium_status help")
