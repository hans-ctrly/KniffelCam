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

async function initApp() {
  const video = document.getElementById("video");
  const cameraCanvas = document.getElementById("cameraCanvas");
  const ctx = cameraCanvas.getContext("2d");
  const switchBtn = document.getElementById("switchCamera");
  const cardWidth = 950, cardHeight = 1400;

  // Define the Kniffel score sheet based on measured values
  const cellHeight = cardHeight * 0.0355;
  const cellWidth = cardWidth * 0.10526
  const offsetUpperBlock = cardHeight * 0.23;
  const offsetLowerBlock = cardHeight * 0.13;
  const offsetLeft = 0.34 * cardWidth;
  const players = 2; //Number of player columns per scorecard
  //Extra size of each cell allow for inaccuracies in the warped image
  const cellPaddingX = .15; 
  const cellPaddingY = .25;

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
  }

  let useFrontCamera = false;
  let currentStream;
  let overlayCtx;
  startCamera(cameraCanvas, currentStream, useFrontCamera).then(({ stream, overlayCtx: returnedOverlayCtx}) => {
    currentStream = stream;
    overlayCtx = returnedOverlayCtx;
  });

  // Button to sitch camera
  switchBtn.addEventListener('click', () => {
    useFrontCamera = !useFrontCamera;
    startCamera(cameraCanvas, currentStream, useFrontCamera).then(({ stream, overlayCtx: returnedOverlayCtx}) => {
      currentStream = stream;
      overlayCtx = returnedOverlayCtx;
    });
  });

  let srcCorners;  
  const detectLoop = () => {
    ctx.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);
    const imageData = ctx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
    const src = cv.matFromImageData(imageData);
        
    srcCorners = detectCardCorners(src);
    if (srcCorners && srcCorners.rows === 4) {
      const corners = [];
      for (let i = 0; i < 4; i++) {
          corners.push({
              x: srcCorners.data32F[i * 2], 
              y: srcCorners.data32F[i * 2 + 1]
          });
      }
      
      // Draw the quadrilateral
      clearOverlay(overlayCtx);
      overlayCtx.strokeStyle = '#00ff00';
      overlayCtx.lineWidth = 3;
      overlayCtx.beginPath();
      overlayCtx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 4; i++) {
          overlayCtx.lineTo(corners[i].x, corners[i].y);
      }
      overlayCtx.closePath();
      overlayCtx.stroke();
      
      // Draw corner circles
      overlayCtx.fillStyle = '#00ff00';
      for (let pt of corners) {
          overlayCtx.beginPath();
          overlayCtx.arc(pt.x, pt.y, 10, 0, 2 * Math.PI);
          overlayCtx.fill();
      }
      srcCorners.delete(); // Clean up the OpenCV Mat
    }
    src.delete();
    requestAnimationFrame(detectLoop);
  };
  detectLoop(ctx, cardWidth, cardHeight); // Start the card detection loop

  document.getElementById('snap').addEventListener('click', () => {
    ctx.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);
    const imageData = ctx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
    const src = cv.matFromImageData(imageData);
    stopCamera(currentStream);
    const cells = detectTableAndDigits(src, cardWidth, cardHeight);

    recognizeDigits(cells).then(results => {
      console.log("Recognizing!")
      // TODO: Use results to update score sheet, calculate total, etc.
    });
    // TODO: use retun value to restart scanning if it failed
  });

/*  async function recognizeDigitsOLD(cells) {
    const results = [];

    const debugContainer = document.getElementById("debugOCR");
    debugContainer.innerHTML = ""; // clear previous results

    for (const cell of cells) {
      let gray = new cv.Mat();
      cv.cvtColor(cell.image, gray, cv.COLOR_RGBA2GRAY);
      cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

      const inputTensor = preprocessForMNIST(gray);
      const digit = await predictDigit(inputTensor);

      results.push({
        row: cell.row,
        col: cell.col,
        text: digit
      });

      // Show in UI for debugging
      const canvas = document.createElement('canvas');
      canvas.width = gray.cols;
      canvas.height = gray.rows;
      cv.imshow(canvas, gray);

      const label = document.createElement("div");
      label.style.display = "inline-block";
      label.style.margin = "5px";
      label.innerHTML = `<strong>${cell.row}:${cell.col} - ${digit}</strong><br/>`;
      label.appendChild(canvas);
      debugContainer.appendChild(label);

      // Cleanup
      gray.delete(); cell.image.delete();
    }
    return results;
  }

  const modelURL = "kniffelcam/mnist-model.json";
  let model;
  async function loadModel() {
    model = await tf.loadLayersModel(modelURL);
    console.log("MNIST model loaded");
  }
  //loadModel();

  function preprocessForMNIST(cellMat) {
    // Resize to 28x28
    let resized = new cv.Mat();
    cv.resize(cellMat, resized, new cv.Size(28, 28), 0, 0, cv.INTER_AREA);

    // Convert to tensor
    const imgData = [];
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 28; x++) {
        // Invert: white digit (0) on black (1) background
        const pixel = resized.ucharPtr(y, x)[0];
        imgData.push((255 - pixel) / 255);  // normalize to 0–1
      }
    }

    const input = tf.tensor4d(imgData, [1, 28, 28, 1]);
    resized.delete();
    return input;
  }

  async function predictDigit(tensor) {
    const prediction = model.predict(tensor);
    const predictedValue = (await prediction.argMax(1).data())[0];
    tensor.dispose();
    prediction.dispose();
    return predictedValue;
  }

  async function recognizeDigitFromCell(cellMat) {
    // Preprocess: grayscale, threshold
    let gray = new cv.Mat();
    cv.cvtColor(cellMat, gray, cv.COLOR_RGBA2GRAY);
    cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

    const inputTensor = preprocessForMNIST(gray);
    const digit = await predictDigit(inputTensor);

    gray.delete();
    return digit;
  }
    */

  function detectTableAndDigits(src, cardWidth, cardHeight) {
    const srcCorners = detectCardCorners(src, true);
    if (!srcCorners) {
      return null;
    }
    const warped = warpCard(src, srcCorners, cardWidth, cardHeight);
    const cells = extractCells(warped, cellTemplate);
    if (!cells) {
      console.warn("Exctracting cells failed");
      return null;
    }
    return cells;
  }
}
