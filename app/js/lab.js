// Merges the real-recording "Lab" mission (app/js/real_rec.js, built by tools/validate_real.js) into the
// dataset: each crew member replays a different real person from open PhysioNet recordings.
(function () {
  const D = window.NS_DATA, R = window.NS_REC;
  if (!R) return;
  D.missions.push(R.mission);
  for (const s of R.scenarios) {
    D.scenarios.push(s);
    const ref = R.tracks.A[s.id];
    D.live[s.id] = { cols: ref.cols, labels: ref.labels, phases: ref.phases };
  }
  D.recCrew = R.tracks;
})();
