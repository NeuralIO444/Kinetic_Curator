import processing.video.*;

class InputRouter {
  Capture cam;
  AudioRouter audio;
  float stimulus = 0;
  float audioWeight = 0.5;  // Blend audio (0.5) with webcam (0.5)
  boolean useAudio = false;

  InputRouter(Capture cam) {
    this.cam = cam;
  }
  
  InputRouter(Capture cam, AudioRouter audio) {
    this.cam = cam;
    this.audio = audio;
    this.useAudio = (audio != null && audio.enabled);
  }

  float update() {
    float camStimulus = 0;
    
    if (cam != null && cam.available()) {
      cam.read();
    }

    if (cam != null && cam.width > 0) {
      cam.loadPixels();
      float total = 0;
      int count = 0;

      for (int i = 0; i < cam.pixels.length; i += 20) {
        total += brightness(cam.pixels[i]);
        count++;
      }

      if (count > 0) {
        float average = total / count;
        camStimulus = constrain(average / 100.0, 0, 1);
      }
    }
    
    // Blend webcam and audio stimulus
    if (useAudio && audio != null) {
      audio.update();
      float audioStimulus = audio.getStimulus();
      stimulus = camStimulus * (1 - audioWeight) + audioStimulus * audioWeight;
    } else {
      stimulus = camStimulus;
    }

    return stimulus;
  }

  float getStimulus() {
    return stimulus;
  }
  
  void setAudioWeight(float w) {
    audioWeight = constrain(w, 0, 1);
  }
  
  float getAudioWeight() {
    return audioWeight;
  }
  
  boolean hasAudio() {
    return useAudio;
  }

  static Capture createCamera(PApplet parent, int w, int h) {
    try {
      String[] cameras = Capture.list();
      if (cameras.length > 0) {
        println("InputRouter: opening camera " + cameras[0]);
        Capture cam = new Capture(parent, cameras[0], w, h);
        cam.start();
        return cam;
      }
    } catch (Exception e) {
      println("InputRouter: camera list unavailable or failed to open camera.");
    }
    println("InputRouter: creating default camera stream.");
    Capture cam = new Capture(parent, w, h);
    cam.start();
    return cam;
  }
}
