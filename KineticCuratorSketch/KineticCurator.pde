import hype.*;
import processing.video.*;
import processing.pdf.*;

AssetPool assetPool;
InputRouter inputRouter;
LayoutManager layout;
HColorPool colors;
Capture cam;
boolean saveSnapshot = false;

void setup() {
  size(1280, 720, P3D);
  surface.setResizable(true);
  H.init(this).background(#050505).useScreenCanvas();

  // Load SVG assets from the data folder.
  assetPool = new AssetPool("data");
  assetPool.loadAssets();

  // Create a dynamic color pool for Joshua Davis-style results.
  colors = new HColorPool(#FF3300, #FFFFFF, #0095FF, #000000);

  // Initialize live input and layout engine.
  cam = InputRouter.createCamera(this, 640, 480);
  inputRouter = new InputRouter(cam);
  layout = new LayoutManager();
  layout.prepare(assetPool, colors);
}

void draw() {
  background(5);

  float stimulus = inputRouter.update();
  layout.applyLayout(stimulus);

  if (saveSnapshot) {
    String filename = "snapshot_" + year() + nf(month(), 2) + nf(day(), 2) + "_" + nf(hour(), 2) + nf(minute(), 2) + nf(second(), 2) + ".pdf";
    beginRecord(PDF, dataPath(filename));
    H.drawStage();
    endRecord();
    println("Saved vector snapshot: " + filename);
    saveSnapshot = false;
  }

  H.drawStage();
}

void keyPressed() {
  if (key == 's' || key == 'S') {
    saveSnapshot = true;
  }
}
