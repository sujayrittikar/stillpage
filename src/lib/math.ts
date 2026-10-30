import katex from 'katex'
import katexCss from 'katex/dist/katex.min.css?inline'
import '../styles/math.css'

/** Marks a slot to fill in a template. Tab moves to the next one. */
export const SLOT = '•'

export interface TexRender {
  html: string
  error: string | null
}

const OPTIONS = { throwOnError: true, strict: false, trust: false, output: 'htmlAndMathml' } as const

export function renderTex(latex: string, displayMode: boolean): TexRender {
  try {
    return { html: katex.renderToString(latex, { ...OPTIONS, displayMode }), error: null }
  } catch (err) {
    const message = err instanceof katex.ParseError ? err.rawMessage : String((err as Error)?.message ?? err)
    return { html: '', error: message }
  }
}

/** Renders without failing: a broken formula shows its source. */
export function renderTexSafe(latex: string, displayMode: boolean): string {
  const r = renderTex(latex, displayMode)
  return r.error === null ? r.html : `<code class="math-error" title="${escapeAttr(r.error)}">${escapeAttr(latex)}</code>`
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ---- Inline math in Markdown ------------------------------------------------
// Pandoc's rule, so prices stay prices: "$5 and $10" is text, "$x^2$" is
// math. The opening $ is followed by a non-space, the closing $ follows a
// non-space and is not followed by a digit.
export const INLINE_MATH = /^\$(?=[^\s$])((?:\\.|[^$\\\n])*?[^\s\\$])\$(?!\d)|^\$([^\s$\\])\$(?!\d)/
export const BLOCK_MATH = /^\$\$\s*([\s\S]+?)\s*\$\$/

// ---- Exporting -----------------------------------------------------------------

let exportCss: Promise<string> | null = null

/** KaTeX's stylesheet with its fonts inlined, for pages printed to PDF where
 *  the app's own font files can't be reached. */
export function mathExportCss(): Promise<string> {
  exportCss ??= (async () => {
    const urls = [...new Set([...katexCss.matchAll(/url\(([^)]+\.woff2)\)/g)].map((m) => m[1].replace(/^["']|["']$/g, '')))]
    const inlined = new Map<string, string>()
    await Promise.all(
      urls.map(async (url) => {
        try {
          const bytes = new Uint8Array(await (await fetch(new URL(url, document.baseURI))).arrayBuffer())
          let binary = ''
          for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
          inlined.set(url, `data:font/woff2;base64,${btoa(binary)}`)
        } catch {
          /* that face falls back to a system font */
        }
      }),
    )
    // Keep only the woff2 source of each face; the others would be dead links.
    return katexCss.replace(/src:\s*url\(([^)]+\.woff2)\)\s*format\(["']?woff2["']?\)[^;}]*/g, (all, url: string) => {
      const clean = url.replace(/^["']|["']$/g, '')
      return inlined.has(clean) ? `src:url(${inlined.get(clean)}) format("woff2")` : all
    })
  })()
  return exportCss
}

// ---- The palette and autocomplete -------------------------------------------

export interface MathSymbol {
  /** What goes into the formula. SLOT marks the places to fill in. */
  tex: string
  /** Shown on the key; defaults to the rendered tex. */
  label?: string
  /** Words to find it by, besides its command name. */
  hint?: string
}

export interface PaletteGroup {
  name: string
  symbols: MathSymbol[]
}

const s = (tex: string, hint?: string, label?: string): MathSymbol => ({ tex, hint, label })
const each = (list: string) => list.split(' ').map((tex) => s(tex))

export const PALETTE: PaletteGroup[] = [
  {
    name: 'Structures',
    symbols: [
      s(`\\frac{${SLOT}}{${SLOT}}`, 'fraction divide'),
      s(`${SLOT}^{${SLOT}}`, 'superscript power exponent', 'x^{n}'),
      s(`${SLOT}_{${SLOT}}`, 'subscript index', 'x_{i}'),
      s(`\\sqrt{${SLOT}}`, 'square root'),
      s(`\\sqrt[${SLOT}]{${SLOT}}`, 'nth root', '\\sqrt[n]{x}'),
      s(`\\sum_{${SLOT}}^{${SLOT}}`, 'sum sigma', '\\sum_{i=1}^{n}'),
      s(`\\prod_{${SLOT}}^{${SLOT}}`, 'product', '\\prod_{i=1}^{n}'),
      s(`\\int_{${SLOT}}^{${SLOT}} ${SLOT}\\,d${SLOT}`, 'integral', '\\int_a^b f\\,dx'),
      s(`\\iint_{${SLOT}} ${SLOT}\\,dA`, 'double integral', '\\iint'),
      s(`\\oint_{${SLOT}} ${SLOT}`, 'contour integral', '\\oint'),
      s(`\\lim_{${SLOT} \\to ${SLOT}}`, 'limit', '\\lim_{x\\to a}'),
      s(`\\frac{d${SLOT}}{d${SLOT}}`, 'derivative', '\\frac{dy}{dx}'),
      s(`\\frac{\\partial ${SLOT}}{\\partial ${SLOT}}`, 'partial derivative', '\\frac{\\partial f}{\\partial x}'),
      s(`\\binom{${SLOT}}{${SLOT}}`, 'binomial choose', '\\binom{n}{k}'),
      s(`\\left( ${SLOT} \\right)`, 'parentheses brackets', '\\left(x\\right)'),
      s(`\\left[ ${SLOT} \\right]`, 'square brackets', '\\left[x\\right]'),
      s(`\\left\\{ ${SLOT} \\right\\}`, 'braces set', '\\left\\{x\\right\\}'),
      s(`\\left| ${SLOT} \\right|`, 'absolute value', '\\left|x\\right|'),
      s(`\\left\\lVert ${SLOT} \\right\\rVert`, 'norm', '\\lVert x\\rVert'),
      s(`\\lfloor ${SLOT} \\rfloor`, 'floor', '\\lfloor x\\rfloor'),
      s(`\\lceil ${SLOT} \\rceil`, 'ceiling', '\\lceil x\\rceil'),
      s(`\\begin{pmatrix} ${SLOT} & ${SLOT} \\\\ ${SLOT} & ${SLOT} \\end{pmatrix}`, 'matrix pmatrix', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}'),
      s(`\\begin{bmatrix} ${SLOT} & ${SLOT} \\\\ ${SLOT} & ${SLOT} \\end{bmatrix}`, 'matrix bmatrix square', '\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}'),
      s(`\\begin{vmatrix} ${SLOT} & ${SLOT} \\\\ ${SLOT} & ${SLOT} \\end{vmatrix}`, 'determinant vmatrix', '\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}'),
      s(`\\begin{cases} ${SLOT} & \\text{if } ${SLOT} \\\\ ${SLOT} & \\text{otherwise} \\end{cases}`, 'cases piecewise', '\\begin{cases}a\\\\b\\end{cases}'),
      s(`\\begin{aligned} ${SLOT} &= ${SLOT} \\\\ &= ${SLOT} \\end{aligned}`, 'aligned align equations', '\\begin{aligned}a&=b\\\\&=c\\end{aligned}'),
      s(`\\vec{${SLOT}}`, 'vector arrow'),
      s(`\\hat{${SLOT}}`, 'hat unit'),
      s(`\\bar{${SLOT}}`, 'bar mean'),
      s(`\\dot{${SLOT}}`, 'dot time derivative'),
      s(`\\ddot{${SLOT}}`, 'double dot'),
      s(`\\tilde{${SLOT}}`, 'tilde'),
      s(`\\overline{${SLOT}}`, 'overline conjugate'),
      s(`\\underbrace{${SLOT}}_{${SLOT}}`, 'underbrace', '\\underbrace{abc}_{n}'),
      s(`\\overset{${SLOT}}{${SLOT}}`, 'overset stack', '\\overset{!}{=}'),
      s(`\\text{${SLOT}}`, 'text words', '\\text{abc}'),
      s(`\\mathbf{${SLOT}}`, 'bold', '\\mathbf{x}'),
      s(`\\mathcal{${SLOT}}`, 'calligraphic script', '\\mathcal{L}'),
      s(`\\mathbb{${SLOT}}`, 'blackboard double struck', '\\mathbb{R}'),
      s(`\\operatorname{${SLOT}}`, 'operator name', '\\operatorname{rank}'),
    ],
  },
  {
    name: 'Greek',
    symbols: each(
      '\\alpha \\beta \\gamma \\delta \\epsilon \\varepsilon \\zeta \\eta \\theta \\vartheta \\iota \\kappa \\lambda \\mu \\nu \\xi \\pi \\rho \\sigma \\tau \\upsilon \\phi \\varphi \\chi \\psi \\omega \\Gamma \\Delta \\Theta \\Lambda \\Xi \\Pi \\Sigma \\Upsilon \\Phi \\Psi \\Omega',
    ),
  },
  {
    name: 'Operators',
    symbols: [
      ...each('\\times \\div \\cdot \\pm \\mp \\circ \\ast \\star \\oplus \\otimes \\cap \\cup \\setminus \\wedge \\vee \\neg \\nabla \\partial \\infty'),
      ...each('\\forall \\exists \\nexists \\emptyset \\mathbb{R} \\mathbb{N} \\mathbb{Z} \\mathbb{Q} \\mathbb{C} \\ldots \\cdots \\vdots \\ddots \\hbar \\ell \\angle \\degree'),
      ...each('\\sin \\cos \\tan \\log \\ln \\exp \\max \\min \\det \\arg'),
    ],
  },
  {
    name: 'Relations',
    symbols: each(
      '= \\neq \\approx \\equiv \\sim \\simeq \\cong \\propto < > \\leq \\geq \\ll \\gg \\in \\notin \\ni \\subset \\subseteq \\supset \\supseteq \\mid \\parallel \\perp \\vdash \\models',
    ),
  },
  {
    name: 'Arrows',
    symbols: each(
      '\\to \\leftarrow \\leftrightarrow \\Rightarrow \\Leftarrow \\Leftrightarrow \\mapsto \\longrightarrow \\implies \\iff \\uparrow \\downarrow \\updownarrow \\nearrow \\searrow \\hookrightarrow \\rightleftharpoons',
    ),
  },
]

/** Environments offered after \begin{. */
const ENVIRONMENTS = ['matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'cases', 'aligned', 'gathered', 'array', 'split']

const extra: MathSymbol[] = [
  ...each('\\left \\right \\quad \\qquad \\, \\; \\displaystyle \\limits'),
  ...each('\\sinh \\cosh \\tanh \\arcsin \\arccos \\arctan \\sec \\csc \\cot \\lg \\sup \\inf \\limsup \\liminf \\gcd \\Pr \\ker \\dim \\hom'),
  ...each('\\langle \\rangle \\lvert \\rvert \\prime \\dagger \\top \\bot \\aleph \\Re \\Im \\wp \\square \\checkmark \\therefore \\because'),
  ...each('\\leqslant \\geqslant \\prec \\succ \\preceq \\succeq \\asymp \\doteq \\triangleq \\coloneqq \\subsetneq \\supsetneq \\bigcup \\bigcap \\bigoplus \\bigotimes \\coprod'),
  ...each('\\Longrightarrow \\Longleftarrow \\Longleftrightarrow \\leftharpoonup \\rightharpoonup \\twoheadrightarrow \\xrightarrow{•}'),
  s(`\\mathrm{${SLOT}}`, 'roman upright'),
  s(`\\mathit{${SLOT}}`, 'italic'),
  s(`\\mathsf{${SLOT}}`, 'sans serif'),
  s(`\\mathfrak{${SLOT}}`, 'fraktur'),
  s(`\\boldsymbol{${SLOT}}`, 'bold symbol greek'),
  s(`\\underline{${SLOT}}`, 'underline'),
  s(`\\overbrace{${SLOT}}^{${SLOT}}`, 'overbrace'),
  s(`\\widehat{${SLOT}}`, 'wide hat'),
  s(`\\widetilde{${SLOT}}`, 'wide tilde'),
  s(`\\overrightarrow{${SLOT}}`, 'vector over arrow'),
  s(`\\cancel{${SLOT}}`, 'strike cancel'),
  s(`\\boxed{${SLOT}}`, 'box answer'),
  s(`\\color{${SLOT}}{${SLOT}}`, 'colour color'),
  s(`\\tag{${SLOT}}`, 'equation number tag'),
  s(`\\dfrac{${SLOT}}{${SLOT}}`, 'display fraction'),
  s(`\\tfrac{${SLOT}}{${SLOT}}`, 'text fraction'),
  s(`\\pmod{${SLOT}}`, 'modulo'),
]

export interface Completion {
  /** The command as typed, e.g. \frac. */
  name: string
  tex: string
  hint?: string
}

const commandName = (tex: string) => /^\\[a-zA-Z]+|^\\./.exec(tex)?.[0] ?? null

/** Every command we can complete, best-known first. */
export const COMPLETIONS: Completion[] = (() => {
  const seen = new Map<string, Completion>()
  for (const sym of [...PALETTE.flatMap((g) => g.symbols), ...extra]) {
    const name = commandName(sym.tex)
    // \begin and \left templates are reached by their own completions.
    if (name && name.length > 2 && name !== '\\begin' && name !== '\\left' && !seen.has(name)) seen.set(name, { name, tex: sym.tex, hint: sym.hint })
  }
  for (const env of ENVIRONMENTS) {
    const body = env === 'array' ? `{cc} ${SLOT} & ${SLOT} \\\\ ${SLOT} & ${SLOT} ` : env.includes('matrix') ? ` ${SLOT} & ${SLOT} \\\\ ${SLOT} & ${SLOT} ` : ` ${SLOT} \\\\ ${SLOT} `
    seen.set(`\\begin{${env}}`, { name: `\\begin{${env}}`, tex: `\\begin{${env}}${body}\\end{${env}}`, hint: 'environment' })
  }
  return [...seen.values()]
})()

/** Completions for a partly typed command such as "\fr" or "\begin{pm". */
export function complete(prefix: string, limit = 8): Completion[] {
  const needle = prefix.toLowerCase()
  const starts = COMPLETIONS.filter((c) => c.name.toLowerCase().startsWith(needle))
  const exact = starts.filter((c) => c.name.startsWith(prefix))
  const rest = needle.length > 2 ? COMPLETIONS.filter((c) => !c.name.toLowerCase().startsWith(needle) && c.hint?.includes(needle.slice(1))) : []
  return [...new Set([...exact, ...starts, ...rest])].slice(0, limit)
}
