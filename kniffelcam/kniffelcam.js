// We're extremely cautious about starting the app
// only once CV and the DOM have finished loading
document.addEventListener("DOMContentLoaded", () => {
  if (typeof cv !== 'undefined') {
    if (cv.onRuntimeInitialized) {
      initApp();
    } else {
      // Wait for OpenCV
      cv.onRuntimeInitialized = initApp;
    }
  } else {
    console.error("OpenCV is not defined");
  }
});

function initApp() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const switchBtn = document.getElementById('switchCamera');
  const cardWidth = 950, cardHeight = 1400;

  // Define the Kniffe score sheet based on measured values
  const cellHeight = cardHeight * 0.0357;
  const cellWidth = cardWidth * 0.10526
  const offsetUpperBlock = cardHeight * 0.21429;
  const offsetLowerBlock = cardHeight * 0.12857;
  const offsetLeft = 0.32632 * cardWidth;
  const players = 1; //Number of player columns per scorecard
  
  const scoreFields = [
    {name: "Einser", upper: true},
    {name: "Zweier", upper: true},
    {name: "Dreier", upper: true},
    {name: "Vierer", upper: true},
    {name: "Fünfer", upper: true},
    {name: "Sechser", upper: true},
    {name: "Dreierpasch", upper: false},
    {name: "Viererpasch", upper: false},
    {name: "Full-House", upper: false},
    {name: "Kleine Straße", upper: false},
    {name: "Große Straße", upper: false},
    {name: "Kniffel", upper: false},
    {name: "Chance", upper: false}
  ];

  let cellTemplate = [];
  for (const [row, field] of scoreFields.entries()) {
    for (let column = 0; column < players; column++) {
      const x = (column * cellWidth) + offsetLeft;
      const yOffset = field.upper ? offsetUpperBlock : offsetLowerBlock;
      const y = (row * cellHeight) + yOffset
      cellTemplate.push({row: row, 
                         column: column, 
                         x: Math.round(x), 
                         y: Math.round(y),
                         w: Math.round(cellWidth), 
                         h: Math.round(cellHeight)});
    }
  }

  let useFrontCamera = false;
  let currentStream;

  async function startCamera() {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }

    const constraints = {
      video: {
        facingMode: useFrontCamera ? "user" : "environment",
      },
      audio: false
    };

    try {
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = currentStream;

      // Wait for video metadata to load so we can get dimensions
      video.onloadedmetadata = () => {
        video.play(); // make sure video is playing
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      };
    } catch (err) {
      console.error("Camera start error:", err);
    }
  }


  switchBtn.addEventListener('click', () => {
    useFrontCamera = !useFrontCamera;
    startCamera();
  });

  document.getElementById('snap').addEventListener('click', () => {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const src = cv.matFromImageData(imageData);
    detectTableAndDigits(src);
  });

  startCamera();

  function detectCardCornersAndWarp(src, cardWidth, cardHeight) {
    let gray = new cv.Mat();
    let binary = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    // Grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Blur
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.Canny(gray, binary, 50, 150);

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

    gray.delete(); binary.delete(); contours.delete(); hierarchy.delete();
    if (biggestContour) biggestContour.delete();

    return warped;
  }

  // Helper to sort the 4 corners: top-left, top-right, bottom-right, bottom-left
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

  function extractCells(warped, template) {
    const cells = [];

    for (const cell of template) {
      const rect = new cv.Rect(cell.x, cell.y, cell.w, cell.h);
      console.log(cell.x, cell.y, cell.w, cell.h);
      const roi = warped.roi(rect);
      cells.push({
        row: cell.row,
        col: cell.col,
        image: roi
      });
    }

    return cells;
  }

function extractCellsWithDebug(warped, template, debugCanvasId = "digits") {
  const cells = [];
  const debugImg = warped.clone();

  for (const cell of template) {
    const rect = new cv.Rect(cell.x, cell.y, cell.w, cell.h);

    console.log(`Rect: x=${cell.x}, y=${cell.y}, w=${cell.w}, h=${cell.h}, imgSize: ${warped.cols}x${warped.rows}`);
    let roi;
    try {
      roi = warped.roi(rect);
      cells.push({ ...cell, image: roi });
    } catch (e) {
      console.error("ROI extraction failed for rect:", rect, "error:", e);
    }

    // Draw rectangle on debug image
    const pt1 = new cv.Point(cell.x, cell.y);
    const pt2 = new cv.Point(cell.x + cell.w, cell.y + cell.h);
    cv.rectangle(debugImg, pt1, pt2, new cv.Scalar(255, 0, 0, 255), 2);

    // Optional: draw text (row,col)
    cv.putText(
      debugImg,
      `${cell.row},${cell.col}`,
      new cv.Point(cell.x + 5, cell.y + 25),
      cv.FONT_HERSHEY_SIMPLEX,
      0.6,
      new cv.Scalar(0, 255, 0, 255),
      1
    );

    cells.push({
      row: cell.row,
      col: cell.col,
      image: roi
    });
  }

  cv.imshow(debugCanvasId, debugImg);
  debugImg.delete();

  return cells;
}


  async function recognizeDigits(cells) {
    const results = [];

    for (const cell of cells) {
      const canvas = document.createElement('canvas');
      canvas.width = cell.image.cols;
      canvas.height = cell.image.rows;
      cv.imshow(canvas, cell.image);

      const result = await Tesseract.recognize(canvas, 'eng', {
        tessedit_char_whitelist: '0123456789',
        classify_bln_numeric_mode: 1,
      });

      results.push({
        row: cell.row,
        col: cell.col,
        text: result.data.text.trim()
      });

      cell.image.delete();
    }

    return results;
  }


  function detectTableAndDigits(src) {
    const warped = detectCardCornersAndWarp(src, cardWidth, cardHeight);
    cv.imshow("canvas", src);
    cv.imshow("warped", warped);
    //const cells = extractCells(warped, cellTemplate);
    
    const cells = extractCellsWithDebug(warped, cellTemplate);

    recognizeDigits(cells).then(results => {
    
      console.table(results);
    // TODO: Use results to update score sheet, calculate total, etc.
    });
  }
}
