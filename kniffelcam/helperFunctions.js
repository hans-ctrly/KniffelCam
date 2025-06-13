async function startCamera(canvas, existingStream, useFrontCamera) {
  const videoContainer = document.getElementById('videoContainer');
  if (existingStream) {
      existingStream.getTracks().forEach(track => track.stop());
  }
  
  const constraints = {
      video: {
          facingMode: useFrontCamera ? "user" : "environment",
      },
      audio: false
  };
  
  try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      return new Promise((resolve) => {
          video.onloadedmetadata = () => {
              video.play();
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              videoContainer.style.height = video.offsetHeight + 'px';
              videoContainer.style.width = video.offsetWidth + 'px';
              // Initialize overlay AFTER canvas dimensions are set
              const overlayCtx = initializeOverlay(canvas);
              
              // Return both stream and overlayCtx
              resolve({ stream, overlayCtx });
          };
      });
      
  } catch (err) {
      console.error("Camera start error:", err);
      return { stream: null, overlayCtx: null };
  }
}

function stopCamera(currentStream) {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null; // Clear the reference
    video.srcObject = null; // Clear the video element's source
  }
  const overlayCanvas = document.getElementById("overlayCanvas");
  overlayCanvas.style.display = "none";
}

function initializeOverlay(cameraCanvas) {
    const overlayCanvas = document.getElementById("overlayCanvas");
    overlayCanvas.width = cameraCanvas.width;
    overlayCanvas.height = cameraCanvas.height;    
    const overlayCtx = overlayCanvas.getContext('2d');    
    return overlayCtx;
}

// Clear overlay canvas
function clearOverlay(overlayCtx) {
  if (overlayCtx) {
    const overlayCanvas = overlayCtx.canvas;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }
}

function createHtmlTable(scoreFields, players) {
    const table = document.getElementById("resultTable");
    table.innerHTML = "";
    for (const [row, field] of scoreFields.entries()) {
        const tableRow = document.createElement("tr");
        tableRow.classList.add(field.classList);
        for (let col = 0; col < players + 1; col++) {
            tableCell = document.createElement("td");
            if (field.readDigit) {
                tableCell.classList.add("table-cell-edit")
            } else {
                tableCell.classList.add("table-cell-calculated")
            }
            if (col === 0) {
                tableCell.innerHTML = field.displayName;
            }
            tableCell.id = field.idPrefix + col.toString();
            tableRow.appendChild(tableCell)
        }
        table.appendChild(tableRow);
    }
}

