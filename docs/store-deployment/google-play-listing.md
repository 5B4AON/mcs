# Google Play listing preparation

This guide covers the English (UK) listing draft and master graphics. It does not submit or publish anything in Play Console. The listing text remains a draft until the owner approves it.

## Text

The copy is in `store/listing/en-GB/`:

- `title.txt` — maximum 30 characters.
- `short-description.txt` — maximum 80 characters.
- `full-description.txt` — maximum 4,000 characters.

Check all claims against the app and [privacy policy](https://morse-code-studio.web.app/privacy.html) before copying them into Play Console. In particular, do not promise USB-serial or WinKeyer support on Android; the app disables those features there. MIDI availability depends on the browser and device.

## Graphics

Play assets are in `store/images/play/`. The source icon is `store/images/source/icon-maskable.svg`; `app-icon.png` is its 512×512 store export. The feature graphic source and export are `feature-graphic.svg` and `feature-graphic.png`.

| Asset | Play requirement | Alt text |
|---|---|---|
| App icon | 512×512, 32-bit PNG with alpha, at most 1 MB; this design has an opaque full-square background | Gold Morse dots and dashes on a navy square |
| Feature graphic | 1024×500, JPEG or 24-bit PNG with no alpha | Morse Code Studio name and gold Morse marks on a navy background, with the words “Send, decode and practise Morse” |

The feature graphic is original artwork, not an app screenshot. Keep important content near the centre, avoid store badges, pricing, rankings, testimonials, time-sensitive claims and device mockups, and check the current Play Console requirements before upload.

Play Console's [AI asset declaration](https://support.google.com/googleplay/android-developer/answer/17262077?hl=en-GB) is made per asset. The owner labelled the app icon and feature graphic as AI-generated; the screenshots are genuine captures with ordinary crops.

## Phone screenshots

Screenshots must show the real app. Do not create, redraw or composite app screens. Capture them from the installed Play build on the owner's phone, then review each image for legibility, private information and current UI before adding it under `store/images/play/screenshots/`.

Play currently requires at least two screenshots for the listing. Phone screenshots must be JPEG or 24-bit PNG without alpha, at least 320px and at most 3,840px on each side; the longer side cannot exceed twice the shorter side. For eligibility in recommendation formats, Play recommends at least four portrait screenshots at 1080×1920px or larger. Confirm the requirements shown in Play Console before upload.

The eight phone screenshots are in `store/images/play/screenshots/`; upload the ordered PNGs.

| Order | File | Alt text |
|---|---|---|
| 1 | `01-main-screen.png` | Main Morse Code Studio screen with decoded text, encoder controls and a Morse key illustration. |
| 2 | `02-send-practice-ebook.png` | Send practice with an e-book: the text to key, its Morse pattern and an instruction note. |
| 3 | `03-lens.png` | Lens view showing the letter R and its Morse pattern. |
| 4 | `04-setup-wizard.png` | Setup Wizard goal list for typing, keying, practice, teaching and decoding Morse. |
| 5 | `05-copy-practice-koch.png` | Copy practice, Koch lesson 1: the new characters K and M with their dots and dashes. |
| 6 | `06-fullscreen-conversation.png` | Full-screen Morse conversation with colour-coded messages and prosigns. |
| 7 | `07-cw-tone-detection.png` | CW tone decoder locked to a 750 Hz signal, showing the live audio waveform and decoded text. |
| 8 | `08-vintage-look.png` | Decoded text in vintage look, with the player bar at the bottom. |

These are real captures from the installed app (1080×2340 on the owner's phone). Each was cropped, without stretching or compositing, to 1080×2160 (2:1) from the top: the Android navigation bar is removed and a few pixels at the bottom are trimmed so the longer side does not exceed twice the shorter. All are 24-bit PNG without alpha and meet Play's size and aspect-ratio limits. They do not use the exact 9:16 ratio recommended for certain recommendation placements. Eight is Play's phone maximum and exceeds the listing minimum of two.

The owner supplied the eight current screenshots. The full-screen conversation contains another operator's callsign; the owner confirmed its public use is authorised. Do not expose relay channel details, secrets or notifications. Add concise alt text (140 characters or fewer) for each screenshot in Play Console.

## Owner review and submission

The owner reviews the title, descriptions, graphics and screenshots together. Only after explicit approval should the text and assets be entered in Play Console; this repository work does not submit or publish the listing.

The owner reported saving the listing and completing the asset labels on 9 November 2026. The listing was included in Play Console submission 1, which was marked **Published** at 21:46 on 9 November 2026 as part of the Alpha closed-test release. This is not a public production release.
