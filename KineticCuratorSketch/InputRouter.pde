import processing.video.*;

class InputRouter {
  Capture cam;
  float stimulus = 0;

  InputRouter(Capture cam) {
    this.cam = cam;
  }

  float update() {
    if (cam != null && cam.available()) {
      cam.read();
    }

    if (cam == null || cam.width == 0) {
      return stimulus;
    }

    cam.loadPixels();
    float total = 0;
    int count = 0;

    for (int i = 0; i < cam.pixels.length; i += 20) {
      total += brightness(cam.pixels[i]);
      count++;
    }

    if (count > 0) {
      float average = total / count;
      stimulus = constrain(average / 100.0, 0, 1);
    }

    return stimulus;
  }

  float getStimulus() {
    return stimulus;
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
