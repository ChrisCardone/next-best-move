import { useEngineStore } from '../engine/engineStore';

const HASH_OPTIONS = [16, 32, 64, 128, 256] as const;

export function EngineSettingsPanel() {
  const interactive = useEngineStore((s) => s.interactive);
  const setInteractive = useEngineStore((s) => s.setInteractive);

  return (
    <div className="engine__settings">
      <div className="engine__settings-row">
        <label htmlFor="eng-multipv">Lines</label>
        <input
          id="eng-multipv"
          type="range"
          min={1}
          max={5}
          step={1}
          value={interactive.multiPv}
          onChange={(e) => setInteractive('multiPv', parseInt(e.target.value, 10))}
        />
        <span className="engine__settings-val">{interactive.multiPv}</span>
      </div>
      <div className="engine__settings-row">
        <label htmlFor="eng-depth">Depth</label>
        <input
          id="eng-depth"
          type="range"
          min={1}
          max={99}
          step={1}
          value={interactive.depth}
          onChange={(e) => setInteractive('depth', parseInt(e.target.value, 10))}
        />
        <span className="engine__settings-val">{interactive.depth}</span>
      </div>
      <div className="engine__settings-row">
        <label htmlFor="eng-hash">Hash</label>
        <select
          id="eng-hash"
          value={interactive.hashMb}
          onChange={(e) => setInteractive('hashMb', parseInt(e.target.value, 10))}
        >
          {HASH_OPTIONS.map((mb) => (
            <option key={mb} value={mb}>
              {mb} MB
            </option>
          ))}
        </select>
      </div>
      <div className="engine__settings-row">
        <label htmlFor="eng-analysemode">Analysis mode</label>
        <input
          id="eng-analysemode"
          type="checkbox"
          checked={interactive.analyseMode}
          onChange={(e) => setInteractive('analyseMode', e.target.checked)}
        />
      </div>
    </div>
  );
}
