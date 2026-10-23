# Yandex Music — migration verification and rollback

Historical record of the local **2026-10-23** deployment to `moode.local`, not a release or verification of later changes. Setup, architecture, credentials and test commands live in [README.md](../README.md#yandex-music).

## Recorded verification scope

The deployed sources, PHP proxy and frontend checksums matched the local build. Device checks used the connected account through the real PHP proxy:

- Authorization, playlists/favorites, search, stations, album/artist details and generated personal playlists.
- Stable loopback MPD stream URLs, byte-range `206`, seek, pause/resume and natural continuation after a complete track.
- Accepted `radioStarted`, `trackStarted`, `skip` and `trackFinished` feedback; subsequent batches retained the playing item's session/batch identity.
- Service restart preserved queue/history/outbox without repeating the same occurrence's `trackStarted`; saved stable URLs recovered metadata after the runtime cache was cleared.
- Cross-origin requests and GET token import were rejected; token/history files were private and the service bound only to `127.0.0.1:8767`.

A headless Chromium follow-up checked readable artist descriptions, rapid Next across queue pruning, and cancellation of a delayed prepare response while MPD was already playing. Cancellation paused MPD and a late response did not restart it. The checks used the mini-player controls; playback volume was not changed.

**Limits:** output was inferred from MPD state/progress, not remote listening. Hardware reboot, prolonged offline recovery, hours-long recommendation diversity and subjective audio output were not verified. Feedback is at-least-once, not exactly-once upstream delivery. Historical checks do not replace running the current tests or verifying new changes on-device.

## Original device backups

These are historical paths on that device, not portable installer defaults. Keep this recovery record until the owner retires the backups. All paths below are under `/var/backups/wave-yandex/`.

| Backup | Relative path |
|---|---|
| Original PHP backend/proxy/unit | `20261023-025825-128536/` |
| Original frontend | `frontend-20261023-025746/wave-ui/` |
| Python update | `20261023-031314-132593/` |
| UI-hotfix backend/proxy | `20261023-033243-137090/` |
| Frontend before identity fix | `frontend-hotfix-20261023-033224/wave-ui/` |
| Frontend before loading-cancel fix | `frontend-cancel-20261023-034311/wave-ui/` |

## Manual rollback to the original PHP deployment

Run **on the original moOde device**. This interrupts/replaces its current radio queue. The retired PHP daemon/cache files were left installed for this rollback; they are no longer supplied by the repository.

```bash
BACKUP=/var/backups/wave-yandex/20261023-025825-128536
FRONTEND=/var/backups/wave-yandex/frontend-20261023-025746/wave-ui
sudo systemctl stop wave-yandex.service
sudo cp -a "$BACKUP/etc/systemd/system/wave-yandex.service" /etc/systemd/system/wave-yandex.service
sudo cp -a "$BACKUP/var/www/wave-yandex-api.php" /var/www/wave-yandex-api.php
sudo cp -a "$FRONTEND/." /var/www/wave-ui/
sudo systemctl daemon-reload
sudo systemctl restart wave-yandex.service
# Replace Python-only stream URLs in MPD with the legacy backend's queue:
curl -fsS 'http://127.0.0.1:3000/wave-yandex-api.php?action=play_station&station=user%3Aonyourwave'
```

Python uses `/var/local/www/yandex-music/token.dat`; PHP uses the retained private `/var/local/www/yandex_token.dat`. If the account/token changed after migration, restore the desired token to the legacy location **before restarting PHP**. Never print or paste token contents into diagnostics.

Rolling back between Python versions instead requires the saved Python sources **and** reinstalling the saved requirements into `/opt/wave-yandex`'s venv. Reload browser/PWA sessions after a frontend change so old in-memory player code is replaced.
