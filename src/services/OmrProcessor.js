import { Buffer } from 'buffer';
import jpeg from 'jpeg-js';

const tick = () => new Promise(r => setTimeout(r, 1));

/*
 * ============================================================
 *  GARUD OMR PROCESSOR — Pure JS, fully anchor-relative
 * ============================================================
 *
 *  A4 Sheet Layout (210mm × 297mm):
 *   ┌──■──────────────────────────────■──┐  ■ = 7mm anchor squares
 *   │  TL                            TR  │  TL center ≈ (9.5mm, 9.5mm)
 *   │                                    │  TR center ≈ (200.5mm, 9.5mm)
 *   │  [Roll Number]  [Instructions]     │  BL center ≈ (9.5mm, 287.5mm)
 *   │                                    │  BR center ≈ (200.5mm, 287.5mm)
 *   │  Q001 ⓐⓑⓒⓓ  Q041 ...  Q161 ...  │
 *   │  Q002           Q042       Q162    │  Inner content area is between
 *   │  ...            ...        ...     │  the 4 anchor centers.
 *   │  Q040           Q080       Q200    │
 *   │                                    │
 *   │  BL                            BR  │
 *   └──■──────────────────────────────■──┘
 *
 *  All coordinates below are expressed as fractions of the
 *  anchor-to-anchor span:
 *    u = (x - TL.x) / (TR.x - TL.x)   in [0, 1]
 *    v = (y - TL.y) / (BL.y - TL.y)   in [0, 1]
 *
 *  This makes detection independent of photo resolution,
 *  rotation, or perspective — everything is relative to
 *  the detected corner anchors.
 * ============================================================
 */

// ---- A4 reference dimensions in mm ----
const PAGE_W = 210;
const PAGE_H = 297;

// Anchor centers in mm (7mm square at 6mm inset → center at 9.5mm)
const ANC_INSET = 9.5;

// Convert mm position to fraction of anchor-to-anchor span
const mmToU = (xMm) => (xMm - ANC_INSET) / (PAGE_W - 2 * ANC_INSET);
const mmToV = (yMm) => (yMm - ANC_INSET) / (PAGE_H - 2 * ANC_INSET);

// ---- Roll Number grid (8 columns × 10 digit rows) ----
// Roll container: left 31.5mm, top 52.5mm (48mm omr-body + 4.5mm)
// width 69.3mm, height 52mm
// CSS layout inside each roll-col (justify-content: space-around):
//   - Title bar (.roll-title): ~5mm (10px font + 2×1mm padding)
//   - Column area (.roll-columns): 52 - 5 = 47mm, padding 0.5mm top/bottom
//   - 11 flex children: 1 digit-header (~3mm) + 10 bubbles (3.4mm each)
//   - space-around: gap = (46mm - 3 - 34) / 11 items → 0.818mm per side
//   - First bubble center at ~6.4mm from column top, step ~4.22mm
const ROLL_LEFT_MM = 31.5;
const ROLL_TOP_MM = 52.5;
const ROLL_W_MM = 69.3;
const ROLL_H_MM = 52;
const ROLL_COLS = 8;
const ROLL_ROWS = 10;
const ROLL_TITLE_BAR_H = 5;   // .roll-title (black bar with text)
const ROLL_COL_W = ROLL_W_MM / ROLL_COLS; // 8.66mm per column
const ROLL_COL_TOP_MM = ROLL_TOP_MM + ROLL_TITLE_BAR_H; // 57.5mm
const ROLL_COL_H = ROLL_H_MM - ROLL_TITLE_BAR_H;        // 47mm
const ROLL_COL_PAD = 0.5; // padding top/bottom on .roll-col
const ROLL_USABLE_H = ROLL_COL_H - 2 * ROLL_COL_PAD;    // 46mm

// CSS space-around with 11 children (1 header 3mm + 10 bubbles 3.4mm each)
const ROLL_HDR_H = 3;          // digit header height
const ROLL_BUBBLE_H = 3.4;     // bubble diameter
const ROLL_ITEMS_TOTAL_H = ROLL_HDR_H + ROLL_ROWS * ROLL_BUBBLE_H; // 3 + 34 = 37mm
const ROLL_REMAINING = ROLL_USABLE_H - ROLL_ITEMS_TOTAL_H;         // 9mm
const ROLL_SPACE_PER_SIDE = ROLL_REMAINING / (2 * 11);             // 0.409mm

// First item (header) center at: pad + spaceBefore + headerH/2
// Bubble i center at: pad + spaceBefore + headerH + gapAfterHeader + i*(bubbleH + gap) + bubbleH/2
const ROLL_FIRST_BUBBLE_OFFSET = ROLL_COL_PAD + ROLL_SPACE_PER_SIDE + ROLL_HDR_H
  + (2 * ROLL_SPACE_PER_SIDE) + ROLL_BUBBLE_H / 2; // ≈ 6.43mm from col top
