// Clickable human figure: each region maps to a body system and is coloured by its score.
NS.bodymap = (function () {
  const COLORS = { ok: '#34d399', warn: '#fbbf24', crit: '#f87171', na: '#334155' };
  const INFO = {
    neuro: { name: 'Brain, eyes & behaviour', what: 'Alertness, workload, brain oxygenation and balance from dry EEG, prefrontal fNIRS, skin conductance and head IMU — no camera needed. Daily: sleep, mood, team cohesion, motion sickness, reaction test and the weekly eye exam (SANS).', hazard: 'Isolation, sleep loss and work overload, altered gravity (G-LOC, disorientation), hypoxia, headward fluid shift (SANS).' },
    cardio: { name: 'Heart & circulation', what: 'Heart rate, heart-rate variability and blood pressure from the PPG sensor.', hazard: 'Fluid shift and deconditioning in microgravity; CO2 and stress raise BP; fainting risk after landing.' },
    resp: { name: 'Lungs, oxygen & decompression', what: 'Blood oxygen saturation (SpO2), breathing rate and — during spacewalks — the tissue nitrogen ratio that predicts decompression sickness.', hazard: 'Cabin leaks, low ppO2, CO2 build-up; "the bends" when moving to the low-pressure spacesuit.' },
    metabolic: { name: 'Metabolism, bone & muscle', what: 'Blood glucose from a continuous glucose monitor. Daily: body mass, energy intake, exercise, weekly strength test and urinary calcium (bone breakdown).', hazard: 'Inadequate food and nutrition; bone loss of 1–1.5 % per month; 10–12 % average loss of strength and fitness.' },
    thermal: { name: 'Temperature & immunity', what: 'Body temperature — the first sign of infection or heat stress. Daily: morning temperature and salivary cortisol (stress hormone).', hazard: 'Altered immune responses and latent-virus reactivation; changing skin and gut microbes.' },
    env: { name: 'Habitat & suit environment', what: 'Cabin CO2, O2, pressure, CO, temperature, humidity and noise; radiation and neutron dose rates; acceleration; suit pressure during EVA. Daily: cabin air bacteria.', hazard: 'Hostile closed environment, space radiation, gravity transitions, distance from Earth.' },
  };
  let selected = 'neuro';
  let onSelect = null;

  const SVG = `
<svg viewBox="0 0 120 270" role="img" aria-label="Body systems">
  <g fill="#1b2b47">
    <rect x="52" y="44" width="16" height="12" rx="4"/>
    <path d="M34 58h52c8 0 12 5 12 13v48c0 4-6 4-6 0V76h-2v54H30V76h-2v43c0 4-6 4-6 0V71c0-8 4-13 12-13z"/>
    <path d="M32 130h56v10l-4 112c0 5-10 5-10 0l-4-96h-4l-4 96c0 5-10 5-10 0l-4-112z"/>
  </g>
  <path class="region" data-sys="thermal" d="M22 74c0-6 3-10 8-12v58c0 4-8 4-8 0zM98 74c0-6-3-10-8-12v58c0 4 8 4 8 0zM34 142h22l-4 108c0 5-10 5-10 0zM64 142h22l-6 108c0 5-10 5-10 0z"/>
  <ellipse class="region" data-sys="neuro" cx="60" cy="24" rx="17" ry="21"/>
  <path class="region" data-sys="resp" d="M38 70c4-6 14-6 18 0v34c-6 4-16 4-20-2zM64 70c4-6 14-6 18 0l2 32c-4 6-14 6-20 2z"/>
  <path class="region" data-sys="cardio" d="M58 86c-3-6-12-4-11 3 1 6 9 11 13 15 4-4 12-9 13-15 1-7-8-9-11-3l-2 3z"/>
  <path class="region" data-sys="metabolic" d="M38 110c8 4 36 4 44 0v24H38z"/>
  <g class="region" data-sys="env"><rect x="30" y="256" width="60" height="13" rx="4"/></g>
  <text x="60" y="265.5" text-anchor="middle" font-size="7.5" fill="#0b1220" font-weight="700" pointer-events="none">HABITAT</text>
</svg>`;

  function mount(el, cb) {
    el.innerHTML = SVG;
    onSelect = cb;
    el.querySelectorAll('.region').forEach((r) => r.addEventListener('click', () => select(r.dataset.sys)));
    select(selected);
  }

  function select(sys) {
    selected = sys;
    document.querySelectorAll('#bodymap .region').forEach((r) => r.classList.toggle('sel', r.dataset.sys === sys));
    if (onSelect) onSelect(sys);
  }

  function color(scores) {
    document.querySelectorAll('#bodymap .region').forEach((r) => {
      const s = scores[r.dataset.sys];
      const fill = s == null ? COLORS.na : COLORS[NS.score.band(s.score)];
      if (r.tagName === 'g') r.querySelector('rect').setAttribute('fill', fill);
      else r.setAttribute('fill', fill);
    });
  }

  return { mount, color, select, INFO, get selected() { return selected; } };
})();
