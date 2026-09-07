# Labelled face calibration dataset (Phase 10.4)

Placeholder directory for a **real, labelled** dataset used by the calibration
tool. Do **not** commit unlicensed photos, and never fabricate subjects.

Required layout — one folder per identity (subject), two or more genuine JPEG
photos of that person per folder:

```text
dataset/
  subject-A/
    genuine-01.jpg
    genuine-02.jpg
    genuine-03.jpg
  subject-B/
    genuine-01.jpg
    genuine-02.jpg
  ...
```

Run the calibration tool (real @vladmandic/human inference, opt-in):

```bash
npm run test:face-calibration                 # uses ./dataset
node scripts/face-calibration.mjs <path>      # explicit dataset path
```

Semantics:

- **GENUINE** = similarity between two *different* photos of the *same*
  subject (same identity).
- **IMPOSTOR** = similarity between photos of *different* subjects (different
  identity).

Documented minimum dataset for a recommendation (see
`scripts/face-calibration.mjs`):

- **≥ 5 usable subjects** (folders with ≥ 2 labelled photos each);
- **≥ 50 genuine pairs** (same-identity comparisons);
- **≥ 50 impostor pairs** (cross-identity comparisons).

Below those minimums the tool reports distributions and candidate thresholds
(FAR/FRR) only if ≥ 2 subjects / ≥ 2 images per subject / ≥ 10 pairs exist, and
otherwise prints `CALIBRATION STATUS: INSUFFICIENT DATA`. It never fabricates
a recommendation and never lowers `FACE_VERIFY_THRESHOLD` on its own.

Privacy & licensing:

- Keep every photo's consent/licence on file.
- Do not add photos of people who did not consent to biometric processing.
- A production calibration set must reflect the deployment population and
  capture conditions.
