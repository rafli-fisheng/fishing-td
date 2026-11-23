# Fishing Torque & Drag – mobile app (installable web app)

Upload every file in this folder to any static web host that serves HTTPS
(GitHub Pages, Netlify, Cloudflare Pages: all free). Then open the link on a phone:

- **Android (Chrome):** tap **Install app** in the top bar, or the browser menu → *Install app*.
- **iPhone (Safari):** tap **Share** → **Add to Home Screen**.

After the first visit the app works with no signal. Cases are saved on the phone;
use **Save case** to keep a copy as a file.

When you update `index.html`, change `VERSION` in `sw.js` so phones pick up the new version.

## Windows program

The `desktop/` folder holds the Windows version (Electron) with the desktop layout and 2D/3D well
trajectory views. See `desktop/README.md`. Installers are built by the *Build Windows app* GitHub Action.
