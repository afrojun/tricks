/*
 * The table: rays turning slowly around the trick, halftone dots growing toward the edges,
 * drawn by a small shader at a modest resolution. The colours come from the theme's tokens, and
 * change with the mood the moment layer sets on the document: a call floods the rays and spins
 * them, a challenge floods them red, a won game floods them with the winner's colour (the
 * `--mood-colour` the layer sets with it). Without WebGL the still rays in `--bg-image` show instead.
 */

const VERTEX = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
const FRAGMENT = `precision mediump float;
uniform vec2 r,o;uniform float t,k;uniform vec3 a,b,c;
void main(){
  vec2 p=gl_FragCoord.xy-o;float len=length(p);
  float w=fract(atan(p.y,p.x)/6.2831853*12.+t);
  float tri=abs(w-.5)*2.;float e=12./(6.2831853*max(len,1.))*2.4;
  vec3 col=mix(a,b,smoothstep(.5-e,.5+e,tri));
  float d=len/length(r);vec2 g=mat2(.7071,-.7071,.7071,.7071)*gl_FragCoord.xy/(7.*k);
  float rad=clamp((d-.32)*1.1,0.,.42);float dotv=1.-smoothstep(rad-.07,rad+.07,length(fract(g)-.5));
  gl_FragColor=vec4(mix(col,c,dotv*.75*step(.01,rad)),1.);
}`

/** How fast the rays turn, in ray pairs per second: barely, until a call. */
const CALM_SPEED = 0.03
const MOOD_SPEED = 0.55
const FRAME_MS = 33
const MAX_SCALE = 1.5

type Rgb = [number, number, number]
type Mood = 'call' | 'danger' | 'win'
const MOODS: readonly string[] = ['call', 'danger', 'win']

function rgb(css: string): Rgb {
  const hex = css.trim()
  const n = parseInt(hex.slice(1), 16)
  if (hex.length === 7 && !Number.isNaN(n)) return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  const m = hex.match(/[\d.]+/g)
  return m && m.length >= 3 ? [+m[0] / 255, +m[1] / 255, +m[2] / 255] : [0, 0, 0]
}

/** `c` moved toward white (`by` > 0) or black (`by` < 0) by that fraction of the way. */
function shade(c: Rgb, by: number): Rgb {
  return c.map((v) => (by > 0 ? v + (1 - v) * by : v + v * by)) as Rgb
}

/** The three felt colours for a mood, from the document's tokens; a win's from the winner's colour. */
function palette(mood: Mood | null): Rgb[] {
  const style = getComputedStyle(document.documentElement)
  if (mood === 'win') {
    const win = rgb(style.getPropertyValue('--mood-colour') || style.getPropertyValue('--yellow'))
    return [win, shade(win, 0.12), shade(win, -0.38)]
  }
  const prefix = mood ? `--felt-${mood}-` : '--felt-'
  return ['a', 'b', 'c'].map((k) => rgb(style.getPropertyValue(`${prefix}${k}`)))
}

/** What the felt is showing for: the mood, the win's colour and the theme, as one string. */
function key(): string {
  const root = document.documentElement
  return `${root.dataset.mood ?? ''}/${root.style.getPropertyValue('--mood-colour')}/${root.dataset.theme ?? ''}`
}

/**
 * Where the rays meet. A table keeps its trick in one place all game, empty under any panel, so
 * the rays turn behind it and never move; while a result covers it they stay where they were.
 * Pages without a table have them under the title.
 */
function origin(canvas: HTMLCanvasElement, remembered: { table: [number, number] | null }): [number, number] {
  const trick = document.querySelector('.trick-area')
  if (trick) {
    const a = trick.getBoundingClientRect()
    remembered.table = [(a.left + a.width / 2) / canvas.clientWidth, (a.top + a.height / 2) / canvas.clientHeight]
    return remembered.table
  }
  if (document.querySelector('[data-felt-table]')) return remembered.table ?? [0.5, 0.44]
  remembered.table = null
  return [0.5, 0.22]
}

/** Starts drawing the felt on `canvas`; returns a stop function. Does nothing where WebGL is missing. */
export function startFelt(canvas: HTMLCanvasElement): () => void {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
  if (!gl) return () => {}
  const program = gl.createProgram()
  for (const [type, src] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const shader = gl.createShader(type)
    if (!shader) return () => {}
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    gl.attachShader(program, shader)
  }
  gl.bindAttribLocation(program, 0, 'p')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return () => {}
  gl.useProgram(program)
  const u = Object.fromEntries(['r', 'o', 't', 'k', 'a', 'b', 'c'].map((n) => [n, gl.getUniformLocation(program, n)]))
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  let colours = palette(null)
  let target = colours
  let mood: Mood | null = null
  let shown = key()
  let phase = 0
  let last = 0
  let frame = 0
  let looked = 0
  let lastOrigin: [number, number] = [0, 0]
  /** The table's trick centre, kept while a result covers it. */
  const remembered: { table: [number, number] | null } = { table: null }

  const draw = (now: number) => {
    frame = requestAnimationFrame(draw)
    if (document.hidden || now - last < FRAME_MS) return
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = now
    // The mood is whatever the moment layer last set; the theme is whatever the picker last set.
    const next = key()
    if (next !== shown) {
      shown = next
      const nextMood = document.documentElement.dataset.mood ?? ''
      mood = MOODS.includes(nextMood) ? (nextMood as Mood) : null
      target = palette(mood)
    }
    const settling = colours.some((c, i) => c.some((v, j) => Math.abs(target[i][j] - v) > 0.002))
    colours = settling ? colours.map((c, i) => c.map((v, j) => v + (target[i][j] - v) * 0.14) as Rgb) : target
    if (!reduce.matches) phase += dt * (CALM_SPEED + (mood ? MOOD_SPEED : 0))

    const k = Math.min(devicePixelRatio || 1, MAX_SCALE)
    const w = Math.round(canvas.clientWidth * k)
    const h = Math.round(canvas.clientHeight * k)
    const resized = canvas.width !== w || canvas.height !== h
    // Under reduced motion the rays stand still, so nothing is drawn unless something changed;
    // the trick's place on screen is looked at only now and then.
    if (reduce.matches && !settling && !resized && now - looked < 500) return
    looked = now
    const [ox, oy] = origin(canvas, remembered)
    if (reduce.matches && !settling && !resized && ox === lastOrigin[0] && oy === lastOrigin[1]) return
    lastOrigin = [ox, oy]
    if (resized) {
      canvas.width = w
      canvas.height = h
    }
    gl.viewport(0, 0, w, h)
    gl.uniform2f(u.r, w, h)
    gl.uniform2f(u.o, ox * w, (1 - oy) * h)
    gl.uniform1f(u.t, phase)
    gl.uniform1f(u.k, k)
    gl.uniform3f(u.a, ...colours[0])
    gl.uniform3f(u.b, ...colours[1])
    gl.uniform3f(u.c, ...colours[2])
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }
  frame = requestAnimationFrame(draw)
  return () => cancelAnimationFrame(frame)
}
