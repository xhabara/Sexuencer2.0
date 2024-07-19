// Sequencer

let bpm = 60;
let beat = 0;
let bpmInput;
let bpmSlider;
let delaySlider;
let randomIntensitySlider;
let nSteps = 8;
let nTracks = 8;

let currentStep = 0;

let cells = [];
let playButton;
let randomizeButton;
let autoRandomizeMode = false;
let randomizationCounter = 0;

let recorder;
let recordedAudioBuffer = null;
let recordButton, downloadButton;
let isRecording = false;


// Delay Effect
let delayEffect;

// Visuals
let t = 30;
let l = 25;
let gridWidth, gridHeight, cellWidth, cellHeight;
let colors = ["#00FF00", "#00CC00", "#08C808", "#07B007", "#05A405", "#06AE06", "#0AA20A", "#17DA1F"];
let muteButtons = [];
let isTrackMuted = new Array(nTracks).fill(false);

// Sound
let player;
let noteNames = ["A1", "C2", "E2", "G2"];
let customSounds = ["A1", "C2", "E2", "G2"];

// Web MIDI API setup
let midiAccess = null;
let midiOutput = null;

function preload() {
  player = new Tone.Sampler({
    "A1": "Rully Samples Vajranala-008.mp3",
    "C2": "RullyShabaraSampleR08.mp3",
    "E2": "Rully Samples Vajranala-055.mp3",
    "G2": "Rully Samples Vajranala-057.mp3"
  }).toDestination();
}

function setup() {
  createCanvas(1000, 900);

  // Delay setup
  delayEffect = new Tone.FeedbackDelay("8n", 0.5);
  delayEffect.wet.value = 0.0;

  player.chain(delayEffect, Tone.Destination);
  Tone.Transport.scheduleRepeat(onBeat, "4n");

  // Recorder setup
  recorder = new Tone.Recorder();

  gridWidth = width - 4 * l - 270;
  gridHeight = height - 13 * t;
  cellWidth = gridWidth / nSteps;
  cellHeight = gridHeight / nTracks;
  const centerX = width / 2.1;
  const centerY = height / 2;

  initMIDI();

  for (let track = 0; track < nTracks; track++) {
    cells[track] = [];
    for (let step = 0; step < nSteps; step++) {
      cells[track][step] = 0;
    }
  }

  setupUI(centerX, centerY);
}

