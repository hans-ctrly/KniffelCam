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
  const cardWidth = 1900; //950
  cardHeight = 2800; //1400

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
  startCamera(currentStream, useFrontCamera).then(stream => {
    currentStream = stream;
  });

  // Button to sitch camera
  switchBtn.addEventListener('click', () => {
    useFrontCamera = !useFrontCamera;
    startCamera(currentStream, useFrontCamera).then(stream => {
      currentStream = stream;
    });
  });

  document.getElementById('snap').addEventListener('click', () => {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const src = cv.matFromImageData(imageData);
    stopCamera(currentStream);
    detectTableAndDigits(src);
  });

  function extractCells(warped, template, debugCanvasId = "debug") {
    const cells = [];
    const debugImg = warped.clone();

    for (const cell of template) {
      const rect = new cv.Rect(cell.x, cell.y, cell.w, cell.h);
      const roi = warped.roi(rect);

      // Try refining the found cell
      const refinedContour = refineCellFromPaddedImage(roi);
      if (!refinedContour) {
        console.warn("Cell contour refinment failed");
        return null;
      }
      let finalROI;
      finalROI = roi.roi(refinedContour);

      // Draw rectangle on debug image
      const pt1 = new cv.Point(cell.x, cell.y);
      const pt2 = new cv.Point(cell.x + cell.w, cell.y + cell.h);
      cv.rectangle(debugImg, pt1, pt2, getRandomColor(), 2);

      cells.push({
        row: cell.row,
        col: cell.col,
        image: finalROI,
      });
    }
    cv.imshow(debugCanvasId, debugImg);
    debugImg.delete();
    return cells;
  }

  async function recognizeDigitsTesseract(cells) {
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
      removeBorderArtifactsDEBUG(resized, 0.15, 0.75, colorDebug);
      
      // Convert to canvas for Tesseract
      const canvasDEBUG = document.createElement('canvas');
      canvasDEBUG.width = colorDebug.cols;
      canvasDEBUG.height = colorDebug.rows;
      cv.imshow(canvasDEBUG, colorDebug);

      cv.bitwise_not(resized, resized);

      // Convert to canvas for Tesseract
      const canvas = document.createElement('canvas');
      canvas.width = resized.cols;
      canvas.height = resized.rows;
      cv.imshow(canvas, resized);

      // OCR
      const result = await Tesseract.recognize(canvas, 'eng', {
        tessedit_char_whitelist: '0123456789/',
        tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT
      });

      results.push({
        row: cell.row,
        col: cell.col,
        text: result.data.text.trim()
      });


      // OPTIONAL: show in UI for debugging
      const label = document.createElement("div");
      label.style.display = "inline-block";
      label.style.margin = "5px";
      label.innerHTML = `<strong>${cell.row}:${cell.col} - ${result.data.text}</strong><br/>`;
      label.appendChild(canvasDEBUG);
      debugContainer.appendChild(label);

      // Cleanup
      gray.delete(); resized.delete(); cell.image.delete();
    }

    console.table(results);
    return results;
  }


  async function recognizeDigits(cells) {
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

  function detectTableAndDigits(src) {
    const warped = detectCardCornersAndWarp(src, cardWidth, cardHeight);
    cv.imshow("canvas", src);
    const cells = extractCells(warped, cellTemplate);
    if (!cells) {
      console.warn("Exctracting cells failed");
      return null;
    }

    recognizeDigitsTesseract(cells).then(results => {
      console.log("Recognizing!")
      // TODO: Use results to update score sheet, calculate total, etc.
    });
    // TODO: use retun value to restart scanning if it failed
    return 1;
  }
}
