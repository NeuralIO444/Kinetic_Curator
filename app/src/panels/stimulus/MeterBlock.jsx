import { WaveformMeter } from '../../components/WaveformMeter.jsx';

export function MeterBlock({ audioBands, beatPulse }) {
  return (
    <div className="stim-meters">
      <WaveformMeter audioBands={audioBands} beatPulse={beatPulse} />
    </div>
  );
}
