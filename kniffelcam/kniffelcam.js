// Start app after OpenCV and the DOM have finished loading
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
  const captureBtn = document.getElementById("snap");
  const debugWindow = document.getElementById("debugWindow");
  const cameraWindow = document.getElementById("cameraWindow");
  const resultTableWindow = document.getElementById("resultTableWindow");
  const cardWidth = 950, cardHeight = 1400;

  // Prepare MNIST model
  const modelURL = "kniffelcam/mnist-model.json";
  let model;
  async function loadModel() {
    model = await tf.loadLayersModel(modelURL);
  }
  modelLoadingPromise = loadModel();

  let appState = {
    useFrontCamera: false,
    currentStream: null,
    overlayCtx: null,
    isActive: false,
    detectLoopRunning: false,
    hasFinished: false
  };

  // Camera management functions
  async function ensureCameraActive() {
    if (!appState.isActive) {
      const result = await startCamera(cameraCanvas, appState.currentStream, appState.useFrontCamera);
      appState.currentStream = result.stream;
      appState.overlayCtx = result.overlayCtx;
      appState.isActive = true;
      
      // Show overlay canvas when camera is active
      const overlayCanvas = document.getElementById("overlayCanvas");
      if (overlayCanvas) {
        overlayCanvas.style.display = "block";
      }
      
      // Start detection loop if not already running
      if (!appState.detectLoopRunning) {
        startDetectionLoop();
      }
    }
  }

  function stopCameraIfActive() {
    if (appState.isActive && appState.currentStream) {
      stopCamera(appState.currentStream);
      appState.isActive = false;
      
      // Hide overlay canvas when camera is stopped
      const overlayCanvas = document.getElementById("overlayCanvas");
      if (overlayCanvas) {
        overlayCanvas.style.display = "none";
      }
    }
  }

  async function switchCamera() {
    stopCameraIfActive();
    appState.useFrontCamera = !appState.useFrontCamera;
    await ensureCameraActive();
  }

  // Detection loop
  function startDetectionLoop() {
    if (appState.detectLoopRunning) return;
    
    appState.detectLoopRunning = true;
    
    const detectLoop = () => {
      // Run detection if camera is active
      if (!appState.isActive) {
        appState.detectLoopRunning = false;
        return;
      }

      ctx.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);
      const imageData = ctx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
      const src = cv.matFromImageData(imageData);
          
      const srcCorners = detectCardCorners(src);
      if (srcCorners && srcCorners.rows === 4) {
        const corners = [];
        for (let i = 0; i < 4; i++) {
            corners.push({
                x: srcCorners.data32F[i * 2], 
                y: srcCorners.data32F[i * 2 + 1]
            });
        }
        
        // Draw the quadrilateral
        clearOverlay(appState.overlayCtx);
        appState.overlayCtx.strokeStyle = '#00ff00';
        appState.overlayCtx.lineWidth = 3;
        appState.overlayCtx.beginPath();
        appState.overlayCtx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 4; i++) {
            appState.overlayCtx.lineTo(corners[i].x, corners[i].y);
        }
        appState.overlayCtx.closePath();
        appState.overlayCtx.stroke();
        
        // Draw corner circles
        appState.overlayCtx.fillStyle = '#00ff00';
        for (let pt of corners) {
            appState.overlayCtx.beginPath();
            appState.overlayCtx.arc(pt.x, pt.y, 10, 0, 2 * Math.PI);
            appState.overlayCtx.fill();
        }
        srcCorners.delete();
      }
      src.delete();
      requestAnimationFrame(detectLoop);
    };
    
    detectLoop();
  }

  // Initialize camera on startup
  ensureCameraActive();

  // Button to switch camera
  switchBtn.addEventListener('click', switchCamera);

  // Button to capture image and start processing
  captureBtn.addEventListener("click", () => {
    ctx.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);
    const imageData = ctx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
    const src = cv.matFromImageData(imageData);
    
    const cells = detectTableAndDigits(src, cardWidth, cardHeight);
    
    if (cells) {
      // Stop camera if detection succeeded
      stopCameraIfActive();
      modelLoadingPromise.then(() => {
        return recognizeDigits(cells, model);
      }).then(results => {
          appState.hasFinished = true;
      });
    } else {
      // Keep camera running if detection failed
      console.warn("Card detection failed");
    }
  });

  // Test button
  document.getElementById("TESTsnap").addEventListener("click", () => {
    const img = new Image();
    const scaleFactor = 0.5;
    
    img.onload = () => {
      // Set canvas size to scaled image dimensions
      cameraCanvas.width = img.width * scaleFactor;
      cameraCanvas.height = img.height * scaleFactor;
      
      // Draw the scaled image to canvas
      ctx.drawImage(img, 0, 0, img.width * scaleFactor, img.height * scaleFactor);
      const imageData = ctx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
      const src = cv.matFromImageData(imageData);
      
      const cells = detectTableAndDigits(src, cardWidth, cardHeight);
      
      if (cells) {
        stopCameraIfActive();
        modelLoadingPromise.then(() => {
          return recognizeDigits(cells, model, cameraWindow, resultTableWindow);
        }).then(results => {
          appState.hasFinished = true;
        });
      } else {
        console.warn("Test image detection failed");
        // Ensure camera is still active
        ensureCameraActive();
      }
    };
    
    img.onerror = () => {
      console.error("Failed to load test image");
    };
    img.src = "kniffelcam/testImage.jpeg";
  });

  // Debug window functions
  function openDebugWindow() {
    stopCameraIfActive();
    debugWindow.style.display = "block";
    cameraWindow.style.display = "none";
    resultTableWindow.style.display = "none";
    // Push a new state to the browser history (enables back button)
    history.pushState({ modalOpen: true }, '', "#debugView");
  }

  function closeDebugWindow() {
    debugWindow.style.display = "none";
    if (appState.hasFinished) {
      resultTableWindow.style.display = "block";    
    } else {
      cameraWindow.style.display = "block";
      ensureCameraActive();
    }
  }

  function resetAppState() {
    appState.hasFinished = false;
    cameraWindow.style.display = "block";
    resultTableWindow.style.display = "none";
    const debugAreas = document.getElementsByClassName("debug-area-content");
    for (let area of debugAreas) {
      area.innerHTML = "";
    }
  }

  // Listen for popstate to detect back button
  window.addEventListener('popstate', (event) => {
    closeDebugWindow();
  });

  // Listen for popstate to detect back button
  window.addEventListener('popstate', (event) => {
    closeDebugWindow();
  });

  document.getElementById('closeDebug').addEventListener('click', () => {
    closeDebugWindow();
  });

  document.getElementById('debug').addEventListener('click', () => {
    openDebugWindow();
  });
  document.getElementById('debugResults').addEventListener('click', () => {
    openDebugWindow();
  });

  document.getElementById('restart').addEventListener('click', () => {
    resetAppState();
    ensureCameraActive();
  });
}