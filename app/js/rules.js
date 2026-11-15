// Condition detection rules + evidence-based guidance library.
// Each rule is evaluated every second against windowed statistics of the live stream.
// level(ctx) returns 'crit' | 'warn' | null. A rule raises only after `hold` consecutive seconds.
NS.rules = (function () {
  const R = [
    {
      id: 'hypoxia', title: 'Hypoxia', system: 'resp', hold: 8,
      level: (c) => c.mean('SPO2', 10) < 90 ? 'crit' : (c.mean('SPO2', 15) < 94 || c.mean('PPO2', 15) < 17.5) ? 'warn' : null,
      why: (c) => `SpO2 ${c.f('SPO2')} %, cabin ppO2 ${c.f('PPO2', 1)} kPa, brain O2 ${c.f('RSO2')} %`,
      advice: [
        'Don the oxygen mask / breathe 100 % O2 now; check the mask flow indicator.',
        'Check cabin pressure and ppO2; if falling, follow the emergency depressurisation procedure.',
        'Do a buddy check: crewmates check each other for confusion, slurred speech, cyanosis.',
        'Stay seated and stop safety-critical tasks until SpO2 is back above 95 %.',
      ],
      escalate: true,
      ref: 'Hypoxia recognition & recovery: FAA AC 61-107B; NASA-STD-3001 Vol. 2 (atmosphere).',
    },
    {
      id: 'depress', title: 'Cabin pressure dropping', system: 'env', hold: 10,
      level: (c) => c.last('PCAB') < 69 ? 'crit' : (c.last('PCAB') < 97 && c.slope('PCAB', 60) < -0.01) || c.last('PCAB') < 95 ? 'warn' : null,
      why: (c) => `Cabin pressure ${c.f('PCAB', 1)} kPa, change ${c.slope('PCAB', 60).toFixed(3)} kPa/s`,
      advice: [
        'Alert the whole crew; confirm the reading with a second sensor.',
        'Start leak isolation per the depressurisation checklist (close hatches, isolate modules).',
        'Prepare O2 masks / suits; keep monitoring SpO2 of every crew member.',
      ],
      escalate: true,
      ref: 'ISS Emergency Depress procedures; NASA-STD-3001 Vol. 2.',
    },
    {
      id: 'gloc', title: 'G-LOC precursor (brain O2 falling under G)', system: 'neuro', hold: 3,
      level: (c) => (c.mean('GZ', 5) > 3.5 || c.max('GZ', 15) > 4.5) && (c.mean('RSO2', 5) < 55 || c.drop('RSO2') > 18) ? 'crit'
        : (c.mean('GZ', 10) > 3.5 && (c.mean('RSO2', 5) < 60 || c.drop('RSO2') > 10)) || c.mean('GZ', 10) > 4.5 ? 'warn' : null,
      why: (c) => `+Gz ${c.f('GZ', 1)} G, brain O2 ${c.f('RSO2')} % (−${c.drop('RSO2').toFixed(0)} % from baseline)`,
      advice: [
        'Perform the anti-G straining manoeuvre (AGSM): tense legs, glutes and abdomen; short breath exchange every 3 s.',
        'Reduce the G-load if control allows (ease off / follow automatic abort profile).',
        'Keep the head still and against the headrest; check G-suit inflation.',
        'After the event: report any grey-out, tunnel vision or lost time to the flight surgeon.',
      ],
      escalate: true,
      ref: 'Whinnery & Forster 2013 (G-LOC); USAF AGSM training; Kikukawa et al. 2008 (in-flight NIRS in pilots).',
    },
    {
      id: 'microsleep', title: 'Drowsiness / microsleep risk', system: 'neuro', hold: 10,
      suppressedBy: ['hypoxia', 'depress', 'gloc', 'co2', 'co', 'hypoglycaemia', 'fever', 'heat', 'cold'],
      level: (c) => c.max('GZ', 30) > 2 ? null // EEG slowing under G-load is handled by the G-LOC rule
        : (c.mean('EEG_FI', 30) > 1.55 && c.last('NOD') >= 3) || c.last('NOD') >= 6 ? 'crit'
        : c.mean('EEG_FI', 60) > 1.35 || c.last('NOD') >= 2 ? 'warn' : null,
      why: (c) => `EEG drowsiness index ${c.f('EEG_FI', 2)}× baseline, ${c.f('NOD')} head nods/min, HR ${c.f('HR')} bpm`,
      advice: [
        'Hand over or pause the safety-critical task (robotics, piloting, EVA support).',
        'If schedule allows take a controlled nap of ~26 min (NASA nap study: +34 % performance, +54 % alertness).',
        'Use bright, blue-enriched light; short physical activity; caffeine only if more than 6 h before sleep.',
        'Log sleep debt in the daily logbook so the schedule can be adjusted.',
      ],
      escalate: false,
      ref: 'Rosekind et al. 1995 (NASA nap study); Barger et al. 2014, Lancet Neurol.; Lockley 2017 (ISS lighting).',
    },
    {
      id: 'overload', title: 'Cognitive overload', system: 'neuro', hold: 15,
      suppressedBy: ['hypoxia', 'depress', 'gloc', 'co2', 'co', 'hypoglycaemia', 'fever', 'heat', 'cold'],
      level: (c) => c.max('GZ', 30) > 2 ? null
        : c.mean('EEG_WL', 30) > 1.8 && (c.mean('HR', 30) > 95 || c.mean('RMSSD', 30) < 20 || c.rise('HR') > 25) ? 'crit'
        // absolute limits, or a clear stress response against the person's own baseline (fit crew rarely reach 85 bpm)
        : c.mean('EEG_WL', 30) > 1.45 && (c.mean('HR', 30) > 85 || c.mean('RMSSD', 30) < 25 || c.mean('GSR', 30) > 9
          || c.rise('HR') > 15 || c.drop('RMSSD') > 35 || c.rise('GSR') > 3.5) ? 'warn' : null,
      why: (c) => `Workload index ${c.f('EEG_WL', 2)}× baseline, HR ${c.f('HR')} bpm, HRV ${c.f('RMSSD')} ms, EDA ${c.f('GSR', 1)} µS`,
      advice: [
        'Prioritise: aviate → navigate → communicate. Defer non-critical tasks.',
        'Use the checklist; ask a crewmate or ground to take over secondary tasks (task shedding).',
        'Paced breathing for 1–2 min (~6 breaths/min) lowers sympathetic arousal.',
      ],
      escalate: false,
      ref: 'Gevins & Smith 2003; Lehrer & Gevirtz 2014 (resonance breathing); NASA HRP HSIA risk.',
    },
    {
      id: 'disorientation', title: 'Spatial disorientation', system: 'neuro', hold: 6,
      suppressedBy: ['gloc'],
      level: (c) => c.mean('VMIS', 10) > 30 ? 'crit' : c.mean('VMIS', 15) > 15 ? 'warn' : null,
      why: (c) => `Head/vehicle motion mismatch ${c.f('VMIS')} °/s, HR ${c.f('HR')} bpm, EDA ${c.f('GSR', 1)} µS`,
      advice: [
        'Trust the instruments, not body sensations; fix the gaze on a stable visual reference.',
        'Minimise head movements; stop the vehicle if it is safe to do so.',
        'If nausea develops, ask the flight surgeon about anti-motion-sickness medication.',
      ],
      escalate: false,
      ref: 'Clément & Reschke 2008; NASA HRP Risk of Impaired Control of Spacecraft (SM risk).',
    },
    {
      id: 'co2', title: 'High cabin CO2', system: 'env', hold: 15,
      // 3 mmHg (≈3950 ppm) = NASA 24-h limit; 4 mmHg (≈5300 ppm) = act now. The real ISS cabin sits around 3300 ppm.
      level: (c) => c.mean('CO2', 15) > 5300 ? 'crit' : c.mean('CO2', 30) > 3950 ? 'warn' : null,
      why: (c) => `CO2 ${c.f('CO2')} ppm (${(c.last('CO2') / 1316).toFixed(1)} mmHg), resp. ${c.f('RR')} /min`,
      advice: [
        'Check the CO2 removal system (CDRA / LiOH canister) and swap or restart it.',
        'Increase ventilation; move to a well-ventilated module; avoid working in dead-air pockets.',
        'Reduce physical exertion until levels drop; report headaches in the logbook.',
      ],
      escalate: true,
      ref: 'Law et al. 2014 (J Occup Environ Med); NASA SMAC JSC-20584.',
    },
    {
      id: 'co', title: 'Toxic atmosphere (CO)', system: 'env', hold: 5,
      level: (c) => c.mean('CO', 10) > 55 ? 'crit' : c.mean('CO', 20) > 15 ? 'warn' : null,
      why: (c) => `CO ${c.f('CO')} ppm`,
      advice: [
        'Don the portable breathing apparatus (PBA).',
        'Follow the fire / toxic atmosphere procedure; isolate the affected module.',
      ],
      escalate: true,
      ref: 'NASA SMAC JSC-20584; ISS emergency procedures.',
    },
    {
      id: 'hypoglycaemia', title: 'Low blood glucose', system: 'metabolic', hold: 10,
      level: (c) => c.mean('GLU', 15) < 54 ? 'crit' : c.mean('GLU', 15) < 70 ? 'warn' : null,
      why: (c) => `Glucose ${c.f('GLU')} mg/dL, HR ${c.f('HR')} bpm, EDA ${c.f('GSR', 1)} µS`,
      advice: [
        '15-15 rule: take 15 g fast carbohydrate (juice pouch, glucose tabs), re-check after 15 min, repeat if still < 70.',
        'Stop exercise; eat a regular meal or snack once glucose is above 70 mg/dL.',
        'If confused or unable to swallow, a crewmate uses the medical kit (glucagon) and calls the flight surgeon.',
      ],
      escalate: true,
      ref: 'ADA Standards of Care in Diabetes, Hypoglycaemia section; Battelino et al. 2019.',
    },
    {
      id: 'fever', title: 'Fever', system: 'thermal', hold: 20,
      level: (c) => c.mean('TEMP', 30) >= 39 ? 'crit' : c.mean('TEMP', 30) >= 38 ? 'warn' : null,
      why: (c) => `Temperature ${c.f('TEMP', 1)} °C, HR ${c.f('HR')} bpm, resp. ${c.f('RR')} /min`,
      advice: [
        'Rest and drink 2–3 L of water today; log symptoms (sore throat, rash, cough).',
        'Antipyretic from the medical kit only after flight surgeon consultation.',
        'Limit close contact and shared items; clean shared surfaces.',
      ],
      escalate: true,
      ref: 'Crucian et al. 2018 (immune dysregulation & viral reactivation in spaceflight).',
    },
    {
      id: 'dcs', title: 'Decompression sickness risk (EVA)', system: 'resp', hold: 5,
      level: (c) => !(c.last('PSUIT') < 70) ? null
        : c.mean('TR', 10) > 1.65 ? 'crit' : c.mean('TR', 10) > 1.4 ? 'warn' : null,
      why: (c) => `Tissue N2 ratio ${c.f('TR', 2)} at suit pressure ${c.f('PSUIT', 1)} kPa, HR ${c.f('HR')} bpm`,
      advice: [
        'Report any joint pain (knee, shoulder, elbow), skin itching, numbness or breathing trouble at once.',
        'With a variable-pressure suit, raise suit pressure now (e.g. to 41 kPa / 6 psi) to shrink N2 bubbles.',
        'If symptoms appear: end the spacewalk safely but quickly and return to the pressurised airlock.',
        'Keep breathing 100 % O2; after the EVA the flight surgeon decides on pressure treatment.',
      ],
      escalate: true,
      ref: 'NASA HRP Risk of Decompression Sickness; Conkin 2011, NASA/TP-2011-216147.',
    },
    {
      id: 'suit', title: 'Suit pressure low (leak)', system: 'env', hold: 3,
      level: (c) => c.last('PSUIT') < 24 ? 'crit' : c.last('PSUIT') < 27.5 ? 'warn' : null,
      why: (c) => `Suit pressure ${c.f('PSUIT', 1)} kPa (nominal 29.6), SpO2 ${c.f('SPO2')} %`,
      advice: [
        'Open the emergency O2 supply and check suit pressure on the display.',
        'Stop work, translate to the airlock with a tethered buddy, and terminate the EVA.',
      ],
      escalate: true,
      ref: 'NASA HRP Risk of Injury and Compromised Performance from Spacewalks; NASA-STD-3001 Vol. 2.',
    },
    {
      id: 'heat', title: 'Cabin heat / humidity out of limits', system: 'env', hold: 15,
      level: (c) => c.mean('CABT', 30) > 30 || (c.mean('CABT', 30) > 27 && c.mean('TEMP', 30) >= 37.8) ? 'crit'
        : c.mean('CABT', 30) > 27 || c.mean('RH', 30) > 75 || (c.mean('RH', 30) < 25 && c.mean('CABT', 30) >= 18) ? 'warn' : null,
      why: (c) => `Cabin ${c.f('CABT', 1)} °C, humidity ${c.f('RH')} %, body temperature ${c.f('TEMP', 1)} °C, HR ${c.f('HR')} bpm`,
      advice: [
        'Check the thermal-control (coolant) loop and switch to the backup loop if available.',
        'Reduce physical work and postpone exercise; drink extra water (0.5 L per hour of work in heat).',
        'Move to the coolest module; watch crewmates for headache, dizziness or confusion.',
        'Wipe condensation and check for leaks: humid air lets microbes grow.',
      ],
      escalate: true,
      ref: 'NASA-STD-3001 Vol. 2 (18–27 °C, 25–75 % RH); NASA HRP hostile/closed environment hazard.',
    },
    {
      id: 'cold', title: 'Cold cabin', system: 'env', hold: 15,
      level: (c) => c.mean('CABT', 30) < 15 || c.mean('TEMP', 30) < 35.5 ? 'crit' : c.mean('CABT', 30) < 18 ? 'warn' : null,
      why: (c) => `Cabin ${c.f('CABT', 1)} °C, body temperature ${c.f('TEMP', 1)} °C, HR ${c.f('HR')} bpm`,
      advice: [
        'Switch to the backup heaters and close off unused modules to keep the heat in.',
        'Put on extra clothing layers and a hat; use sleeping bags if needed.',
        'Light physical activity and a warm drink help; watch crewmates for shivering, clumsiness or confusion.',
        'Watch for condensation and frost on cold walls; check pipes and water lines.',
      ],
      escalate: true,
      ref: 'NASA-STD-3001 Vol. 2 (18–27 °C); NASA HRP hostile/closed environment hazard.',
    },
    {
      id: 'noise', title: 'High cabin noise', system: 'env', hold: 30,
      level: (c) => c.mean('SPL', 30) > 85 ? 'crit' : c.mean('SPL', 60) > 67 ? 'warn' : null,
      why: (c) => `Noise ${c.f('SPL')} dBA`,
      advice: [
        'Wear hearing protection (earplugs / headset) while the noise lasts.',
        'Find the source (fan, pump, exercise device) and reduce its speed or isolate it.',
        'Protect the sleep period: sleep in the quietest module with earplugs.',
      ],
      escalate: false,
      ref: 'NASA-STD-3001 Vol. 2 (acoustics); NASA HRP Sleep risk.',
    },
    {
      id: 'radiation', title: 'Radiation: solar particle event', system: 'env', hold: 5,
      level: (c) => c.mean('DOSE', 10) > 100 || c.mean('NEUT', 10) > 40 ? 'crit' : c.mean('DOSE', 20) > 25 || c.mean('NEUT', 20) > 10 ? 'warn' : null,
      why: (c) => `Dose rate ${c.f('DOSE')} µGy/h (background ≈ 14), neutrons ${c.f('NEUT', 1)} µSv/h`,
      advice: [
        'Go to the storm shelter / most shielded area (water walls, crew quarters).',
        'Postpone EVAs and lunar/Mars surface activity until the event ends.',
        'Keep your personal dosimeter on; the cumulative dose is logged automatically.',
      ],
      escalate: true,
      ref: 'NASA-STD-3001 Vol. 1 (radiation limits); Zeitlin et al. 2013.',
    },
    {
      id: 'hypertension', title: 'High blood pressure', system: 'cardio', hold: 30,
      suppressedBy: ['hypoxia', 'depress', 'gloc', 'co2', 'co', 'hypoglycaemia', 'fever', 'heat', 'cold'],
      level: (c) => c.mean('SBP', 60) >= 160 || c.mean('DBP', 60) >= 100 ? 'crit'
        : (c.mean('SBP', 60) >= 140 || c.mean('DBP', 60) >= 90) && c.mean('GZ', 30) < 1.5 ? 'warn' : null,
      why: (c) => `BP ${c.f('SBP')}/${c.f('DBP')} mmHg`,
      advice: [
        'Rest seated for 5 min and repeat the measurement.',
        'Check cabin CO2 (a common cause in spacecraft); limit salt in meals.',
        'Report repeated readings above 140/90 to the flight surgeon.',
      ],
      escalate: false,
      ref: '2017 ACC/AHA BP guideline.',
    },
    {
      // validated on real recordings: PhysioNet Non-EEG stress protocol (see Guide → Datasets)
      id: 'stress', title: 'Acute stress response', system: 'neuro', hold: 20,
      suppressedBy: ['overload', 'hypoxia', 'depress', 'gloc', 'co2', 'co', 'hypoglycaemia', 'fever', 'heat', 'cold', 'radiation', 'dcs'],
      level: (c) => {
        if (isNaN(c.base('HR')) || isNaN(c.base('GSR'))) return null;
        // physical effort raises HR and sweating too: not flagged as stress when breathing is up, in a suit or under G
        if (c.rise('RR') >= 5 || !isNaN(c.last('PSUIT')) || c.max('GZ', 30) > 1.5) return null;
        // skin conductance drifts upward over a session, so its rise is measured against the lowest value
        // of the last 5 min (a phasic response), heart rate against the resting baseline
        const lo = c.lowMean('GSR', 300, 30), dg = c.mean('GSR', 30) - lo;
        return c.rise('HR') >= 5 && dg >= Math.max(0.5, 0.5 * lo) ? 'warn' : null;
      },
      why: (c) => `HR +${c.rise('HR').toFixed(0)} bpm over your resting baseline, skin conductance +${(c.mean('GSR', 30) - c.lowMean('GSR', 300, 30)).toFixed(1)} µS within 5 min`,
      advice: [
        'If you are not exercising: pause, breathe slowly (6 breaths/min) for two minutes.',
        'Hand over or postpone safety-critical tasks until heart rate settles.',
        'If it keeps coming back, talk to the crew medical officer or a behavioural-health conference.',
      ],
      escalate: false,
      ref: 'Boucsein 2012 (electrodermal activity); Birjandtalab et al. 2016 (PhysioNet Non-EEG stress dataset).',
    },
    {
      // validated on real recordings: PhysioNet PRCP tilt-table and stand-up tests
      id: 'orthostatic', title: 'Low blood pressure / orthostatic stress', system: 'cardio', hold: 10, suppressedBy: ['gloc'],
      level: (c) => {
        if (isNaN(c.base('SBP'))) return null;
        // only when gravity loads the body more than at baseline (tilt, standing up, landing); high G belongs to G-LOC
        const gz = c.mean('GZ', 30), dgz = gz - c.base('GZ');
        if (!isNaN(gz) && (dgz < 0.3 || gz > 1.5)) return null;
        // consensus definitions against the person's own supine/seated baseline (Freeman et al. 2011):
        // orthostatic hypotension = systolic drop >= 20 mmHg; postural tachycardia = HR rise >= 30 bpm.
        // A low absolute value alone is not used: healthy young people can sit below 90 mmHg.
        const drop = -c.rise('SBP'), dh = c.rise('HR');
        if (drop >= 20 && c.mean('SBP', 10) < 80) return 'crit';
        return drop >= 20 || dh >= 30 ? 'warn' : null;
      },
      why: (c) => `Systolic ${c.f('SBP')} mmHg (${c.rise('SBP').toFixed(0)} vs baseline), HR ${c.f('HR')} bpm (+${c.rise('HR').toFixed(0)})`,
      advice: [
        'Lie down or sit with legs raised; tense the leg muscles.',
        'Drink fluid with salt if allowed; avoid standing still for long right after landing.',
        'If dizziness or fainting follows, the crew medical officer checks blood pressure lying and standing.',
      ],
      escalate: true,
      ref: 'Freeman et al. 2011 consensus (orthostatic hypotension, POTS); Heldt et al. 2003 (PhysioNet PRCP); NASA HRP Risk of Orthostatic Intolerance.',
    },
    {
      id: 'tachy', title: 'Rapid heart rate', system: 'cardio', hold: 30,
      suppressedBy: ['hypoxia', 'depress', 'gloc', 'co2', 'co', 'hypoglycaemia', 'fever', 'heat', 'cold'],
      level: (c) => c.mean('HR', 30) > 140 ? 'crit' : c.mean('HR', 60) > 120 ? 'warn' : null,
      why: (c) => `HR ${c.f('HR')} bpm, HRV ${c.f('RMSSD')} ms`,
      advice: [
        'If not exercising: stop activity, sit and breathe slowly; re-check after 5 min.',
        'Look for a cause: hypoxia, fever, low glucose, dehydration, stress.',
      ],
      escalate: false,
      ref: 'AHA; NASA HRP Cardiovascular risk.',
    },
    {
      id: 'brady', title: 'Very slow heart rate', system: 'cardio', hold: 15,
      level: (c) => c.mean('HR', 15) < 40 ? 'crit' : null,
      why: (c) => `HR ${c.f('HR')} bpm`,
      advice: ['Check for dizziness or fainting; lie down and call the flight surgeon.'],
      escalate: true,
      ref: 'AHA.',
    },
  ];

  // Guidance for daily-log anomaly patterns (used by the logbook).
  const DAILY_ADVICE = {
    sleep: ['Protect the next sleep period (8.5 h scheduled); use eye mask and earplugs.', 'Avoid caffeine within 6 h of sleep; ask for a schedule shift if the timeline caused it.'],
    infection: ['Rest, hydrate and log symptoms twice a day.', 'Contact the flight surgeon; limit shared items.'],
    co2: ['Check CO2 removal hardware; ventilate crew quarters.', 'Report headaches — CO2 sensitivity differs between crew members.'],
    bp: ['Re-measure after 5 min rest; check CO2 and salt intake.'],
    mass: ['Energy intake may be too low: review menu, add snacks, track food intake.', 'Keep exercise at ~2.5 h/day to protect bone and muscle; drink 2–3 L/day.'],
    mood: ['Schedule a private family / psychological support conference.', 'Keep regular exercise, leisure time and contact with crewmates; report to behavioral health.'],
    radiation: ['Record cumulative dose; review the shelter timeline and EVA plan.'],
    sans: ['Flight surgeon reviews the OCT / fundus images; repeat the eye exam within a week.', 'Countermeasures under study: thigh cuffs to keep fluid in the legs, B-vitamin supplement; keep cabin CO2 low.'],
    fitness: ['Restore resistive exercise (ARED) to the planned load; add the weekly strength test to the timeline.', 'Strength loss raises injury risk at landing and on the Moon / Mars surface.'],
    bone: ['Keep resistive exercise and vitamin D intake on plan; drink 2–3 L water to lower kidney-stone risk.'],
    team: ['Plan shared crew time (meal, movie); use the crew conflict-resolution guide.', 'Offer a private conference with behavioral health.'],
    sm: ['Limit head movements; keep a fixed visual reference; anti-motion-sickness medication per flight surgeon.'],
    stress: ['High stress hormone: protect sleep and leisure time; watch for cold sores, rashes or infection.'],
    microbe: ['Disinfect the affected area and dry condensation; check humidity control.', 'Swab surfaces and repeat the air sample; crew with symptoms report to the flight surgeon.'],
    generic: ['Repeat the measurement and compare with your own baseline.'],
  };

  // ---- runtime state
  const active = {}; // id -> {level, since, t, count}

  function evaluate(ctx, t) {
    const changes = [];
    for (const r of R) {
      let lv = null;
      try { lv = r.level(ctx); } catch (e) { lv = null; }
      // a more specific root cause (e.g. hypoxia) explains generic signs (drowsiness, tachycardia)
      if (lv && r.suppressedBy && r.suppressedBy.some((id) => active[id] && active[id].level)) lv = null;
      const a = active[r.id] || (active[r.id] = { level: null, pending: 0, pendingLevel: null, clear: 0 });
      if (lv) {
        a.clear = 0;
        if (a.level === lv) { a.why = r.why(ctx); a.pending = 0; continue; }
        a.pending = a.pendingLevel === lv ? a.pending + 1 : 1;
        a.pendingLevel = lv;
        // escalation to critical is immediate; downgrading needs 3× the hold time (hysteresis)
        const need = a.level === 'crit' && lv === 'warn' ? r.hold * 3 : r.hold;
        if (a.pending >= need || (a.level && lv === 'crit')) {
          const prev = a.level;
          a.level = lv; a.since = a.since != null && prev ? a.since : t; a.why = r.why(ctx); a.pending = 0;
          changes.push({ rule: r, level: lv, prev, t, why: a.why });
        }
      } else if (a.level) {
        a.clear++;
        if (a.clear >= 10) { changes.push({ rule: r, level: null, prev: a.level, t }); a.level = null; a.since = null; a.pending = 0; }
      } else { a.pending = 0; a.pendingLevel = null; }
    }
    return changes;
  }

  function current() {
    return R.filter((r) => active[r.id] && active[r.id].level)
      .map((r) => ({ rule: r, level: active[r.id].level, since: active[r.id].since, why: active[r.id].why }))
      .sort((a, b) => (a.level === b.level ? 0 : a.level === 'crit' ? -1 : 1));
  }

  function reset() { for (const k in active) delete active[k]; }

  return { list: R, evaluate, current, reset, DAILY_ADVICE };
})();
