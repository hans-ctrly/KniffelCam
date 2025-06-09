async function startCamera(canvas, existingStream, useFrontCamera) {
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

function detectTableAndDigits(src, cardWidth, cardHeight, cellTemplate) {
  const srcCorners = detectCardCorners(src);
  if (!srcCorners) {
    return null;
  }
  
  const warped = warpCard(src, srcCorners, cardWidth, cardHeight);
  const cells = extractCells(warped, cellTemplate);
  if (!cells) {
    return null;
  }
  return cells;
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
      let debugBinary = new cv.Mat();
      cv.cvtColor(binary, debugBinary, cv.COLOR_GRAY2RGBA);
      // draw found corners on debug image
      for (let pt of sorted) {
        cv.circle(debugBinary, new cv.Point(pt.x, pt.y), 10, new cv.Scalar(0, 255, 0, 255), -1);
      }
      cv.imshow("debugBinary", debugBinary);
      debugBinary.delete(); 
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
    const debugContainer = document.getElementById("debugCellRefinement");

    for (const cell of template) {
      const rect = new cv.Rect(cell.x, cell.y, cell.w, cell.h);
      const roi = tableImage.roi(rect);

      // Draw approximate cells on debug image
      const pt1 = new cv.Point(cell.x, cell.y);
      const pt2 = new cv.Point(cell.x + cell.w, cell.y + cell.h);
      cv.rectangle(debugImg, pt1, pt2, getRandomColor(), 2);
      const whiteThreshold = .7;
      // Try refining the found cell
      const refinedContour = refineCellFromPaddedImage(roi, whiteThreshold, debugContainer);
      if (!refinedContour) {
        debugContainer.innerHTML = "";
        return null;
      }
      let finalROI;
      finalROI = roi.roi(refinedContour);

      cells.push({
        row: cell.row,
        col: cell.col,
        image: finalROI,
      });
    }
    cv.imshow("debugTable", debugImg);
    debugImg.delete();
    return cells;
  }

function refineCellFromPaddedImage(paddedMat, whiteThreshold, debugContainer) {
  let gray = new cv.Mat();
  let binary = new cv.Mat();
  let resultRect = null;

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

    resultRect = new cv.Rect(x1, y1, x2 - x1, y2 - y1);
  } else {
    return null;
  }

  
  // Draw cell bounbdary on debug image
  let debug = new cv.Mat();
  cv.cvtColor(binary, debug, cv.COLOR_GRAY2RGBA);
  const vec = new cv.MatVector();
  cv.rectangle(debug, new cv.Point(x1, y1), new cv.Point(x2, y2), new cv.Scalar(0, 255, 0, 255), 2);
  const canvasDEBUG = document.createElement('canvas');
  canvasDEBUG.width = debug.cols;
  canvasDEBUG.height = debug.rows;
  cv.imshow(canvasDEBUG, debug);
  const debugImg = document.createElement("div");
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

function cleanCellEdges(binImg, lineThreshold = 0.5, scanDepth = .1, maxMisses = 2) {
  const h = binImg.rows;
  const w = binImg.cols;
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
        if (binImg.ucharPtr(rowY, x)[0] === white) whiteCount++;
      }
      if (whiteCount > lineThreshold * w) {
        cv.line(binImg, new cv.Point(0, rowY), new cv.Point(w, rowY), new cv.Scalar(0), 1);
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
        if (binImg.ucharPtr(y, colX)[0] === white) whiteCount++;
      }
      if (whiteCount > lineThreshold * h) {
        cv.line(binImg, new cv.Point(colX, 0), new cv.Point(colX, h), new cv.Scalar(0), 1);
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


function removeBorderArtifacts(binaryMat, marginRatio, outsideThreshold, debugColorOutput) {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(binaryMat, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

  const w = binaryMat.cols;
  const h = binaryMat.rows;

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
      cv.drawContours(binaryMat, contours, i, new cv.Scalar(0), -1); // black
    }

    cnt.delete();
  }

  contours.delete();
  hierarchy.delete();
}

async function recognizeDigits(cells) {
  const results = [];

  const debugContainer = document.getElementById("debugOCR");
  debugContainer.innerHTML = ""; // clear previous results

  for (const cell of cells) {
    // Preprocess cell image: grayscale + threshold + resize
    let gray = new cv.Mat();
    cv.cvtColor(cell.image, gray, cv.COLOR_RGBA2GRAY);
    cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

    cleanCellEdges(gray);

    // Resize up for better OCR accuracy
    let resized = new cv.Mat();
    const scale = 2.0;
    cv.resize(gray, resized, new cv.Size(0, 0), scale, scale, cv.INTER_LINEAR);

    const colorDebug = new cv.Mat();
    cv.cvtColor(resized, colorDebug, cv.COLOR_GRAY2RGBA);
    removeBorderArtifacts(resized, 0.15, 0.75, colorDebug);
    
    // ToDo: get result
    result = null;
    /*results.push({
      row: cell.row,
      col: cell.col,
      text: result.data.text.trim()
    });*/


    // Convert to canvas for Tesseract
    const canvasDEBUG = document.createElement('canvas');
    canvasDEBUG.width = colorDebug.cols;
    canvasDEBUG.height = colorDebug.rows;
    cv.imshow(canvasDEBUG, colorDebug);
    const label = document.createElement("div");
    label.style.display = "inline-block";
    label.style.margin = "5px";
    label.innerHTML = `<strong>${cell.row}:${cell.col} - ${result}</strong><br/>`;
    label.appendChild(canvasDEBUG);
    debugContainer.appendChild(label);

    // Cleanup
    gray.delete(); resized.delete(); cell.image.delete(); colorDebug.delete();
  }
  return results;
}