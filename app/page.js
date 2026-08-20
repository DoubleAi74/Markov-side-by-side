import Link from "next/link";

const EXAMPLES = [
  { href: "/gillespie", label: "Birth–death process", method: "Exact SSA", equation: "X → X + 1,   X → X − 1", note: "Event timing and extinction" },
  { href: "/ctmp-inhomo", label: "Seasonal population", method: "Time-varying CTMP", equation: "λ(t) = λ₀[1 + a sin(ωt)]", note: "Non-stationary hazards" },
  { href: "/sde", label: "Ornstein–Uhlenbeck", method: "Euler–Maruyama", equation: "dXₜ = θ(μ − Xₜ)dt + σdWₜ", note: "Mean reversion and noise" },
];

function HeroFigure() {
  return (
    <figure className="hero-figure">
      <svg viewBox="0 0 700 420" role="img" aria-labelledby="hero-chart-title hero-chart-desc">
        <title id="hero-chart-title">Illustration of a jump-process trace and phase portrait</title>
        <desc id="hero-chart-desc">A schematic stepped population trace above a two-dimensional phase curve. This editorial illustration is not simulation output.</desc>
        <g className="hero-grid"><path d="M62 38V225H650M62 85H650M62 132H650M62 179H650" /><path d="M62 252V382H650M180 252V382M298 252V382M416 252V382M534 252V382" /></g>
        <path className="hero-trace-shadow" d="M62 194H87V184H105V171H129V177H149V151H171V158H190V139H215V124H238V132H257V112H282V119H302V91H326V98H351V77H378V89H405V69H431V82H457V61H486V71H513V54H542V64H570V48H601V58H626V41H650" />
        <path className="hero-trace" d="M62 194H87V184H105V171H129V177H149V151H171V158H190V139H215V124H238V132H257V112H282V119H302V91H326V98H351V77H378V89H405V69H431V82H457V61H486V71H513V54H542V64H570V48H601V58H626V41H650" />
        <path className="hero-phase" d="M112 354C146 339 169 366 200 342S246 291 284 318 335 368 371 331 405 272 448 302 489 359 526 318 569 265 616 281" />
        <circle cx="112" cy="354" r="6" className="hero-start" /><rect x="610" y="275" width="12" height="12" rx="2" className="hero-end" />
        <g className="hero-labels"><text x="62" y="22">population X(t)</text><text x="62" y="407">schematic state-space trace</text><text x="625" y="243">time →</text></g>
      </svg>
      <figcaption>Editorial illustration, not computed data. A line shows a possible path; circle and square mark its start and end.</figcaption>
    </figure>
  );
}

export default function HomePage() {
  return (
    <div className="landing-shell">
      <section className="landing-hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Stochastic modelling, in the browser</p>
          <h1 id="hero-title">Build the model.<br />Interrogate the noise.</h1>
          <p className="hero-lede">Markov Lab is a focused workspace for jump processes and stochastic differential equations. Define a model, reproduce a run, and move from trajectories to diagnostics without leaving the page.</p>
          <div className="hero-actions"><Link className="button-primary" href="/gillespie">Open the lab</Link><a className="button-secondary" href="#methods">Choose a solver</a></div>
          <p className="hero-footnote">No installation required · local runs work without an account · exports keep the model with the result</p>
        </div>
        <HeroFigure />
      </section>

      <section className="editorial-section" aria-labelledby="workflow-title">
        <div className="section-heading"><p className="eyebrow">A legible scientific workflow</p><h2 id="workflow-title">From mechanism to evidence</h2><p>Keep assumptions close to the output. Markov Lab separates model definition, numerical configuration, and interpretation so each can be inspected.</p></div>
        <ol className="workflow-list"><li><span>01</span><h3>Define</h3><p>Describe states, parameters, rates, drift, and diffusion in Guided or Expert mode.</p></li><li><span>02</span><h3>Run</h3><p>Keep a fixed root seed while you tune the model; choose New seed only when you mean to.</p></li><li><span>03</span><h3>Inspect</h3><p>Move between paths, phase space, distributions, summaries, and solver diagnostics.</p></li><li><span>04</span><h3>Export</h3><p>Save figures, tables, model JSON, or a native bundle with numerical context intact.</p></li></ol>
      </section>

      <section id="methods" className="editorial-section solver-guide" aria-labelledby="solver-title">
        <div className="section-heading"><p className="eyebrow">Solver decision guide</p><h2 id="solver-title">Match the method to the mechanism</h2></div>
        <div className="solver-table-wrap" tabIndex="0"><table><caption>Scope and trade-offs of the three available stochastic solvers.</caption><thead><tr><th>Use when</th><th>State</th><th>Clock</th><th>Method</th><th>Open</th></tr></thead><tbody><tr><th scope="row">Events occur one at a time at state-dependent rates</th><td>Integer counts</td><td>Continuous, homogeneous</td><td>Gillespie direct SSA</td><td><Link href="/gillespie">Reaction network <span aria-hidden="true">→</span></Link></td></tr><tr><th scope="row">Transition rates change explicitly with time</th><td>Integer counts</td><td>Continuous, time-varying</td><td>Integrated-hazard SSA</td><td><Link href="/ctmp-inhomo">Time-dependent process <span aria-hidden="true">→</span></Link></td></tr><tr><th scope="row">Noise acts continuously on real-valued states</th><td>Continuous</td><td>Fixed numerical grid</td><td>Euler–Maruyama</td><td><Link href="/sde">SDE workspace <span aria-hidden="true">→</span></Link></td></tr></tbody></table></div>
      </section>

      <section className="editorial-section" aria-labelledby="examples-title"><div className="section-heading"><p className="eyebrow">Curated starting points</p><h2 id="examples-title">Models with a question attached</h2></div><div className="example-ledger">{EXAMPLES.map((example, index) => <Link href={example.href} key={example.label}><span className="example-index">0{index + 1}</span><div><p>{example.method}</p><h3>{example.label}</h3><code>{example.equation}</code></div><strong>{example.note} <span aria-hidden="true">↗</span></strong></Link>)}</div></section>

      <section className="methodology-note" aria-labelledby="accuracy-title"><div><p className="eyebrow">Methodology &amp; accuracy</p><h2 id="accuracy-title">A simulation is an argument with numerical assumptions.</h2></div><div><p>Exact SSA is exact for the specified jump process, not automatically for the system it represents. Time-discretised methods introduce error: repeat CTMP analyses with a smaller maximum interval and SDE analyses at <i>dt</i>, <i>dt</i>/2, and <i>dt</i>/4.</p><p>Fixing a seed makes a computation reproducible; it does not make one path representative. Use ensembles, inspect excluded runs and warnings, and report solver settings with any figure.</p></div></section>
    </div>
  );
}
