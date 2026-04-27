class LayoutManager {
  ArrayList<HShape> placed;
  HColorPool colors;

  void prepare(AssetPool pool, HColorPool colors) {
    this.colors = colors;
    placed = new ArrayList<HShape>();

    for (HShape original : pool.getAssets()) {
      HShape copy = new HShape(original.getShape());
      copy.enableStyle(false)
          .strokeWeight(0.5)
          .anchorAt(H.CENTER);
      H.add(copy);
      placed.add(copy);
    }
  }

  void applyLayout(float stimulus) {
    if (placed == null || placed.size() == 0) {
      return;
    }

    int count = placed.size();
    int cols = ceil(sqrt(count));
    int rows = ceil(count / (float) cols);
    float cellW = width / (float) cols;
    float cellH = height / (float) rows;

    for (int i = 0; i < placed.size(); i++) {
      HShape s = placed.get(i);
      int col = i % cols;
      int row = i / cols;
      float tx = cellW * (col + 0.5);
      float ty = cellH * (row + 0.5);

      float offset = map(stimulus, 0, 1, 0, PI * 2);
      float rotation = offset + i * 0.05;
      float scaleValue = map(stimulus, 0, 1, 0.45, 1.15);
      float alphaValue = map(stimulus, 0, 1, 120, 255);
      float colorIndex = (sin(i * 0.25 + frameCount * 0.02) + 1) * 0.5;

      s.loc(tx, ty);
      s.rotation(rotation);
      s.scale(scaleValue);
      s.alpha((int) alphaValue);
      s.fill(colors.getColor(colorIndex));
    }
  }
}