function createTableTemplate(cardWidth, cardHeight) {
    // Define the Kniffel score sheet based on measured values
  const cellHeight = cardHeight * 0.0355;
  const cellWidth = cardWidth * 0.10526

  // Add some randomness here to allow for inaccuracies in the printed card
  const randomFactor = (Math.random() * 0.01) - 0.005 // random float between -0.005 and 0.005
  const offsetUpperBlock = cardHeight * (0.23 + randomFactor);
  const offsetLowerBlock = cardHeight * (0.135 + randomFactor);
  const offsetLeft = 0.34 * cardWidth;
  const players = 2; //Number of player columns per scorecard
  //Extra size of each cell allow for inaccuracies in the warped image
  const cellPaddingX = .25; 
  const cellPaddingY = .45;

  
  const scoreFields = [
    {name: "Header", displayName: "", idPrefix: "h", 
        classList: "result-table-header", upper: true, readDigit: false},
    {name: "Einser", displayName: "&#x2680;&#x2680;&#x2680", idPrefix: "0", 
        classList: "result-table-row", upper: true, readDigit: true},
    {name: "Zweier", displayName: "&#x2681;&#x2681;&#x2681;", idPrefix: "1", 
        classList: "result-table-row", upper: true, readDigit: true},
    {name: "Dreier", displayName: "&#x2682;&#x2682;&#x2682;", idPrefix: "2", 
        classList: "result-table-row", upper: true, readDigit: true},
    {name: "Vierer", displayName: "&#x2683;&#x2683;&#x2683;", idPrefix: "3", 
        classList: "result-table-row", upper: true, readDigit: true},
    {name: "Fünfer", displayName: "&#x2684;&#x2684;&#x2684;", idPrefix: "4", 
        classList: "result-table-row", upper: true, readDigit: true},
    {name: "Sechser", displayName: "&#x2685;&#x2685;&#x2685;", idPrefix: "5", 
        classList: "result-table-row", upper: true, readDigit: true},
    {name: "Sum upper", displayName: "Total", idPrefix: "u", 
        classList: "result-table-row", upper: true, readDigit: false},
    {name: "Bonus", displayName: "Bonus", idPrefix: "b", 
        classList: "result-table-row", upper: true, readDigit: false},
    {name: "Total upper", displayName: "Total", idPrefix: "tu", 
        classList: "result-table-row", upper: true, readDigit: false},
    {name: "Separator", displayName: "", idPrefix: "s", 
        classList: "section-separator", upper: true, readDigit: false},
    {name: "Dreierpasch", displayName: "Dreierpash", idPrefix: "6", 
        classList: "result-table-row", upper: false, readDigit: true},
    {name: "Viererpasch", displayName: "Viererpasch", idPrefix: "7", 
        classList: "result-table-row", upper: false, readDigit: true},
    {name: "Full-House", displayName: "Full-House", idPrefix: "8", 
        classList: "result-table-row", upper: false, readDigit: true},
    {name: "Kleine Straße", displayName: "Kleine Straße", idPrefix: "9", 
        classList: "result-table-row", upper: false, readDigit: true},
    {name: "Große Straße", displayName: "Große Straße", idPrefix: "10", 
        classList: "result-table-row", upper: false, readDigit: true},
    {name: "Kniffel", displayName: "Kniffel", idPrefix: "11", 
        classList: "result-table-row", upper: false, readDigit: true},
    {name: "Chance", displayName: "Chance", idPrefix: "12", 
        classList: "result-table-row", upper: false, readDigit: true},
    {name: "Sum lower", displayName: "Total lower", idPrefix: "u", 
        classList: "result-table-row", upper: true, readDigit: false},
    {name: "Total upper 2", displayName: "Total upper", idPrefix: "tuz", 
        classList: "result-table-row", upper: true, readDigit: false},
    {name: "Final score", displayName: "Final", idPrefix: "f", 
        classList: "result-table-row", upper: true, readDigit: false},
  ];

  // Show table in frontend
  createHtmlTable(scoreFields, players);

  // Create table image overlay for cell detection
  let cellTemplate = [];
  let row = 0
  for (const field of scoreFields) {
    if (field.readDigit) {
        for (let col = 0; col < players; col++) {
          const x = ((col * cellWidth) + offsetLeft) - (cellPaddingX * cellWidth) ;
          const yOffset = field.upper ? offsetUpperBlock : offsetUpperBlock + offsetLowerBlock;
          const y = (row * cellHeight) + yOffset - (cellPaddingY * cellHeight)
          cellTemplate.push({row: row, 
                             col: col, 
                             x: Math.round(x), 
                             y: Math.round(y),
                             w: Math.round(cellWidth + (2 * cellPaddingX * cellWidth)), 
                             h: Math.round(cellHeight  + (2 * cellPaddingY * cellHeight))});
        }
    row++;
    }
  }
  return cellTemplate;
}


function detectTableAndDigits(src, cardWidth, cardHeight) {
  const srcCorners = detectCardCorners(src, true);
  if (!srcCorners) {
    return null;
  }
  const warped = warpCard(src, srcCorners, cardWidth, cardHeight);
  const cellTemplate = createTableTemplate(cardWidth, cardHeight);
  const cells = extractCells(warped, cellTemplate);
  if (!cells) {
    console.warn("Extracting cells failed");
    return null;
  } else {
    console.log("Succesfull refinement of table cells");
    return cells;
  }
}

