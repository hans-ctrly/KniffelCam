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


function removeBorderArtifactsDEBUG(binaryMat, marginRatio = 0.15, outsideThreshold = 0.4, debugColorOutput = null) {
  drawEdgeSlicingLines(binaryMat);
  
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
