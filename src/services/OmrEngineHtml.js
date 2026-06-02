export const getOmrEngineHtml = () => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0f19;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      overflow: hidden;
    }
    #container {
      width: 100%;
      max-width: 500px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
      padding: 20px;
      box-sizing: border-box;
    }
    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.5px;
      background: linear-gradient(to right, #38bdf8, #818cf8);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    #canvas-container {
      position: relative;
      width: 100%;
      aspect-ratio: 1 / 1.414;
      background-color: #1e293b;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    canvas {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    #status {
      font-size: 14px;
      color: #94a3b8;
      font-weight: 500;
      text-align: center;
    }
    .spinner {
      border: 3px solid rgba(255, 255, 255, 0.05);
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border-left-color: #38bdf8;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>

  <div id="container">
    <h2>GARUD OMR SCANNER</h2>
    <div id="canvas-container">
      <canvas id="cv-canvas"></canvas>
    </div>
    <div style="display: flex; align-items: center; gap: 8px;">
      <div id="loader" class="spinner"></div>
      <div id="status">Ready for scanning...</div>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('cv-canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const statusEl = document.getElementById('status');
    const loader = document.getElementById('loader');

    // Communicate back to React Native
    function sendToRN(data) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
      } else {
        console.log("Result (RN simulation):", data);
      }
    }

    // Logger to React Native
    function logToRN(msg) {
      sendToRN({ type: 'log', message: msg });
    }

    // Set canvas resolution
    canvas.width = 1000;
    canvas.height = 1414;

    // Listen for messages from React Native (via webViewRef.postMessage)
    // This bridges RN → WebView communication to trigger processOmr()
    window.addEventListener('message', function(event) {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && data.type === 'process') {
          logToRN('Received process message from React Native, starting OMR scan...');
          processOmr(data.base64Image, data.questionCount, data.sections);
        }
      } catch (e) {
        logToRN('Error parsing message from RN: ' + e.message);
      }
    });
    // Also listen on document for Android WebView compatibility
    document.addEventListener('message', function(event) {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data && data.type === 'process') {
          logToRN('Received process message from React Native (document), starting OMR scan...');
          processOmr(data.base64Image, data.questionCount, data.sections);
        }
      } catch (e) {
        logToRN('Error parsing message from RN: ' + e.message);
      }
    });

    // processOmr is also available as a global function for direct injectJavaScript calls

    function processOmr(base64Image, questionCount, sections) {
      logToRN("processOmr invoked successfully");
      statusEl.textContent = "Loading OMR image...";
      loader.style.display = "block";

      const img = new Image();
      img.onload = function() {
        try {
          logToRN("img.onload fired, dimensions: " + img.width + "x" + img.height);
          statusEl.textContent = "Processing image...";
          
          // Downscale the camera photo to a standard high-performance processing resolution (e.g. 800px width)
          const procWidth = 800;
          const procHeight = Math.round(800 * (img.height / img.width));
          logToRN("Canvas processing grid set to downscaled resolution: " + procWidth + "x" + procHeight);
          
          // Temporary canvas for source image processing
          const tCanvas = document.createElement('canvas');
          tCanvas.width = procWidth;
          tCanvas.height = procHeight;
          const tCtx = tCanvas.getContext('2d', { willReadFrequently: true });
          tCtx.drawImage(img, 0, 0, procWidth, procHeight);

          // Get image data for adaptive thresholding
          const imgData = tCtx.getImageData(0, 0, procWidth, procHeight);
          const data = imgData.data;

          statusEl.textContent = "Calibrating alignment anchors...";
          
           // 1. Convert to grayscale and binarize inside grayscaled buffer
          const gray = new Uint8Array(procWidth * procHeight);
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i+1];
            const b = data[i+2];
            gray[i/4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          }
          logToRN("Grayscale conversion finished");

          // 2. Locate the 4 corner alignment markers (solid black squares)
          // We divide the image into 4 quadrant regions
          const qW = Math.round(procWidth * 0.22); // search region width
          const qH = Math.round(procHeight * 0.22); // search region height

          // Find black square centroids in each corner quadrant
          // We look for pixels that are very dark compared to the local neighborhood (or simple threshold)
          // Since it's a black square on white paper, we can use a basic thresholding for anchor search
          const findAnchor = (startX, startY, width, height) => {
            let sumX = 0;
            let sumY = 0;
            let count = 0;

            // Sample region to find darkest cluster
            for (let y = startY; y < startY + height; y++) {
              for (let x = startX; x < startX + width; x++) {
                const idx = y * procWidth + x;
                // If pixel is very dark (black square anchor)
                if (gray[idx] < 65) {
                  sumX += x;
                  sumY += y;
                  count++;
                }
              }
            }

            if (count > 25) {
              return { x: sumX / count, y: sumY / count, found: true };
            }
            // Fallback to absolute corner of region if not found
            return { x: startX + width / 2, y: startY + height / 2, found: false };
          };

          logToRN("Locating corner anchors...");
          const tl = findAnchor(5, 5, qW, qH);
          const tr = findAnchor(procWidth - qW - 5, 5, qW, qH);
          const bl = findAnchor(5, procHeight - qH - 5, qW, qH);
          const br = findAnchor(procWidth - qW - 5, procHeight - qH - 5, qW, qH);
          logToRN("Calibrated anchors: tl=" + JSON.stringify(tl) + ", tr=" + JSON.stringify(tr) + ", bl=" + JSON.stringify(bl) + ", br=" + JSON.stringify(br));

          statusEl.textContent = "Warping perspective grid...";
          logToRN("Warping 1000x1414 bilinear perspective grid...");

          // 3. Bilinear Quadrilateral Mapping
          // Standard reference size is 1000 x 1414
          // Maps a point (u, v) in unit space [0, 1]x[0, 1] to downscaled source image coordinates
          const getOriginalCoords = (u, v) => {
            const x = (1 - u) * (1 - v) * tl.x + u * (1 - v) * tr.x + (1 - u) * v * bl.x + u * v * br.x;
            const y = (1 - u) * (1 - v) * tl.y + u * (1 - v) * tr.y + (1 - u) * v * bl.y + u * v * br.y;
            return { x: Math.round(x), y: Math.round(y) };
          };

          // 4. Warp the binarized image to our destination A4 canvas (1000x1414)
          const destImgData = ctx.createImageData(1000, 1414);
          const destData = destImgData.data;
          const warpedGray = new Uint8Array(1000 * 1414);

          for (let v = 0; v < 1414; v++) {
            for (let u = 0; u < 1000; u++) {
              const uPct = u / 1000;
              const vPct = v / 1414;
              
              const orig = getOriginalCoords(uPct, vPct);
              let val = 255; // default white

              if (orig.x >= 0 && orig.x < procWidth && orig.y >= 0 && orig.y < procHeight) {
                val = gray[orig.y * procWidth + orig.x];
              }

              warpedGray[v * 1000 + u] = val;

              // Render grayscale warped image to screen canvas
              const destIdx = (v * 1000 + u) * 4;
              destData[destIdx] = val;     // R
              destData[destIdx + 1] = val; // G
              destData[destIdx + 2] = val; // B
              destData[destIdx + 3] = 255; // A
            }
          }
          ctx.putImageData(destImgData, 0, 0);
          logToRN("Perspective warping completed successfully.");

          statusEl.textContent = "Scanning bubble fields...";

          // 5. Adaptive thresholding on the warped grayscale A4 space to handle lighting variations
          // This creates a binarized version of the bubbles
          const binarized = new Uint8Array(1000 * 1414);
          const w = 1000;
          const h = 1414;
          
          // Fast Integral Image for Adaptive Thresholding (Wellner's algorithm or box filter)
          const integral = new Uint32Array(w * h);
          for (let y = 0; y < h; y++) {
            let sum = 0;
            for (let x = 0; x < w; x++) {
              const idx = y * w + x;
              sum += warpedGray[idx];
              if (y === 0) {
                integral[idx] = sum;
              } else {
                integral[idx] = integral[(y - 1) * w + x] + sum;
              }
            }
          }

          // Adaptive Thresholding logic
          const S = 30; // local neighborhood block size
          const T = 12; // threshold factor in percentage
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const idx = y * w + x;
              let x1 = Math.max(0, x - S/2);
              let x2 = Math.min(w - 1, x + S/2);
              let y1 = Math.max(0, y - S/2);
              let y2 = Math.min(h - 1, y + S/2);
              
              const count = (x2 - x1) * (y2 - y1);
              const sum = integral[y2 * w + x2] - integral[y1 * w + x2] - integral[y2 * w + x1] + integral[y1 * w + x1];
              
              if (warpedGray[idx] * count < sum * (100 - T) / 100) {
                binarized[idx] = 1; // BLACK (marked)
              } else {
                binarized[idx] = 0; // WHITE (paper)
              }
            }
          }
          logToRN("Adaptive thresholding binarization completed.");

          // 6. Bubble fill checker helper
          // Computes percentage of black binarized pixels in radius
          const checkBubbleFill = (centerX, centerY, radius = 9) => {
            let blackCount = 0;
            let totalCount = 0;
            
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                if (dx*dx + dy*dy <= radius*radius) {
                  const px = Math.round(centerX + dx);
                  const py = Math.round(centerY + dy);
                  if (px >= 0 && px < 1000 && py >= 0 && py < 1414) {
                    if (binarized[py * 1000 + px] === 1) {
                      blackCount++;
                    }
                    totalCount++;
                  }
                }
              }
            }
            return blackCount / totalCount;
          };

          // 7. Parse Roll Number (8 Columns, 0-9 rows)
          // Located at:
          // X: start 15% (150px) to 48% (480px) -> Column spacing = (480 - 150) / 8 = 41.25px
          // Y: start 17% (240px) to 34.5% (488px) -> Row spacing = (488 - 240) / 10 = 24.8px
          const rollStartX = 158;
          const rollEndX = 482;
          const rollStartY = 240;
          const rollEndY = 488;
          const rollColStep = (rollEndX - rollStartX) / 7;
          const rollRowStep = (rollEndY - rollStartY) / 9;

          let detectedRoll = "";
          const rollBubblesDetails = [];

          for (let col = 0; col < 8; col++) {
            const cx = rollStartX + col * rollColStep;
            let maxFill = -1;
            let detectedDigit = "?";

            for (let row = 0; row < 10; row++) {
              const cy = rollStartY + row * rollRowStep;
              const fillPct = checkBubbleFill(cx, cy, 9);
              
              rollBubblesDetails.push({ col, digit: row, fillPct, cx, cy });

              // If fill is significant and higher than any other digit in this column
              if (fillPct > 0.45 && fillPct > maxFill) {
                maxFill = fillPct;
                detectedDigit = String(row);
              }
            }
            detectedRoll += detectedDigit;
          }
          logToRN("Roll number parsed successfully: " + detectedRoll);

          // 8. Parse Question Bubble Fields
          // Grid layout matches:
          // Up to 200 questions.
          // Spaced across columns. Each column holds 40 questions.
          // Y limits: Y = 560px to 1340px -> height 780px.
          // 40 questions => Step Y = 780 / 40 = 19.5px
          // Options: A, B, C, D spaced at 17px steps
          const qStartY = 560;
          const qRowHeight = 19.5;
          const bubbleOptionSpacing = 16.5;

          // Determine how many columns of 40 questions we need - FIXED to 5 columns for static coordinates
          const colCapacity = 40;
          const activeCols = 5;
          
          // Column X centers spread across X = [40px, 960px]
          // A single column layout uses X centers, width of question block ~150px
          // We can calculate column start positions mathematically
          const getColStartX = (colIdx) => {
            const availableWidth = 920; // 960 - 40
            const colWidth = availableWidth / activeCols;
            return 40 + colIdx * colWidth + 40; // centered offset
          };

          const detectedAnswers = [];
          logToRN("Parsing OMR bubble fields for " + questionCount + " questions...");

          for (let q = 1; q <= questionCount; q++) {
            const colIdx = Math.floor((q - 1) / colCapacity);
            const rowIdx = (q - 1) % colCapacity;

            const colStartX = getColStartX(colIdx);
            const cy = qStartY + rowIdx * qRowHeight;
            
            // X coordinates for A, B, C, D bubbles in this row
            // Question number label is at colStartX
            // Bubble A is at colStartX + 42px
            const startBubbleX = colStartX + 45;
            
            const options = ['A', 'B', 'C', 'D'];
            let maxFill = -1;
            let selectedOption = null;
            const optionFills = {};

            options.forEach((opt, oIdx) => {
              const cx = startBubbleX + oIdx * bubbleOptionSpacing;
              const fillPct = checkBubbleFill(cx, cy, 9);
              optionFills[opt] = fillPct;

              if (fillPct > 0.45 && fillPct > maxFill) {
                maxFill = fillPct;
                selectedOption = opt;
              }
            });

            detectedAnswers.push({
              qNo: q,
              selectedOption: selectedOption, // null if unattempted
              fills: optionFills,
              cx: startBubbleX + 24, // mid point for visual draw
              cy: cy,
            });
          }

          // 9. Draw scanning highlights on the canvas for visual wow!
          // Draw anchors
          ctx.lineWidth = 4;
          const drawMarker = (pt, color) => {
            ctx.strokeStyle = color;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 16, 0, 2*Math.PI);
            ctx.stroke();
          };
          
          // We can't draw original anchors directly, but we can highlight corners of warped space
          ctx.strokeStyle = '#38bdf8';
          ctx.strokeRect(5, 5, 990, 1404);

          // Highlight detected Roll bubbles
          ctx.lineWidth = 1.5;
          rollBubblesDetails.forEach(b => {
            if (b.fillPct > 0.45) {
              ctx.strokeStyle = '#10b981'; // Green for selected
              ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
            } else {
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
              ctx.fillStyle = 'transparent';
            }
            ctx.beginPath();
            ctx.arc(b.cx, b.cy, 9, 0, 2*Math.PI);
            ctx.fill();
            ctx.stroke();
          });

          // Highlight detected Question bubbles
          detectedAnswers.forEach(q => {
            const options = ['A', 'B', 'C', 'D'];
            options.forEach((opt, oIdx) => {
              const cx = (q.cx - 24) + oIdx * bubbleOptionSpacing;
              const fill = q.fills[opt];
              if (opt === q.selectedOption) {
                ctx.strokeStyle = '#6366f1'; // Indigo for selected
                ctx.fillStyle = 'rgba(99, 102, 241, 0.25)';
              } else {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.fillStyle = 'transparent';
              }
              ctx.beginPath();
              ctx.arc(cx, q.cy, 8, 0, 2*Math.PI);
              ctx.fill();
              ctx.stroke();
            });
          });

          statusEl.textContent = "Scanning completed!";
          loader.style.display = "none";
          logToRN("OMR scanning finished! Sending results back to React Native. Roll: " + detectedRoll + ", Answers: " + detectedAnswers.length);

          // Send results back to React Native container
          sendToRN({
            success: true,
            rollNo: detectedRoll.includes("?") ? "????????" : detectedRoll,
            rawRoll: detectedRoll,
            answers: detectedAnswers.map(ans => ({
              qNo: ans.qNo,
              selectedOption: ans.selectedOption,
            })),
          });

        } catch (err) {
          loader.style.display = "none";
          statusEl.textContent = "Error scanning image.";
          logToRN("CRITICAL WEBVIEW SCANNER EXCEPTION: " + err.message + "\nStack:\n" + err.stack);
          sendToRN({ success: false, error: "Processing error: " + err.message });
        }
      };

      img.onerror = function() {
        loader.style.display = "none";
        statusEl.textContent = "Image loading failed.";
        sendToRN({ success: false, error: "Failed to load base64 source image in canvas" });
      };

      // Set image source to trigger load
      img.src = base64Image.startsWith('data:') ? base64Image : ('data:image/jpeg;base64,' + base64Image);
    }

    // Signal to RN that the WebView engine is loaded
    logToRN('WebView CV engine loaded and ready.');
    sendToRN({ type: 'ready' });
  </script>
</body>
</html>
`;
