# NeuroShield: Crew Health Monitor
**Team Paragon · NASA Space Apps Challenge 2026 · "Create Health Monitoring Software for Astronauts on Space Missions"**

*NeuroShield: see it before you feel it.*

A camera-free, explainable health self-assessment tool for astronauts on station, lunar and Martian missions.
It combines wearable neuro-physiological sensors (EEG, fNIRS, PPG/SpO2, skin conductance, IMU), the core vital signs the challenge names
(blood pressure, heart rate, blood sugar, body temperature, sleep, mood), habitat and suit sensors, and a daily log with photos.
From these it scores health, explains every alert, says what to do and who leads, and finds day-to-day changes against each astronaut's own baseline.

| | |
|---|---|
| **Live demo** | [paragonaerotech.com/spaceappschallenge/app](https://paragonaerotech.com/spaceappschallenge/app/index.html): free, no login, runs in the browser |
| **Video (30 s)** | [youtube.com/watch?v=gFMQSDXIvwI](https://www.youtube.com/watch?v=gFMQSDXIvwI) |
| **Paper (IEEE format)** | [paper/NeuroShield_IEEE.pdf](paper/NeuroShield_IEEE.pdf) · [.docx](paper/NeuroShield_IEEE.docx) · [.html](paper/NeuroShield_IEEE.html) |
| **Presentation (7 slides)** | [presentation/NeuroShield_TeamParagon.pptx](presentation/NeuroShield_TeamParagon.pptx): PowerPoint / Keynote |
| **Challenge** | [spaceappschallenge.org/2026/challenges/health-monitoring-software](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/) |

[![NeuroShield 30-second demo video on YouTube](https://img.youtube.com/vi/gFMQSDXIvwI/hqdefault.jpg)](https://www.youtube.com/watch?v=gFMQSDXIvwI)

*Click the image to watch the video on YouTube.*

---

## Contents
1. [Objectives](#objectives)
2. [Team](#team)
3. [The product: modules](#the-product-modules)
4. [Live Monitor scenarios](#live-monitor-scenarios)
5. [Run it](#run-it)
6. [Data](#data)
7. [Validation](#validation)
8. [Deliverables and how to rebuild them](#deliverables-and-how-to-rebuild-them)
9. [Datasets](#datasets)
10. [References](#references)
11. [Disclaimer](#disclaimer)

---

## Objectives
Missions are getting longer and farther from Earth. NASA's Artemis program has flown a crew around the Moon, and crewed missions to Mars are planned.
The NASA Human Research Program lists five hazards of human spaceflight:
- space radiation;
- isolation and confinement;
- distance from Earth;
- gravity fields;
- hostile closed environments.

These hazards can cause immune changes, bone loss, cardiovascular events, poor nutrition and behavioral health conditions.
On a Mars mission a call to the flight surgeon can take up to 24 minutes each way. Astronauts therefore have to be able to assess their own health and act on the result.

The challenge asks for **a visual tool that helps astronauts assess their own health during space missions and provides guidance on treatments and health improvements**.
The table below shows how NeuroShield answers each part of the objective.

| The challenge asks… | NeuroShield's answer |
|---|---|
| A **visual tool** for astronauts to **assess their own health** | A colour-coded Live Monitor (green / amber / red), a 0–100 health score per body system and overall, and trend charts with the normal and caution limits drawn in |
| **Guidance on treatments and health improvements** | Every alert explains why it fired, what to do now (step by step) and who leads: the flight surgeon on the ISS, or the onboard Crew Medical Officer when Earth is minutes away. The daily routine adds prevention habits (sleep, food, water, exercise) |
| Input by **keyboard text, mouse clicks or camera images** | Daily log form (keyboard), one-click routine and self-rating buttons (mouse), a 10-trial reaction test (PVT), and photo upload (skin, eye/OCT, wound, ultrasound) |
| **Any data that represents a health indicator** (e.g. blood sugar in mg/dL, ultrasound images) | 26 live signals and 28 daily indicators in their real units (mg/dL, mmHg, bpm, %, ms, ppm, mGy…), plus photos compared side by side over time |
| Use **NASA Human Research Program resources** and other space agencies to see how hazards affect health | Every indicator is mapped to the 5 hazards and the HRP risks (Guide tab). Real NASA data is used: ISS cabin CO2 and radiation (OSDR EDA), Inspiration4 bloodwork (OSDR OSD-569/575) and NOAA space weather. Sources also include the Canadian Space Agency and WHO |
| *Which measurements can be performed in space?* | Only measurements possible with wearables, a fingerstick, saliva and urine kits, a fundoscope/OCT or a handheld ultrasound. The Guide explains how each one is measured on board |
| *Why is an exam needed? How do hazards affect these indicators?* | Each indicator in the Guide states which hazard changes it and why (e.g. fluid shift → optic-disc swelling, CO2 → headache, microgravity → bone loss and urinary calcium) |
| *When might a result warrant attention from the crew or flight surgeons?* | Every indicator has normal and caution limits with a linked source. 21 rules add persistence, hysteresis and root-cause suppression, so alerts come early without flooding the crew |
| *What actions can prevent a critical condition?* | Rule-specific actions (mask up, move to the storm shelter, 15 g fast carbs, stop the EVA and repressurise…), plus logbook episodes that catch slow changes (sleep debt, SANS signs, weight loss) days before they become critical |
| **User interface design**: animations, interactivity, e.g. a clickable human figure | A clickable body map coloured by each system's score, live animated charts, a mission switch (ISS / Moon / Mars), hover explanations, a gamified routine (XP, streaks, badges) and reminders |

## Team
**Team Paragon**

| Member | Role |
|---|---|
| **Mehmet Ulaş Çakır** | Team Lead · Entrepreneur & Innovator |
| **Ece Özge Çakır** | Researcher · Robert College, 10th-grade student |
| **Dr. Rıfat Uğurlutan** | Consultant · Aerospace Medicine & Biophysics |
| **Dr. Emre Ayvaz** | Consultant |

## The product: modules
NeuroShield is a single web app with seven tabs. It has no build step and no dependencies, and it works offline.

| Module (tab) | What it does | Which objective it serves |
|---|---|---|
| **Live Monitor** | 26 live signal cards with average, min and max values and dashed reference limits. It also shows the health score gauge, system bars, a clickable body map, alerts with guidance and an event log. Scenarios can be replayed for ISS / Moon / Mars / Lab and for crew members A–D. There is also a WebSocket input (`⚡ Device`) for the real wearable | Visual self-assessment, early warning, treatment guidance |
| **Daily Check-in** | A timed morning routine: vitals 07:00, glucose 07:15, saliva 07:20, sleep 07:30, mood 07:45, reaction test 09:00, live session 10:00, food 13:00, exercise 15:00, water 20:00. It includes "How?" step-by-step instructions, reminders with snooze, XP, streaks and badges, a PVT reaction test and the daily log form with photo upload | Data input (keyboard, mouse, images), prevention habits |
| **Crew Logbook** | 60-day personal history with a trend chart and limits, an anomaly heat map, detected episodes with advice, CSV export, and an image log that shows each photo beside the earlier one of the same kind | Spotting slow changes against the astronaut's own baseline |
| **Bloodwork** | Real Inspiration4 complete blood count and metabolic panel (NASA OSDR OSD-569 / OSD-575). Each astronaut is scored against their own preflight baseline | Real NASA data, lab-based indicators |
| **Space Weather** | Live GOES proton flux from NOAA SWPC (a 7-day snapshot is bundled for offline use), the NOAA S-scale and what each level means for EVAs | Radiation hazard awareness |
| **AI Assistant** | Offline demo chat. Answers are assembled by rules from the crew member's logbook, episodes, 7-day trends, radiation budget and live session. It also describes the plan for an onboard small language model (MedGemma) | Guidance in plain language when Earth is far |
| **Guide** | Explains every indicator: reference ranges, how it is measured and the basis with a linked source. It also holds the HRP hazard and risk coverage table and the dataset table | Answers the challenge's "which / why / when / what" questions |

Code modules (`app/js/`):

| File | Role |
|---|---|
| `stream.js` | Replays a 1 Hz scenario (or live WebSocket samples) and keeps windowed statistics |
| `rules.js` | 21 condition rules: hypoxia, cabin pressure dropping, G-LOC precursor, drowsiness/microsleep, cognitive overload, spatial disorientation, high CO2, CO, low glucose, fever, EVA decompression sickness, suit leak, cabin heat/humidity, cold cabin, noise, solar particle event, high BP, acute stress, low BP/orthostatic stress, rapid HR, very slow HR. Each has evidence-based guidance |
| `score.js` | Indicator → body system → overall health score (0–100) |
| `bodymap.js` | Clickable human figure coloured by system score |
| `live.js`, `chart.js` | Live Monitor view and the dependency-free canvas charts |
| `checkin.js` | Daily routine, reminders, gamification, PVT, daily log form |
| `images.js` | Photo storage (IndexedDB, downscaled to ≤1024 px), image log and side-by-side comparison |
| `logbook.js`, `anomaly.js` | Personal logbook and anomaly detection (robust z-scores, drift, persistence, episode classification) |
| `bloodwork.js`, `spacewx.js`, `assistant.js` | Bloodwork, Space Weather and AI Assistant tabs |
| `lab.js`, `real_rec.js` | The "Lab" mission: real human recordings, calibration and validation results |
| `app.js`, `util.js` | App shell, crew and profile selection, Guide page, shared helpers |

## Live Monitor scenarios
Each of the 12 scenarios is generated for three missions: ISS (microgravity, 0.5 s signal delay), Moon (0.17 g, 1.3 s) and Mars (0.38 g, about 12 min one way).
That gives 36 runs of 900 s at 1 Hz, and each one is lived by four crew members (A–D), who have their own baselines and react in their own way.
A fourth mission, **Lab**, replays real human recordings.

- **Nominal day.** Routine work, used to learn the normal ranges. *Moon:* heart rate and blood pressure sit a little higher because gravity pulls blood to the legs again, and background radiation is higher. *Mars:* the cardiovascular system carries more load, and ground support is 12 minutes away.
- **Fatigue → microsleep.** EEG slowing rises minutes before head nods and microsleeps. *ISS:* night-shift robotic-arm monitoring. *Moon:* 14 days of lunar night blur the sleep–wake rhythm. *Mars:* the 24 h 39 min sol keeps shifting the schedule, so drowsiness starts earlier.
- **Cognitive overload.** The workload index, HR, BP and skin conductance rise while HRV falls. *ISS:* docking a visiting vehicle with several malfunctions. *Moon:* a manual landing among boulders after a landing sensor fails. *Mars:* a crewmate is injured, and with a 24-min round trip the crew handles the emergency alone.
- **Hypoxia (slow leak).** ppO2, SpO2 and brain oxygenation fall until the crew dons O2 masks at 11:30. *ISS:* undetected depressurisation. *Moon:* abrasive dust wears a hatch seal. *Mars:* a seal cracks in the cold Martian night.
- **High-G / G-LOC precursor.** Brain oxygenation (fNIRS) falls under sustained +Gz. *ISS:* return to Earth after 6 months with an abort-profile peak. *Moon:* Orion's 11 km/s skip entry. *Mars:* the entry G is lower than on Earth, but a crew deconditioned by 7 months in microgravity tolerates it less.
- **Spatial disorientation.** *ISS:* a visual reorientation illusion between modules with different "up" directions. *Moon:* on a rover traverse, weak gravity cues and long shadows make slopes hard to judge. *Mars:* the inner ear is still adapting to 0.38 g after landing.
- **CO2 build-up (scrubber failure).** Respiration, HR and BP rise, then drowsiness and headache markers follow. *ISS:* the CDRA fails. *Moon:* lunar dust clogs the scrubber. *Mars:* the scrubber fails and no resupply is possible.
- **Hypoglycaemia after exercise.** Exercise after a skipped meal drives glucose below 70 and then 54 mg/dL; it recovers after 15 g of carbohydrate. *Moon:* shovelling regolith. *Mars:* a treadmill session in 0.38 g.
- **Fever / immune response.** A latent virus reactivates (time-compressed): temperature, HR and respiration rise and HRV falls. *Moon:* evacuation would take about 3 days. *Mars:* no evacuation is possible, so the Crew Medical Officer treats on site.
- **Solar particle event.** *ISS:* the magnetosphere deflects most protons, so the dose rate rises only into the caution band. *Moon:* with no magnetosphere the full storm arrives and the crew moves to the storm shelter. *Mars:* the thin atmosphere absorbs part of it, but the dose still passes the alert limit.
- **EVA: decompression sickness risk.** After a shortened or skipped O2 prebreathe the tissue N2 ratio is high. *ISS:* 29.6 kPa suit pressure, resolved by a suit pressure bump. *Moon / Mars:* the habitat runs at 70.3 kPa, but walking in partial gravity works the joints harder than floating.
- **Cabin thermal failure.** *ISS:* a coolant pump fails, and cabin temperature, humidity and fan noise rise, followed by heart rate and body temperature. *Moon:* a radiator pump fails at lunar noon (+120 °C outside). *Mars:* the heater bus fails at night (−80 °C outside), and shivering raises HR and BP.

**Lab mission (real recordings).** The monitor shows only the signals each dataset actually records.
- **Stress protocol** (PhysioNet Non-EEG): rest, treadmill, emotional and mental-arithmetic stress. HR, SpO2 and skin conductance.
- **Tilt table & stand-up** (PhysioNet PRCP): supine rest, slow and fast head-up tilt, and standing up. This is the closest Earth analogue of re-entering gravity. Beat-to-beat BP, HR and +Gz from the table angle.
- **ICU bedside vitals** (PhysioNet BIDMC): 8-minute recordings from intensive-care patients, a clinical reference. HR, SpO2 and respiration.
- **VR navigation, cybersickness** (Wang et al. 2023): the scene turns while the body stays still, a visual–vestibular conflict like space motion sickness. Skin conductance, HR, the scene rotation rate and the sickness score (SSQ).

## Run it
No install and no build step. Open `app/index.html` in Chrome, Edge, Firefox or Safari, or use the [live demo](https://paragonaerotech.com/spaceappschallenge/app/index.html).
To serve it locally:
```bash
./start.sh            # serves on http://localhost:8000/app/
```

## Data
Regenerate the synthetic dataset (deterministic, Python 3 standard library only):
```bash
python3 data/generator/generate_dataset.py
```
* `data/reference_ranges.json`: indicator definitions, normal and caution limits, and the literature basis with source links (single source of truth)
* `data/live/<scenario>.csv`: 36 runs × 900 s at 1 Hz with columns `t, HR, RMSSD, SBP, DBP, SPO2, RR, TEMP, GLU, EEG_FI, EEG_WL, RSO2, GSR, NOD, GZ, VMIS, CO2, PPO2, PCAB, CO, DOSE, TR, PSUIT, NEUT, CABT, RH, SPL, label, phase`. Moon and Mars runs are prefixed `moon_` / `mars_`. `data/live/crew_A…D/` holds the same runs lived by each crew member
* `data/logbook/crew_daily_log.csv`: 4 crew × 60 mission days, 28 daily indicators. `data/logbook/injected_anomalies.json` is the ground truth
* `app/js/data_bundle.js`: all of the above, bundled for the app

The live and logbook signals are **synthetic**: they come from literature-informed models and are not astronaut measurements.
Some parts use **real** data:
- the logbook's cabin CO2 and daily dose are 60 real ISS days from NASA OSDR EDA, mission RR-7 (Jul–Sep 2018), including a real CO2 excursion;
- the Bloodwork tab uses Inspiration4 clinical panels;
- the Space Weather tab uses live NOAA data;
- the Lab mission replays open human recordings.

Real-data pipeline:
```bash
python3 data/generator/fetch_osdr_eda.py          # ISS cabin + radiation (NASA OSDR EDA)
python3 data/generator/build_real_data.py         # Inspiration4 bloodwork + NOAA snapshot
sh data/generator/fetch_lab_datasets.sh           # open Earth-lab datasets into data/external/
uv run --python 3.12 --with wfdb --with scipy --with xlrd --with pandas python data/generator/build_lab_datasets.py
node tools/validate_real.js                       # → app/js/real_rec.js
```
The Tufts fNIRS2MW files are hosted on Box and cannot be fetched by script. Save `sub_*.csv` by hand into `data/external/fnirs2mw/`.

The sample health images for crew A (`app/img/samples/`) are drawn by code (`data/generator/make_sample_images.py`) and are labelled "illustrative sample". They are not real patient images.

## Validation
**Synthetic ground truth** (`node tools/evaluate.js`):
- **Live rules** (36 runs = 12 scenarios × ISS/Moon/Mars, 32,400 s): sensitivity **93.3 %**, specificity **90.1 %** per second; no alerts in any nominal run.
- **Health score:** 96.0 ± 11.4 in nominal seconds vs 60.2 ± 17.5 in abnormal ones.
- **Logbook anomaly detector:** **18/18** injected events found, with 2 unmatched episodes over 240 crew-days.

**Real recordings** (`node tools/validate_real.js`):
- **Stress rule:** active 22.8 % of cognitive-stress time vs 3.6 % at rest (Non-EEG, 20 people).
- **Orthostatic rule:** fired in 5 of 59 head-up manoeuvres of healthy volunteers and 0 % of supine time (PRCP).
- **ICU data:** alerts in 14 of 53 ICU patients, mostly low SpO2 (BIDMC).
- **Cybersickness:** skin-conductance rise tracks sickness, ρ 0.38 and AUC 0.78.

**Calibration:**
- HRV normal band from 54 healthy 24-h ECGs (RMSSD p10 = 13 ms, NSR).
- EEG drowsiness index 1.61× alert level, AUC 0.70.
- Sleep 7.3 h at 92 % efficiency (Sleep-EDF).
- fNIRS oxygenation rises with n-back workload, ρ 0.73 (Tufts).

## Deliverables and how to rebuild them
| Deliverable | File | Rebuild |
|---|---|---|
| Evaluation numbers + paper figures | `paper/results.json`, `paper/figures/` | `node tools/evaluate.js` (`CREW=A…D` for one crew member) |
| IEEE-format paper | [`paper/NeuroShield_IEEE.pdf`](paper/NeuroShield_IEEE.pdf), [`.docx`](paper/NeuroShield_IEEE.docx) | `node tools/build_paper.js && node tools/build_paper_docx.js` |
| 30-second demo video | [`presentation/NeuroShield_30s.mp4`](presentation/NeuroShield_30s.mp4), `.srt` · [YouTube](https://www.youtube.com/watch?v=gFMQSDXIvwI) | `KOKORO_DIR=/path/to/models node tools/build_video30.js /tmp/v30` |
| Slide deck (7 slides) | [`presentation/NeuroShield_TeamParagon.pptx`](presentation/NeuroShield_TeamParagon.pptx) | `node tools/capture_deck_assets.js && node tools/build_deck.js` |
| Long demo video (~5.5 min) | `presentation/NeuroShield_demo.mp4`, `.srt` | `KOKORO_DIR=/path/to/models KOKORO_VOICE=af_heart node tools/build_video.js /tmp/nsvideo` |

The narration uses the open-source **Kokoro-82M** text-to-speech model (Apache-2.0). Download `kokoro-v1.0.onnx` and `voices-v1.0.bin` from
[kokoro-onnx model-files-v1.0](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0).
The video builds need ffmpeg, uv and the npm packages `playwright-core` and `sharp`. The long video and the deck also need macOS (Keynote, swift) and `pptxgenjs`, `docx`, `react`, `react-dom` and `react-icons`.

## Datasets
Every dataset reviewed for the project, as listed in the app's Guide → Datasets table. Raw files are not redistributed; each keeps its own licence.

Status:
- **In use:** the data drives the app or its validation.
- **Planned:** next step.
- **Proxy:** an Earth analogue, not spaceflight data.
- **Reviewed:** checked but not used.

**NASA space data**

| Dataset | What it contains | Used for | Status |
|---|---|---|---|
| [NASA OSDR Environmental Data Application (EDA)](https://visualization.osdr.nasa.gov/eda/) | Real ISS cabin CO2, temperature and humidity (every 5 min) and daily radiation dose (galactic cosmic rays, South Atlantic Anomaly, total) from rodent-research missions; API + data tables. | Cabin CO2, temperature, humidity and ISS dose baselines; 60-day logbook CO2 and daily dose (mission RR-7, Jul–Sep 2018, incl. a real CO2 excursion) | In use |
| [NASA OSDR RadLab](https://visualization.osdr.nasa.gov/radlab/) | ISS radiation dose and flux from several space agencies’ detectors; portal + API. | Radiation budget | Reviewed |
| [Inspiration4 / SOMA in OSDR (OSD-569, OSD-575)](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569) | Clinical and omics data of the 4 civilian Inspiration4 astronauts (2021); complete blood count and metabolic panel at 7 timepoints. Raw sequencing data needs approval. | Bloodwork tab (each crew member A–D stands in for one Inspiration4 astronaut) | In use |
| [NOAA SWPC GOES integral proton flux](https://services.swpc.noaa.gov/json/goes/primary/integral-protons-7-day.json) | Live 7-day proton flux from the GOES satellites (≥10 MeV, ≥100 MeV). | Space Weather tab (NOAA S-scale) | In use |

**Brain and cognition**

| Dataset | What it contains | Used for | Status |
|---|---|---|---|
| [EEG driver drowsiness dataset](https://figshare.com/articles/dataset/EEG_driver_drowsiness_dataset/14273687) | EEG from 11 people labelled alert or drowsy (2,022 three-second, 30-channel epochs at 128 Hz); Matlab file; CC BY 4.0. | EEG drowsiness index (EEG_FI) | In use |
| [Cao et al. 2019 — Multi-channel EEG during a sustained-attention driving task](https://figshare.com/articles/dataset/Multi-channel_EEG_recordings_during_a_sustained-attention_driving_task/6427334) | 62 sessions of 32-channel EEG from 27 people in a 90-min driving task with lane drifts and reaction times; CC BY 4.0. 64 files, 19.6 GB. | EEG drowsiness index | Reviewed |
| [COG-BCI database](https://zenodo.org/records/7413650) | EEG + ECG from 29 people in 3 sessions: NASA MATB-II, N-back, PVT and Flanker tasks with KSS sleepiness and workload ratings. 31.7 GB (≈1.1 GB per person). | Workload index, PVT reaction test | Planned |
| [Tufts fNIRS2MW](https://tufts-hci-lab.github.io/code_and_datasets/fNIRS2MW.html) | Forehead fNIRS (2 optode pairs, oxy/deoxy-haemoglobin, 5.2 Hz) from 68 people doing 0- to 3-back blocks; CC BY 4.0. Box download, by hand. | Cerebral oxygenation (rSO2), workload | In use |
| [Shin et al. 2018 — Simultaneous EEG + NIRS](http://doc.ml.tu-berlin.de/simultaneous_EEG_NIRS/) | 26 people doing n-back and two other cognitive tasks with simultaneous EEG and NIRS (EEG 5.67 GB, NIRS 760 MB). | Cerebral oxygenation + EEG | Planned |

**Heart, blood pressure and skin conductance**

| Dataset | What it contains | Used for | Status |
|---|---|---|---|
| [PhysioNet Non-EEG Dataset](https://physionet.org/content/noneeg/1.0.0/) | Wrist sensors on 20 people (EDA, temperature, acceleration at 8 Hz; HR, SpO2 at 1 Hz) through rest, treadmill, emotional and cognitive stress. 3.7 MB. | EDA, HR, SpO2 | In use |
| [WESAD (UCI)](https://archive.ics.uci.edu/dataset/465/wesad+wearable+stress+and+affect+detection) | Wrist + chest sensors on 15 people (neutral, stress, amusement): EDA, ECG, BVP, temperature, acceleration. One 2.1 GB ZIP. | EDA, HRV, stress | Planned |
| [PhysioNet BIDMC PPG and Respiration](https://physionet.org/content/bidmc/1.0.0/) | 53 eight-minute ICU recordings: PPG, ECG and respiration at 125 Hz; HR, RR and SpO2 at 1 Hz (CSV). Hospital patients, so a clinical reference. | HR, SpO2, respiration rate | In use |
| [PhysioNet Normal Sinus Rhythm RR Interval Database](https://physionet.org/content/nsr2db/1.0.0/) | Beat-to-beat intervals from 54 long-term ECGs of healthy people (28–76 y); 24-h HRV rhythms. 11.1 MB. | HRV (RMSSD) | In use |
| [PhysioNet PRCP — Physiologic Response to Changes in Posture](https://physionet.org/content/prcp/1.0.0/) | ECG + continuous arterial blood pressure from 10 healthy people during slow tilt, fast tilt and standing (250 Hz, beat annotations). 54.1 MB. | Systolic BP, HR, +Gz (orthostatic response) | In use |
| [PhysioNet Cerebral Vasoregulation in Diabetes](https://physionet.org/content/cerebral-vasoreg-diabetes/1.0.0/) | ECG, blood pressure, transcranial Doppler brain blood flow and CO2 during head-up tilt; use the control group only. 3.0 GB. | Systolic BP, brain blood flow, CO2 | Planned |

**Sleep, head nods and vestibular mismatch** No open, labelled dataset exists for head nods or vestibular mismatch, so the last three rows are proxies; the VR cybersickness set is used as one (scene motion with a still body).

| Dataset | What it contains | Used for | Status |
|---|---|---|---|
| [PhysioNet Sleep-EDF Expanded](https://physionet.org/content/sleep-edfx/1.0.0/) | 197 full-night recordings with EEG, EOG, chin EMG and expert-scored sleep stages (8.1 GB); NeuroShield uses only the 153 sleep-cassette hypnograms. | Sleep duration, sleep efficiency | In use |
| [Head Motion EMA (G-Node GIN)](https://gin.g-node.org/phausamann/head-motion-ema) | Head and waist IMUs on 10 people, accelerometer and gyroscope at 100 Hz over a day (Hausamann et al. 2019); no drowsiness labels. | Head nods | Proxy |
| [PhysioNet Noise Enhancement of Sensorimotor Function](https://physionet.org/content/nesfdb/1.0.0/) | Postural sway of 15 young and 12 older healthy people, with and without sub-threshold foot vibration. 32.2 MB. | Vestibular mismatch (balance) | Proxy |
| [Cybersickness dataset (Wang et al., arXiv 2023)](https://github.com/coreturn/Cybersickness_Dataset) | VR navigation: 159 four-minute sessions of 54 people with wrist EDA and HR (Empatica E4), head pose, scene rotation and a sickness questionnaire (SSQ) after each; preprint, lower rigour. 416 MB. | Vestibular mismatch (sensory conflict) | In use |

## References
### Paper references
The 68 references of the paper, in the paper's citation order ([paper/NeuroShield_IEEE.pdf](paper/NeuroShield_IEEE.pdf)).

1. NASA Space Apps Challenge, "Create Health Monitoring Software for Astronauts on Space Missions," 2026 challenge statement. [www.spaceappschallenge.org/2026/challenges/health-monitoring-software/](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)
2. NASA Human Research Program, "Human Research Program risks," NASA, 2025. [www.nasa.gov/hrp/risks](https://www.nasa.gov/hrp/risks)
3. NASA Human Health and Performance, "Human System Risks," NASA, 2025. [www.nasa.gov/hhp/human-system-risks/](https://www.nasa.gov/hhp/human-system-risks/)
4. A. G. Lee et al., "Spaceflight associated neuro-ocular syndrome (SANS) and the neuro-ophthalmologic effects of microgravity: A review and an update," npj Microgravity, vol. 6, art. 7, 2020. [doi.org/10.1038/s41526-020-0097-9](https://doi.org/10.1038/s41526-020-0097-9)
5. Z. S. Patel et al., "Red risks for a journey to the red planet: The highest priority human health risks for a mission to Mars," npj Microgravity, vol. 6, art. 33, 2020. [doi.org/10.1038/s41526-020-00124-6](https://doi.org/10.1038/s41526-020-00124-6)
6. E. Afshinnekoo et al., "Fundamental biological features of spaceflight: Advancing the field to enable deep-space exploration," Cell, vol. 183, no. 5, pp. 1162–1184, 2020. [doi.org/10.1016/j.cell.2020.10.050](https://doi.org/10.1016/j.cell.2020.10.050)
7. F. E. Garrett-Bakelman et al., "The NASA Twins Study: A multidimensional analysis of a year-long human spaceflight," Science, vol. 364, no. 6436, art. eaau8650, 2019. [doi.org/10.1126/science.aau8650](https://doi.org/10.1126/science.aau8650)
8. P. D. Hodkinson, R. A. Anderton, B. N. Posselt, and K. J. Fong, "An overview of space medicine," Br. J. Anaesth., vol. 119, suppl. 1, pp. i143–i153, 2017. [doi.org/10.1093/bja/aex336](https://doi.org/10.1093/bja/aex336)
9. R. T. Scott et al., "Biomonitoring and precision health in deep space supported by artificial intelligence," Nat. Mach. Intell., vol. 5, no. 3, pp. 196–207, 2023. [doi.org/10.1038/s42256-023-00617-5](https://doi.org/10.1038/s42256-023-00617-5)
10. European Parliament and Council, "Regulation (EU) 2019/2144 on type-approval requirements for motor vehicles … as regards their general safety and the protection of vehicle occupants and vulnerable road users," Off. J. Eur. Union, L 325, 2019. [eur-lex.europa.eu/eli/reg/2019/2144/oj](https://eur-lex.europa.eu/eli/reg/2019/2144/oj)
11. R. L. Hughson et al., "Increased postflight carotid artery stiffness and inflight insulin resistance resulting from 6-mo spaceflight in male and female astronauts," Am. J. Physiol. Heart Circ. Physiol., vol. 310, no. 5, pp. H628–H638, 2016. [doi.org/10.1152/ajpheart.00802.2015](https://doi.org/10.1152/ajpheart.00802.2015)
12. R. M. Baevsky et al., "Autonomic cardiovascular and respiratory control during prolonged spaceflights aboard the International Space Station," J. Appl. Physiol., vol. 103, no. 1, pp. 156–161, 2007. [doi.org/10.1152/japplphysiol.00137.2007](https://doi.org/10.1152/japplphysiol.00137.2007)
13. R. Freeman et al., "Consensus statement on the definition of orthostatic hypotension, neurally mediated syncope and the postural tachycardia syndrome," Clin. Auton. Res., vol. 21, no. 2, pp. 69–72, 2011. [doi.org/10.1007/s10286-011-0119-5](https://doi.org/10.1007/s10286-011-0119-5)
14. P. K. Whelton et al., "2017 ACC/AHA/AAPA/ABC/ACPM/AGS/APhA/ASH/ASPC/NMA/PCNA guideline for the prevention, detection, evaluation, and management of high blood pressure in adults," Hypertension, vol. 71, no. 6, pp. e13–e115, 2018. [doi.org/10.1161/HYP.0000000000000065](https://doi.org/10.1161/HYP.0000000000000065)
15. F. Shaffer and J. P. Ginsberg, "An overview of heart rate variability metrics and norms," Front. Public Health, vol. 5, art. 258, 2017. [doi.org/10.3389/fpubh.2017.00258](https://doi.org/10.3389/fpubh.2017.00258)
16. A. C. Stahn et al., "Increased core body temperature in astronauts during long-duration space missions," Sci. Rep., vol. 7, art. 16180, 2017. [doi.org/10.1038/s41598-017-15560-w](https://doi.org/10.1038/s41598-017-15560-w)
17. B. E. Crucian et al., "Immune system dysregulation during spaceflight: Potential countermeasures for deep space exploration missions," Front. Immunol., vol. 9, art. 1437, 2018. [doi.org/10.3389/fimmu.2018.01437](https://doi.org/10.3389/fimmu.2018.01437)
18. NASA, "Immune Biomarkers," Artemis II research investigation, 2026. [www.nasa.gov/reference/immune-biomarkers](https://www.nasa.gov/reference/immune-biomarkers)
19. S. M. Smith et al., "Bone metabolism and renal stone risk during International Space Station missions," Bone, vol. 81, pp. 712–720, 2015. [doi.org/10.1016/j.bone.2015.10.002](https://doi.org/10.1016/j.bone.2015.10.002)
20. J. A. Loehr et al., "Physical training for long-duration spaceflight," Aerosp. Med. Hum. Perform., vol. 86, no. 12, suppl., pp. A14–A23, 2015. [doi.org/10.3357/amhp.ec03.2015](https://doi.org/10.3357/amhp.ec03.2015)
21. T. Battelino et al., "Clinical targets for continuous glucose monitoring data interpretation: Recommendations from the international consensus on time in range," Diabetes Care, vol. 42, no. 8, pp. 1593–1603, 2019. [doi.org/10.2337/dci19-0028](https://doi.org/10.2337/dci19-0028)
22. American Diabetes Association Professional Practice Committee, "6. Glycemic goals and hypoglycemia: Standards of Care in Diabetes—2025," Diabetes Care, vol. 48, suppl. 1, pp. S128–S145, 2025. [doi.org/10.2337/dc25-s006](https://doi.org/10.2337/dc25-s006)
23. L. K. Barger et al., "Prevalence of sleep deficiency and use of hypnotic drugs in astronauts before, during, and after spaceflight: An observational study," Lancet Neurol., vol. 13, no. 9, pp. 904–912, 2014. [doi.org/10.1016/s1474-4422(14)70122-x](https://doi.org/10.1016/s1474-4422%2814%2970122-x)
24. M. Basner and D. F. Dinges, "Maximizing sensitivity of the psychomotor vigilance test (PVT) to sleep loss," Sleep, vol. 34, no. 5, pp. 581–591, 2011. [doi.org/10.1093/sleep/34.5.581](https://doi.org/10.1093/sleep/34.5.581)
25. M. Basner et al., "Development and validation of the Cognition test battery for spaceflight," Aerosp. Med. Hum. Perform., vol. 86, no. 11, pp. 942–952, 2015. [doi.org/10.3357/amhp.4343.2015](https://doi.org/10.3357/amhp.4343.2015)
26. J. Stuster, "Behavioral issues associated with long-duration space expeditions: Review and analysis of astronaut journals," NASA, Houston, TX, USA, Tech. Rep. NASA/TM-2010-216130, 2010. [ntrs.nasa.gov/citations/20100026549](https://ntrs.nasa.gov/citations/20100026549)
27. N. Kanas and D. Manzey, Space Psychology and Psychiatry, 2nd ed. Dordrecht, The Netherlands: Springer, 2008. [doi.org/10.1007/978-1-4020-6770-9](https://doi.org/10.1007/978-1-4020-6770-9)
28. L. Frisén, "Swelling of the optic nerve head: A staging scheme," J. Neurol. Neurosurg. Psychiatry, vol. 45, no. 1, pp. 13–18, 1982. [doi.org/10.1136/jnnp.45.1.13](https://doi.org/10.1136/jnnp.45.1.13)
29. J. Law et al., "Relationship between carbon dioxide levels and reported headaches on the International Space Station," J. Occup. Environ. Med., vol. 56, no. 5, pp. 477–483, 2014. [doi.org/10.1097/JOM.0000000000000158](https://doi.org/10.1097/JOM.0000000000000158)
30. NASA Johnson Space Center, "Spacecraft Maximum Allowable Concentrations for Airborne Contaminants," JSC-20584, Houston, TX, USA, 2008. [ntrs.nasa.gov/citations/20090014213](https://ntrs.nasa.gov/citations/20090014213)
31. NASA, "NASA Spaceflight Human-System Standard, Vol. 1: Crew Health and Vol. 2: Human Factors, Habitability, and Environmental Health," NASA-STD-3001. [www.nasa.gov/reference/nasa-std-3001v2](https://www.nasa.gov/reference/nasa-std-3001v2)
32. C. Zeitlin et al., "Measurements of energetic particle radiation in transit to Mars on the Mars Science Laboratory," Science, vol. 340, no. 6136, pp. 1080–1084, 2013. [doi.org/10.1126/science.1235989](https://doi.org/10.1126/science.1235989)
33. F. A. Cucinotta and M. Durante, "Cancer risk from exposure to galactic cosmic rays: Implications for space exploration by human beings," Lancet Oncol., vol. 7, no. 5, pp. 431–435, 2006. [doi.org/10.1016/s1470-2045(06)70695-7](https://doi.org/10.1016/s1470-2045%2806%2970695-7)
34. T. Berger et al., "Long term variations of galactic cosmic radiation on board the International Space Station, on the Moon and on the surface of Mars," J. Space Weather Space Clim., vol. 10, art. 34, 2020. [doi.org/10.1051/swsc/2020028](https://doi.org/10.1051/swsc/2020028)
35. World Health Organization, Pulse Oximetry Training Manual. Geneva, Switzerland: WHO, 2011. [cdn.who.int/media/docs/default-source/patient-safety/pulse-oximetry/who-ps-pulse-oxymetry-training-manual-en.pdf](https://cdn.who.int/media/docs/default-source/patient-safety/pulse-oximetry/who-ps-pulse-oxymetry-training-manual-en.pdf)
36. Federal Aviation Administration, "Aircraft operations at altitudes above 25,000 feet mean sea level or Mach numbers greater than .75," Advisory Circular AC 61-107B, 2013. [www.faa.gov/documentLibrary/media/Advisory_Circular/AC_61-107B_CHG_1.pdf](https://www.faa.gov/documentLibrary/media/Advisory_Circular/AC_61-107B_CHG_1.pdf)
37. J. Conkin, "Preventing decompression sickness over three decades of extravehicular activity," NASA Johnson Space Center, Houston, TX, USA, Tech. Paper NASA/TP-2011-216147, 2011. [purl.fdlp.gov/GPO/gpo23332](https://purl.fdlp.gov/GPO/gpo23332)
38. S. K. L. Lal and A. Craig, "A critical review of the psychophysiology of driver fatigue," Biol. Psychol., vol. 55, no. 3, pp. 173–194, 2001. [doi.org/10.1016/s0301-0511(00)00085-5](https://doi.org/10.1016/s0301-0511%2800%2900085-5)
39. B. T. Jap, S. Lal, P. Fischer, and E. Bekiaris, "Using EEG spectral components to assess algorithms for detecting fatigue," Expert Syst. Appl., vol. 36, no. 2, pp. 2352–2359, 2009. [doi.org/10.1016/j.eswa.2007.12.043](https://doi.org/10.1016/j.eswa.2007.12.043)
40. A. Gevins and M. E. Smith, "Neurophysiological measures of cognitive workload during human–computer interaction," Theor. Issues Ergon. Sci., vol. 4, no. 1–2, pp. 113–131, 2003. [doi.org/10.1080/14639220210159717](https://doi.org/10.1080/14639220210159717)
41. H. Ayaz et al., "Optical brain monitoring for operator training and mental workload assessment," NeuroImage, vol. 59, no. 1, pp. 36–47, 2012. [doi.org/10.1016/j.neuroimage.2011.06.023](https://doi.org/10.1016/j.neuroimage.2011.06.023)
42. Z. Huang et al., "The Tufts fNIRS mental workload dataset & benchmark for brain-computer interfaces that generalize," in Proc. NeurIPS Datasets and Benchmarks Track, 2021. [tufts-hci-lab.github.io/code_and_datasets/fNIRS2MW.html](https://tufts-hci-lab.github.io/code_and_datasets/fNIRS2MW.html)
43. A. Kikukawa, A. Kobayashi, and Y. Miyamoto, "Monitoring of pre-frontal oxygen status in helicopter pilots using near-infrared spectrophotometers," Dyn. Med., vol. 7, art. 10, 2008. [doi.org/10.1186/1476-5918-7-10](https://doi.org/10.1186/1476-5918-7-10)
44. J. M. Murkin and M. Arango, "Near-infrared spectroscopy as an index of brain and tissue oxygenation," Br. J. Anaesth., vol. 103, suppl. 1, pp. i3–i13, 2009. [doi.org/10.1093/bja/aep299](https://doi.org/10.1093/bja/aep299)
45. J. E. Whinnery and E. M. Forster, "The +Gz-induced loss of consciousness curve," Extrem. Physiol. Med., vol. 2, art. 19, 2013. [doi.org/10.1186/2046-7648-2-19](https://doi.org/10.1186/2046-7648-2-19)
46. W. Boucsein, Electrodermal Activity, 2nd ed. New York, NY, USA: Springer, 2012. [doi.org/10.1007/978-1-4614-1126-0](https://doi.org/10.1007/978-1-4614-1126-0)
47. G. Clément and M. F. Reschke, Neuroscience in Space. New York, NY, USA: Springer, 2008. [doi.org/10.1007/978-0-387-78950-7](https://doi.org/10.1007/978-0-387-78950-7)
48. R. S. Kennedy, N. E. Lane, K. S. Berbaum, and M. G. Lilienthal, "Simulator sickness questionnaire: An enhanced method for quantifying simulator sickness," Int. J. Aviat. Psychol., vol. 3, no. 3, pp. 203–220, 1993. [doi.org/10.1207/s15327108ijap0303_3](https://doi.org/10.1207/s15327108ijap0303_3)
49. C. Leys, C. Ley, O. Klein, P. Bernard, and L. Licata, "Detecting outliers: Do not use standard deviation around the mean, use absolute deviation around the median," J. Exp. Soc. Psychol., vol. 49, no. 4, pp. 764–766, 2013. [doi.org/10.1016/j.jesp.2013.03.013](https://doi.org/10.1016/j.jesp.2013.03.013)
50. B. Iglewicz and D. C. Hoaglin, How to Detect and Handle Outliers. Milwaukee, WI, USA: ASQC Quality Press, 1993. (print book, no online copy)
51. V. Chandola, A. Banerjee, and V. Kumar, "Anomaly detection: A survey," ACM Comput. Surv., vol. 41, no. 3, art. 15, 2009. [doi.org/10.1145/1541880.1541882](https://doi.org/10.1145/1541880.1541882)
52. PhysioNet, "Normal Sinus Rhythm RR Interval Database (nsr2db)," v1.0.0. [physionet.org/content/nsr2db/1.0.0/](https://physionet.org/content/nsr2db/1.0.0/)
53. J. Cui et al., "EEG driver drowsiness dataset," figshare, 2021. [doi.org/10.6084/m9.figshare.14273687](https://doi.org/10.6084/m9.figshare.14273687)
54. B. Kemp, A. H. Zwinderman, B. Tuk, H. A. C. Kamphuisen, and J. J. L. Oberyé, "Analysis of a sleep-dependent neuronal feedback loop: The slow-wave microcontinuity of the EEG," IEEE Trans. Biomed. Eng., vol. 47, no. 9, pp. 1185–1194, 2000. [doi.org/10.1109/10.867928](https://doi.org/10.1109/10.867928)
55. M. R. Rosekind et al., "Alertness management: Strategic naps in operational settings," J. Sleep Res., vol. 4, suppl. 2, pp. 62–66, 1995. [doi.org/10.1111/j.1365-2869.1995.tb00229.x](https://doi.org/10.1111/j.1365-2869.1995.tb00229.x)
56. G. C. Brainard et al., "Solid-state lighting for the International Space Station: Tests of visual performance and melatonin regulation," Acta Astronaut., vol. 92, no. 1, pp. 21–28, 2013. [doi.org/10.1016/j.actaastro.2012.04.019](https://doi.org/10.1016/j.actaastro.2012.04.019)
57. P. M. Lehrer and R. Gevirtz, "Heart rate variability biofeedback: How and why does it work?," Front. Psychol., vol. 5, art. 756, 2014. [doi.org/10.3389/fpsyg.2014.00756](https://doi.org/10.3389/fpsyg.2014.00756)
58. NASA Open Science Data Repository, "Environmental Data Application (EDA): ISS telemetry and radiation dosimetry," NASA, 2026. [visualization.osdr.nasa.gov/eda/](https://visualization.osdr.nasa.gov/eda/)
59. NASA Open Science Data Repository, "OSD-569: Inspiration4 complete blood count" and "OSD-575: Inspiration4 comprehensive metabolic panel," NASA, 2024. [osdr.nasa.gov/bio/repo/data/studies/OSD-569](https://osdr.nasa.gov/bio/repo/data/studies/OSD-569)
60. E. G. Overbey et al., "The Space Omics and Medical Atlas (SOMA) and international astronaut biobank," Nature, vol. 632, no. 8027, pp. 1145–1154, 2024. [doi.org/10.1038/s41586-024-07639-y](https://doi.org/10.1038/s41586-024-07639-y)
61. NOAA Space Weather Prediction Center, "GOES integral proton flux" and "NOAA space weather scales," 2026. [www.swpc.noaa.gov/noaa-scales-explanation](https://www.swpc.noaa.gov/noaa-scales-explanation)
62. A. Sellergren et al., "MedGemma technical report," arXiv:2507.05201, 2025. [arxiv.org/abs/2507.05201](https://arxiv.org/abs/2507.05201)
63. J. Birjandtalab, D. Cogan, M. B. Pouyan, and M. Nourani, "A non-EEG biosignals dataset for assessment and visualization of neurological status," in Proc. IEEE Int. Workshop Signal Process. Syst. (SiPS), 2016, pp. 110–114. [doi.org/10.1109/sips.2016.27](https://doi.org/10.1109/sips.2016.27)
64. A. L. Goldberger et al., "PhysioBank, PhysioToolkit, and PhysioNet: Components of a new research resource for complex physiologic signals," Circulation, vol. 101, no. 23, pp. e215–e220, 2000. [doi.org/10.1161/01.CIR.101.23.e215](https://doi.org/10.1161/01.CIR.101.23.e215)
65. T. Heldt, M. B. Oefinger, M. Hoshiyama, and R. G. Mark, "Circulatory response to passive and active changes in posture," in Proc. Computers in Cardiology, vol. 30, 2003, pp. 263–266. Dataset: PhysioNet PRCP. [physionet.org/content/prcp/1.0.0/](https://physionet.org/content/prcp/1.0.0/)
66. M. A. F. Pimentel et al., "Toward a robust estimation of respiratory rate from pulse oximeters," IEEE Trans. Biomed. Eng., vol. 64, no. 8, pp. 1914–1923, 2017. [doi.org/10.1109/tbme.2016.2613124](https://doi.org/10.1109/tbme.2016.2613124)
67. Y. Wang, R. Li, J.-R. Chardonnet, and P. Hui, "Dataset for predicting cybersickness from a virtual navigation task," arXiv:2303.13527, 2023. [arxiv.org/abs/2303.13527](https://arxiv.org/abs/2303.13527)
68. Z. Cao, C.-H. Chuang, J.-K. King, and C.-T. Lin, "Multi-channel EEG recordings during a sustained-attention driving task," Sci. Data, vol. 6, art. 19, 2019. [doi.org/10.1038/s41597-019-0027-4](https://doi.org/10.1038/s41597-019-0027-4)

### Guide sources: health indicators and reference ranges
The "Basis" link of every indicator in the app's Guide → *Health indicators, reference ranges and how they are measured*.

**Live Monitor signals**

- Heart rate: [AHA adult resting HR 60-100 bpm](https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse)
- Heart-rate variability (RMSSD): [Shaffer & Ginsberg 2017, Front Public Health](https://doi.org/10.3389/fpubh.2017.00258)
- Systolic blood pressure: [2017 ACC/AHA BP guideline](https://doi.org/10.1161/HYP.0000000000000065)
- Diastolic blood pressure: [2017 ACC/AHA BP guideline](https://doi.org/10.1161/HYP.0000000000000065)
- Blood oxygen saturation: [WHO Pulse Oximetry Training Manual 2011](https://cdn.who.int/media/docs/default-source/patient-safety/pulse-oximetry/who-ps-pulse-oxymetry-training-manual-en.pdf)
- Respiration rate: [Standard adult resting range 12-20 /min](https://my.clevelandclinic.org/health/articles/10881-vital-signs)
- DCS tissue ratio (N2): [Conkin 2011, NASA/TP-2011-216147](https://purl.fdlp.gov/GPO/gpo23332) · [NASA HRP Risk of Decompression Sickness](https://www.nasa.gov/reference/risk-of-decompression-sickness/)
- Body temperature: [Stahn et al. 2017, Sci Rep 7:16180](https://doi.org/10.1038/s41598-017-15560-w)
- Blood glucose (CGM): [Battelino et al. 2019, Diabetes Care](https://doi.org/10.2337/dci19-0028)
- EEG drowsiness index (θ+α)/β: [Jap et al. 2009, Expert Syst Appl](https://doi.org/10.1016/j.eswa.2007.12.043) · [Lal & Craig 2001, Biol Psychol](https://doi.org/10.1016/S0301-0511%2800%2900085-5)
- EEG workload index θf/αp: [Gevins & Smith 2003, Theor Issues Ergon Sci](https://doi.org/10.1080/14639220210159717)
- Cerebral oxygenation (fNIRS rSO2): [Kikukawa et al. 2008, Dynamic Medicine](https://doi.org/10.1186/1476-5918-7-10) · [Murkin & Arango 2009, Br J Anaesth](https://doi.org/10.1093/bja/aep299)
- Skin conductance (EDA): [Boucsein 2012, Electrodermal Activity](https://doi.org/10.1007/978-1-4614-1126-0)
- Acceleration (+Gz): [Whinnery & Forster 2013](https://doi.org/10.1186/2046-7648-2-19)
- Vestibular mismatch: [Clément & Reschke 2008, Neuroscience in Space](https://doi.org/10.1007/978-0-387-78950-7)
- Cabin CO2: [Law et al. 2014, J Occup Environ Med](https://doi.org/10.1097/JOM.0000000000000158) · [NASA SMAC (JSC-20584)](https://ntrs.nasa.gov/citations/20090014213)
- Cabin oxygen partial pressure: [NASA-STD-3001 Vol. 2](https://www.nasa.gov/reference/nasa-std-3001v2)
- Cabin pressure: [NASA-STD-3001 Vol. 2](https://www.nasa.gov/reference/nasa-std-3001v2) · [NASA Exploration Atmospheres Working Group 2012](https://purl.fdlp.gov/GPO/gpo7190)
- Suit pressure: [Decompression Sickness](https://www.nasa.gov/reference/risk-of-decompression-sickness/) · [EVA injury](https://www.nasa.gov/reference/risk-of-injury-and-compromised-performance-from-extravehicular-activity-eva/) · [NASA-STD-3001 Vol. 2](https://www.nasa.gov/reference/nasa-std-3001v2)
- Cabin carbon monoxide: [NASA Spacecraft Maximum Allowable Concentrations, JSC-20584](https://ntrs.nasa.gov/citations/20090014213)
- Cabin temperature: [NASA-STD-3001 Vol. 2](https://www.nasa.gov/reference/nasa-std-3001v2)
- Cabin humidity: [NASA-STD-3001 Vol. 2](https://www.nasa.gov/reference/nasa-std-3001v2)
- Cabin noise: [NASA-STD-3001 Vol. 2](https://www.nasa.gov/reference/nasa-std-3001v2) · [NASA HRP hostile/closed environment hazard](https://www.nasa.gov/hrp/hazard-hostile-closed-environments/)
- Radiation dose rate: [Zeitlin et al. 2013, Science](https://doi.org/10.1126/science.1235989) · [NASA-STD-3001 Vol. 1](https://www.nasa.gov/reference/nasa-std-3001)
- Neutron dose rate: [Canadian Space Agency 2026 (CANS contract news)](https://www.canada.ca/en/space-agency/news/2026/02/canadian-space-radiation-technology-to-support-health-and-safety.html) · [Zeitlin et al. 2013](https://doi.org/10.1126/science.1235989)

**Daily log indicators**

- Sleep duration: [Barger et al. 2014, Lancet Neurol](https://doi.org/10.1016/S1474-4422%2814%2970122-X)
- Sleep efficiency: [Ohayon et al. 2017, Sleep Health](https://doi.org/10.1016/j.sleh.2016.11.006) · [NASA HRP Sleep & Irregular Schedules risk](https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/)
- Work hours: [NASA HRP Risk from Inadequate Sleep and Irregular Schedules](https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/)
- Mood (self-rated 1-5): [NASA HRP Risk of Behavioral Conditions and Psychiatric Disorders](https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/)
- Stress (self-rated 1-5): [NASA HRP Risk of Behavioral Conditions and Psychiatric Disorders](https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/)
- Team cohesion (self-rated 1-5): [NASA HRP Risk of Inadequate Teamwork](https://www.nasa.gov/reference/risk-of-inadequate-teamwork/)
- Motion sickness (0-10): [NASA HRP Risk of Altered Sensorimotor and Vestibular Function](https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/)
- Reaction time (PVT): [Basner & Dinges 2011, Sleep](https://doi.org/10.1093/sleep/34.5.581) · [Dinges et al. ISS Reaction Self Test](https://www.med.upenn.edu/uep/astronaut.html)
- PVT lapses (>500 ms): [Basner & Dinges 2011](https://doi.org/10.1093/sleep/34.5.581)
- Optic-disc swelling (Frisén grade): [Frisén 1982](https://doi.org/10.1136/jnnp.45.1.13) · [Lee et al. 2020, npj Microgravity](https://doi.org/10.1038/s41526-020-0097-9) · [NASA HRP SANS risk](https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/)
- Resting heart rate: [AHA](https://www.heart.org/en/health-topics/high-blood-pressure/the-facts-about-high-blood-pressure/all-about-heart-rate-pulse)
- Morning HRV (RMSSD): [Shaffer & Ginsberg 2017](https://doi.org/10.3389/fpubh.2017.00258)
- Systolic BP: [ACC/AHA 2017](https://doi.org/10.1161/HYP.0000000000000065)
- Diastolic BP: [ACC/AHA 2017](https://doi.org/10.1161/HYP.0000000000000065)
- SpO2: [WHO 2011](https://cdn.who.int/media/docs/default-source/patient-safety/pulse-oximetry/who-ps-pulse-oxymetry-training-manual-en.pdf)
- Body temperature: [Stahn et al. 2017](https://doi.org/10.1038/s41598-017-15560-w)
- Salivary cortisol (morning): [NASA Immune Biomarkers study (Artemis II dry saliva)](https://www.nasa.gov/reference/immune-biomarkers) · [Crucian et al. 2014](https://doi.org/10.1089/jir.2013.0129)
- Fasting glucose: [ADA Standards of Care](https://doi.org/10.2337/dc25-S002)
- Body mass change: [Smith et al. 2005](https://doi.org/10.1093/jn/135.3.437) · [NASA Nutritional Biochemistry](https://www.nasa.gov/reference/jsc-food-nutrition/)
- Energy intake: [Smith et al. 2005, J Nutr](https://doi.org/10.1093/jn/135.3.437) · [NASA HRP Risk of Inadequate Food and Nutrition](https://www.nasa.gov/reference/risk-of-inadequate-food-and-nutrition/)
- Exercise: [Loehr et al. 2015, Aerosp Med Hum Perform](https://doi.org/10.3357/AMHP.EC03.2015)
- Muscle strength: [NASA HRP Risk of Reduced Cardiorespiratory and Musculoskeletal Fitness](https://www.nasa.gov/reference/risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness/)
- Urinary calcium: [NASA HRP Risk of Spaceflight-Induced Bone Changes](https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/) · [CIPHER Bone Health study](https://www.nasa.gov/reference/cipher/)
- Water intake: [NASA HRP Renal Stone risk](https://www.nasa.gov/directorates/esdmd/hhp/risk-of-renal-stone-formation/)
- Cabin CO2 (daily mean): [Law et al. 2014, J Occup Environ Med](https://doi.org/10.1097/JOM.0000000000000158)
- Cabin air bacteria: [ISS microbial limit < 1000 CFU/m³ (SSP 50260)](https://ntrs.nasa.gov/api/citations/20130013534/downloads/20130013534.pdf) · [NASA HRP Risk of Host-Microorganism Interactions](https://www.nasa.gov/reference/risk-of-host-microorganism-interactions/)
- Daily absorbed dose: [Zeitlin et al. 2013](https://doi.org/10.1126/science.1235989) · [Berger et al. 2020](https://doi.org/10.1051/swsc/2020028)

## Disclaimer
NeuroShield is a research and education prototype built for the NASA Space Apps Challenge. It is a decision-support aid, not a medical device:
it does not diagnose disease and does not replace flight surgeons or medical procedures.
