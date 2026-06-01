import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Users, Trophy, Home, ChevronLeft, Copy, Check, Settings, Mountain, Clock } from "lucide-react";

// Speech helper
function speak(text) {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

const PHASES = {
  READY: "ready",
  CLIMB: "climb",
  SCORE: "score",
  REST: "rest",
  DONE: "done",
};

const HOLD_ORDER = ["start", "five", "ten", "fifteen", "twenty", "top"];
const HOLD_LABELS = { start: "S", five: "5", ten: "10", fifteen: "15", twenty: "20", top: "T" };
const HOLD_SCORES = { start: 0, five: 5, ten: 10, fifteen: 15, twenty: 20, top: 25 };

function computeScore(highestHold, attempts) {
  const baseScore = HOLD_SCORES[highestHold] || 0;
  const penalty = Math.min(10, attempts) * 0.1;
  return Math.max(0, Number((baseScore - penalty).toFixed(1)));
}

function computeTotal(boulders) {
  return boulders.reduce((sum, b) => sum + computeScore(b.highestHold, b.attempts), 0).toFixed(1);
}

function toShareCode(obj) {
  return btoa(encodeURIComponent(JSON.stringify(obj)));
}

function fromShareCode(code) {
  return JSON.parse(decodeURIComponent(atob(String(code || "").trim())));
}

// Get the canonical ID for leaderboard grouping
// Original comps: canonicalId === id. Imported comps: canonicalId = original id.
function getCanonicalId(comp) {
  return comp.canonicalId || comp.id;
}

export default function App() {
  const [screen, setScreen] = useState("home");
  const [comps, setComps] = useState([]);
  const [activeComp, setActiveComp] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [activeTiming, setActiveTiming] = useState(null);

  // Load comps from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("comps");
      if (stored) setComps(JSON.parse(stored));
    } catch {}
  }, []);

  const [saveError, setSaveError] = useState("");

  // Save comps to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("comps", JSON.stringify(comps));
      setSaveError("");
    } catch (err) {
      setSaveError(`Could not save to device storage: ${err && err.message ? err.message : String(err)}. Images may be too large.`);
    }
  }, [comps]);

  const saveSession = (compId, session) => {
    setComps((prev) =>
      prev.map((c) => {
        if (c.id !== compId) return c;
        return { ...c, sessions: [...(c.sessions || []), session] };
      })
    );
  };

  const deleteComp = (compId) => {
    setComps((prev) => prev.filter((c) => c.id !== compId));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-transparent to-transparent"></div>
      <div className="relative min-h-screen">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {saveError && (
            <div className="mb-4 bg-red-900/60 border border-red-500 rounded-lg p-3 text-xs text-red-300">{saveError}</div>
          )}
          {screen === "home" && (
            <HomeScreen
              comps={comps}
              onNewComp={() => setScreen("create")}
              onRunComp={(comp) => {
                setActiveComp(comp);
                setScreen("pre-run");
              }}
              onImport={(comp) => {
                setComps((prev) => [...prev, comp]);
                setActiveComp(comp);
                setScreen("pre-run");
              }}
              onDeleteComp={deleteComp}
            />
          )}

          {screen === "create" && (
            <CreateCompScreen
              onBack={() => setScreen("home")}
              onCreate={(comp) => {
                setComps((prev) => [...prev, comp]);
                setActiveComp(comp);
                setScreen("pre-run");
              }}
            />
          )}

          {screen === "pre-run" && activeComp && (
            <PreRunScreen
              comp={activeComp}
              allComps={comps}
              onBack={() => {
                setActiveComp(null);
                setScreen("home");
              }}
              onStartRun={(playerNames, timing) => {
                const sessions = playerNames.map(name => ({
                  id: `session-${Date.now()}-${Math.random()}`,
                  compId: activeComp.id,
                  compName: activeComp.name,
                  playerName: name,
                  startedAt: new Date().toISOString(),
                  boulders: activeComp.boulders.map(() => ({ highestHold: null, attempts: 1 })),
                }));
                setActiveSession(sessions);
                setActiveTiming(timing);
                setScreen("run");
              }}
            />
          )}

          {screen === "run" && activeComp && activeSession && (
            <RunScreen
              comp={activeComp}
              sessions={activeSession}
              timing={activeTiming}
              onUpdateSessions={setActiveSession}
              onComplete={(completedSessions) => {
                completedSessions.forEach(session => {
                  saveSession(activeComp.id, session);
                });
                setActiveSession(null);
                setActiveComp(null);
                setActiveTiming(null);
                setScreen("home");
              }}
              onExit={() => {
                setActiveSession(null);
                setActiveComp(null);
                setActiveTiming(null);
                setScreen("home");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function HomeScreen({ comps, onNewComp, onRunComp, onImport, onDeleteComp }) {
  const [shareCode, setShareCode] = useState("");
  const [importError, setImportError] = useState("");
  const [showImport, setShowImport] = useState(false);

  // Global leaderboard — groups sessions across comps that share the same canonicalId
  const allSessions = useMemo(() => {
    const sessions = [];
    comps.forEach((c) => {
      (c.sessions || []).forEach((s) => sessions.push({ ...s, compName: c.name }));
    });
    return sessions.sort((a, b) => {
      return parseFloat(computeTotal(b.boulders)) - parseFloat(computeTotal(a.boulders));
    }).slice(0, 10);
  }, [comps]);

  const handleImport = () => {
    try {
      const payload = fromShareCode(shareCode.trim());
      if (!payload || !payload.comp) throw new Error("Invalid");

      const imported = {
        ...payload.comp,
        id: `comp-${Date.now()}`,
        canonicalId: payload.comp.canonicalId || payload.comp.id, // preserve link for shared leaderboard
        importedAt: new Date().toISOString(),
        sessions: [],
      };

      onImport(imported);
      setShareCode("");
      setShowImport(false);
      setImportError("");
    } catch {
      setImportError("Invalid share code. Please check and try again.");
    }
  };

  return (
    <div className="space-y-8">
      <header className="text-center pt-8 pb-6">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Mountain className="w-12 h-12 text-emerald-400" />
          <h1 className="text-5xl font-black bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
            Comp in a Box
          </h1>
        </div>
        <p className="text-slate-400 text-lg">Create • Compete • Conquer</p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        <button
          onClick={onNewComp}
          className="group relative overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white p-8 rounded-2xl font-semibold shadow-2xl transition-all duration-300 hover:scale-105 hover:shadow-emerald-500/50"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="relative flex flex-col items-center gap-3">
            <Plus className="w-8 h-8" />
            <span className="text-xl">Create New Comp</span>
            <span className="text-sm text-emerald-100 opacity-90">Design your own boulders</span>
          </div>
        </button>

        <button
          onClick={() => setShowImport(!showImport)}
          className="group relative overflow-hidden bg-gradient-to-br from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white p-8 rounded-2xl font-semibold shadow-2xl transition-all duration-300 hover:scale-105 hover:shadow-cyan-500/50"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <div className="relative flex flex-col items-center gap-3">
            <Copy className="w-8 h-8" />
            <span className="text-xl">Join with Code</span>
            <span className="text-sm text-cyan-100 opacity-90">Compete on shared boulders</span>
          </div>
        </button>
      </div>

      {showImport && (
        <div className="bg-slate-900/90 backdrop-blur-xl rounded-2xl p-6 space-y-4 border border-slate-700/50 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-cyan-500/20 rounded-xl">
              <Copy className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-bold text-xl text-white">Join a Comp</h3>
              <p className="text-sm text-slate-400">Enter the share code to get started</p>
            </div>
          </div>
          <textarea
            className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-sm min-h-[100px] focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none font-mono text-slate-200 placeholder-slate-500"
            placeholder="Paste share code here..."
            value={shareCode}
            onChange={(e) => {
              setImportError("");
              setShareCode(e.target.value);
            }}
          />
          {importError && <p className="text-sm text-red-400 flex items-center gap-2">⚠️ {importError}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => { setShowImport(false); setShareCode(""); setImportError(""); }}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-xl font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!shareCode.trim()}
              className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-all shadow-lg"
            >
              Join Comp
            </button>
          </div>
        </div>
      )}

      {comps.length > 0 && (
        <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 space-y-4 border border-slate-700/50 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <Users className="w-6 h-6 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">My Comps</h2>
          </div>
          <div className="grid gap-3">
            {comps.map((comp) => (
              <div key={comp.id} className="flex items-center justify-between bg-slate-800/60 backdrop-blur rounded-xl p-4 border border-slate-700/50 hover:border-emerald-500/50 transition-all group">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-lg text-white truncate">{comp.name}</div>
                  <div className="text-sm text-slate-400">
                    {comp.sessions?.length || 0} run{comp.sessions?.length !== 1 ? 's' : ''} • 4 boulders
                    {comp.canonicalId && comp.canonicalId !== comp.id && (
                      <span className="ml-2 text-cyan-400">• shared</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => onRunComp(comp)}
                    className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-emerald-500/50"
                  >
                    Run
                  </button>
                  <button
                    onClick={() => onDeleteComp(comp.id)}
                    className="p-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {allSessions.length > 0 && (
        <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 space-y-4 border border-slate-700/50 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <Trophy className="w-6 h-6 text-yellow-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
          </div>
          <div className="space-y-2">
            {allSessions.map((session, i) => (
              <div key={session.id} className="flex items-center justify-between bg-slate-800/60 backdrop-blur rounded-xl p-4 border border-slate-700/50 hover:border-yellow-500/30 transition-all">
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-700/50 text-slate-400 font-bold">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{session.playerName}</div>
                    <div className="text-xs text-slate-400 truncate max-w-[200px]">{session.compName}</div>
                  </div>
                </div>
                <div className="text-2xl font-bold text-emerald-400">{computeTotal(session.boulders)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {comps.length === 0 && (
        <div className="text-center py-20">
          <div className="inline-block p-6 bg-slate-800/50 rounded-full mb-6">
            <Mountain className="w-16 h-16 text-slate-600" />
          </div>
          <p className="text-slate-400 text-lg">No comps yet. Create your first one!</p>
        </div>
      )}
    </div>
  );
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB soft warning threshold

function CreateCompScreen({ onBack, onCreate }) {
  const [name, setName] = useState("");
  const [boulders, setBoulders] = useState([
    { id: 1, name: "Boulder 1", imageUrl: "", holds: {} },
    { id: 2, name: "Boulder 2", imageUrl: "", holds: {} },
    { id: 3, name: "Boulder 3", imageUrl: "", holds: {} },
    { id: 4, name: "Boulder 4", imageUrl: "", holds: {} },
  ]);
  const [currentBoulder, setCurrentBoulder] = useState(0);
  const [imageUploadError, setImageUploadError] = useState("");

  const boulder = boulders[currentBoulder];
  const nextHold = HOLD_ORDER.find((h) => !boulder.holds[h]);

  // Detailed validation: what's missing?
  const missingItems = useMemo(() => {
    const missing = [];
    if (!name.trim()) missing.push("Comp name (required)");
    boulders.forEach((b, i) => {
      if (!b.imageUrl) missing.push(`Boulder ${i + 1}: no photo`);
      else if (!b.holds.start) missing.push(`Boulder ${i + 1}: no start hold marked`);
      else if (!b.holds.top) missing.push(`Boulder ${i + 1}: no top hold marked`);
    });
    return missing;
  }, [name, boulders]);

  const isValid = missingItems.length === 0;

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageUploadError("");
    if (file.size > MAX_IMAGE_BYTES) {
      setImageUploadError(`Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — large images may fail to save. Consider resizing it first.`);
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBoulders((prev) => {
        const updated = [...prev];
        updated[currentBoulder] = { ...updated[currentBoulder], imageUrl: String(ev.target.result) };
        return updated;
      });
    };
    reader.onerror = () => {
      setImageUploadError(`Failed to read image: ${reader.error ? reader.error.message : "unknown error"} (code ${reader.error ? reader.error.code : "?"})`);
    };
    reader.readAsDataURL(file);
  };

  const handleImageClick = (e) => {
    if (!nextHold) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setBoulders((prev) => {
      const updated = [...prev];
      updated[currentBoulder] = {
        ...updated[currentBoulder],
        holds: { ...updated[currentBoulder].holds, [nextHold]: { x, y } },
      };
      return updated;
    });
  };

  const resetHolds = () => {
    setBoulders((prev) => {
      const updated = [...prev];
      updated[currentBoulder] = { ...updated[currentBoulder], holds: {} };
      return updated;
    });
  };

  const handleCreate = () => {
    if (!isValid) return;
    const id = `comp-${Date.now()}`;
    onCreate({
      id,
      canonicalId: id, // original comp — canonical = self
      name: name.trim(),
      createdAt: new Date().toISOString(),
      boulders,
      sessions: [],
    });
  };

  const holdsSet = Object.keys(boulder.holds).length;
  const boulderComplete = boulder.imageUrl && boulder.holds.start && boulder.holds.top;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between bg-slate-900/60 backdrop-blur-xl rounded-2xl p-4 border border-slate-700/50">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold">Back</span>
        </button>
        <h2 className="text-2xl font-bold text-white">Create Comp</h2>
        <div className="w-20"></div>
      </div>

      <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50 space-y-4">
        <div>
          <label className="block text-sm font-semibold mb-2 text-slate-300">
            Comp Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Friday Night Comp"
            className={`w-full bg-slate-800/50 border rounded-xl px-4 py-3 focus:ring-2 focus:outline-none text-white placeholder-slate-500 ${
              !name.trim() ? "border-red-500/50 focus:border-red-500 focus:ring-red-500/20" : "border-slate-700 focus:border-emerald-500 focus:ring-emerald-500/20"
            }`}
          />
          {!name.trim() && (
            <p className="text-xs text-red-400 mt-1">⚠️ A comp name is required to continue</p>
          )}
        </div>
      </div>

      <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-xl text-white">Boulder {currentBoulder + 1} of 4</h3>
          <div className="flex gap-2">
            {boulders.map((_, i) => (
              <button
                key={i}
                onClick={() => { setCurrentBoulder(i); setImageUploadError(""); }}
                className={`w-12 h-12 rounded-xl font-bold text-sm transition-all ${
                  i === currentBoulder
                    ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg"
                    : boulders[i].imageUrl && boulders[i].holds.start && boulders[i].holds.top
                    ? "bg-emerald-500/30 text-emerald-300 border-2 border-emerald-500/50"
                    : "bg-slate-800 text-slate-500 border-2 border-slate-700"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        <input
          type="text"
          value={boulder.name}
          onChange={(e) => {
            const value = e.target.value;
            setBoulders((prev) => {
              const updated = [...prev];
              updated[currentBoulder] = { ...updated[currentBoulder], name: value };
              return updated;
            });
          }}
          placeholder="Boulder name (optional)"
          className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none text-white placeholder-slate-500"
        />

        <div>
          <label className="block text-sm font-semibold mb-3 text-slate-300">Upload Photo</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="w-full text-sm text-slate-300 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-emerald-500 file:to-emerald-600 file:text-white hover:file:from-emerald-600 hover:file:to-emerald-700 file:cursor-pointer file:font-semibold file:shadow-lg"
          />
          {imageUploadError && (
            <div className="mt-2 text-xs text-red-400 bg-red-900/30 border border-red-700 rounded-lg px-3 py-2">{imageUploadError}</div>
          )}
        </div>

        {boulder.imageUrl && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-slate-300">
                  Mark holds ({holdsSet}/6)
                </label>
                <button onClick={resetHolds} className="text-xs text-red-400 hover:text-red-300 font-semibold">
                  Reset
                </button>
              </div>

              {nextHold && (
                <div className="bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 border border-emerald-500/50 rounded-xl p-4 mb-4">
                  <div className="text-sm font-semibold text-emerald-300">
                    👆 Click to mark: <span className="text-lg text-white">{HOLD_LABELS[nextHold]}</span>
                    <span className="text-slate-400 ml-2">
                      {nextHold === 'start' && '(Starting hold)'}
                      {nextHold === 'top' && '(Top/finish hold)'}
                      {!['start', 'top'].includes(nextHold) && `(${HOLD_SCORES[nextHold]} points)`}
                    </span>
                  </div>
                </div>
              )}

              <div
                className="relative w-full bg-slate-950 rounded-xl overflow-hidden cursor-crosshair border-2 border-emerald-500/50 hover:border-emerald-500 transition-all shadow-2xl"
                onClick={handleImageClick}
                style={{ minHeight: '400px', maxHeight: '600px' }}
              >
                <img
                  src={boulder.imageUrl}
                  alt="Boulder"
                  className="w-full h-full object-contain pointer-events-none select-none"
                  style={{ minHeight: '400px', maxHeight: '600px' }}
                />
                {Object.entries(boulder.holds).map(([holdKey, pos]) => (
                  <div
                    key={holdKey}
                    className="absolute w-14 h-14 rounded-full bg-emerald-500 border-4 border-white flex items-center justify-center text-lg font-bold text-white shadow-2xl pointer-events-none animate-pulse"
                    style={{
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {HOLD_LABELS[holdKey]}
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-slate-400 bg-slate-800/50 rounded-xl p-4 space-y-2 border border-slate-700/50">
              <div className="font-semibold text-slate-300">📍 How to mark holds:</div>
              <div>1. Click the starting hold on the image</div>
              <div>2. Click each scoring hold (5, 10, 15, 20)</div>
              <div>3. Click the top/finish hold</div>
              <div className="pt-2 text-slate-500">Minimum required: Start + Top</div>
            </div>
          </div>
        )}

        {boulderComplete && (
          <div className="flex items-center gap-3 text-sm text-emerald-400 bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/30">
            <Check className="w-5 h-5" />
            <span className="font-semibold">Boulder {currentBoulder + 1} complete!</span>
          </div>
        )}
      </div>

      {/* What's missing checklist */}
      {!isValid && (
        <div className="bg-orange-900/30 border border-orange-500/50 rounded-2xl p-5 space-y-2">
          <div className="text-sm font-bold text-orange-300 mb-3">⚠️ Complete these to unlock the comp:</div>
          {missingItems.map((item, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-orange-200">
              <div className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0"></div>
              {item}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={!isValid}
        className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-bold text-lg shadow-2xl transition-all hover:scale-105"
      >
        {isValid ? "Create Comp & Continue →" : "Complete checklist above to continue"}
      </button>
    </div>
  );
}

// Time picker: a row of preset buttons + custom input (in minutes)
function TimePicker({ label, valueSeconds, onChange, presets }) {
  const valueMins = Math.round(valueSeconds / 60);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-300">{label}</label>
        <span className="text-emerald-400 font-bold text-sm">{formatTime(valueSeconds)}</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => onChange(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              valueSeconds === p.value
                ? "bg-emerald-500 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
            type="button"
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg px-2">
          <input
            type="number"
            min={1}
            max={60}
            value={valueMins}
            onChange={(e) => {
              const v = Math.max(1, Math.min(60, parseInt(e.target.value) || 1));
              onChange(v * 60);
            }}
            className="w-10 bg-transparent text-white text-xs text-center focus:outline-none py-1.5"
          />
          <span className="text-slate-400 text-xs">min</span>
        </div>
      </div>
    </div>
  );
}

function PreRunScreen({ comp, allComps, onBack, onStartRun }) {
  const [players, setPlayers] = useState([""]);
  const [showShareCode, setShowShareCode] = useState(true); // show by default
  const [copied, setCopied] = useState(false);
  const [showTimingSettings, setShowTimingSettings] = useState(false);

  // Timing settings (in seconds)
  const [preclimbTime, setPreclimbTime] = useState(10);
  const [climbTime, setClimbTime] = useState(4 * 60);
  const [restTime, setRestTime] = useState(2 * 60);

  const shareCode = useMemo(() => {
    return toShareCode({
      comp: {
        ...comp,
        sessions: [],
        canonicalId: comp.canonicalId || comp.id,
      }
    });
  }, [comp]);

  // Shared leaderboard: all sessions from comps sharing the same canonicalId
  const leaderboard = useMemo(() => {
    const canonId = getCanonicalId(comp);
    const sessions = [];
    allComps.forEach((c) => {
      if (getCanonicalId(c) === canonId) {
        (c.sessions || []).forEach((s) => sessions.push({ ...s, compName: c.name }));
      }
    });
    return sessions
      .sort((a, b) => parseFloat(computeTotal(b.boulders)) - parseFloat(computeTotal(a.boulders)))
      .slice(0, 10);
  }, [comp, allComps]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const addPlayer = () => {
    if (players.length < 8) setPlayers([...players, ""]);
  };

  const removePlayer = (idx) => {
    if (players.length > 1) setPlayers(players.filter((_, i) => i !== idx));
  };

  const updatePlayer = (idx, value) => {
    const updated = [...players];
    updated[idx] = value;
    setPlayers(updated);
  };

  const validPlayers = players.filter(p => p.trim()).map(p => p.trim());
  const canStart = validPlayers.length > 0;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between bg-slate-900/60 backdrop-blur-xl rounded-2xl p-4 border border-slate-700/50">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold">Back</span>
        </button>
        <h2 className="text-xl font-bold text-white truncate max-w-[200px]">{comp.name}</h2>
        <button
          onClick={() => setShowTimingSettings(!showTimingSettings)}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
          title="Timing settings"
        >
          <Clock className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Share code — prominent at the top */}
      <div className="bg-gradient-to-br from-cyan-900/40 to-blue-900/40 backdrop-blur-xl rounded-2xl p-6 border border-cyan-500/30 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-lg">
              <Copy className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">Share Code</h3>
              <p className="text-xs text-slate-400">Give this to others so they can compete on the same boulders & join your leaderboard</p>
            </div>
          </div>
          <button
            onClick={() => setShowShareCode(!showShareCode)}
            className="text-xs text-slate-400 hover:text-white"
          >
            {showShareCode ? "Hide" : "Show"}
          </button>
        </div>

        {showShareCode && (
          <>
            <textarea
              value={shareCode}
              readOnly
              className="w-full bg-slate-800/50 rounded-xl p-4 text-xs min-h-[80px] border border-slate-700 font-mono text-slate-300"
            />
            <button
              onClick={handleCopy}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy Share Code"}
            </button>
          </>
        )}
      </div>

      {/* Timing settings */}
      {showTimingSettings && (
        <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <Clock className="w-5 h-5 text-orange-400" />
            </div>
            <h3 className="font-bold text-lg text-white">Timing Settings</h3>
          </div>

          <TimePicker
            label="Pre-Climb (Transition)"
            valueSeconds={preclimbTime}
            onChange={setPreclimbTime}
            presets={[
              { label: "10s", value: 10 },
              { label: "30s", value: 30 },
              { label: "1 min", value: 60 },
              { label: "2 min", value: 120 },
            ]}
          />

          <TimePicker
            label="Climb Time"
            valueSeconds={climbTime}
            onChange={setClimbTime}
            presets={[
              { label: "3 min", value: 3 * 60 },
              { label: "4 min", value: 4 * 60 },
              { label: "5 min", value: 5 * 60 },
              { label: "6 min", value: 6 * 60 },
            ]}
          />

          <TimePicker
            label="Rest Time"
            valueSeconds={restTime}
            onChange={setRestTime}
            presets={[
              { label: "1 min", value: 60 },
              { label: "2 min", value: 2 * 60 },
              { label: "3 min", value: 3 * 60 },
              { label: "5 min", value: 5 * 60 },
            ]}
          />
        </div>
      )}

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <Trophy className="w-5 h-5 text-yellow-400" />
            </div>
            <h3 className="font-bold text-lg text-white">Leaderboard</h3>
            <span className="text-xs text-slate-400">(all runs on this comp)</span>
          </div>
          <div className="space-y-2">
            {leaderboard.map((session, i) => (
              <div key={session.id} className="flex items-center justify-between bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-bold w-8">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </span>
                  <div>
                    <span className="font-semibold text-white">{session.playerName}</span>
                    {session.compName !== comp.name && (
                      <div className="text-xs text-slate-500">{session.compName}</div>
                    )}
                  </div>
                </div>
                <span className="font-bold text-emerald-400 text-lg">{computeTotal(session.boulders)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Players */}
      <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 rounded-lg">
            <Users className="w-5 h-5 text-cyan-400" />
          </div>
          <h3 className="font-bold text-lg text-white">Add Players</h3>
        </div>
        <div className="space-y-3">
          {players.map((name, idx) => (
            <div key={idx} className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => updatePlayer(idx, e.target.value)}
                placeholder={`Player ${idx + 1} name`}
                className="flex-1 bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none text-white placeholder-slate-500"
              />
              {players.length > 1 && (
                <button
                  onClick={() => removePlayer(idx)}
                  className="p-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl transition-all"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
          {players.length < 8 && (
            <button
              onClick={addPlayer}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 py-3 rounded-xl text-sm font-semibold text-slate-300 transition-all border border-slate-700"
            >
              <Plus className="w-4 h-4" />
              Add Player
            </button>
          )}
        </div>
        <button
          onClick={() => onStartRun(validPlayers, { preclimbTime, climbTime, restTime })}
          disabled={!canStart}
          className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold text-lg shadow-2xl transition-all"
        >
          Start Climbing {validPlayers.length > 0 && `(${validPlayers.length} player${validPlayers.length !== 1 ? 's' : ''})`}
        </button>
      </div>
    </div>
  );
}

function RunScreen({ comp, sessions, timing, onUpdateSessions, onComplete, onExit }) {
  const climbTime = timing?.climbTime ?? 4 * 60;
  const restTime = timing?.restTime ?? 2 * 60;
  const preclimbTime = timing?.preclimbTime ?? 10;

  const [boulderIdx, setBoulderIdx] = useState(0);
  const [playerIdx, setPlayerIdx] = useState(0);
  const [phase, setPhase] = useState(PHASES.READY);
  const [timeLeft, setTimeLeft] = useState(preclimbTime);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [shareCode, setShareCode] = useState("");
  const [copied, setCopied] = useState(false);

  const currentSession = sessions[playerIdx];
  const boulder = comp.boulders[boulderIdx];
  const sessionBoulder = currentSession.boulders[boulderIdx];

  const tickEnabled = phase === PHASES.CLIMB || phase === PHASES.READY || phase === PHASES.REST;

  useEffect(() => {
    if (!tickEnabled || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => {
      const newTime = Math.max(0, t - 1);
      if (newTime === 0) {
        if (phase === PHASES.READY) {
          setPhase(PHASES.CLIMB);
          setTimeLeft(climbTime);
          speak(`${currentSession.playerName}, you may begin climbing`);
        } else if (phase === PHASES.REST) {
          setPhase(PHASES.READY);
          setTimeLeft(preclimbTime);
        }
      }
      return newTime;
    }), 1000);
    return () => clearInterval(timer);
  }, [tickEnabled, timeLeft, phase, currentSession.playerName, climbTime, preclimbTime]);

  useEffect(() => {
    if (phase === PHASES.READY) {
      if (timeLeft <= 5 && timeLeft > 0) speak(String(timeLeft));
    } else if (phase === PHASES.CLIMB) {
      if (timeLeft === 60) speak("One minute remaining");
      if (timeLeft === 10) speak("Ten seconds");
      if (timeLeft === 0) speak("Time is up");
    }
  }, [phase, timeLeft]);

  const finishClimb = () => setPhase(PHASES.SCORE);

  const setHighestHold = (hold) => {
    onUpdateSessions((prev) => {
      const updated = [...prev];
      updated[playerIdx] = {
        ...updated[playerIdx],
        boulders: updated[playerIdx].boulders.map((b, i) =>
          i === boulderIdx ? { ...b, highestHold: hold } : b
        )
      };
      return updated;
    });
  };

  const setAttempts = (attempts) => {
    onUpdateSessions((prev) => {
      const updated = [...prev];
      updated[playerIdx] = {
        ...updated[playerIdx],
        boulders: updated[playerIdx].boulders.map((b, i) =>
          i === boulderIdx ? { ...b, attempts } : b
        )
      };
      return updated;
    });
  };

  const nextTurn = () => {
    if (playerIdx < sessions.length - 1) {
      setPlayerIdx(playerIdx + 1);
      setPhase(PHASES.REST);
      setTimeLeft(restTime);
    } else if (boulderIdx < 3) {
      setBoulderIdx(boulderIdx + 1);
      setPlayerIdx(0);
      setPhase(PHASES.REST);
      setTimeLeft(restTime);
    } else {
      const code = toShareCode({
        comp: {
          ...comp,
          sessions: [],
          canonicalId: comp.canonicalId || comp.id,
        }
      });
      setShareCode(code);
      setShowResults(true);
    }
  };

  const handleCopyShareCode = async () => {
    try {
      await navigator.clipboard.writeText(shareCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleFinish = () => {
    const completedSessions = sessions.map(s => ({
      ...s,
      completedAt: new Date().toISOString(),
    }));
    onComplete(completedSessions);
  };

  const skipRest = () => {
    setPhase(PHASES.READY);
    setTimeLeft(preclimbTime);
  };

  useEffect(() => {
    if (phase === PHASES.REST && timeLeft === 0) {
      setPhase(PHASES.READY);
      setTimeLeft(preclimbTime);
    }
  }, [phase, timeLeft, preclimbTime]);

  const handleExit = () => {
    if (phase === PHASES.CLIMB) setShowExitConfirm(true);
    else onExit();
  };

  return (
    <div className="space-y-4 pb-8">
      {showResults && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 rounded-3xl p-8 max-w-md w-full space-y-6 border border-slate-700 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="text-center">
              <div className="inline-block p-4 bg-yellow-500/20 rounded-full mb-4">
                <Trophy className="w-12 h-12 text-yellow-400" />
              </div>
              <h3 className="text-3xl font-bold mb-2 text-white">Competition Complete!</h3>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-5 space-y-3">
              <h4 className="font-bold text-sm text-slate-400 mb-4">FINAL STANDINGS</h4>
              {sessions
                .map((s, i) => ({ ...s, index: i, total: computeTotal(s.boulders) }))
                .sort((a, b) => parseFloat(b.total) - parseFloat(a.total))
                .map((s, rank) => (
                  <div key={s.index} className="flex justify-between items-center py-3 border-b border-slate-700 last:border-0">
                    <div className="flex items-center gap-4">
                      <span className="text-3xl">
                        {rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : `#${rank + 1}`}
                      </span>
                      <span className="font-semibold text-white">{s.playerName}</span>
                    </div>
                    <span className="text-2xl font-bold text-emerald-400">{s.total}</span>
                  </div>
                ))}
            </div>

            <div className="bg-gradient-to-br from-cyan-900/40 to-blue-900/40 rounded-2xl p-5 space-y-4 border border-cyan-500/30">
              <div className="flex items-center gap-2">
                <Copy className="w-5 h-5 text-cyan-400" />
                <h4 className="font-bold text-white">Share This Comp</h4>
              </div>
              <p className="text-xs text-slate-400">
                Share this code so others can compete on the same boulders and join the leaderboard!
              </p>
              <textarea
                value={shareCode}
                readOnly
                className="w-full bg-slate-900 rounded-xl p-3 text-xs min-h-[80px] border border-slate-700 font-mono text-slate-300"
              />
              <button
                onClick={handleCopyShareCode}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy Share Code"}
              </button>
            </div>

            <button
              onClick={handleFinish}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white py-4 rounded-xl font-bold text-lg transition-all shadow-lg"
            >
              Save Results & Return Home
            </button>
          </div>
        </div>
      )}

      {showExitConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 rounded-3xl p-6 max-w-sm w-full space-y-5 border border-slate-700 shadow-2xl">
            <h3 className="text-2xl font-bold text-white">Exit Run?</h3>
            <p className="text-slate-300">Your progress will be lost if you exit now.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 py-3 rounded-xl font-semibold text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowExitConfirm(false); onExit(); }}
                className="flex-1 bg-red-500 hover:bg-red-600 py-3 rounded-xl font-semibold text-white"
              >
                Exit Run
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between bg-slate-900/60 backdrop-blur-xl rounded-2xl p-4 border border-slate-700/50">
        <button onClick={handleExit} className="flex items-center gap-2 text-slate-400 hover:text-white">
          <Home className="w-5 h-5" />
          <span className="font-semibold">Exit</span>
        </button>
        <div className="text-center">
          <div className="text-xs text-slate-400">
            Boulder {boulderIdx + 1}/4 • Player {playerIdx + 1}/{sessions.length}
          </div>
          <div className="font-bold text-emerald-400">{currentSession.playerName}</div>
        </div>
        <div className="w-16"></div>
      </div>

      <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl p-4 border border-slate-700/50">
        <div className="text-xs text-slate-400 mb-3 font-semibold">CURRENT STANDINGS</div>
        <div className="space-y-2">
          {sessions
            .map((s, i) => ({ ...s, index: i, total: computeTotal(s.boulders) }))
            .sort((a, b) => parseFloat(b.total) - parseFloat(a.total))
            .map((s, rank) => (
              <div
                key={s.index}
                className={`flex justify-between text-sm py-2 px-3 rounded-lg ${
                  s.index === playerIdx ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-slate-300'
                }`}
              >
                <span>#{rank + 1} {s.playerName}</span>
                <span>{s.total}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-slate-700/50 space-y-6">
        {phase === PHASES.READY && (
          <>
            <div className="text-center space-y-4">
              <div className="text-sm text-slate-400 font-semibold">GET READY</div>
              <h2 className="text-4xl font-black text-white">{currentSession.playerName}</h2>
              <div className="bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl p-5">
                <div className="text-sm text-white/80 mb-1 font-semibold">Boulder {boulderIdx + 1} of 4</div>
                <div className="text-3xl font-bold text-white">{boulder.name}</div>
              </div>
              <div className="text-8xl font-black tabular-nums text-emerald-400 py-6">{timeLeft}</div>
              <p className="text-slate-400 text-lg">Prepare to climb...</p>
            </div>

            {boulder.imageUrl && (
              <div className="relative w-full bg-slate-950 rounded-xl overflow-hidden border-2 border-slate-700">
                <img
                  src={boulder.imageUrl}
                  alt="Boulder"
                  className="w-full h-full object-contain"
                  style={{ minHeight: '300px', maxHeight: '400px' }}
                />
                {Object.entries(boulder.holds).map(([holdKey, pos]) => (
                  <div
                    key={holdKey}
                    className="absolute w-12 h-12 rounded-full bg-emerald-500 border-3 border-white flex items-center justify-center text-base font-bold text-white shadow-lg"
                    style={{
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {HOLD_LABELS[holdKey]}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => {
                setPhase(PHASES.CLIMB);
                setTimeLeft(climbTime);
                speak(`${currentSession.playerName}, you may begin climbing`);
              }}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold transition-all shadow-lg"
            >
              Skip Pre-Climb
            </button>
          </>
        )}

        {phase === PHASES.CLIMB && (
          <>
            <div className="text-center space-y-4">
              <div className="text-8xl font-black tabular-nums text-emerald-400">{formatTime(timeLeft)}</div>
              <p className="text-slate-400 text-lg">Climbing in progress...</p>
            </div>

            {boulder.imageUrl && (
              <div className="relative w-full bg-slate-950 rounded-xl overflow-hidden border-2 border-slate-700">
                <img
                  src={boulder.imageUrl}
                  alt="Boulder"
                  className="w-full h-full object-contain"
                  style={{ minHeight: '200px', maxHeight: '300px' }}
                />
                {Object.entries(boulder.holds).map(([holdKey, pos]) => (
                  <div
                    key={holdKey}
                    className="absolute w-10 h-10 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-sm font-bold text-white shadow-lg"
                    style={{
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {HOLD_LABELS[holdKey]}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={finishClimb}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-xl font-bold transition-all shadow-lg"
            >
              Finished Early - Score Now
            </button>
          </>
        )}

        {phase === PHASES.SCORE && (
          <>
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">Score Boulder {boulderIdx + 1}</h3>
              <p className="text-sm text-slate-400">{boulder.name}</p>
              <p className="text-xs text-slate-500 mt-1">{currentSession.playerName}</p>
            </div>

            {boulder.imageUrl && (
              <div className="relative w-full bg-slate-950 rounded-xl overflow-hidden border-2 border-slate-700 mb-6">
                <img
                  src={boulder.imageUrl}
                  alt="Boulder"
                  className="w-full h-full object-contain"
                  style={{ minHeight: '250px', maxHeight: '350px' }}
                />
                {Object.entries(boulder.holds).map(([holdKey, pos]) => (
                  <div
                    key={holdKey}
                    className={`absolute w-12 h-12 rounded-full border-3 border-white flex items-center justify-center text-base font-bold text-white shadow-lg ${
                      sessionBoulder.highestHold === holdKey ? 'bg-yellow-500 ring-4 ring-yellow-300' : 'bg-emerald-500'
                    }`}
                    style={{
                      left: `${pos.x * 100}%`,
                      top: `${pos.y * 100}%`,
                      transform: "translate(-50%, -50%)",
                    }}
                  >
                    {HOLD_LABELS[holdKey]}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold mb-3 text-slate-300">Highest Hold Reached</label>
                <div className="grid grid-cols-3 gap-3">
                  {HOLD_ORDER.map((hold) => (
                    <button
                      key={hold}
                      onClick={() => setHighestHold(hold)}
                      className={`py-4 rounded-xl font-bold transition-all shadow-lg ${
                        sessionBoulder.highestHold === hold
                          ? "bg-emerald-500 text-white scale-105"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                      }`}
                    >
                      {HOLD_LABELS[hold]} ({HOLD_SCORES[hold]})
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold mb-3 text-slate-300">Number of Attempts</label>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setAttempts(n)}
                      className={`py-3 rounded-xl font-bold transition-all ${
                        sessionBoulder.attempts === n
                          ? "bg-emerald-500 text-white scale-105"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {[6, 7, 8, 9, 10].map((n) => (
                    <button
                      key={n}
                      onClick={() => setAttempts(n)}
                      className={`py-3 rounded-xl font-bold transition-all ${
                        sessionBoulder.attempts === n
                          ? "bg-emerald-500 text-white scale-105"
                          : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-slate-400 mt-3 bg-slate-800/50 rounded-lg p-3">
                  Final Score: <span className="text-emerald-400 font-bold text-lg">{computeScore(sessionBoulder.highestHold, sessionBoulder.attempts)}</span>
                  <span className="ml-2">(Base: {HOLD_SCORES[sessionBoulder.highestHold] || 0}, Penalty: -{(sessionBoulder.attempts * 0.1).toFixed(1)})</span>
                </div>
              </div>

              <button
                onClick={nextTurn}
                disabled={!sessionBoulder.highestHold}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white py-5 rounded-xl font-bold text-lg shadow-2xl transition-all"
              >
                {playerIdx < sessions.length - 1
                  ? "Next Player →"
                  : boulderIdx < 3
                    ? "Next Boulder →"
                    : "Finish Comp 🎉"}
              </button>
            </div>
          </>
        )}

        {phase === PHASES.REST && (
          <>
            <div className="text-center space-y-4">
              <h3 className="text-3xl font-bold text-white">Rest Period</h3>
              <div className="text-7xl font-black tabular-nums text-orange-400">{formatTime(timeLeft)}</div>
              <p className="text-slate-400 text-lg">
                {playerIdx < sessions.length - 1
                  ? `${sessions[playerIdx + 1].playerName} up next on ${boulder.name}`
                  : boulderIdx < 3
                    ? `Moving to Boulder ${boulderIdx + 2} - ${sessions[0].playerName} will go first`
                    : "Great climbing everyone!"}
              </p>
            </div>

            <button
              onClick={skipRest}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-xl font-bold transition-all"
            >
              Skip Rest
            </button>
          </>
        )}
      </div>
    </div>
  );
}
