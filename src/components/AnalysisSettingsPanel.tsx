import { useEngineStore } from '../engine/engineStore';

const HASH_OPTIONS = [16, 32, 64, 128, 256] as const;

/**
 * Settings for the full-game Run Analysis pass. Used to live in the engine
 * gear menu; now embedded in the Analysis workspace tab next to its trigger
 * button so all full-game-analysis controls are in one place.
 */
export function AnalysisSettingsPanel() {
  const fullGame = useEngineStore((s) => s.fullGame);
  const setFullGame = useEngineStore((s) => s.setFullGame);

  return (
    <div className="analysis__settings">
      <div className="analysis__settings-title">Settings</div>
      <div className="analysis__settings-row">
        <label htmlFor="ana-multipv">Lines</label>
        <input
          id="ana-multipv"
          type="range"
          min={1}
          max={5}
          step={1}
          value={fullGame.multiPv}
          onChange={(e) => setFullGame('multiPv', parseInt(e.target.value, 10))}
        />
        <span className="analysis__settings-val">{fullGame.multiPv}</span>
      </div>
      <div className="analysis__settings-row">
        <label htmlFor="ana-limit-kind">Limit by</label>
        <select
          id="ana-limit-kind"
          value={fullGame.limitKind}
          onChange={(e) => setFullGame('limitKind', e.target.value as 'depth' | 'nodes')}
        >
          <option value="nodes">Nodes (Lichess-style)</option>
          <option value="depth">Depth</option>
        </select>
      </div>
      {fullGame.limitKind === 'depth' ? (
        <div className="analysis__settings-row">
          <label htmlFor="ana-depth">Depth</label>
          <input
            id="ana-depth"
            type="range"
            min={1}
            max={99}
            step={1}
            value={fullGame.depth}
            onChange={(e) => setFullGame('depth', parseInt(e.target.value, 10))}
          />
          <span className="analysis__settings-val">{fullGame.depth}</span>
        </div>
      ) : (
        <div className="analysis__settings-row">
          <label htmlFor="ana-nodes">Nodes</label>
          <select
            id="ana-nodes"
            value={fullGame.nodes}
            onChange={(e) => setFullGame('nodes', parseInt(e.target.value, 10))}
          >
            <option value={500_000}>500k (fast)</option>
            <option value={1_500_000}>1.5M (Lichess fishnet)</option>
            <option value={4_050_000}>4.05M (Lichess classical)</option>
            <option value={10_000_000}>10M (deep)</option>
          </select>
        </div>
      )}
      <div className="analysis__settings-row">
        <label htmlFor="ana-hash">Hash</label>
        <select
          id="ana-hash"
          value={fullGame.hashMb}
          onChange={(e) => setFullGame('hashMb', parseInt(e.target.value, 10))}
        >
          {HASH_OPTIONS.map((mb) => (
            <option key={`ana-${mb}`} value={mb}>
              {mb} MB
            </option>
          ))}
        </select>
      </div>
      <div className="analysis__settings-row">
        <label htmlFor="ana-cloud">Cloud cache</label>
        <input
          id="ana-cloud"
          type="checkbox"
          checked={fullGame.useCloudEval}
          onChange={(e) => setFullGame('useCloudEval', e.target.checked)}
        />
      </div>
    </div>
  );
}