function setupUI(centerX, centerY) {
  // User interaction to start audio
  document.querySelector('button').addEventListener('click', () => {
    Tone.start();
    console.log("Audio Context started");
    if (Tone.context.state !== 'running') {
      Tone.context.resume();
    }
  });

  // Handle fullscreen changes
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
      console.log("Entered fullscreen");
    } else {
      console.log("Exited fullscreen");
    }
    if (Tone.context.state !== 'running') {
      Tone.context.resume();
    }
  });

  playButton = createButton('Start/Stop');
  playButton.position(centerX - 300, 150);
  styleButton(playButton);
  playButton.mouseClicked(() => {
    if (Tone.context.state !== 'running') {
      Tone.context.resume().then(() => {
        console.log("Audio context resumed!");
        togglePlay();
      });
    } else {
      togglePlay();
    }
  });

  randomizeButton = createButton('randomize');
  randomizeButton.position(centerX + 200, centerY + 350);
  randomizeButton.mouseClicked(() => {
    autoRandomizeMode = !autoRandomizeMode;
    randomizeButton.html(autoRandomizeMode ? 'fix pattern' : 'randomize');
    if (autoRandomizeMode) {
      randomizeCells();
      randomizationCounter = Math.floor(Math.random() * 4) + 4;
    }
  });
  styleButton(randomizeButton);

  bpmInput = createInput('160');
  bpmInput.position(centerX - 250, centerY + 355);
  bpmInput.input(updateBpmFromInput);
  styleInput(bpmInput);

  bpmSlider = createSlider(20, 600, 60);
  bpmSlider.position(centerX - 15, centerY + 347);
  bpmSlider.input(updateBpmFromSlider);
  styleSlider(bpmSlider);

  delaySlider = createSlider(0, 100, 0);
  delaySlider.position(centerX - 15, centerY + 400);
  delaySlider.input(updateDelayFromSlider);
  styleSlider(delaySlider);

  randomIntensitySlider = createSlider(0, 100, 50);
  randomIntensitySlider.position(centerX + 200, centerY + 400);
  randomIntensitySlider.input(updateRandomIntensity);
  styleSlider(randomIntensitySlider);

  for (let track = 0; track < nTracks; track++) {
    let pitchDownButton = createButton('↓');
    pitchDownButton.position(centerX + 350, centerY - 213 + track * cellHeight);
    pitchDownButton.mouseClicked(() => adjustPitch(track, -1));
    pitchDownButton.mousePressed(() => indicateClick(pitchDownButton));
    pitchDownButton.mouseReleased(() => resetButtonStyle(pitchDownButton));
    styleButton(pitchDownButton);

    let pitchUpButton = createButton('↑');
    pitchUpButton.position(centerX + 390, centerY - 213 + track * cellHeight);
    pitchUpButton.mouseClicked(() => adjustPitch(track, 1));
    pitchUpButton.mousePressed(() => indicateClick(pitchUpButton));
    pitchUpButton.mouseReleased(() => resetButtonStyle(pitchUpButton));
    styleButton(pitchUpButton);

    let muteButton = createButton('Mute');
    muteButton.position(centerX + 430, centerY - 213 + track * cellHeight);
    muteButton.mouseClicked(() => toggleMute(track));
    styleButton(muteButton);
    muteButtons.push(muteButton);
  }

  // Record button
  recordButton = createButton('Record');
  recordButton.position(200, 850);
  recordButton.mouseClicked(toggleRecording);
  styleButton(recordButton);

  // Download button
  downloadButton = createButton('Download');
  downloadButton.position(centerX - 150, centerY + 400);
  downloadButton.mouseClicked(downloadRecording);
  downloadButton.hide(); // Initially hidden
  styleButton(downloadButton);

  // Custom upload buttons
  for (let i = 0; i < 4; i++) {
    let uploadInput = createFileInput((file) => handleFileUpload(file, i));
    uploadInput.position(centerX - 305 + i * 170, centerY + 300);
    uploadInput.style('opacity', '0');

    let customButton = createButton(`Custom Sound ${i + 1}`);
    customButton.position(centerX - 305 + i * 170, centerY + 300);
    customButton.mousePressed(() => uploadInput.elt.click());
    styleButton(customButton);
  }
}

function initMIDI() {
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess({ sysex: false }).then(onMIDISuccess, onMIDIFailure);
  } else {
    console.log("No MIDI support in your browser.");
  }
}

function onMIDISuccess(midi) {
  midiAccess = midi;
  const outputs = midiAccess.outputs.values();
  for (let output of outputs) {
    midiOutput = output;
    console.log("MIDI Output:", midiOutput);
  }
}

function onMIDIFailure(error) {
  console.log("Failed to access MIDI devices:", error);
}

function sendMIDIMessage(note, velocity, duration) {
  if (midiOutput) {
    const noteOnMessage = [0x90, note, velocity];
    const noteOffMessage = [0x80, note, velocity];
    midiOutput.send(noteOnMessage);
    setTimeout(() => {
      midiOutput.send(noteOffMessage);
    }, duration);
  }
}

function noteToMidi(note) {
  const noteMap = {
    "A1": 33, "B1": 35, "C2": 36, "D2": 38, "E2": 40, "F2": 41, "G2": 43, "A2": 45,
    "B2": 47, "C3": 48, "D3": 50, "E3": 52, "F3": 53, "G3": 55, "A3": 57, "B3": 59
  };
  return noteMap[note];
}

function updateBpmFromInput() {
  let bpmVal = parseInt(bpmInput.value());
  bpm = isNaN(bpmVal) ? 60 : bpmVal;
  Tone.Transport.bpm.value = bpm;
  bpmSlider.value(bpm);
}

