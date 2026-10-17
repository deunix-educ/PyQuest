# Accessibility and settings

PyQuest aims at **WCAG 2.2 AA**. The **Settings** button opens the following panel.

## Settings

| Setting | Effect |
|---|---|
| Language | French or English; the current level restarts in the new language |
| Text size | from 80% to 200% |
| Theme | automatic (follows your system), light or dark |
| Guide character | shows or hides the encouragement bubbles |
| Sound effects / Volume | success and error sounds, can be turned off; "Test the sound" |
| Voice / Speed | the "Listen" button of explanations, can be turned off; "Test the voice" |
| Offline voices | downloads the quality voices so you can hear them without a connection (see below) |

Sound and voice **never** start on their own. No information is conveyed by sound or colour alone: every result is
also written ("Well done, that's correct!", "Not yet.").

## Keyboard

Everything works without a mouse.

| Key | Action |
|---|---|
| `Tab` / `Shift + Tab` | move between controls |
| `Ctrl + Enter` (`Cmd + Enter`) | run the cell |
| `Esc` | close the "Levels" or "Settings" panel (focus returns to the button that opened it) |
| `Tab` in the code editor | indent; `Esc` then `Tab` to leave the editor |

While a panel is open, the rest of the page is set aside and focus stays inside.

## Screen readers

Controls have explicit names, results and errors are announced (`role="status"` regions), the progress map and
badges have their states in text, and the canvas drawing has a description and a list of lines.

!!! note "Feedback welcome"
    The app is tested automatically, but a try with a real screen reader (Orca, NVDA, VoiceOver) remains the best
    check. If something is not announced or is confusing, report it: it is a defect to fix.

## Offline

PyQuest is an installable web app (PWA). After a first complete load it works without a connection; your browser
may offer to install it.

### Offline voices

The quality voices (Piper) are audio files. The level you open is **preloaded automatically**; for all the others, open
**Settings → Offline voices → Download the voices for offline use** (about 4 MB per language, once). Without it, offline,
only the excerpts you already listened to remain available and the rest is read by your device's more rudimentary voice.
Downloaded voices survive application updates; the download must be redone for the other language if you switch.
