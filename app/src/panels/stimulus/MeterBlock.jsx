import { WaveformMeter } from '../../components/WaveformMeter.jsx';
import { MeterRow } from './MeterRow.jsx';

export function MeterBlock({ motionEnergy, audioBands, beatPulse }) {
  return (
    <div className="stim-meters">
      <MeterRow label="MOTION" value={motionEnergy} color="#00ff88" />
      <div style={{ height: '4px' }} />
      <WaveformMeter audioBands={audioBands} beatPulse={beatPulse} />
    </div>
  );
}