function detectCardCorners(src, debugPrint = false) {
  let blurred = new cv.Mat();
  let binary = new cv.Mat();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  // Blur (smoothes out noise and improves the resulting binary)
  // fyi: Canny() does already include a Gaussian blur, but it works way better with this extra step
  cv.GaussianBlur(src, blurred, new cv.Size(5, 5), 0);
  // Turn to binary image
  cv.Canny(blurred, binary, 50, 150);

  // Find contours
  cv.findContours(binary, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  let maxArea = 0;
  let biggestContour = null;

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    const peri = cv.arcLength(cnt, true);
    const approx = new cv.Mat();

    cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

    // Find the largest 4-corner polygon
    if (area > maxArea && approx.rows === 4) {
      maxArea = area;
      biggestContour = approx;
    } else {
      approx.delete();
    }
    cnt.delete();
  }

  let cardCorners = null;
  if (biggestContour) {
    const sorted = sortCorners(biggestContour);

    cardCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
      sorted[0].x, sorted[0].y,
      sorted[1].x, sorted[1].y,
      sorted[2].x, sorted[2].y,
      sorted[3].x, sorted[3].y
    ]);
  
    if (debugPrint) {
      // Draw found corners on debug image
      let debugBinary = new cv.Mat();
      cv.cvtColor(binary, debugBinary, cv.COLOR_GRAY2RGBA);
      for (let pt of sorted) {
        cv.circle(debugBinary, new cv.Point(pt.x, pt.y), 10, new cv.Scalar(0, 255, 0, 255), -1);
      }
      const canvasDEBUG = document.createElement('canvas');
      canvasDEBUG.width = debugBinary.cols;
      canvasDEBUG.height = debugBinary.rows;
      cv.imshow(canvasDEBUG, debugBinary);
      const debugContainer = document.getElementById("debugBinary");
      debugContainer.innerHTML = ""; // Clear image from previous tries
      debugContainer.appendChild(canvasDEBUG);
    }
    biggestContour.delete();
  }
  blurred.delete(); binary.delete(); contours.delete(); hierarchy.delete();
  
  return cardCorners
}

function warpCard(src, srcCorners, cardWidth, cardHeight) {
  let warped = new cv.Mat();
  const dstCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    cardWidth, 0,
    cardWidth, cardHeight,
    0, cardHeight
  ]);
  const transform = cv.getPerspectiveTransform(srcCorners, dstCorners);
  cv.warpPerspective(src, warped, transform, new cv.Size(cardWidth, cardHeight));
  dstCorners.delete(); transform.delete();
  return warped;
}

function extractCells(tableImage, template) {
    const cells = [];
    const debugImg = tableImage.clone();
    let failed = false;
    for (const cell of template) {
      const rect = new cv.Rect(cell.x, cell.y, cell.w, cell.h);
      const roi = tableImage.roi(rect);
     
      // Draw approximate cells on debug image
      const pt1 = new cv.Point(cell.x, cell.y);
      const pt2 = new cv.Point(cell.x + cell.w, cell.y + cell.h);
      cv.rectangle(debugImg, pt1, pt2, getRandomColor(), 2);
      
      // Try refining the found cell
      const debugContainer = document.getElementById("debugCellRefinement");
      const whiteThreshold = .7;
      const refinedContour = refineCell(roi, whiteThreshold, debugContainer);
      if (!refinedContour) {
        debugContainer.innerHTML = "";
        failed = true;
        continue;
      }

      const finalROI = roi.roi(refinedContour);
      cells.push({
        row: cell.row,
        col: cell.col,
        image: finalROI,
      });
    }
    
    const canvasDEBUG = document.createElement('canvas');
    canvasDEBUG.width = debugImg.cols;
    canvasDEBUG.height = debugImg.rows;
    cv.imshow(canvasDEBUG, debugImg);
    const debugContainer = document.getElementById("debugTable");
    debugContainer.innerHTML = ""; // Clear image from previous tries
    debugContainer.appendChild(canvasDEBUG);
    
    debugImg.delete();
    if (failed) {
        return null;
    } else {
        return cells;
    }
}

