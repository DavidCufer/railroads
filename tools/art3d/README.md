# 3D art: app icon (crest) and intro clip

Owner (2026-11-04): the app icon is the crest (brass shield, 3D engine with plough, "IRON & STEAM" banner); the intro
plays a short 3D clip of the engine arriving at night and fades into the crest. These are the only pre-rendered pictures
in the app (an owner-approved exception to "all graphics procedural"; see SPEC deviations).

The engine is a real 3D model (three.js primitives: boiler, smokebox, wheels, buffers, plough, lamp, steam sprites),
rendered in headless Chromium. three.js is NOT a project dependency; install it here only when re-rendering:

    cd tools/art3d && npm i --no-save --no-package-lock three@0.170.0

## Files
- `scene.js` + `index.html`: the scene. Query parameters: `size` or `w`/`h` (pixels), `cam`, `look`, `fov`, `exp`
  (exposure), `bg=crest` (transparent background, no bloom: the engine for the shield), `plough=0`, `t=<seconds>`
  (animation time: the engine runs in from 55 m and stops at 3.6 s; steam is born at the chimney and left behind).
- `shoot.mjs "<query>" out.png`: renders one picture (serves this folder to the page itself).
- `render-frames.sh`: renders the clip's frames (30 fps).
- `crest.html` + `shoot-crest.mjs`: composes the crest (SVG shield, banner and text around `art/icon/crest-engine-1024.png`).

## Commands used (2026-11-04)
    node shoot.mjs "size=2048&bg=crest&exp=1.1&cam=0.4,0.65,9.6&fov=31&look=0,2.4,-3" engine.png   # then downscale to 1024
    node shoot.mjs "size=2048&exp=1.05&cam=0.4,0.65,9.6&fov=31&look=0,2.4,-3" night.png           # the night still
    node shoot-crest.mjs "$PWD/crest.html?bg=1" ../../art/icon/crest-1024.png
    node shoot-crest.mjs "$PWD/crest.html?bg=0" ../../art/icon/crest-foreground-1024.png
    for w in 0 1 2; do ./render-frames.sh $w 3 144 & done; wait
    ffmpeg -framerate 30 -i frames/f%04d.png -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 -pix_fmt yuv420p -an ../../art/intro/arrival.webm

## Masters (`art/`)
- `art/icon/crest-1024.png`: the full icon (green square), source for the legacy mipmaps and the 512 store icon.
- `art/icon/crest-foreground-1024.png`: shield + banner on transparent, source for the adaptive-icon foreground and
  the intro's crest.
- `art/icon/crest-engine-1024.png`: the 3D engine alone (transparent), used inside the crest.
- `art/intro/night-still-1024.png`: the night arrival still (for the store feature graphic).
- `art/intro/arrival.webm`: the intro clip, 1280x720, 30 fps, VP9, no sound.