const ROLL_BUBBLE_STEP = ROLL_BUBBLE_H + 2 * ROLL_SPACE_PER_SIDE;  // ≈ 4.218mm

// Pre-compute roll bubble positions as (u, v) fractions
const ROLL_POSITIONS = [];
for (let col = 0; col < ROLL_COLS; col++) {
  const colPositions = [];
  const xMm = ROLL_LEFT_MM + (col + 0.5) * ROLL_COL_W;
  for (let row = 0; row < ROLL_ROWS; row++) {
    const yMm = ROLL_COL_TOP_MM + ROLL_FIRST_BUBBLE_OFFSET + row * ROLL_BUBBLE_STEP;
    colPositions.push({ u: mmToU(xMm), v: mmToV(yMm) });
  }
  ROLL_POSITIONS.push(colPositions);
}

// ---- Question bubble grid (5 columns × 40 rows × 4 options) ----
// questions-container: top 112mm (48+64), left 8mm, width (210-16)mm = 194mm, 5 columns
// Each column: 194/5 = 38.8mm wide, with 2mm internal padding → content width ~34.8mm
// question-row height: 4.1mm
// q-no: 8mm width + 2.5mm right padding = 10.5mm offset for bubble start
// bubble: 3.4mm diameter, gap 1.35mm → center spacing = 3.4 + 1.35 = 4.75mm
// Bottom of questions: 112 + 40 * 4.1 = 276mm (within page)
const Q_CONTAINER_TOP_MM = 112;
const Q_CONTAINER_LEFT_MM = 8;
const Q_CONTAINER_W_MM = 194;
const Q_COLS = 5;
const Q_COL_W = Q_CONTAINER_W_MM / Q_COLS; // 38.8mm
const Q_COL_PAD = 2; // column internal padding
const Q_ROW_H = 4.1;
const Q_ROWS_PER_COL = 40;
const Q_NUM_W = 10.5; // q-no width + padding
const Q_BUBBLE_DIAMETER = 3.4;
const Q_BUBBLE_GAP = 1.35;
const Q_BUBBLE_STEP = Q_BUBBLE_DIAMETER + Q_BUBBLE_GAP; // 4.75mm

// Pre-compute question bubble positions as (u, v) fractions for each question
function getQuestionBubbleUV(qNo) {
  // qNo is 1-based
  const colIdx = Math.floor((qNo - 1) / Q_ROWS_PER_COL);
  const rowIdx = (qNo - 1) % Q_ROWS_PER_COL;

  const colLeftMm = Q_CONTAINER_LEFT_MM + colIdx * Q_COL_W + Q_COL_PAD;
  const yMm = Q_CONTAINER_TOP_MM + (rowIdx + 0.5) * Q_ROW_H; // center of row

  const options = [];
  for (let oi = 0; oi < 4; oi++) {
    const xMm = colLeftMm + Q_NUM_W + (oi * Q_BUBBLE_STEP) + Q_BUBBLE_DIAMETER / 2;
    options.push({ u: mmToU(xMm), v: mmToV(yMm) });
  }
  return options;
}


/**
 * Main OMR processing function.
 * @param {string} base64 - JPEG as base64 (with or without data: prefix)
 * @param {number} questionCount - how many questions to read
 * @param {Function} onStatus - status callback
 */
