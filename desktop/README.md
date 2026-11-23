# Fishing Torque & Drag – Windows program

Desktop version of the Fishing Torque & Drag tool. Runs fully offline on Windows 10/11 (64-bit).

## What is in it

- The full torque and drag engine: soft-string model with a stiff-BHA beam zone, pick-up / slack-off /
  rotating weights, buckling, jarring, back-off, milling and washover, stuck point, friction calibration.
- **Well trajectory in 2D and 3D** (Well path tab):
  - *3D*: drag to rotate, right-drag to pan, scroll to zoom. Buttons for fit, 3D view, look down, look across the section.
  - *Section*: vertical section along the closure azimuth, true scale.
  - *Plan*: north up, true scale.
  - Colour by dogleg severity, inclination, or cased / open hole. Hover the path to read MD, TVD, inclination,
    azimuth, dogleg, coordinates, hole section and the string item at that depth.
- Native menu and shortcuts: Ctrl+N new, Ctrl+O open, Ctrl+S save, Ctrl+Shift+P PDF report, Ctrl+1…8 to switch screens.
- Light and dark theme (View > Theme).
- The open case is kept automatically between sessions.

## Install

Download from the repository's **Actions** tab → *Build Windows app* → artifact *FishingTorqueDrag-Windows*:

- `FishingTorqueDrag-Setup-<version>.exe` – installer (Start menu and desktop shortcut).
- `FishingTorqueDrag-Portable-<version>.exe` – single file, no install.
- `FishingTorqueDrag-<version>-win-x64.zip` – unzip anywhere and run `Fishing Torque & Drag.exe`.

The program is not code-signed, so Windows SmartScreen may show "Windows protected your PC" the first time:
click **More info → Run anyway**.

## Build it yourself

Requires Node.js 20 or newer.

```
cd desktop
npm install
npm start            # run from source
npm run dist:win     # build installer, portable exe and zip into dist/ (on Windows)
npm run dist:win-zip # zip only; also works on Linux without Wine
```

`app/index.html` holds the calculation and screens, `app/trajview.js` the 2D views, `app/well3d.js` the
3D view (three.js in `app/vendor`), `main.js` the window, menu and file dialogs.
