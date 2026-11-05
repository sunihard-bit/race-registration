# Backups and race-day fallback

## Nightly off-site backup

The app copies its whole database once a day, gzips it, encrypts it (AES-256-GCM, key derived from `DATA_ENCRYPTION_KEY`) and uploads it to any S3-compatible storage. Backups older than 30 days are deleted, and the 7 newest are always kept. Status and a **Back up now** button are on `/admin`.

### Set up with Cloudflare R2 (free up to 10 GB)

1. Cloudflare dashboard → **R2** → **Create bucket**, e.g. `racekit-backups`. Leave it private.
2. R2 → **Manage API tokens** → **Create API token** with *Object Read & Write* on that bucket. Note the Access Key ID, Secret Access Key and the S3 endpoint (`https://<account-id>.r2.cloudflarestorage.com`).
3. In Render → your service → **Environment**, add:

| Setting | Value |
|---|---|
| `BACKUP_S3_ENDPOINT` | the endpoint from step 2 |
| `BACKUP_S3_BUCKET` | `racekit-backups` |
| `BACKUP_S3_ACCESS_KEY_ID` | from step 2 |
| `BACKUP_S3_SECRET_ACCESS_KEY` | from step 2 |
| `BACKUP_S3_REGION` | `auto` (optional) |
| `BACKUP_KEEP_DAYS` | `30` (optional) |

4. Save. After the restart, open `/admin` and click **Back up now** to check that it works.

**Keep a copy of `DATA_ENCRYPTION_KEY` somewhere safe outside Render** (a password manager). Without it, neither the live data nor the backups can be read.

### Restore

On any computer with the code and the same settings in `.env.local`:

```
npm run restore-backup -- list                      # see available backups
npm run restore-backup -- latest --out restored.db  # or give a specific key
```

Then stop the app, put `restored.db` at the path in `DATABASE_PATH` (on Render, the disk mount), and start it again. The app runs on any host with Node 22, so this also works for moving to a new host.

## Race-day pack

Organizers (manager role) can download a zip from **Check-in** or **Participants** → **Race-day pack**. It contains a printable alphabetical check-in sheet, the timer start list, a participant list, shirt-size counts and a confidential emergency-contacts file. Each download is recorded in the audit log. Download it the night before so check-in and timing can run without internet.
