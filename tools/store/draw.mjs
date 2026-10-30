/** Drawing code shared by the icon and the feature graphic. Runs inside the page (Playwright serialises it), so it
 * is self-contained. Everything is Canvas 2D; palette = the game's brass and dark green (docs/STYLE.md). */
export function drawLocoInPage(ctx, ox, oy, s) {
  // Side-on steam locomotive facing right in a 100 x 60 box scaled by s at (ox, oy) = top-left.
  const BRASS = "#E2B24A",
    BRASS_D = "#B98724",
    BRASS_L = "#F6D88A",
    GREEN = "#0E2C20",
    GREEN_M = "#1B4A33",
    CREAM = "#F3EBD3";
  const X = (v) => ox + v * s,
    Y = (v) => oy + v * s,
    L = (v) => v * s;
  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.roundRect(X(x), Y(y), L(w), L(h), L(r));
  };
  // rail
  ctx.fillStyle = BRASS_D;
  rr(0, 56, 100, 3, 1);
  ctx.fill();
  // tender
  ctx.fillStyle = BRASS_D;
  rr(2, 26, 24, 24, 2);
  ctx.fill();
  ctx.fillStyle = GREEN_M;
  rr(4, 22, 20, 8, 2);
  ctx.fill();
  // cab
  ctx.fillStyle = BRASS;
  rr(27, 14, 20, 38, 2);
  ctx.fill();
  ctx.fillStyle = BRASS_L;
  rr(24, 11, 26, 5, 2);
  ctx.fill();
  ctx.fillStyle = GREEN;
  rr(31, 20, 12, 12, 2);
  ctx.fill();
  // boiler
  ctx.fillStyle = BRASS;
  rr(46, 26, 46, 24, 10);
  ctx.fill();
  ctx.fillStyle = BRASS_L;
  rr(48, 28, 42, 5, 3);
  ctx.fill();
  ctx.fillStyle = GREEN;
  for (const bx of [58, 72]) {
    rr(bx, 26, 3, 24, 0.5);
    ctx.fill();
  }
  // dome, chimney
  ctx.fillStyle = BRASS_L;
  ctx.beginPath();
  ctx.arc(X(54), Y(25), L(6), Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = BRASS_D;
  rr(82, 10, 9, 18, 1);
  ctx.fill();
  ctx.fillStyle = BRASS_L;
  rr(79, 6, 15, 6, 2);
  ctx.fill();
  // cow-catcher
  ctx.fillStyle = BRASS_D;
  ctx.beginPath();
  ctx.moveTo(X(90), Y(46));
  ctx.lineTo(X(100), Y(56));
  ctx.lineTo(X(88), Y(56));
  ctx.closePath();
  ctx.fill();
  // wheels
  for (const [wx, wr] of [
    [16, 6],
    [37, 8],
    [58, 8],
    [76, 8],
  ]) {
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.arc(X(wx), Y(56 - wr + 1), L(wr + 1.5), 0, 7);
    ctx.fill();
    ctx.fillStyle = BRASS;
    ctx.beginPath();
    ctx.arc(X(wx), Y(56 - wr + 1), L(wr - 0.5), 0, 7);
    ctx.fill();
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.arc(X(wx), Y(56 - wr + 1), L(wr * 0.35), 0, 7);
    ctx.fill();
  }
  ctx.strokeStyle = BRASS_L;
  ctx.lineWidth = L(1.6);
  ctx.beginPath();
  ctx.moveTo(X(37), Y(49));
  ctx.lineTo(X(76), Y(49));
  ctx.stroke();
  // steam
  ctx.fillStyle = CREAM;
  for (const [px, py, pr] of [
    [84, 2, 4.5],
    [92, -6, 6],
    [100, -16, 7.5],
  ]) {
    ctx.beginPath();
    ctx.arc(X(px), Y(py), L(pr), 0, 7);
    ctx.fill();
  }
}

export const PAL = { GREEN: "#0E2C20", GREEN_M: "#1B4A33", BRASS: "#E2B24A", CREAM: "#F3EBD3" };
