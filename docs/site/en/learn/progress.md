# Progress and backup

## XP, badges, streak

- **XP (experience points)**: each level is worth some points, granted **only once**, when you complete its **final
  mission**. Redoing a level earns nothing more.
- **Badges**: rewards for milestones (first level, three levels, 100 XP, 3-day and 7-day streaks).
- **Day streak**: the number of consecutive days you practised. Missing a day resets it to 1, without blame.

Nothing is locked: points and badges only measure your progress.

## Where is my progress saved?

**In your browser**, on your device (local storage). You do nothing. Beware: clearing the site's data, or switching
browser or device, makes it disappear. Two solutions below.

## Back up to a file (no server)

**Settings → Progress backup**

- **Export my progress** downloads a `pyquest-progress-YYYY-MM-DD.json` file.
- **Import progress** reads such a file and **merges** it with your current progress: all levels and badges are
  kept, nothing is ever lost. The app tells you how many levels are new.

Keep the file or copy it to another device. An invalid file is refused without changing anything.

## Sync between devices (optional)

If your PyQuest instance offers sync (a server with the sync module), you can find your progress everywhere,
**without creating an account**.

**Settings → Sync between devices**

1. On the first device: **Turn on sync**. A **secret token** is created and shown.
2. On the second device: paste that token into "Or paste the token from another device", then **Link this device**.
   The two progresses are merged.
3. After that it is automatic: at startup, when the network returns, and shortly after each completed level.
   **Sync now** forces an exchange.

!!! warning "The token is like a password"
    It gives access to your progress. Do not share it. **If lost, it cannot be recovered**: the server only keeps a
    fingerprint of it. Also make a file backup.

- **Turn off (keep the server data)** stops syncing on this device.
- **Turn off and erase the server data** permanently deletes what is stored for this token.
- **Offline** or server unavailable: a message says so, your local progress stays intact and syncing resumes by
  itself.