export async function processOmrNative(base64, questionCount, onStatus) {
  try {
    onStatus('Decoding image...');
    await tick();

    const raw = base64.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(raw, 'base64');
    const decoded = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
    const { width: imgW, height: imgH, data: imgData } = decoded;

    onStatus('Converting to grayscale...');
    await tick();

    // 1. Downscale + grayscale
    const PW = 800;
    const PH = Math.round(PW * (imgH / imgW));
    const gray = new Uint8Array(PW * PH);

    for (let y = 0; y < PH; y++) {
      const srcY = Math.floor(y * imgH / PH);
      for (let x = 0; x < PW; x++) {
        const srcX = Math.floor(x * imgW / PW);
        const i = (srcY * imgW + srcX) * 4;
        gray[y * PW + x] = Math.round(0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2]);
      }
    }

    onStatus('Locating corner anchors...');
    await tick();

    // 2. Find 4 corner anchor centroids
    const searchW = Math.round(PW * 0.18);
    const searchH = Math.round(PH * 0.18);

    const findAnchor = (sx, sy, w, h) => {
      // Two-pass: first find the darkest cluster, then refine
      let sumX = 0, sumY = 0, count = 0;
      // Use a stricter threshold first
      for (let y = sy; y < sy + h; y++) {
        for (let x = sx; x < sx + w; x++) {
          if (gray[y * PW + x] < 80) {
            sumX += x; sumY += y; count++;
          }
        }
      }
      if (count > 50) {
        // Refine: only keep pixels within 2× the expected anchor radius from centroid
        const cx0 = sumX / count, cy0 = sumY / count;
        const maxR = Math.min(w, h) * 0.4;
        let sx2 = 0, sy2 = 0, c2 = 0;
        for (let y = Math.max(sy, Math.floor(cy0 - maxR)); y < Math.min(sy + h, Math.ceil(cy0 + maxR)); y++) {
          for (let x = Math.max(sx, Math.floor(cx0 - maxR)); x < Math.min(sx + w, Math.ceil(cx0 + maxR)); x++) {
            if (gray[y * PW + x] < 80) {
              sx2 += x; sy2 += y; c2++;
            }
          }
        }
        if (c2 > 20) return { x: sx2 / c2, y: sy2 / c2, found: true };
        return { x: cx0, y: cy0, found: true };
      }
      return { x: sx + w / 2, y: sy + h / 2, found: false };
    };

    const tl = findAnchor(0, 0, searchW, searchH);
    const tr = findAnchor(PW - searchW, 0, searchW, searchH);
    const bl = findAnchor(0, PH - searchH, searchW, searchH);
    const br = findAnchor(PW - searchW, PH - searchH, searchW, searchH);

    const anchorsFound = [tl, tr, bl, br].filter(a => a.found).length;
    if (anchorsFound < 3) {
      return { success: false, error: `Only ${anchorsFound}/4 corner anchors detected. Ensure all 4 black corner squares are clearly visible.` };
    }

    onStatus(`Anchors found (${anchorsFound}/4). Mapping coordinates...`);
    await tick();

    // 3. Bilinear interpolation: map (u, v) in [0,1] to pixel coords in source image
    //    (u, v) represents position relative to the anchor quadrilateral
    const mapUV = (u, v) => ({
      x: (1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + (1 - u) * v * bl.x + u * v * br.x,
      y: (1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + (1 - u) * v * bl.y + u * v * br.y,
    });

    // 4. Bubble fill checker — samples a circular region in the source grayscale image
    const checkFill = (u, v, radiusFrac = 0.008) => {
      const center = mapUV(u, v);
      const rPx = Math.max(4, Math.round(radiusFrac * PW));
      let dark = 0, total = 0;

      for (let dy = -rPx; dy <= rPx; dy++) {
        for (let dx = -rPx; dx <= rPx; dx++) {
          if (dx * dx + dy * dy <= rPx * rPx) {
            const px = Math.round(center.x + dx);
            const py = Math.round(center.y + dy);
            if (px >= 0 && px < PW && py >= 0 && py < PH) {
              // Adaptive: compare to local neighborhood
              if (gray[py * PW + px] < 120) dark++;
              total++;
            }
          }
        }
      }
      return total > 0 ? dark / total : 0;
    };

    onStatus('Reading roll number...');
    await tick();

    // 5. Read roll number using pre-computed (u,v) positions
    let detectedRoll = '';
    for (let col = 0; col < ROLL_COLS; col++) {
      let maxFill = -1, digit = '?';
      for (let row = 0; row < ROLL_ROWS; row++) {
        const pos = ROLL_POSITIONS[col][row];
        const f = checkFill(pos.u, pos.v, 0.006);
        if (f > 0.40 && f > maxFill) {
          maxFill = f;
          digit = String(row);
        }
      }
      detectedRoll += digit;
    }

    onStatus('Scanning answer bubbles...');
    await tick();

    // 6. Read question answers
    const answers = [];
    const optLabels = ['A', 'B', 'C', 'D'];

    for (let q = 1; q <= questionCount; q++) {
      const bubbles = getQuestionBubbleUV(q);
      let maxF = -1, sel = null;
      let filledOptions = [];

      bubbles.forEach((pos, oi) => {
        const f = checkFill(pos.u, pos.v, 0.006);
        if (f > 0.40) {
          filledOptions.push(optLabels[oi]);
        }
        if (f > 0.40 && f > maxF) {
          maxF = f;
          sel = optLabels[oi];
        }
      });

      // If more than one bubble is filled, reward as negative (marked as MULTIPLE)
      if (filledOptions.length > 1) {
        sel = 'MULTIPLE';
      }

      answers.push({ qNo: q, selectedOption: sel });

      // Yield every 20 questions to keep UI responsive
      if (q % 20 === 0) {
        onStatus(`Scanning bubbles... ${q}/${questionCount}`);
        await tick();
      }
    }

    onStatus('Scan complete!');
    return {
      success: true,
      rollNo: detectedRoll.includes('?') ? '????????' : detectedRoll,
      rawRoll: detectedRoll,
      answers,
      anchorsFound,
    };
  } catch (err) {
    return { success: false, error: 'Processing error: ' + err.message };
  }
}
