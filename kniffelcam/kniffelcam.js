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
  const offsetLowerBlock = cardHeight * 0.14;
  const offsetLeft = 0.34 * cardWidth;
  const players = 2; //Number of player columns per scorecard
  //Extra size of each cell allow for inaccuracies in the warped image
  const cellPaddingX = .25; 
  const cellPaddingY = .45;

  // Prepare MNIST model
  const modelURL = "kniffelcam/mnist-model.json";
  let model;
  async function loadModel() {
    model = await tf.loadLayersModel(modelURL);
    console.log("MNIST model loaded");
  }
  loadModel();


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
    
    // Restart camera if table recognition failed on snapped image 
    if (!cells) {
      startCamera(cameraCanvas, currentStream, useFrontCamera).then(({ stream, overlayCtx: returnedOverlayCtx}) => {
      currentStream = stream;
      overlayCtx = returnedOverlayCtx;
      const overlayCanvas = document.getElementById("overlayCanvas");
      overlayCanvas.style.display = "block";
    });
    } else {
      recognizeDigits(cells, model).then(results => {
        console.log("Recognizing!")
        // TODO: Use results to update score sheet, calculate total, etc.
      });
    }
    });

    function detectTableAndDigits(src, cardWidth, cardHeight) {
    const srcCorners = detectCardCorners(src, true);
    if (!srcCorners) {
      return null;
    }
    const warped = warpCard(src, srcCorners, cardWidth, cardHeight);
    const cells = extractCells(warped, cellTemplate);
    if (!cells) {
      console.warn("Extracting cells failed");
      return null;
    }
    return cells;
  }
}
