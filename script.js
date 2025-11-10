// Replace this with your Monetag smartlink
const MONETAG_URL = "https://otieu.com/4/9405330";

const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const spinBtn = document.getElementById('spinBtn');
const message = document.getElementById('message');

const PRIZES = ["Try Again", "$5", "$10", "$20", "$50", "$100"]; // order around wheel clockwise
const COLORS = ["#f87171","#fbbf24","#60a5fa","#34d399","#a78bfa","#f472b6"];

let totalSectors = PRIZES.length;
let currentRotation = 0;        // radians (wheel rotation applied when drawing)
let spinning = false;
let spinStep = 0;              // 0 = first spin -> Try Again, 1 = second spin -> $100

// make canvas crisp on high-dpi screens
function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const size = 500;
  canvas.style.width = size + "px";
  canvas.style.height = size + "px";
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

// helper: draw the wheel using currentRotation
function drawWheel(rotation = 0) {
  const cx = canvas.width / (window.devicePixelRatio || 1) / 2;
  const cy = cx;
  const radius = cx - 8;
  const anglePer = (2 * Math.PI) / totalSectors;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // draw sectors
  for (let i = 0; i < totalSectors; i++) {
    const start = rotation + i * anglePer;
    const end = start + anglePer;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, end);
    ctx.closePath();
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.stroke();

    // prize text: place near outer edge, rotated to sector middle
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + anglePer / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = "#041127";
    ctx.font = "bold 20px Arial";
    // draw a faint white background for clearer text
    ctx.fillStyle = "#ffffff";
    ctx.fillText(PRIZES[i], radius - 12, 8);
    ctx.restore();
  }

  // draw center circle
  ctx.beginPath();
  ctx.arc(cx, cy, 48, 0, Math.PI * 2);
  ctx.fillStyle = "#060606";
  ctx.fill();
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  ctx.stroke();
}

// easing (smooth deceleration)
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// compute rotation needed to align the center of sector `index` to 12 o'clock
// arrowAngle = -Math.PI/2 (12 o'clock). We want: rotation + (index + 0.5)*anglePer === arrowAngle (mod 2π)
// solve for rotation => rotation = arrowAngle - (index+0.5)*anglePer + k*2π
function computeTargetRotation(index, extraFullTurns = 6) {
  const anglePer = (2 * Math.PI) / totalSectors;
  const arrowAngle = -Math.PI / 2; // top of circle
  const rotationToAlign = arrowAngle - (index + 0.5) * anglePer;
  // choose positive large rotation so wheel spins clockwise many turns
  const target = extraFullTurns * 2 * Math.PI + rotationToAlign;
  return target;
}

// animate from currentRotation -> targetRotation over duration ms
function animateTo(targetRotation, duration = 3800) {
  return new Promise(resolve => {
    const startRotation = currentRotation;
    const startTime = performance.now();
    function frame(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      currentRotation = startRotation + (targetRotation - startRotation) * eased;
      drawWheel(currentRotation);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

// determine which prize is under the arrow given currentRotation
function prizeUnderArrow(rotation) {
  // Normalize rotation into [0, 2pi)
  const anglePer = (2 * Math.PI) / totalSectors;
  // Angle at arrow is -PI/2. The sector center angles are rotation + (i+0.5)*anglePer
  // Find i such that rotation + (i+0.5)*anglePer ≡ arrowAngle (mod 2π)
  // Rearranged: i = ((arrowAngle - rotation) / anglePer) - 0.5
  const arrowAngle = -Math.PI / 2;
  const normalized = ((arrowAngle - rotation) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const idx = Math.floor(normalized / anglePer);
  // idx in [0, totalSectors-1]
  return idx;
}

// main flow
async function doSpin() {
  if (spinning) return;
  spinning = true;
  spinBtn.disabled = true;

  // open monetag popup immediately
  try { window.open(MONETAG_URL, '_blank', 'noopener'); } catch (e) { /* ignore */ }

  // choose deterministic target
  let targetIndex;
  if (spinStep === 0) {
    targetIndex = PRIZES.indexOf("Try Again");
    messageText("Spinning... First spin: Try Again (do not close ad window)");
  } else {
    targetIndex = PRIZES.indexOf("$100");
    messageText("Spinning... You will win $100 (do not close ad window)");
  }

  // compute target rotation so that sector center aligns with arrow at top
  const targetRotation = computeTargetRotation(targetIndex, 7); // 7 full turns for drama
  await animateTo(targetRotation, 4200);

  // after spin ends, ensure that prize under arrow equals targetIndex
  const idx = prizeUnderArrow(currentRotation);
  // defensive check - if mismatch (shouldn't happen) snap-correct
  if (idx !== targetIndex) {
    // minor correction: rotate by small delta to align exactly
    const anglePer = (2 * Math.PI) / totalSectors;
    const arrowAngle = -Math.PI / 2;
    const desiredRotation = arrowAngle - (targetIndex + 0.5) * anglePer + 7 * 2 * Math.PI;
    currentRotation = desiredRotation;
    drawWheel(currentRotation);
  }

  // show result
  const finalIdx = prizeUnderArrow(currentRotation);
  if (spinStep === 0) {
    // first spin: Try Again
    showTryAgain();
    spinStep = 1;
    spinning = false;
    spinBtn.disabled = false;
  } else {
    // second spin: $100
    await showWin100();
    // after claim the function resets spinStep in claim handler
  }
}

function messageText(txt) {
  message.innerHTML = txt;
}

function showTryAgain() {
  messageText(`Try Again! <br><small style="color:#ffd">Please do not close the ad window</small>`);
}

function showWin100() {
  return new Promise(resolve => {
    messageText(`🎉 You won $100! <br><small style="color:#ffd">Please do not close the ad window</small>`);
    const claim = document.createElement('button');
    claim.textContent = "CLAIM";
    claim.style.marginTop = '10px';
    claim.style.padding = '8px 16px';
    claim.style.borderRadius = '8px';
    claim.style.border = '0';
    claim.style.background = '#00c853';
    claim.style.color = '#fff';
    claim.style.cursor = 'pointer';
    claim.onclick = () => {
      try { window.open(MONETAG_URL, '_blank', 'noopener'); } catch(e){}
      // reset wheel to initial state visually
      currentRotation = 0;
      drawWheel(currentRotation);
      spinStep = 0;
      messageText('Click SPIN to play again!');
      spinBtn.disabled = false;
      claim.remove();
      resolve();
    };
    message.appendChild(claim);
  });
}

// initial draw
drawWheel(currentRotation);

// wire up button
spinBtn.addEventListener('click', doSpin);

// Expose variables to console for debugging (optional)
// window._wheel = { drawWheel, currentRotation, prizeUnderArrow };