function refineCell(paddedMat, whiteThreshold, debugContainer) {
  let gray = new cv.Mat();
  let binary = new cv.Mat();
  // Grayscale and binary
  cv.cvtColor(paddedMat, gray, cv.COLOR_RGBA2GRAY);
  cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  cv.bitwise_not(binary, binary);

  const rows = binary.rows;
  const cols = binary.cols;

  const horizontalLines = [];
  const verticalLines = [];

  // Scan rows from top
  for (let y = 0; y < rows; y++) {
    const row = binary.row(y);
    const whiteRatio = cv.countNonZero(row) / cols;
    if (whiteRatio > whiteThreshold) {
      horizontalLines.push(y);
      if (horizontalLines.length >= 2) break;
    }
  }

  // Scan rows from bottom
  for (let y = rows - 1; y >= 0; y--) {
    const row = binary.row(y);
    const whiteRatio = cv.countNonZero(row) / cols;
    if (whiteRatio > whiteThreshold) {
      horizontalLines.push(y);
      if (horizontalLines.length >= 4) break;
    }
  }

  // Scan cols from left
  for (let x = 0; x < cols; x++) {
    const col = binary.col(x);
    const whiteRatio = cv.countNonZero(col) / rows;
    if (whiteRatio > whiteThreshold) {
      verticalLines.push(x);
      if (verticalLines.length >= 2) break;
    }
  }

  // Scan cols from right
  for (let x = cols - 1; x >= 0; x--) {
    const col = binary.col(x);
    const whiteRatio = cv.countNonZero(col) / rows;
    if (whiteRatio > whiteThreshold) {
      verticalLines.push(x);
      if (verticalLines.length >= 4) break;
    }
  }

  let x1, y1, x2, y2;
  // Sort and get bounding box
  if (horizontalLines.length >= 2 && verticalLines.length >= 2) {
    horizontalLines.sort((a, b) => a - b);
    verticalLines.sort((a, b) => a - b);
    y1 = horizontalLines[0]
    y2 = horizontalLines[horizontalLines.length - 1];
    x1 = verticalLines[0]
    x2 = verticalLines[verticalLines.length - 1];

    const ratio = (x2 - x1) / (y2 - y1);
    // skip if ratio of found cell seems weird
    const maxRatioDeviance = .25;
    const expectedRatio = 1.8;
    if ((ratio > expectedRatio * (1 + maxRatioDeviance)) || (ratio < expectedRatio * (1 - maxRatioDeviance))) {
      console.warn(`Skipped ratio of ${ratio} (Expected ratio is ${expectedRatio})`);
      return null;
    }
  } else {
    // skip if no cell is found
    return null;
  }

  const resultRect = new cv.Rect(x1, y1, x2 - x1, y2 - y1);
  // Draw cell boundary on debug image
  let debug = new cv.Mat();
  cv.cvtColor(binary, debug, cv.COLOR_GRAY2RGBA);
  const vec = new cv.MatVector();
  cv.rectangle(debug, new cv.Point(x1, y1), new cv.Point(x2, y2), new cv.Scalar(0, 255, 0, 255), 2);
  const canvasDEBUG = document.createElement('canvas');
  canvasDEBUG.width = debug.cols;
  canvasDEBUG.height = debug.rows;
  cv.imshow(canvasDEBUG, debug);
  const debugImg = document.createElement("div");
  debugImg.classList.add("debug-cell");
  debugImg.appendChild(canvasDEBUG);
  debugContainer.appendChild(debugImg);
  debug.delete();
  gray.delete(); binary.delete();

  return resultRect;
}

// Get different colors for the cell borders in the debug image 
function getRandomColor() {
    return new cv.Scalar(
        Math.floor(Math.random() * 256), // R
        Math.floor(Math.random() * 256), // G
        Math.floor(Math.random() * 256), // B
        255                              // A
    );
}

// Sort the 4 corners of the found score card
  function sortCorners(cnt) {
    let points = [];
    for (let i = 0; i < cnt.rows; i++) {
      points.push({ x: cnt.intPtr(i, 0)[0], y: cnt.intPtr(i, 0)[1] });
    }

    // Sort by y, then x
    points.sort((a, b) => a.y - b.y);
    let top = points.slice(0, 2).sort((a, b) => a.x - b.x);
    let bottom = points.slice(2, 4).sort((a, b) => a.x - b.x);
    return [top[0], top[1], bottom[1], bottom[0]];
  }

