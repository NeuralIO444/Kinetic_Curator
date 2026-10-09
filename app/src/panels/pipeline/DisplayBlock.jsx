import { useStore } from "../../state/store.js";
import { helpText } from "../../data/helpCopy.js";
import { DsMatrix } from "./ds.jsx";

// #740/#741: global display settings — how the frame is resolved to the screen.
// Both are per-machine (their own localStorage keys), never project content.
// FXAA applies to the live canvas and to exports (what you see is what you
// export); gate weave is live-only — recordings get it, stills stay exact.
export function DisplayBlock() {
  const fxaa = useStore((s) => s.fxaa);
  const setFxaa = useStore((s) => s.setFxaa);
  const shed = useStore((s) => s.fxaaShed);
  const weave = useStore((s) => s.weave);
  const setWeave = useStore((s) => s.setWeave);
  return (
    <>
      <div className="pipeline-row" title={helpText("output-fxaa")}>
        <span style={{ flex: 1, fontSize: 11 }}>
          EDGE AA · FXAA
          {fxaa && shed && (
            <em style={{ marginLeft: 6, color: "var(--kc-red)" }}>
              shed by governor
            </em>
          )}
        </span>
        <DsMatrix
          label="FXAA"
          options={[
            { value: true, label: "ON" },
            { value: false, label: "OFF" },
          ]}
          value={fxaa}
          onChange={setFxaa}
        />
      </div>
      <div className="pipeline-row" title={helpText("output-weave")}>
        <span className="lbl" style={{ flex: 1, fontSize: 11 }}>
          film · gate weave
        </span>
        <DsMatrix
          label="gate weave"
          options={[
            { value: true, label: "ON" },
            { value: false, label: "OFF" },
          ]}
          value={weave}
          onChange={setWeave}
        />
      </div>
    </>
  );
}
