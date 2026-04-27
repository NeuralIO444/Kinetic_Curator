import java.io.File;
import java.util.ArrayList;

class AssetPool {
  String folder;
  ArrayList<HShape> assets;

  AssetPool(String folder) {
    this.folder = folder;
    assets = new ArrayList<HShape>();
  }

  void loadAssets() {
    String dataDir = dataPath(folder);
    File dir = new File(dataDir);
    if (!dir.exists() || !dir.isDirectory()) {
      println("AssetPool: data folder not found: " + dataDir);
      return;
    }

    String[] files = dir.list();
    if (files == null) {
      println("AssetPool: no files found in " + dataDir);
      return;
    }

    for (String filename : files) {
      if (filename.toLowerCase().endsWith(".svg")) {
        String pathInData = folder.equals("") ? filename : folder + "/" + filename;
        HShape s = new HShape(pathInData);
        s.enableStyle(false)
         .strokeWeight(0.5)
         .anchorAt(H.CENTER);
        assets.add(s);
      }
    }

    if (assets.size() == 0) {
      println("AssetPool: no SVG assets found in " + folder + ". Using placeholder shapes.");
      createPlaceholderAssets();
    } else {
      println("AssetPool: loaded " + assets.size() + " SVG assets from " + folder);
    }
  }

  ArrayList<HShape> getAssets() {
    return assets;
  }

  void createPlaceholderAssets() {
    for (int i = 0; i < 6; i++) {
      PShape shape = createShape(ELLIPSE, 0, 0, 120, 120);
      HShape s = new HShape(shape);
      s.enableStyle(false)
       .strokeWeight(1)
       .anchorAt(H.CENTER);
      assets.add(s);
    }
  }
}