function cleanCellEdges(binaryImage, colorDebug) {
  const lineThreshold = 0.5;
  const scanDepth = .1;
  const maxMisses = 2;
  const h = binaryImage.rows;
  const w = binaryImage.cols;
  const minLineLength = Math.floor(0.8 * w); // horizontal
  const minLineHeight = Math.floor(0.8 * h); // vertical
  const white = 255;
  let misses = 0;
  
  const scanDepthX = Math.round(scanDepth * w)
  const scanDepthY = Math.round(scanDepth * h)
  
    // Clean horizontal top & bottom
  for (let y of [0, h - 1]) {
    for (let offset = 0; offset < h; offset++) {
      let rowY = y + (y === 0 ? offset : -offset);
      let whiteCount = 0;
      for (let x = 0; x < w; x++) {
        if (binaryImage.ucharPtr(rowY, x)[0] === white) whiteCount++;
      }
      if (whiteCount > lineThreshold * w) {
        cv.line(binaryImage, new cv.Point(0, rowY), new cv.Point(w, rowY), new cv.Scalar(0), 1);
        // Also show on debug image
        cv.line(colorDebug, new cv.Point(0, rowY), new cv.Point(w, rowY), new cv.Scalar(255, 255, 0, 255), 1);
        misses = 0;
      } else {
        misses++;
      }
      if (offset > scanDepthY && misses >= maxMisses) {
        break;
      }
    }
  }

  // Clean vertical left & right
  for (let x of [0, w - 1]) {
    for (let offset = 0; offset < h; offset++) {
      let colX = x + (x === 0 ? offset : -offset);
      let whiteCount = 0;
      for (let y = 0; y < h; y++) {
        if (binaryImage.ucharPtr(y, colX)[0] === white) whiteCount++;
      }
      if (whiteCount > lineThreshold * h) {
        cv.line(binaryImage, new cv.Point(colX, 0), new cv.Point(colX, h), new cv.Scalar(0), 1);
         // Also show on debug image
        cv.line(colorDebug, new cv.Point(colX, 0), new cv.Point(colX, h), new cv.Scalar(255, 255, 0, 255), 1);
        misses = 0;
      } else {
        misses++;
      }
      if (offset > scanDepthX && misses >= maxMisses) {
        break;
      }
    }
  }
}


