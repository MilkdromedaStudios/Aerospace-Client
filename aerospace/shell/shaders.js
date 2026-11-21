/*
 * Aerospace Client — shader engine.
 *
 * Eaglercraft 26.x puts every finished frame on screen with one tiny "present"
 * pass: a fullscreen triangle whose fragment shader just copies the frame
 * texture (`fragColor = texture(u_tex, v_uv)`). This file swaps that one shader
 * for the Aerospace post-processing shader when the game compiles it, so looks
 * (colour grading, glow, vignette, grain, CRT…) and motion blur run on the GPU
 * as part of the game's own last draw. No game code is changed.
 *
 * Safety rules:
 *   - Only the exact stock present shader is replaced; any other source passes
 *     through untouched.
 *   - The replacement is test-compiled and test-linked against the stock
 *     present vertex shader first; if either fails, the stock shader is used.
 *   - With no settings applied every uniform is zero, which makes the shader an
 *     exact passthrough.
 *   - The one texture unit borrowed for motion blur is restored after the draw.
 */
(function () {
	"use strict";
	if (window.__aerospaceShaders) return;

	var listeners = [];
	var api = {
		active: false,        // true once the game's present pass runs our shader
		disabled: false,      // set before the game boots to keep the stock shader
		failed: null,         // why the engine is not active, if it gave up
		frames: 0,            // presents seen by the engine
		setParams: setParams,
		capture: capture,
		onChange: function (cb) { listeners.push(cb); }
	};
	window.__aerospaceShaders = api;

	var GL2 = window.WebGL2RenderingContext;
	if (!GL2 || !GL2.prototype) { api.failed = "WebGL2 is not available"; return; }

	// Byte-for-byte copies of the stock present shaders (WebGL2CommandEncoder).
	var PRESENT_VS = "#version 300 es\nprecision highp float;\nout vec2 v_uv;\nvoid main() {\n"
		+ "  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));\n"
		+ "  v_uv = p;\n  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\n}\n";
	var PRESENT_FS = "#version 300 es\nprecision highp float;\nuniform sampler2D u_tex;\nin vec2 v_uv;\n"
		+ "out vec4 fragColor;\nvoid main() {\n  fragColor = texture(u_tex, v_uv);\n}\n";

	var AERO_FS = [
		"#version 300 es",
		"precision highp float;",
		"uniform sampler2D u_tex;",
		"uniform sampler2D u_aeroHist;",
		"uniform int u_aeroOn;",
		"uniform vec4 u_aeroGrade;  // brightness curve, saturation, contrast, warmth",
		"uniform vec4 u_aeroFx;     // bloom, vignette, grain, sharpen",
		"uniform vec4 u_aeroFx2;    // motion blur, colour fringe, scanlines, letterbox",
		"uniform vec4 u_aeroTone;   // filmic curve, split-tone amount, visor filter, time",
		"uniform vec3 u_aeroShadow; // split-tone shadow tint (0.5 = neutral)",
		"uniform vec3 u_aeroHigh;   // split-tone highlight tint (0.5 = neutral)",
		"uniform vec3 u_aeroView;   // width, height, history valid",
		"in vec2 v_uv;",
		"out vec4 fragColor;",
		"const vec2 RING_A[8] = vec2[8](vec2(1.0, 0.0), vec2(0.7071, 0.7071), vec2(0.0, 1.0), vec2(-0.7071, 0.7071),",
		"  vec2(-1.0, 0.0), vec2(-0.7071, -0.7071), vec2(0.0, -1.0), vec2(0.7071, -0.7071));",
		"const vec2 RING_B[8] = vec2[8](vec2(0.9239, 0.3827), vec2(0.3827, 0.9239), vec2(-0.3827, 0.9239), vec2(-0.9239, 0.3827),",
		"  vec2(-0.9239, -0.3827), vec2(-0.3827, -0.9239), vec2(0.3827, -0.9239), vec2(0.9239, -0.3827));",
		"float aeroLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }",
		"float aeroHash(vec2 p) {",
		"  vec3 p3 = fract(vec3(p.xyx) * 0.1031);",
		"  p3 += dot(p3, p3.yzx + 33.33);",
		"  return fract((p3.x + p3.y) * p3.z);",
		"}",
		"vec3 aeroThermal(float t) {",
		"  vec3 c = mix(vec3(0.02, 0.0, 0.12), vec3(0.45, 0.0, 0.6), smoothstep(0.0, 0.25, t));",
		"  c = mix(c, vec3(0.95, 0.1, 0.15), smoothstep(0.25, 0.5, t));",
		"  c = mix(c, vec3(1.0, 0.75, 0.0), smoothstep(0.5, 0.8, t));",
		"  return mix(c, vec3(1.0), smoothstep(0.8, 1.0, t));",
		"}",
		"void main() {",
		"  vec4 base = texture(u_tex, v_uv);",
		"  if (u_aeroOn == 0) { fragColor = base; return; }",
		"  vec2 px = 1.0 / max(u_aeroView.xy, vec2(1.0));",
		"  vec3 col = base.rgb;",
		"  float fringe = u_aeroFx2.y;",
		"  if (fringe > 0.0) {",
		"    vec2 off = (v_uv - 0.5) * fringe * 0.01;",
		"    col.r = texture(u_tex, v_uv + off).r;",
		"    col.b = texture(u_tex, v_uv - off).b;",
		"  }",
		"  float sharpen = u_aeroFx.w;",
		"  if (sharpen > 0.0) {",
		"    vec3 n = texture(u_tex, v_uv + vec2(0.0, px.y)).rgb + texture(u_tex, v_uv - vec2(0.0, px.y)).rgb",
		"      + texture(u_tex, v_uv + vec2(px.x, 0.0)).rgb + texture(u_tex, v_uv - vec2(px.x, 0.0)).rgb;",
		"    col = clamp(col + (col - n * 0.25) * sharpen, 0.0, 1.0);",
		"  }",
		"  float bloom = u_aeroFx.x;",
		"  if (bloom > 0.0) {",
		"    vec3 acc = vec3(0.0);",
		"    vec2 r = px * max(u_aeroView.y * 0.0045, 1.5);",
		"    for (int i = 0; i < 8; i++) {",
		"      acc += max(texture(u_tex, v_uv + RING_A[i] * r).rgb - 0.55, 0.0);",
		"      acc += max(texture(u_tex, v_uv + RING_B[i] * r * 2.6).rgb - 0.55, 0.0) * 0.6;",
		"    }",
		"    col += acc * (bloom * 0.9 / 5.76);",
		"  }",
		"  float k = u_aeroGrade.x;",
		"  if (k != 1.0) col = 1.0 - pow(clamp(1.0 - col, 0.0, 1.0), vec3(k));",
		"  float w = u_aeroGrade.w;",
		"  col *= vec3(1.0 + 0.10 * w, 1.0 + 0.02 * w, 1.0 - 0.10 * w);",
		"  col = (col - 0.5) * u_aeroGrade.z + 0.5;",
		"  col = mix(vec3(aeroLuma(col)), col, u_aeroGrade.y);",
		"  if (u_aeroTone.x > 0.0) {",
		"    vec3 c = clamp(col, 0.0, 1.0);",
		"    col = mix(col, c * c * (3.0 - 2.0 * c), u_aeroTone.x);",
		"  }",
		"  if (u_aeroTone.y > 0.0) {",
		"    float t = smoothstep(0.15, 0.85, aeroLuma(clamp(col, 0.0, 1.0)));",
		"    col = mix(col, col * (0.6 + 0.8 * mix(u_aeroShadow, u_aeroHigh, t)), u_aeroTone.y);",
		"  }",
		"  int f = int(u_aeroTone.z + 0.5);",
		"  if (f > 0) {",
		"    float y = aeroLuma(clamp(col, 0.0, 1.0));",
		"    if (f == 1) col = vec3(0.12, 1.0, 0.3) * pow(y, 0.8) * 1.25;",
		"    else if (f == 2) col = mix(col, y * vec3(1.0, 0.76, 0.42) * 1.1, 0.65);",
		"    else if (f == 3) col = mix(col, vec3(col.r * 0.8, col.g * 0.95, col.b * 1.2 + 0.03), 0.9);",
		"    else if (f == 4) col = aeroThermal(clamp(y, 0.0, 1.0));",
		"    else if (f == 5) col = vec3(y) * vec3(0.92, 0.97, 1.05);",
		"  }",
		"  float scan = u_aeroFx2.z;",
		"  if (scan > 0.0) {",
		"    col *= 1.0 - scan * 0.35 * mod(floor(gl_FragCoord.y), 2.0);",
		"    float m = mod(floor(gl_FragCoord.x), 3.0);",
		"    vec3 mask = m < 0.5 ? vec3(1.0, 0.85, 0.85) : (m < 1.5 ? vec3(0.85, 1.0, 0.85) : vec3(0.85, 0.85, 1.0));",
		"    col *= mix(vec3(1.0), mask, scan * 0.6) * (1.0 + scan * 0.2);",
		"  }",
		"  float vig = u_aeroFx.y;",
		"  if (vig > 0.0) {",
		"    vec2 q = v_uv - 0.5;",
		"    q.x *= u_aeroView.x / max(u_aeroView.y, 1.0);",
		"    col *= mix(1.0, 1.0 - smoothstep(0.35, 1.05, length(q)), vig);",
		"  }",
		"  float grain = u_aeroFx.z;",
		"  if (grain > 0.0) {",
		"    vec2 seed = vec2(fract(u_aeroTone.w * 7.13) * 419.0, fract(u_aeroTone.w * 3.71) * 233.0);",
		"    col += (aeroHash(gl_FragCoord.xy + seed) - 0.5) * grain * 0.09;",
		"  }",
		"  float bars = u_aeroFx2.w;",
		"  if (bars > 0.0 && (v_uv.y < bars || v_uv.y > 1.0 - bars)) col = vec3(0.0);",
		"  col = clamp(col, 0.0, 1.0);",
		"  float blur = u_aeroFx2.x * u_aeroView.z;",
		"  if (blur > 0.0) col = mix(col, texture(u_aeroHist, v_uv).rgb, blur);",
		"  fragColor = vec4(col, base.a);",
		"}",
		""
	].join("\n");

	var HIST_UNIT = 15;   // WebGL2 guarantees at least 16 fragment texture units

	// ------------------------------------------------------------- parameters
	var P = {
		on: 0, curve: 1, saturation: 1, contrast: 1, warmth: 0,
		bloom: 0, vignette: 0, grain: 0, sharpen: 0,
		motionBlur: 0, fringe: 0, scanlines: 0, letterbox: 0,
		filmic: 0, split: 0, filter: 0,
		shadow: [0.5, 0.5, 0.5], high: [0.5, 0.5, 0.5]
	};
	function setParams(p) {
		for (var k in p) if (k in P) P[k] = p[k];
	}

	// ------------------------------------------------------------------ state
	var proto = GL2.prototype;
	var orig = {
		shaderSource: proto.shaderSource,
		attachShader: proto.attachShader,
		linkProgram: proto.linkProgram,
		useProgram: proto.useProgram,
		drawArrays: proto.drawArrays
	};
	var replacedShaders = new WeakSet();
	var ourPrograms = new WeakSet();
	var verified = new WeakMap();
	var S = {
		gl: null, program: null, loc: null, current: null, dead: false, neutral: false,
		hist: null, histW: 0, histH: 0, histValid: 0, blank: null,
		saved: null, linear: false, captures: [], t0: performance.now()
	};

	function setActive(on, why) {
		if (api.active === on) return;
		api.active = on;
		if (!on && why) api.failed = why;
		for (var i = 0; i < listeners.length; ++i) { try { listeners[i](on); } catch (e) {} }
	}

	// Fall back to an exact passthrough for the rest of the session. The present
	// program keeps its uniforms, so they are reset (effects off, history sampler
	// back on unit 0 next to the frame texture) the next time it is current.
	function giveUp(err) {
		if (S.dead) return;
		S.dead = true;
		S.captures = [];
		setActive(false, "disabled after an error: " + (err && err.message || err));
		try { console.warn("[aerospace] shader engine disabled: " + (err && err.stack || err)); } catch (e) {}
		if (S.gl && S.current === S.program) neutralize(S.gl);
	}
	function neutralize(gl) {
		if (S.neutral || !S.loc) return;
		S.neutral = true;
		try {
			gl.uniform1i(S.loc.on, 0);
			gl.uniform1i(S.loc.hist, 0);
		} catch (e) {}
		try {
			if (S.saved) {
				var prevActive = gl.getParameter(gl.ACTIVE_TEXTURE);
				gl.activeTexture(gl.TEXTURE0 + HIST_UNIT);
				gl.bindTexture(gl.TEXTURE_2D, S.saved.tex);
				if (S.saved.sampler) gl.bindSampler(HIST_UNIT, S.saved.sampler);
				gl.activeTexture(prevActive);
				S.saved = null;
			}
		} catch (e) {}
	}

	// Compile + link the replacement once per context before letting the game use it.
	function verify(gl) {
		if (verified.has(gl)) return verified.get(gl);
		var ok = false;
		try {
			var vs = gl.createShader(gl.VERTEX_SHADER), fs = gl.createShader(gl.FRAGMENT_SHADER);
			orig.shaderSource.call(gl, vs, PRESENT_VS);
			gl.compileShader(vs);
			orig.shaderSource.call(gl, fs, AERO_FS);
			gl.compileShader(fs);
			if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
				api.failed = "test vertex shader did not compile";
			} else if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
				api.failed = "shader did not compile: " + gl.getShaderInfoLog(fs);
			} else {
				var p = gl.createProgram();
				orig.attachShader.call(gl, p, vs);
				orig.attachShader.call(gl, p, fs);
				orig.linkProgram.call(gl, p);
				ok = !!gl.getProgramParameter(p, gl.LINK_STATUS);
				if (!ok) api.failed = "shader did not link: " + gl.getProgramInfoLog(p);
				gl.deleteProgram(p);
			}
			gl.deleteShader(vs);
			gl.deleteShader(fs);
		} catch (e) {
			ok = false;
			api.failed = "shader test threw: " + e;
		}
		verified.set(gl, ok);
		return ok;
	}

	// ------------------------------------------------------------------ hooks
	proto.shaderSource = function (shader, source) {
		if (source === PRESENT_FS && !api.disabled) {
			try {
				if (verify(this)) {
					replacedShaders.add(shader);
					return orig.shaderSource.call(this, shader, AERO_FS);
				}
			} catch (e) {}
		}
		return orig.shaderSource.call(this, shader, source);
	};

	proto.attachShader = function (program, shader) {
		try { if (shader && replacedShaders.has(shader)) ourPrograms.add(program); } catch (e) {}
		return orig.attachShader.call(this, program, shader);
	};

	proto.linkProgram = function (program) {
		var r = orig.linkProgram.call(this, program);
		try {
			if (program && ourPrograms.has(program) && this.getProgramParameter(program, this.LINK_STATUS)) {
				var gl = this, L = function (n) { return gl.getUniformLocation(program, n); };
				S.gl = gl;
				S.program = program;
				S.loc = {
					hist: L("u_aeroHist"), on: L("u_aeroOn"), grade: L("u_aeroGrade"), fx: L("u_aeroFx"),
					fx2: L("u_aeroFx2"), tone: L("u_aeroTone"), shadow: L("u_aeroShadow"),
					high: L("u_aeroHigh"), view: L("u_aeroView")
				};
				S.histUnitSet = false;
				setActive(true);
			}
		} catch (e) { giveUp(e); }
		return r;
	};

	proto.useProgram = function (program) {
		var r = orig.useProgram.call(this, program);
		if (this === S.gl) {
			S.current = program;
			if (program !== null && program === S.program && S.loc) {
				if (S.dead) neutralize(this);
				else { try { beforePresent(this); } catch (e) { giveUp(e); } }
			}
		}
		return r;
	};

	proto.drawArrays = function (mode, first, count) {
		if (this !== S.gl || S.current === null || S.current !== S.program || !S.loc || S.dead) {
			return orig.drawArrays.call(this, mode, first, count);
		}
		var gl = this;
		try {
			// Glow and colour fringe sample between pixels; the frame texture is set
			// to NEAREST by the game right before this draw, so switch it to LINEAR
			// for our draw only and put it back afterwards.
			S.linear = P.on && (P.bloom > 0 || P.fringe > 0) && gl.getParameter(gl.ACTIVE_TEXTURE) === gl.TEXTURE0;
			if (S.linear) {
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			}
		} catch (e) { S.linear = false; }
		var r = orig.drawArrays.call(this, mode, first, count);
		try { afterPresent(gl); } catch (e) { giveUp(e); }
		return r;
	};

	// ------------------------------------------------------------- per frame
	function ensureTextures(gl) {
		if (!S.blank) {
			S.blank = gl.createTexture();
			withUnit(gl, function () {
				gl.bindTexture(gl.TEXTURE_2D, S.blank);
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			});
		}
		if (!S.hist) {
			S.hist = gl.createTexture();
			S.histW = S.histH = 0;
		}
	}

	// Run fn with HIST_UNIT active, restoring that unit's texture/sampler and the
	// previously active unit afterwards unless keep is set.
	function withUnit(gl, fn) {
		var prevActive = gl.getParameter(gl.ACTIVE_TEXTURE);
		gl.activeTexture(gl.TEXTURE0 + HIST_UNIT);
		var prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
		var prevSampler = gl.getParameter(gl.SAMPLER_BINDING);
		try { fn(); } finally {
			gl.bindTexture(gl.TEXTURE_2D, prevTex);
			if (prevSampler) gl.bindSampler(HIST_UNIT, prevSampler);
			gl.activeTexture(prevActive);
		}
	}

	function beforePresent(gl) {
		var L = S.loc, w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
		ensureTextures(gl);
		if (!S.histUnitSet) { gl.uniform1i(L.hist, HIST_UNIT); S.histUnitSet = true; }
		var blur = P.on ? P.motionBlur : 0;
		var histOk = blur > 0 && S.histValid && S.histW === w && S.histH === h ? 1 : 0;
		gl.uniform1i(L.on, P.on ? 1 : 0);
		gl.uniform4f(L.grade, P.curve, P.saturation, P.contrast, P.warmth);
		gl.uniform4f(L.fx, P.bloom, P.vignette, P.grain, P.sharpen);
		gl.uniform4f(L.fx2, blur, P.fringe, P.scanlines, P.letterbox);
		gl.uniform4f(L.tone, P.filmic, P.split, P.filter, ((performance.now() - S.t0) / 1000) % 1000);
		gl.uniform3f(L.shadow, P.shadow[0], P.shadow[1], P.shadow[2]);
		gl.uniform3f(L.high, P.high[0], P.high[1], P.high[2]);
		gl.uniform3f(L.view, w, h, histOk);
		// Every active sampler needs a compatible texture on its unit, even when the
		// branch that reads it is skipped, so the unit always gets one of ours.
		// (If the last present never reached its draw, keep the binding saved then.)
		var prevActive = gl.getParameter(gl.ACTIVE_TEXTURE);
		gl.activeTexture(gl.TEXTURE0 + HIST_UNIT);
		if (!S.saved) S.saved = { tex: gl.getParameter(gl.TEXTURE_BINDING_2D), sampler: gl.getParameter(gl.SAMPLER_BINDING) };
		gl.bindTexture(gl.TEXTURE_2D, histOk ? S.hist : S.blank);
		if (S.saved.sampler) gl.bindSampler(HIST_UNIT, null);
		gl.activeTexture(prevActive);
	}

	function afterPresent(gl) {
		api.frames++;
		var w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
		if (S.linear) {
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			S.linear = false;
		}
		var prevRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
		if (prevRead !== null) gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
		var prevActive = gl.getParameter(gl.ACTIVE_TEXTURE);
		gl.activeTexture(gl.TEXTURE0 + HIST_UNIT);
		if (P.on && P.motionBlur > 0) {
			gl.bindTexture(gl.TEXTURE_2D, S.hist);
			if (S.histW !== w || S.histH !== h) {
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, w, h, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				S.histW = w; S.histH = h;
			}
			gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, w, h);
			S.histValid = 1;
		} else {
			S.histValid = 0;
		}
		if (S.saved) {
			gl.bindTexture(gl.TEXTURE_2D, S.saved.tex);
			if (S.saved.sampler) gl.bindSampler(HIST_UNIT, S.saved.sampler);
			S.saved = null;
		}
		gl.activeTexture(prevActive);
		if (S.captures.length) {
			var pixels = new Uint8Array(w * h * 4);
			gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
			var waiting = S.captures;
			S.captures = [];
			for (var i = 0; i < waiting.length; ++i) waiting[i]({ width: w, height: h, pixels: pixels });
		}
		if (prevRead !== null) gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevRead);
	}

	// Resolves with a PNG of the next presented frame (bottom-up rows flipped).
	function capture() {
		return new Promise(function (resolve, reject) {
			if (!api.active) { reject(new Error("the shader engine is not active")); return; }
			var timer = setTimeout(function () { reject(new Error("no frame was presented")); }, 3000);
			S.captures.push(function (shot) {
				clearTimeout(timer);
				try {
					var c = document.createElement("canvas");
					c.width = shot.width;
					c.height = shot.height;
					var ctx = c.getContext("2d");
					var img = ctx.createImageData(shot.width, shot.height);
					var row = shot.width * 4;
					for (var y = 0; y < shot.height; ++y) {
						var src = (shot.height - 1 - y) * row;
						img.data.set(shot.pixels.subarray(src, src + row), y * row);
					}
					for (var a = 3; a < img.data.length; a += 4) img.data[a] = 255;
					ctx.putImageData(img, 0, 0);
					c.toBlob(function (blob) { blob ? resolve(blob) : reject(new Error("PNG encoding failed")); }, "image/png");
				} catch (e) { reject(e); }
			});
		});
	}
})();
