// CAEngine.jsx — Cellular Automaton + Bitwise transforms
// Generates positions via Conway's Game of Life variant, mutates colors/params via bitwise ops

// ────────────────────────────────────────────────────────────────
// Bitwise transforms for mutation
// ────────────────────────────────────────────────────────────────
function bitXOR(colorHex, bits) {
  const num = parseInt(colorHex.replace('#', ''), 16);
  const mutated = num ^ bits;
  return '#' + mutated.toString(16).padStart(6, '0');
}

function bitRotateLeft(value, bits) {
  const b = bits & 7;
  if (b === 0) return value & 0xFF;
  return ((value << b) | ((value & 0xFF) >>> (8 - b))) & 0xFF;
}

function bitRotateRight(value, bits) {
  const b = bits & 7;
  if (b === 0) return value & 0xFF;
  return (((value & 0xFF) >>> b) | (value << (8 - b))) & 0xFF;
}

function bitMutateColor(hex, seed) {
  const r = parseInt(hex.substr(1, 2), 16);
  const g = parseInt(hex.substr(3, 2), 16);
  const b = parseInt(hex.substr(5, 2), 16);
  
  return '#' + 
    bitRotateLeft(r ^ seed, 2).toString(16).padStart(2, '0') +
    bitRotateLeft(g ^ seed, 1).toString(16).padStart(2, '0') +
    bitRotateLeft(b ^ seed, 3).toString(16).padStart(2, '0');
}

// ────────────────────────────────────────────────────────────────
// Cellular Automaton grid
// ────────────────────────────────────────────────────────────────
function seededRng(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) / 0xffffffff);
  };
}

class CAGrid {
  constructor(width, height, seed = 0x12345) {
    this.width = width;
    this.height = height;
    this.grid = this.initGrid(seed);
    this.generation = 0;
  }

  initGrid(seed) {
    const rand = seededRng(seed);
    const grid = Array(this.height).fill(null).map(() =>
      Array(this.width).fill(0).map(() => rand() > 0.7 ? 1 : 0)
    );
    return grid;
  }

  countNeighbors(x, y) {
    let count = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = (x + dx + this.width) % this.width;
        const ny = (y + dy + this.height) % this.height;
        count += this.grid[ny][nx];
      }
    }
    return count;
  }

  step(energyBias = 0.5) {
    const newGrid = Array(this.height).fill(null).map(() => Array(this.width).fill(0));
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const neighbors = this.countNeighbors(x, y);
        const alive = this.grid[y][x];
        
        // Conway with bias: energy drives more births
        const birthThreshold = Math.round(3 - energyBias);
        const survivalThreshold = Math.round(2 + energyBias);
        
        if (!alive && neighbors === birthThreshold) {
          newGrid[y][x] = 1; // Birth
        } else if (alive && (neighbors === survivalThreshold || neighbors === 3)) {
          newGrid[y][x] = 1; // Survival
        }
      }
    }
    
    this.grid = newGrid;
    this.generation++;
    return this.grid;
  }

  getActiveCells() {
    const cells = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x]) {
          cells.push({ x, y, id: `${x}_${y}` });
        }
      }
    }
    return cells;
  }
}

// ────────────────────────────────────────────────────────────────
// Layout generator: CA → positions
// ────────────────────────────────────────────────────────────────
function generateCALayout(params, rng, motionEnergy = 0.5, seed = 0) {
  const caGrid = new CAGrid(12, 8, seed ^ 0x5A17);
  
  // Simulate a few generations influenced by motion
  for (let i = 0; i < Math.round(3 + motionEnergy * 5); i++) {
    caGrid.step(motionEnergy);
  }

  const activeCells = caGrid.getActiveCells();
  const positions = [];

  // Map CA cells to canvas positions
  const cellW = 1000 / caGrid.width;
  const cellH = 700 / caGrid.height;

  for (let i = 0; i < params.count && i < activeCells.length * 3; i++) {
    const cell = activeCells[i % activeCells.length];
    const generation = caGrid.generation;
    
    // Jittered position within cell
    const x = cell.x * cellW + cellW * 0.5 + (rng() - 0.5) * params.jitter;
    const y = cell.y * cellH + cellH * 0.5 + (rng() - 0.5) * params.jitter;
    
    // Bitwise mutation of parameters
    const cellSeed = (cell.x << 4) ^ cell.y;
    const mutationFactor = ((cellSeed ^ (generation * 13)) & 0xFF) / 255;
    
    const scale = params.scale[0] + (params.scale[1] - params.scale[0]) * mutationFactor;
    const rot = params.rotate[0] + (params.rotate[1] - params.rotate[0]) * mutationFactor;
    const alpha = params.alpha[0] + (params.alpha[1] - params.alpha[0]) * mutationFactor;

    positions.push({
      id: `ca_${i}_${generation}`,
      x: Math.max(0, Math.min(1000, x)),
      y: Math.max(0, Math.min(700, y)),
      scale,
      rot,
      alpha: alpha / 100,
      caGeneration: generation,
      cellIndex: i % activeCells.length,
      mutationSeed: cellSeed,
    });
  }

  return positions;
}

window.CAEngine = {
  CAGrid,
  generateCALayout,
  bitMutateColor,
  bitXOR,
  bitRotateLeft,
  bitRotateRight,
};