function removeBorderArtifacts(binaryImage, debugColorOutput) {
  marginRatio = 0.15; // Area of cell that is considered to be "outside"
  outsideThreshold = 0.75; // Area of countour that must be "outside" for deletetion
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(binaryImage, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

  const w = binaryImage.cols;
  const h = binaryImage.rows;

  const marginX = w * marginRatio;
  const marginY = h * marginRatio;

  const minX = marginX;
  const maxX = w - marginX;
  const minY = marginY;
  const maxY = h - marginY;

  for (let i = 0; i < contours.size(); ++i) {
    const cnt = contours.get(i);

    let totalPoints = cnt.total();
    let outsidePoints = 0;

    for (let j = 0; j < totalPoints; ++j) {
      const pt = cnt.intPtr(j, 0);
      const x = pt[0];
      const y = pt[1];

      if (x < minX || x > maxX || y < minY || y > maxY) {
        outsidePoints++;
      }
    }

    const outsideRatio = outsidePoints / totalPoints;

    if (outsideRatio > outsideThreshold) {
      // Optionally draw in red on debug image
      if (debugColorOutput) {
        cv.drawContours(debugColorOutput, contours, i, new cv.Scalar(255, 0, 0, 255), -1); // red
      }

      // Remove from binary (black it out)
      cv.drawContours(binaryImage, contours, i, new cv.Scalar(0), -1); // black
    }

    cnt.delete();
  }

  contours.delete();
  hierarchy.delete();
}

function findDigitSplit(binaryImage, debugColorOutput) {
  const w = binaryImage.cols;
  const h = binaryImage.rows;
  const white = 255;
  const digitThreshold = .2;
  const blankThreshold = .08;

  let foundDigit = false;
  let foundGap = false;
  let split = null;
  let splitQuality = 1; // 0 is best

  // Search for two large masses of pixels separatet by blank space
  // limit search to the center of the image
  offset = Math.round(w * .35)
  for (let x = 0; x < (w - offset); x++) {
    let whiteCount = 0;
    for (let y = 0; y < h; y++) {
      if (binaryImage.ucharPtr(y, x)[0] === white) whiteCount++;
    }
    let whiteRatio = whiteCount / h;
    if (whiteRatio > digitThreshold) {
      foundDigit = true;
    }

    if ((whiteRatio < blankThreshold)) {
      if (foundDigit && !foundGap) {
        // Blank area after first digit found
        split = x;
        splitQuality = whiteRatio
        foundDigit = false; // Reset conter
        foundGap = true;
      }
      if (foundGap && (whiteRatio < splitQuality)) {
        // Found better gap
        split = x;
        splitQuality = whiteRatio
      }
    }
  }
  if (debugColorOutput && split) {
    cv.line(debugColorOutput, new cv.Point(split, 0), new cv.Point(split, h), new cv.Scalar(0, 0, 255, 255), 2);
  }
  return split;
}

function prepareDigitImages(binary, splitX, colorDebug) {
  const digits = [];
  // Define ROI rectangles depending on whether we're splitting
  let halves;
  if (splitX) {
    halves = [new cv.Rect(0, 0, splitX, binary.rows),
              new cv.Rect(splitX, 0, binary.cols - splitX, binary.rows)];
  } else {
    halves = [new cv.Rect(0, 0, binary.cols, binary.rows)]
  }

  for (let i = 0; i < halves.length; i++) {
    const roi = binary.roi(halves[i]);

    // Filter out mostly-black regions
    const nonZeroPixels = cv.countNonZero(roi);
    const pixelThreshold = binary.rows * binary.cols * .01;
    if (nonZeroPixels < pixelThreshold) {
      roi.delete();
      continue;
    }

    // Find all contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(roi, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Compute a bounding box around all contours
    let digitRect = null;

    if (contours.size() > 0) {
      let x1 = Number.MAX_VALUE, y1 = Number.MAX_VALUE;
      let x2 = 0, y2 = 0;

      for (let j = 0; j < contours.size(); j++) {
        const cnt = contours.get(j);
        const rect = cv.boundingRect(cnt);

        x1 = Math.min(x1, rect.x);
        y1 = Math.min(y1, rect.y);
        x2 = Math.max(x2, rect.x + rect.width);
        y2 = Math.max(y2, rect.y + rect.height);

        cnt.delete();
      }
      digitRect = new cv.Rect(x1, y1, x2 - x1, y2 - y1);
    }

    contours.delete();
    hierarchy.delete();

    // Crop digit from image
    const digitROI = roi.roi(digitRect);

    // Resize to 20x20
    let resized = new cv.Mat();
    cv.resize(digitROI, resized, new cv.Size(20, 20), 0, 0, cv.INTER_AREA);

    // Place into center of 28x28 canvas
    let canvas = cv.Mat.zeros(28, 28, cv.CV_8UC1);
    let x = Math.floor((28 - resized.cols) / 2);
    let y = Math.floor((28 - resized.rows) / 2);
    const centered = canvas.roi(new cv.Rect(x, y, resized.cols, resized.rows));
    resized.copyTo(centered);
    centered.delete();

    if (colorDebug) {
        const offsetX = halves[i].x;
        const color = new cv.Scalar(0, 255, 0, 255);
        cv.rectangle(
          colorDebug,
          new cv.Point(offsetX + digitRect.x, digitRect.y),
          new cv.Point(offsetX + digitRect.x + digitRect.width, digitRect.y + digitRect.height),
          color,
          2
        );
      }

    digits.push(canvas);

    digitROI.delete();
    resized.delete();
    roi.delete();
  }
  return digits;
}

function preprocessForMNIST(digitImage) {
  // Convert to tensor with shape 28x28
  const imgData = [];
  for (let y = 0; y < 28; y++) {
    for (let x = 0; x < 28; x++) {
      const pixel = digitImage.ucharPtr(y, x)[0];
      imgData.push(pixel);
    }
  }
  const input = tf.tensor4d(imgData, [1, 28, 28, 1]);
  return input;
}

async function predictDigitMNIST(model, tensor) {
  // Normalize pixels to 0|1
  tensor = tensor.div(255.0);
  // Predict
  const prediction = model.predict(tensor);
  // Get prediction and confidence from softmax probability distribution
  const predictedValue = (await prediction.argMax(1).data())[0];
  const probabilities = await prediction.data();
  const confidence = probabilities[predictedValue];

  tensor.dispose();
  prediction.dispose();
  return {predictedValue: predictedValue, confidence: confidence, probabilities: probabilities};
}

 async function predictDigitTesseract(cellMat) {
  cv.bitwise_not(cellMat, cellMat);
  
  // Resize (Tesseract is supposedly better on larger images)
  let dsize = new cv.Size(64, 64);
  cv.resize(cellMat, cellMat, dsize, 0, 0, cv.INTER_LINEAR);

  // Convert to canvas
  const canvas = document.createElement('canvas');
  canvas.width = cellMat.cols;
  canvas.height = cellMat.rows;
  cv.imshow(canvas, cellMat);
  // OCR
  const result = await Tesseract.recognize(canvas, 'eng', {
    tessedit_char_whitelist: '0123456789/',
    config: {
      tessedit_char_whitelist: '0123456789/',
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_CHAR
    }
  });
  return result.data.text.trim();
}

async function recognizeDigits(cells, model) {
  const results = [];
  const debugContainer = document.getElementById("debugOCR");
  debugContainer.innerHTML = ""; // clear previous results
  for (const cell of cells) {
    const gray = new cv.Mat();
    const binary = new cv.Mat();
    // Preprocess cell image: grayscale + threshold
    cv.cvtColor(cell.image, gray, cv.COLOR_RGBA2GRAY);
    cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

    // Prepare debug image
    const colorDebug = new cv.Mat();
    cv.cvtColor(binary, colorDebug, cv.COLOR_GRAY2RGBA)
    
    // Try to remove cell boundaries that might still be the edges of the image
    cleanCellEdges(binary, colorDebug);
    removeBorderArtifacts(binary, colorDebug);
    const split = findDigitSplit(binary, colorDebug);
    const digits = prepareDigitImages(binary, split, colorDebug);

    // Predict digit with MNIST model
    let result = "";
    let resultTesseract = "";
    let resultText = "";
    let confidence = 0;
    for (const digit of digits) {
      tensor = preprocessForMNIST(digit);
      prediction = await predictDigitMNIST(model, tensor);
      confidence += prediction.confidence;
      // If it's the first of two digits and the model predicts a 7
      // We can be pretty sure it's actually a 1
      // (But we only force the correction if 1 is the second next likely)
      if ((digits.length == 2) && (result == "") && (prediction.predictedValue == 7)) {
        result += 1;
        resultText += `${prediction.predictedValue}(${prediction.confidence.toFixed(2)}%)-Replaced by 1`;  
      } else {
        result += prediction.predictedValue;
        resultText += `${prediction.predictedValue}(${prediction.confidence.toFixed(2)}%) `;
      }
      // Optionally try with tesseract, but it's very slow and the results are worse
      //resultTesseract += await predictDigitTesseract(digit);
    }
    
    confidence = confidence / digits.length;
    results.push({
      row: cell.row,
      col: cell.col,
      text: result,
      confidence: confidence
    })

    // Show debug image with removed elements, digits split and bounding rectangles
    const canvasDEBUG = document.createElement('canvas');
    canvasDEBUG.width = colorDebug.cols;
    canvasDEBUG.height = colorDebug.rows;
    cv.imshow(canvasDEBUG, colorDebug);
    const label = document.createElement("div");
    label.classList.add("debug-digit");
    label.innerHTML = `<strong>${cell.row}:${cell.col} - ${resultText} - ${resultTesseract}</strong><br/>`;
    label.appendChild(canvasDEBUG);
    debugContainer.appendChild(label);

    // Clean up
    gray.delete(); binary.delete(); cell.image.delete(); colorDebug.delete();
  }
  return results;
}

function showResults(results, cameraWindow, resultTableWindow) {
    console.table(results);
    cameraWindow.style.display = "none";
    resultTableWindow.style.display = "block"; 
}