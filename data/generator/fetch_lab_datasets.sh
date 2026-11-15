#!/bin/sh
# Downloads the open Earth-lab datasets used by build_lab_datasets.py into data/external/
# (raw files are not redistributed with NeuroShield; each keeps its own licence - see Guide → Datasets).
set -e
cd "$(dirname "$0")/../external" 2>/dev/null || { mkdir -p "$(dirname "$0")/../external"; cd "$(dirname "$0")/../external"; }
PN=https://physionet.org

# PhysioNet Non-EEG (3.7 MB), NSR RR intervals (11 MB), PRCP posture changes (54 MB): full ZIPs
for pair in "noneeg non-eeg-dataset-for-assessment-of-neurological-status-1.0.0" \
            "nsr2db normal-sinus-rhythm-rr-interval-database-1.0.0" \
            "prcp physiologic-response-to-changes-in-posture-1.0.0"; do
  set -- $pair
  [ -d "$1" ] || { curl -sL -o "$1.zip" "$PN/static/published-projects/$1/$2.zip" && mkdir -p "$1" && unzip -q "$1.zip" -d "$1" && rm "$1.zip"; }
done

# PhysioNet BIDMC: only the 1 Hz numerics and the patient info (not the 125 Hz waveforms)
mkdir -p bidmc
for i in $(seq -w 1 53); do
  for f in Numerics.csv Fix.txt; do
    [ -s "bidmc/bidmc_${i}_$f" ] || curl -sL -o "bidmc/bidmc_${i}_$f" "$PN/files/bidmc/1.0.0/bidmc_csv/bidmc_${i}_$f"
  done
done

# Sleep-EDF Expanded: only the hypnograms of the sleep-cassette study + subject table (not the 8 GB of PSG signals)
mkdir -p sleepedf
[ -s sleepedf/SC-subjects.xls ] || curl -sL -o sleepedf/SC-subjects.xls "$PN/files/sleep-edfx/1.0.0/SC-subjects.xls"
for f in $(curl -s "$PN/files/sleep-edfx/1.0.0/sleep-cassette/" | grep -oE 'SC[0-9]{4}[A-Z0-9]{2}-Hypnogram\.edf' | sort -u); do
  [ -s "sleepedf/$f" ] || curl -sL -o "sleepedf/$f" "$PN/files/sleep-edfx/1.0.0/sleep-cassette/$f"
done

# EEG driver drowsiness dataset (figshare, 181 MB, CC BY 4.0)
[ -f eeg_drowsy.mat ] || curl -sL -o eeg_drowsy.mat https://ndownloader.figshare.com/files/30707285
# Cybersickness dataset (Wang et al. 2023): 416 MB pickle stored with Git LFS, served by the media URL
mkdir -p cybersickness
[ -s cybersickness/raw_data2020.p ] || curl -sL -o cybersickness/raw_data2020.p https://media.githubusercontent.com/media/coreturn/Cybersickness_Dataset/master/data/raw_data2020.p

# Tufts fNIRS2MW: Box shared folder, no scripted download. Save the per-subject CSVs (sub_1.csv …) by hand from
# https://tufts-hci-lab.github.io/code_and_datasets/fNIRS2MW.html into data/external/fnirs2mw/
mkdir -p fnirs2mw
echo "done: $(pwd)"
