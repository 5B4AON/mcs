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

## Phone screenshots

Screenshots must show the real app. Do not create, redraw or composite app screens. Capture them from the installed Play build on the owner's phone, then review each image for legibility, private information and current UI before adding it under `store/images/play/screenshots/`.

Play currently requires at least two screenshots for the listing. Phone screenshots must be JPEG or 24-bit PNG without alpha, at least 320px and at most 3,840px on each side; the longer side cannot exceed twice the shorter side. For eligibility in recommendation formats, Play recommends at least four portrait screenshots at 1080×1920px or larger. Confirm the requirements shown in Play Console before upload.

The approved six phone screenshots are in `store/images/play/screenshots/`; upload the ordered PNGs.

| Order | File | Alt text |
|---|---|---|
| 1 | `01-main-screen.png` | Main Morse Code Studio screen with a CW exchange, encoder controls and a Morse key illustration. |
| 2 | `02-send-practice.png` | Send Practice screen showing a Morse prompt, keyed pattern and practice instructions. |
| 3 | `03-lens.png` | Lens view showing the letter R and its Morse pattern. |
| 4 | `04-setup-wizard.png` | Setup Wizard goal list for typing, keying, practice, teaching and decoding Morse. |
| 5 | `05-copy-practice-results.png` | Copy Practice results showing two round scores and an average. |
| 6 | `06-fullscreen-conversation.png` | Full-screen Morse conversation with colour-coded messages and prosigns. |

These are real captures from the installed app, cropped without stretching or compositing. All six meet Play's basic phone screenshot size and aspect-ratio limits. Four are 1080×2160 (2:1), and two are 1080×1880; the latter crop removes the lower touch-key area so it is not cut off. They do not use the exact 9:16 ratio recommended for certain recommendation placements. Six is within Play's phone maximum of eight and exceeds the listing minimum of two.

The owner approved these six screenshots, their order and the crops for the Play listing. The full-screen conversation contains another operator's callsign; the owner confirmed its public use is authorised. Do not expose relay channel details, secrets or notifications. Add concise alt text (140 characters or fewer) for each screenshot in Play Console.

## Owner review and submission

The owner reviews the title, descriptions, graphics and screenshots together. Only after explicit approval should the text and assets be entered in Play Console; this repository work does not submit or publish the listing.
