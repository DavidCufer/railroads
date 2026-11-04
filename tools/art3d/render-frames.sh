#!/bin/bash
# Renders intro-clip frames with the 3D scene. usage: render-frames.sh <worker> <workers> <nframes> [outdir]
# Run several workers in parallel, e.g.: for w in 0 1 2; do ./render-frames.sh $w 3 144 & done; wait
cd "$(dirname "$0")"
OUT=${4:-frames}; mkdir -p "$OUT"
for ((i=$1; i<$3; i+=$2)); do
  t=$(python3 -c "print(round($i/30,4))")
  f=$(printf "%s/f%04d.png" "$OUT" $i)
  [ -f "$f" ] || node shoot.mjs "w=1280&h=720&t=$t&exp=1.05&cam=0.4,0.65,9.6&fov=44&look=0,2.45,-3" "$f"
done