function updateBpmFromSlider() {
  bpm = bpmSlider.value();
  Tone.Transport.bpm.value = bpm;
  bpmInput.value(bpm);
}

function updateDelayFromSlider() {
  delayEffect.wet.value = delaySlider.value() / 100;
}

function updateRandomIntensity() {
  randomizationCounter = Math.floor(Math.random() * 4) + 4;
}

function adjustPitch(track, direction) {
  let allNotes = ["A1", "C2", "E2", "G2"];
  let currentNoteIndex = allNotes.indexOf(noteNames[track]);
  if (currentNoteIndex !== -1) {
    let newNoteIndex = currentNoteIndex + direction;
    if (newNoteIndex >= 0 && newNoteIndex < allNotes.length) {
      noteNames[track] = allNotes[newNoteIndex];
    }
  }
}

function toggleMute(track) {
  isTrackMuted[track] = !isTrackMuted[track];
  muteButtons[track].html(isTrackMuted[track] ? "Unmute" : "Mute");
}

function onBeat(time) {
  console.log(`Beat triggered: ${currentStep}, Transport State: ${Tone.Transport.state}, Context State: ${Tone.context.state}`);
  console.log("Sampler loaded:", player.loaded);

  if (autoRandomizeMode) {
    if (randomizationCounter <= 0) {
      randomizeCells();
      randomizationCounter = Math.floor(Math.random() * 4) + 4;
    } else {
      randomizationCounter--;
    }
  }

  currentStep = beat % nSteps;
  console.log(`Current Step: ${currentStep}`);

  for (let track = 0; track < nTracks; track++) {
    if (!isTrackMuted[track] && cells[track][currentStep]) {
      let mainNote = noteNames[track % noteNames.length];
      if (mainNote) {
        console.log(`Playing note: ${mainNote} on track ${track}`);
        player.triggerAttackRelease(mainNote, "8n", time);
        let midiNote = noteToMidi(mainNote);
        sendMIDIMessage(midiNote, 127, 500);
      }
    }
  }

  beat++;
}

function randomizeCells() {
  let intensity = randomIntensitySlider.value() / 100;

  for (let step = 0; step < nSteps; step++) {
    if (Math.random() < (0.3 * (1 - intensity))) {
      for (let track = 0; track < nTracks; track++) {
        cells[track][step] = 0;
      }
      continue;
    }

    for (let track = 0; track < nTracks; track++) {
      cells[track][step] = 0;
    }

    let activeCells = 0;
    while (activeCells < Math.floor(2 + 6 * intensity)) {
      let randomTrack = Math.floor(Math.random() * nTracks);
      if (cells[randomTrack][step] === 0) {
        cells[randomTrack][step] = 1;
        activeCells++;
        if (Math.random() < (0.5 * intensity)) {
          break;
        }
      }
    }
  }
}

function toggleRecording() {
  if (!isRecording) {
    recorder.start();
    recordButton.html('Stop Recording');
    downloadButton.hide();
    isRecording = true;
  } else {
    recorder.stop().then((blob) => {
      recordedAudioBuffer = blob;
      recordButton.html('Record');
      downloadButton.show();
      isRecording = false;
    });
  }
}

