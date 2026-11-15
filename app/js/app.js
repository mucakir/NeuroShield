// App shell: tabs, crew/profile selection and the Guide page.
(function () {
  const D = window.NS_DATA;
  const U = NS.util;
  const $ = (id) => document.getElementById(id);

  const HAZARDS = [
    ['Space radiation', 'Galactic cosmic rays and solar particle events damage tissue; neutrons are about 30 % of the ISS dose.', 'Dose rate, neutron dose rate, daily dose, mission radiation budget'],
    ['Isolation & confinement', 'Sleep loss, work overload and isolation affect mood, alertness and teamwork.', 'EEG drowsiness/workload, HRV, EDA, sleep + actigraphy, work hours, mood, team cohesion, cortisol, PVT'],
    ['Distance from Earth', 'Communication delay (up to 22 min one-way at Mars) means the crew must assess and act on their own health.', 'Mission signal delay, health score, guidance library, anomaly detection, delay-aware escalation'],
    ['Gravity fields', 'Microgravity shifts fluids (SANS) and unloads bone and muscle; high G at launch/entry can cause G-LOC; transitions cause disorientation.', '+Gz, fNIRS brain O2, vestibular mismatch, motion sickness, optic-disc grade, strength, urinary calcium, body mass'],
    ['Hostile closed environment', 'Life support must keep pressure, gases, temperature, humidity, noise and microbes in limits; suits add decompression risk.', 'Cabin CO2, ppO2, pressure, CO, temperature, humidity, noise, air bacteria, suit pressure, DCS tissue ratio'],
  ];

  // NASA HRP risks (nasa.gov/hrp/risks) mapped to live (L) and daily (D) indicators
  const RISKS = [
    ['Altered immune system responses', 'Physiology', ['L:TEMP', 'D:temp', 'D:cortisol', 'D:rhr', 'D:rmssd'], 'Fever rule; infection pattern in the logbook'],
    ['Altered sensorimotor & vestibular function', 'Physiology', ['L:VMIS', 'L:GZ', 'D:msq'], 'Spatial-disorientation rule; motion-sickness pattern'],
    ['Cardiovascular adaptations', 'Physiology', ['L:HR', 'L:RMSSD', 'L:SBP', 'L:DBP', 'D:rhr', 'D:sbp', 'D:dbp'], 'Tachycardia, bradycardia and blood-pressure rules'],
    ['Decompression sickness', 'Physiology', ['L:TR', 'L:PSUIT'], 'DCS rule during EVA (EVA scenario)'],
    ['Host-microorganism interactions', 'Physiology', ['D:microbe_cfu', 'L:RH', 'D:temp'], 'Microbial-growth pattern; humidity rule'],
    ['Hypoxia', 'Physiology', ['L:SPO2', 'L:PPO2', 'L:PCAB', 'L:RSO2'], 'Hypoxia and depressurisation rules'],
    ['Inadequate food and nutrition', 'Physiology', ['D:kcal_pct', 'D:mass_change', 'D:water_l', 'L:GLU'], 'Hypoglycaemia rule; body-mass / low-intake pattern'],
    ['Injury & compromised performance from spacewalks', 'Physiology', ['L:PSUIT', 'L:TR', 'L:HR', 'L:TEMP'], 'Suit-pressure and DCS rules'],
    ['Reduced cardiorespiratory & musculoskeletal fitness', 'Physiology', ['D:exercise_min', 'D:strength_pct', 'D:rhr'], 'Strength-loss pattern'],
    ['Spaceflight associated neuro-ocular syndrome (SANS)', 'Physiology', ['D:sans_grade', 'L:CO2'], 'SANS pattern from the weekly eye exam'],
    ['Spaceflight-induced bone changes', 'Physiology', ['D:u_ca', 'D:exercise_min', 'D:strength_pct'], 'Bone-breakdown marker pattern'],
    ['Behavioral changes & psychiatric disorders', 'Behavior', ['D:mood', 'D:stress', 'D:cortisol', 'L:GSR'], 'Low-mood pattern'],
    ['Inadequate teamwork', 'Behavior', ['D:team'], 'Team-cohesion pattern'],
    ['Inadequate sleep & irregular schedules', 'Behavior', ['D:sleep_h', 'D:sleep_eff', 'D:work_h', 'D:pvt_rt', 'L:EEG_FI', 'L:NOD', 'L:SPL'], 'Microsleep and noise rules; sleep-loss pattern'],
    ['Inadequate systems operations support', 'Behavior', ['L:EEG_WL', 'L:HR', 'L:GSR'], 'Cognitive-overload rule; on-board guidance; delay-aware escalation'],
    ['Injury from dynamic loads', 'Behavior', ['L:GZ', 'L:RSO2', 'D:strength_pct'], 'G-LOC precursor rule'],
    ['Radiation-induced cancers', 'Radiation', ['L:DOSE', 'L:NEUT', 'D:dose_mGy'], 'Radiation rule; mission radiation budget'],
  ];

  // Datasets reviewed for the project (Guide tab). status: use | plan | proxy | info
  // Numbers come from the real-data analysis (data/real/lab, bundled in app/js/real_rec.js).
  const CAL = window.NS_REC.calibration, VAL = window.NS_REC.validation;
  const pct = (x) => Math.round(100 * x) + ' %';
  const DATASETS = [
    ['NASA space data', null, [
      ['NASA OSDR Environmental Data Application (EDA)', 'https://visualization.osdr.nasa.gov/eda/',
        'Real ISS cabin CO2, temperature and humidity (every 5 min) and daily radiation dose (galactic cosmic rays, South Atlantic Anomaly, total) from rodent-research missions; API + data tables.',
        'Cabin CO2, temperature, humidity and ISS dose baselines; 60-day logbook CO2 and daily dose (mission RR-7, Jul–Sep 2018, incl. a real CO2 excursion)', 'use'],
      ['NASA OSDR RadLab', 'https://visualization.osdr.nasa.gov/radlab/',
        'ISS radiation dose and flux from several space agencies’ detectors; portal + API.',
        'Radiation budget', 'info', 'The portal returned a server error when checked on 14 Nov 2026; ISS dose comes from the EDA dosimetry for now.'],
      ['Inspiration4 / SOMA in OSDR (OSD-569, OSD-575)', 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569',
        'Clinical and omics data of the 4 civilian Inspiration4 astronauts (2021); complete blood count and metabolic panel at 7 timepoints. Raw sequencing data needs approval.',
        'Bloodwork tab (each crew member A–D stands in for one Inspiration4 astronaut)', 'use'],
      ['NOAA SWPC GOES integral proton flux', 'https://services.swpc.noaa.gov/json/goes/primary/integral-protons-7-day.json',
        'Live 7-day proton flux from the GOES satellites (≥10 MeV, ≥100 MeV).', 'Space Weather tab (NOAA S-scale)', 'use'],
    ]],
    ['Brain and cognition', null, [
      ['EEG driver drowsiness dataset', 'https://figshare.com/articles/dataset/EEG_driver_drowsiness_dataset/14273687',
        'EEG from 11 people labelled alert or drowsy (2,022 three-second, 30-channel epochs at 128 Hz); Matlab file; CC BY 4.0.', 'EEG drowsiness index (EEG_FI)', 'use',
        `Limits checked: the (θ+α)/β index of drowsy epochs is ${CAL.eeg_drowsiness.drowsy_median}× the person's alert level (median). The 1.3× caution limit flags ${pct(CAL.eeg_drowsiness.drowsy_above_1_3)} of drowsy and ${pct(CAL.eeg_drowsiness.alert_above_1_3)} of alert single epochs (AUC ${CAL.eeg_drowsiness.auc_pooled}); the microsleep rule averages 10–30 s and adds head nods.`],
      ['Cao et al. 2019 — Multi-channel EEG during a sustained-attention driving task', 'https://figshare.com/articles/dataset/Multi-channel_EEG_recordings_during_a_sustained-attention_driving_task/6427334',
        '62 sessions of 32-channel EEG from 27 people in a 90-min driving task with lane drifts and reaction times; CC BY 4.0. 64 files, 19.6 GB.', 'EEG drowsiness index', 'info',
        'The labelled subset above is extracted from this study and is what NeuroShield uses; the raw 19.6 GB is kept for the lead-time analysis.'],
      ['COG-BCI database', 'https://zenodo.org/records/7413650',
        'EEG + ECG from 29 people in 3 sessions: NASA MATB-II, N-back, PVT and Flanker tasks with KSS sleepiness and workload ratings. 31.7 GB (≈1.1 GB per person).', 'Workload index, PVT reaction test', 'plan',
        'Next: one participant (≈1.1 GB) to validate the cognitive-overload rule and the reaction test.'],
      ['Tufts fNIRS2MW', 'https://tufts-hci-lab.github.io/code_and_datasets/fNIRS2MW.html',
        'Forehead fNIRS (2 optode pairs, oxy/deoxy-haemoglobin, 5.2 Hz) from 68 people doing 0- to 3-back blocks; CC BY 4.0. Box download, by hand.', 'Cerebral oxygenation (rSO2), workload', CAL.fnirs_workload ? 'use' : 'plan',
        CAL.fnirs_workload ? (() => { const F = CAL.fnirs_workload, f = F.per_subject[0].features[F.best_feature], lm = f.level_mean.map((v) => (v > 0 ? '+' : '') + v.toFixed(2));
          return `Workload response checked on ${F.subjects} of ${F.of_subjects} subjects (${F.per_subject[0].blocks} blocks of ${F.per_subject[0].block_s} s): oxygenated haemoglobin on the ${F.best_feature.slice(0, 2)} channel rises with n-back level (Spearman ρ ${F.best_mean_spearman}; 0/1/2/3-back means ${lm.join(' / ')} SD), and separates 2–3-back from 0–1-back blocks with AUC ${f.auc_high_vs_low}. 3-back is below 2-back, a known overload pattern. Values are normalised, so they test the trend, not the rSO2 % limits.`; })()
          : 'Hosted in Box shared folders, which cannot be fetched by script; manual download needed.'],
      ['Shin et al. 2018 — Simultaneous EEG + NIRS', 'http://doc.ml.tu-berlin.de/simultaneous_EEG_NIRS/',
        '26 people doing n-back and two other cognitive tasks with simultaneous EEG and NIRS (EEG 5.67 GB, NIRS 760 MB).', 'Cerebral oxygenation + EEG', 'plan'],
    ]],
    ['Heart, blood pressure and skin conductance', null, [
      ['PhysioNet Non-EEG Dataset', 'https://physionet.org/content/noneeg/1.0.0/',
        'Wrist sensors on 20 people (EDA, temperature, acceleration at 8 Hz; HR, SpO2 at 1 Hz) through rest, treadmill, emotional and cognitive stress. 3.7 MB.', 'EDA, HR, SpO2', 'use',
        `Live Monitor → Lab → "Stress protocol": each crew member replays a real person. Stress rule checked on all 20: active ${VAL.noneeg.phases.cognitive_stress.stressPct} % of cognitive-stress time vs ${VAL.noneeg.phases.nominal.stressPct} % at rest; emotional-stress clips (≈40 s) go unnoticed. Wrist HR + EDA alone are a weak stress signal — the reason NeuroShield adds EEG workload.`],
      ['WESAD (UCI)', 'https://archive.ics.uci.edu/dataset/465/wesad+wearable+stress+and+affect+detection',
        'Wrist + chest sensors on 15 people (neutral, stress, amusement): EDA, ECG, BVP, temperature, acceleration. One 2.1 GB ZIP.', 'EDA, HRV, stress', 'plan', 'Next: second, independent check of the stress rule (Trier Social Stress Test labels).'],
      ['PhysioNet BIDMC PPG and Respiration', 'https://physionet.org/content/bidmc/1.0.0/',
        '53 eight-minute ICU recordings: PPG, ECG and respiration at 125 Hz; HR, RR and SpO2 at 1 Hz (CSV). Hospital patients, so a clinical reference.', 'HR, SpO2, respiration rate', 'use',
        `Live Monitor → Lab → "ICU bedside vitals" (1 Hz numerics). On all 53 patients the monitor alerted in ${VAL.bidmc.patientsWithAlert}, for ${VAL.bidmc.alertTimePct} % of the time, mostly low SpO2 — expected in intensive care.`],
      ['PhysioNet Normal Sinus Rhythm RR Interval Database', 'https://physionet.org/content/nsr2db/1.0.0/',
        'Beat-to-beat intervals from 54 long-term ECGs of healthy people (28–76 y); 24-h HRV rhythms. 11.1 MB.', 'HRV (RMSSD)', 'use',
        `HRV limits set from it: ${CAL.hrv_nsr.windows_5min.toLocaleString('en')} five-minute windows, RMSSD median ${CAL.hrv_nsr.rmssd_ms.median} ms, 10th percentile ${CAL.hrv_nsr.rmssd_ms.p10} ms, so the live normal band starts at 13 ms (was 20 ms, which put ${pct(CAL.hrv_nsr.share_below_20)} of healthy windows in caution).`],
      ['PhysioNet PRCP — Physiologic Response to Changes in Posture', 'https://physionet.org/content/prcp/1.0.0/',
        'ECG + continuous arterial blood pressure from 10 healthy people during slow tilt, fast tilt and standing (250 Hz, beat annotations). 54.1 MB.', 'Systolic BP, HR, +Gz (orthostatic response)', 'use',
        `Live Monitor → Lab → "Tilt table & stand-up". Orthostatic rule checked on ${VAL.prcp.manoeuvres} head-up manoeuvres: healthy volunteers compensate (HR +${VAL.prcp.hrRiseMedian} bpm, systolic ${VAL.prcp.sbpChangeMedian >= 0 ? '+' : ''}${VAL.prcp.sbpChangeMedian} mmHg), the rule fired in ${VAL.prcp.manoeuvresWithAlert} and ${VAL.prcp.supineAlertPct} % of supine time.`],
      ['PhysioNet Cerebral Vasoregulation in Diabetes', 'https://physionet.org/content/cerebral-vasoreg-diabetes/1.0.0/',
        'ECG, blood pressure, transcranial Doppler brain blood flow and CO2 during head-up tilt; use the control group only. 3.0 GB.', 'Systolic BP, brain blood flow, CO2', 'plan'],
    ]],
    ['Sleep, head nods and vestibular mismatch', 'No open, labelled dataset exists for head nods or vestibular mismatch, so the last three rows are proxies; the VR cybersickness set is used as one (scene motion with a still body).', [
      ['PhysioNet Sleep-EDF Expanded', 'https://physionet.org/content/sleep-edfx/1.0.0/',
        '197 full-night recordings with EEG, EOG, chin EMG and expert-scored sleep stages (8.1 GB); NeuroShield uses only the 153 sleep-cassette hypnograms.', 'Sleep duration, sleep efficiency', 'use',
        `Sleep limits checked on ${CAL.sleep_edf.nights} nights: adults under 50 sleep a median ${CAL.sleep_edf.under50.tst_median} h with ${CAL.sleep_edf.under50.eff_median} % efficiency (10th percentile ${CAL.sleep_edf.under50.eff_p10} %), consistent with the 7–9.5 h and ≥ 85 % normal bands.`],
      ['Head Motion EMA (G-Node GIN)', 'https://gin.g-node.org/phausamann/head-motion-ema',
        'Head and waist IMUs on 10 people, accelerometer and gyroscope at 100 Hz over a day (Hausamann et al. 2019); no drowsiness labels.', 'Head nods', 'proxy'],
      ['PhysioNet Noise Enhancement of Sensorimotor Function', 'https://physionet.org/content/nesfdb/1.0.0/',
        'Postural sway of 15 young and 12 older healthy people, with and without sub-threshold foot vibration. 32.2 MB.', 'Vestibular mismatch (balance)', 'proxy'],
      ['Cybersickness dataset (Wang et al., arXiv 2023)', 'https://github.com/coreturn/Cybersickness_Dataset',
        'VR navigation: 159 four-minute sessions of 54 people with wrist EDA and HR (Empatica E4), head pose, scene rotation and a sickness questionnaire (SSQ) after each; preprint, lower rigour. 416 MB.', 'Vestibular mismatch (sensory conflict)', CAL.cybersickness ? 'use' : 'proxy',
        CAL.cybersickness ? (() => { const C = CAL.cybersickness, V = VAL.cybersickness;
          return `Live Monitor → Lab → "VR navigation": 4 real sessions, most to least sick. Following the authors' notebook: SSQ median ${C.ssq_quartiles[1]} (IQR ${C.ssq_quartiles[0]}–${C.ssq_quartiles[2]}), ${pct(C.share_ssq_ge40)} of sessions ≥ 40. Skin-conductance rise during the session tracks sickness best (ρ ${C.eda_rise.rho_ssq[0]} with SSQ, ${C.eda_rise.rho_nausea[0]} with nausea; AUC ${C.eda_rise.auc_sick} for SSQ ≥ 40 vs < 20); HR change does not (ρ ${C.hr_change.rho_ssq[0]}). More scene rotation makes the same person sicker (ρ ${C.scene_rotation.rho_within_person[0]} within person). The disorientation rule (mismatch > 15 °/s for 15 s) fired in only ${V.sick.sessionsWithDisorientation} of ${V.sick.sessions} sick and ${V.mild.sessionsWithDisorientation} of ${V.mild.sessions} mild sessions: VR sickness builds from moderate (median ${C.scene_rotation.session_mean_median} °/s), cumulative conflict, which this rule does not score. Proxy: VR, not spaceflight.`; })()
          : 'The data file is stored with Git LFS and could not be downloaded on 14 Nov 2026.'],
    ]],
  ];
  const DS_LABEL = { use: 'In use', plan: 'Planned', proxy: 'Proxy', info: 'Reviewed' };

  function datasets() {
    let h = '<tr><th>Study / dataset</th><th>What is inside</th><th>NeuroShield variable</th><th>Status</th></tr>';
    for (const [group, note, rows] of DATASETS) {
      h += `<tr class="ds-grp"><th colspan="4">${group}${note ? ` <small>${note}</small>` : ''}</th></tr>`;
      for (const [name, url, what, variable, st, why] of rows) {
        h += `<tr><td><a href="${url}" target="_blank" rel="noopener">${name}</a></td><td>${what}</td><td>${variable}</td>
          <td><span class="ds-st ${st}">${DS_LABEL[st]}</span>${why ? `<div class="muted ds-why">${why}</div>` : ''}</td></tr>`;
      }
    }
    $('dsTbl').innerHTML = h;
  }

  function fillCrew(sel) {
    const s = $('crewSel');
    s.innerHTML = '';
    for (const p of NS.logbook.allProfiles()) s.appendChild(U.el('option', { value: p.id }, p.name));
    s.appendChild(U.el('option', { value: '__new' }, '+ New profile…'));
    s.value = sel;
  }

  function setCrew(id) {
    U.store('crew', id);
    NS.logbook.setCrew(id);
    NS.checkin.setCrew(id);
    NS.stream.setCrew(id, NS.logbook.rowsFor(id));
    NS.checkin.render(); // keeps the XP / streak chip in the header on the selected crew member
    refresh();
  }

  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    U.store('tab', name);
    refresh();
  }

  function refresh() {
    const tab = U.store('tab') || 'live';
    if (tab === 'logbook') NS.logbook.render();
    if (tab === 'checkin') NS.checkin.render();
    if (tab === 'live') NS.live.redraw();
    if (tab === 'assistant') NS.assistant.render();
    if (tab === 'bloodwork') NS.bloodwork.render();
    if (tab === 'spacewx') NS.spacewx.render();
  }

  function guide() {
    $('hazards').innerHTML = HAZARDS.map(([t, d, m]) => `<div class="hazard"><b>${t}</b>${d}<div class="m">→ ${m}</div></div>`).join('');
    const tag = (x) => {
      const [src, k] = x.split(':');
      const def = src === 'L' ? D.ranges.live[k] : D.ranges.daily[k];
      return `<span class="ind ${src === 'L' ? 'live' : 'day'}" title="${src === 'L' ? 'Live monitor' : 'Daily logbook'}">${def.label}</span>`;
    };
    $('riskTbl').innerHTML = '<tr><th>HRP risk</th><th>Area</th><th>Monitored by NeuroShield <small class="muted">(<span class="ind live">live</span> <span class="ind day">daily</span>)</small></th><th>Detection</th></tr>'
      + RISKS.map(([r, a, ind, how]) => `<tr><td><b>${r}</b></td><td class="muted">${a}</td><td>${ind.map(tag).join(' ')}</td><td>${how}</td></tr>`).join('');
    // the basis text stays as written; each cited source in it becomes a link (data/reference_ranges.json → source_links)
    const basis = (d) => (d.source_links || []).reduce((t, [cite, url]) => t.replace(cite, `<a href="${url}" target="_blank" rel="noopener">${cite}</a>`), d.source);
    let h = '<tr><th>Indicator</th><th>Unit</th><th>Normal</th><th>Caution</th><th>How measured</th><th>Why it matters in space</th><th>Basis</th></tr>';
    for (const k in D.ranges.live) {
      const d = D.ranges.live[k];
      h += `<tr><td><b>${d.label}</b></td><td>${d.unit}</td><td class="ok">${U.rangeText(d.normal, d.dec)}</td><td class="warn">${U.rangeText(d.warn, d.dec)}</td><td>${d.sensor}</td><td>${d.desc}</td><td class="muted">${basis(d)}</td></tr>`;
    }
    h += '<tr><th colspan="7">Daily logbook indicators</th></tr>';
    for (const k in D.ranges.daily) {
      const d = D.ranges.daily[k];
      if (!d.normal) continue;
      h += `<tr><td><b>${d.label}</b></td><td>${d.unit}</td><td class="ok">${U.rangeText(d.normal, d.dec)}</td><td class="warn">${U.rangeText(d.warn, d.dec)}</td><td>${d.sensor || 'Daily check-in'}</td><td>${d.desc}</td><td class="muted">${basis(d)}</td></tr>`;
    }
    $('guideTbl').innerHTML = h;
  }

  function init() {
    NS.live.init();
    NS.logbook.init();
    NS.checkin.init();
    NS.assistant.init();
    NS.bloodwork.init();
    NS.spacewx.init();
    guide();
    datasets();

    let crew = U.store('crew') || 'A';
    if (!NS.logbook.allProfiles().some((p) => p.id === crew)) { crew = 'A'; U.store('crew', crew); }
    fillCrew(crew);
    NS.logbook.setCrew(crew);
    NS.checkin.setCrew(crew);
    $('crewSel').addEventListener('change', (e) => {
      if (e.target.value === '__new') {
        // demo version: adding crew members is disabled
        e.target.value = NS.logbook.crew;
        $('demoDlg').showModal();
        return;
      }
      setCrew(e.target.value);
    });

    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
    NS.stream.setCrew(crew, NS.logbook.rowsFor(crew));
    NS.live.load(U.store('scenario') || 'fatigue_microsleep');
    NS.checkin.render(); // updates the XP chip
    showTab(U.store('tab') || 'live');
  }

  init();
})();
