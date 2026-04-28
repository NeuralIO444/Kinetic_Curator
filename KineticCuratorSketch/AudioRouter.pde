// AudioRouter — beat detection and frequency analysis for audio-driven stimulus
// Uses Minim library for audio input and analysis

import ddf.minim.*;
import ddf.minim.analysis.*;

class AudioRouter {
  private Minim minim;
  private AudioInput input;
  private FFT fft;
  
  private float beatStrength = 0;
  private float bassEnergy = 0;
  private float midEnergy = 0;
  private float trebleEnergy = 0;
  
  private float prevBassEnergy = 0;
  private float beatThreshold = 50;
  private float beatCooldown = 0;
  private final float BEAT_COOLDOWN_FRAMES = 10;
  
  boolean enabled = false;
  
  AudioRouter(PApplet parent) {
    minim = new Minim(parent);
    // Start with line input; can be switched to mic() for microphone input
    input = minim.getLineIn(Minim.STEREO, 512);
    fft = new FFT(input.bufferSize(), input.sampleRate());
    enabled = true;
  }
  
  void update() {
    if (!enabled || input == null) return;
    
    fft.forward(input.mix);
    
    // Analyze frequency bands
    int bassEnd = (int)(200.0 / input.sampleRate() * fft.specSize());
    int midEnd = (int)(2000.0 / input.sampleRate() * fft.specSize());
    int trebleEnd = fft.specSize();
    
    bassEnergy = 0;
    midEnergy = 0;
    trebleEnergy = 0;
    
    for (int i = 0; i < bassEnd; i++) {
      bassEnergy += fft.getBand(i);
    }
    for (int i = bassEnd; i < midEnd; i++) {
      midEnergy += fft.getBand(i);
    }
    for (int i = midEnd; i < trebleEnd; i++) {
      trebleEnergy += fft.getBand(i);
    }
    
    // Normalize energy values
    bassEnergy /= (float)bassEnd;
    midEnergy /= (float)(midEnd - bassEnd);
    trebleEnergy /= (float)(trebleEnd - midEnd);
    
    // Detect beat onset (bass rise)
    beatStrength = 0;
    if (bassEnergy > prevBassEnergy + beatThreshold && beatCooldown <= 0) {
      beatStrength = map(bassEnergy - prevBassEnergy, beatThreshold, 200, 0, 1);
      beatCooldown = BEAT_COOLDOWN_FRAMES;
    }
    
    prevBassEnergy = prevBassEnergy * 0.95 + bassEnergy * 0.05;
    beatCooldown--;
  }
  
  float getStimulus() {
    if (!enabled) return 0;
    // Combine beat onset with bass energy
    float stimFromBeat = beatStrength * 0.6;
    float stimFromBass = map(bassEnergy, 0, 100, 0, 0.4);
    return constrain(stimFromBeat + stimFromBass, 0, 1);
  }
  
  float getBeatStrength() {
    return beatStrength;
  }
  
  float getBassEnergy() {
    return bassEnergy;
  }
  
  float getMidEnergy() {
    return midEnergy;
  }
  
  float getTrebleEnergy() {
    return trebleEnergy;
  }
  
  void switchToMicrophone() {
    if (input != null) {
      input.close();
    }
    input = minim.getLineIn(Minim.STEREO, 512);
    fft = new FFT(input.bufferSize(), input.sampleRate());
  }
  
  void dispose() {
    if (input != null) {
      input.close();
    }
    if (minim != null) {
      minim.stop();
    }
  }
}