function downloadRecording() {
  if (recordedAudioBuffer) {
    const url = URL.createObjectURL(recordedAudioBuffer);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'recording.webm';
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

function connectPlayerToRecorder() {
  player.connect(recorder);
}

function handleFileUpload(file, index) {
  if (file.type === 'audio' && player) {
    let reader = new FileReader();
    reader.onload = (e) => {
      player.add(customSounds[index], e.target.result);
      noteNames[index] = customSounds[index];
      console.log(`Custom sound ${index + 1} loaded`);
    };
    reader.readAsDataURL(file.file);
  }
}

function styleButton(button) {
  button.style('background-color', '#000');
  button.style('color', '#0f0');
  button.style('border', 'none');
  button.style('padding', '10px 20px');
  button.style('font', '16px monospace');
  button.style('transition', 'background-color 0.2s, color 0.2s');
  button.mouseOver(() => button.style('background-color', '#5E615E'));
  button.mouseOut(() => button.style('background-color', '#000'));
}

function indicateClick(button) {
  button.style('background-color', '#81DB81');
  button.style('color', '#000');
}

function resetButtonStyle(button) {
  button.style('background-color', '#000');
  button.style('color', '#0f0');
}

function styleInput(input) {
  input.style('background-color', '#000');
  input.style('color', '#0f0');
  input.style('border', '1px solid #0f0');
  input.style('padding', '5px');
  input.style('font', '16px monospace');
}

function styleSlider(slider) {
  slider.style('width', '200px');
  slider.style('background', '#000');
  slider.style('outline', 'none');
  slider.style('padding', '5px 0');
  slider.style('margin', '10px 0');
  slider.style('appearance', 'none');
  slider.style('border', '1px solid #0f0');
  slider.style('border-radius', '5px');
  slider.style('box-shadow', '0 0 10px #0f0');
  slider.style('background', 'linear-gradient(to right, #00FF00, #003300)');

  slider.style('::-webkit-slider-thumb', {
    'appearance': 'none',
    'width': '20px',
    'height': '20px',
    'background': '#0f0',
    'cursor': 'pointer',
    'border-radius': '50%'
  });
  slider.style('::-moz-range-thumb', {
    'appearance': 'none',
    'width': '20px',
    'height': '20px',
    'background': '#0f0',
    'cursor': 'pointer',
    'border-radius': '50%'
  });
}

function draw() {
  background(0);
  stroke('#0f0');

  const centerX = width / 2;
  const centerY = height / 2;

  for (let step = 0; step < nSteps; step++) {
    for (let track = 0; track < nTracks; track++) {
      if (cells[track][step] == 1) {
        fill(colors[track]);
        rect(centerX - gridWidth / 2 + step * cellWidth, centerY - gridHeight / 2 + track * cellHeight, cellWidth, cellHeight);
      }
    }
  }

  for (let i = 0; i <= nTracks; i++) {
    let y = centerY - gridHeight / 2 + i * cellHeight;
    line(centerX - gridWidth / 2, y, centerX + gridWidth / 2, y);
  }

  for (let i = 0; i <= nSteps; i++) {
    let x = centerX - gridWidth / 2 + i * cellWidth;
    line(x, centerY - gridHeight / 2, x, centerY + gridHeight / 2);

    if ((beat - 1) % nSteps == i && Tone.Transport.state == "started") {
      fill(234, 30, 83, 60);
      noStroke();
      rect(x, centerY - gridHeight / 2, cellWidth, gridHeight);
    }
  }
}

function mousePressed() {
  const centerX = width / 2;
  const centerY = height / 2;

  if (centerX - gridWidth / 2 < mouseX && mouseX < centerX + gridWidth / 2 &&
    centerY - gridHeight / 2 < mouseY && mouseY < centerY + gridHeight / 2) {
    let x = mouseX - (centerX - gridWidth / 2);
    let y = mouseY - (centerY - gridHeight / 2);
    let i = floor(x / cellWidth);
    let j = floor(y / cellHeight);
    cells[j][i] = !cells[j][i];
  }
}

function connectPlayerToRecorder() {
  player.connect(recorder);
}

function initializeAudio() {
  connectPlayerToRecorder();
  Tone.Transport.bpm.value = bpm;
}

function togglePlay() {
  console.log(`Current Tone.js state: ${Tone.Transport.state}`);
  console.log(`AudioContext state: ${Tone.context.state}`);

  if (Tone.Transport.state === "stopped" && Tone.context.state === "running") {
    Tone.Transport.start();
    console.log("Transport started");
  } else {
    Tone.Transport.stop();
    console.log("Transport stopped");
  }

  // Initialize audio when play is first toggled
  if (!player.initialized) {
      connectPlayerToRecorder();
      player.initialized = true;
    }
  }