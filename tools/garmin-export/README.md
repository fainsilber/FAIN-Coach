# Garmin export helper

Downloads your Garmin Connect runs as `.tcx` files so you can import them into
FAIN Coach in one go, instead of exporting them one at a time by hand.

This is a **local tool**. It runs on your machine, talks directly to Garmin, and
writes files to a folder. Nothing passes through FAIN Coach's servers — there is
no server involved at all.

## Before you start — please read

Garmin has no official API for personal use. This uses their private web API
through the unofficial [`python-garminconnect`][pgc] client, which means:

- **It needs your Garmin email and password.** They are used once, on this
  machine, to obtain access tokens. The password is read with `getpass()`, is
  never a command-line argument, and is never written to disk.
- **It may break without notice.** Garmin changes this API whenever they like —
  a previous client (`garth`) was discontinued after one such change.
- **It may conflict with Garmin's terms of service.** That's your call to make.

If you'd rather not use it, Garmin Connect's own **Export to TCX** works fine —
FAIN Coach imports multiple files at once either way.

Tokens are cached in `~/.fain-coach/garmin-tokens`, deliberately **outside this
repository** so they can never end up in a commit. Delete that folder to sign
out.

## Install

```bash
pip install garminconnect curl_cffi
```

## Use

Last 90 days of runs:

```bash
python garmin_export.py --days 90
```

A specific range, into a folder of your choosing:

```bash
python garmin_export.py --from 2026-01-01 --to 2026-06-30 --out ./my-runs
```

Include rides, swims and everything else, not just runs:

```bash
python garmin_export.py --days 30 --all-activities
```

Then open FAIN Coach → **Upload**, and drop the whole folder of `.tcx` files on
the drop zone. You'll get a review list before anything is saved.

## Notes

- **Re-running is cheap.** Files already downloaded are skipped, and FAIN Coach
  recognises runs you've already imported and marks them "Already imported"
  rather than duplicating them.
- **Don't rename the files.** The name (`garmin-<activityId>.tcx`) is how the
  app recognises a run it already has. A renamed file still imports — it just
  can't be de-duplicated later.
- **Rate limiting is normal.** Garmin limits how often you can sign in from one
  IP; the tool backs off and retries. If a big backfill stalls, wait a few
  minutes and run it again — it picks up where it left off.

[pgc]: https://github.com/cyberjunky/python-garminconnect
