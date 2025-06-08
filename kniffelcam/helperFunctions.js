async function initCamera() {
    currentStream = await startCamera(currentStream, useFrontCamera);
    return currentStream;
}

async function startCamera(existingStream, useFrontCamera) {
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
      video.onloadedmetadata = () => {
          video.play();
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
      };
      return stream; // Return the new stream
  } catch (err) {
      console.error("Camera start error:", err);
      return null;
  }
}

function stopCamera(currentStream) {
    //if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null; // Clear the reference
        video.srcObject = null; // Clear the video element's source
    //}
}

function detectCardCornersAndWarp(src, cardWidth, cardHeight) {
  let blurred = new cv.Mat();
  let binary = new cv.Mat();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  // Blur (smoothes out noise and improves the resulting binary)
  // fyi: Canny() does already include a Gaussian blur, but it works way better with this extra step
  cv.GaussianBlur(src, blurred, new cv.Size(5, 5), 0);
  // Turn to binary image
  cv.Canny(blurred, binary, 50, 150);

  cv.imshow('binary', binary);

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

  let warped = new cv.Mat();
  if (biggestContour) {
    const sorted = sortCorners(biggestContour);

    const srcCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
      sorted[0].x, sorted[0].y,
      sorted[1].x, sorted[1].y,
      sorted[2].x, sorted[2].y,
      sorted[3].x, sorted[3].y
    ]);
    const dstCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      cardWidth, 0,
      cardWidth, cardHeight,
      0, cardHeight
    ]);

    const transform = cv.getPerspectiveTransform(srcCorners, dstCorners);
    cv.warpPerspective(src, warped, transform, new cv.Size(cardWidth, cardHeight));
    
  for (let pt of sorted) {
    cv.circle(src, new cv.Point(pt.x, pt.y), 10, new cv.Scalar(0, 255, 0, 255), -1);
  }

    srcCorners.delete(); dstCorners.delete(); transform.delete();
  } else {
    console.warn("No card detected");
    warped = src.clone(); // fallback to unwarped
  }

  blurred.delete(); binary.delete(); contours.delete(); hierarchy.delete();
  if (biggestContour) biggestContour.delete();

  return warped;
}

function refineCellFromPaddedImage(paddedMat, whiteThreshold = 0.70) {
  let gray = new cv.Mat();
  let binary = new cv.Mat();
  let resultRect = null;

  // Grayscale and binary
  cv.cvtColor(paddedMat, gray, cv.COLOR_RGBA2GRAY);
  cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  cv.bitwise_not(binary, binary);
  const debugContainer = document.getElementById("debugCellRefinement");

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
    console.warn("No cell found in refinement")
    return null;
  }

  
  // Optional: draw on a debug copy
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

// 
function removeBorderArtifacts(binaryMat, marginRatio = 0.2, outsideThreshold = 0.5) {
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
      // Too much of this contour lies near the border — remove it
      cv.drawContours(binaryMat, contours, i, new cv.Scalar(0), -1);
    }

    cnt.delete();
  }

  contours.delete();
  hierarchy.delete();
}

function cleanCellEdges(binImg, lineThreshold = 0.5, scanDepth = 15, maxMisses = 2) {
  const h = binImg.rows;
  const w = binImg.cols;

  const minLineLength = Math.floor(0.8 * w); // horizontal
  const minLineHeight = Math.floor(0.8 * h); // vertical

  const white = 255;
  let misses = 0
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
      if (offset > scanDepth && misses >= maxMisses) {
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
      if (offset > scanDepth && misses >= maxMisses) {
        break;
      }
    }
  }
}


function removeBorderArtifactsDEBUG(binaryMat, marginRatio, outsideThreshold, debugColorOutput = null) {
  //drawEdgeSlicingLines(binaryMat);
  
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

function drawEdgeSlicingLines(img, pixelDepth = 14, lineSpacing = 2) {
  const height = img.rows;
  const width = img.cols;

  // Horizontal slicing lines from top and bottom inward
  for (let y = 0; y < pixelDepth; y += lineSpacing) {
    // From top
    cv.line(img, new cv.Point(0, y), new cv.Point(width, y), new cv.Scalar(0, 0, 0, 255), 1);

    // From bottom
    const bottomY = height - 1 - y;
    cv.line(img, new cv.Point(0, bottomY), new cv.Point(width, bottomY), new cv.Scalar(0, 0, 0, 255), 1);
  }

  // Vertical slicing lines from left and right inward
  for (let x = 0; x < pixelDepth; x += lineSpacing) {
    // From left
    cv.line(img, new cv.Point(x, 0), new cv.Point(x, height), new cv.Scalar(0, 0, 0, 255), 1);

    // From right
    const rightX = width - 1 - x;
    cv.line(img, new cv.Point(rightX, 0), new cv.Point(rightX, height), new cv.Scalar(0, 0, 0, 255), 1);
  }
}
