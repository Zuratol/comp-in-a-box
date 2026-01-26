import React, { useEffect, useMemo, useRef, useState } from "react";

// Simple speech helper
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
  PRECLIMB: "preclimb",
  CLIMB: "climb",
  SCORE: "score",
  REST: "rest",
  DONE: "done",
};

function phaseLabel(phase) {
  switch (phase) {
    case PHASES.PRECLIMB:
      return "Pre-Climb";
    case PHASES.CLIMB:
      return "Climbing";
    case PHASES.SCORE:
      return "Scoring";
    case PHASES.REST:
      return "Rest";
    case PHASES.DONE:
      return "Done";
    default:
      return String(phase || "");
  }
}

const HOLD_ORDER = ["start", "five", "ten", "fifteen", "twenty", "twentyFive"];
const HOLD_LABELS = {
  start: "S",
  five: "5",
  ten: "10",
  fifteen: "15",
  twenty: "20",
  twentyFive: "25",
};

const SCORE_CHOICES = [0, 5, 10, 15, 20, 25];
const MAX_ATTEMPTS = 10;
const ATTEMPT_PENALTY_PER_ATTEMPT = 0.01;

function clampInt(n, min, max) {
  const x = Number.isFinite(Number(n)) ? Math.floor(Number(n)) : 0;
  return Math.max(min, Math.min(max, x));
}

function computeBoulderEffective(score, attempts) {
  const s = clampInt(score, 0, 25);
  const a = clampInt(attempts, 0, MAX_ATTEMPTS);
  const eff = s - a * ATTEMPT_PENALTY_PER_ATTEMPT;
  return eff < 0 ? 0 : Number(eff.toFixed(2));
}

function computeTotal(scores, attempts) {
  let sum = 0;
  for (let i = 0; i < 4; i++) sum += computeBoulderEffective(scores[i] || 0, attempts[i] || 0);
  return Number(sum.toFixed(2));
}

// Share code helpers (base64 of URI-encoded JSON)
function toShareCode(obj) {
  const json = JSON.stringify(obj);
  const uri = encodeURIComponent(json);
  return btoa(uri);
}

function fromShareCode(code) {
  const uri = atob(String(code || "").trim());
  const json = decodeURIComponent(uri);
  return JSON.parse(json);
}

// Minimal self-tests (no framework here)
(function runSelfTests() {
  try {
    console.assert(formatTime(0) === "00:00", "formatTime 0");
    console.assert(formatTime(65) === "01:05", "formatTime 65");
    console.assert(computeBoulderEffective(25, 10) === 24.9, "penalty max");
    const sample = { a: 1, name: "tilted earth" };
    const back = fromShareCode(toShareCode(sample));
    console.assert(back.a === 1 && back.name === "tilted earth", "share encode/decode");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("Self-tests failed:", e);
  }
})();

const initialTemplates = [];

export default function App() {
  const [screen, setScreen] = useState("home");
  const [templates, setTemplates] = useState(initialTemplates);
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [playerName, setPlayerName] = useState("");
  const [liveConfig, setLiveConfig] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("compTemplates");
      if (stored) setTemplates(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("compTemplates", JSON.stringify(templates));
    } catch {}
  }, [templates]);

  const globalLeaderboard = useMemo(() => {
    const sessions = [];
    templates.forEach((t) => {
      (t.sessions || []).forEach((s) => sessions.push({ ...s, templateName: t.name }));
    });
    sessions.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    return sessions.slice(0, 10);
  }, [templates]);

  const handleTemplateCreated = (template) => {
    setTemplates((prev) => [...prev, template]);
    setActiveTemplate(template);
    setScreen("run-new-template");
  };

  const handleSessionSaved = (templateId, session) => {
    setTemplates((prev) =>
      prev.map((t) => {
        if (t.id !== templateId) return t;
        return { ...t, sessions: [...(t.sessions || []), session] };
      })
    );
  };

  const handleImportShareCode = (code) => {
    const payload = fromShareCode(code);
    if (!payload || !payload.template) throw new Error("Invalid share code");

    const importedTemplate = {
      ...payload.template,
      id: `t-import-${Date.now()}`,
      createdAt: new Date().toISOString(),
      sessions: payload.template.sessions || [],
    };

    setTemplates((prev) => [...prev, importedTemplate]);
    setActiveTemplate(importedTemplate);
    setScreen("run-shared");
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-50 flex flex-col items-center p-4">
      <div className="w-full max-w-md">
        <header className="mb-4 text-center">
          <h1 className="text-2xl font-bold">Comp in a Box</h1>
          <p className="text-xs text-slate-300">4-boulder mini comps. Share a code. Chase the ghost.</p>
        </header>

        {screen === "home" && (
          <HomeScreen
            templates={templates}
            globalLeaderboard={globalLeaderboard}
            onStartNew={() => setScreen("setup")}
            onStartLive={() => setScreen("live-setup")}
            onRunShared={(t) => {
              setActiveTemplate(t);
              setScreen("run-shared");
            }}
            onImportShareCode={handleImportShareCode}
            onClearLeaderboard={() => {
              setTemplates((prev) => prev.map((t) => ({ ...t, sessions: [] })));
            }}
            onClearTemplates={() => {
              setTemplates([]);
              setActiveTemplate(null);
            }}
          />
        )}

        {screen === "setup" && (
          <SetupWizard
            onCancel={() => setScreen("home")}
            onTemplateCreated={handleTemplateCreated}
            playerName={playerName}
            setPlayerName={setPlayerName}
          />
        )}

        {screen === "run-new-template" && activeTemplate && (
          <CompRunner
            template={activeTemplate}
            playerName={playerName}
            mode="new"
            onHome={() => setScreen("home")}
            onDone={(session) => {
              if (session) handleSessionSaved(activeTemplate.id, session);
              setScreen("home");
            }}
          />
        )}

        {screen === "run-shared" && activeTemplate && (
          <SharedCompRunner
            template={activeTemplate}
            onCancel={() => setScreen("home")}
            onDone={(session) => {
              if (session && !session.__start) handleSessionSaved(activeTemplate.id, session);
              setScreen("home");
            }}
          />
        )}

        {screen === "live-setup" && (
          <LiveCompSetup
            onCancel={() => setScreen("home")}
            onStart={(cfg) => {
              setLiveConfig(cfg);
              setScreen("live-run");
            }}
          />
        )}

        {screen === "live-run" && liveConfig && (
          <LiveCompRunner
            config={liveConfig}
            onHome={() => {
              setLiveConfig(null);
              setScreen("home");
            }}
          />
        )}
      </div>
    </div>
  );
}

function HomeScreen({
  templates,
  globalLeaderboard,
  onStartNew,
  onStartLive,
  onRunShared,
  onImportShareCode,
  onClearLeaderboard,
  onClearTemplates,
}) {
  const [selected, setSelected] = useState("");
  const [shareCode, setShareCode] = useState("");
  const [importErr, setImportErr] = useState("");

  const template = templates.find((t) => t.id === selected) || null;

  return (
    <div className="space-y-4">
      <button className="w-full py-3 rounded-lg bg-emerald-500 text-slate-900 font-semibold" onClick={onStartNew} type="button">
        Start a New Comp
      </button>
      <button className="w-full py-2 rounded-lg bg-orange-500 text-slate-900 font-semibold" onClick={onStartLive} type="button">
        Start a Live Comp
      </button>

      <div className="flex gap-2">
        <select
          className="flex-1 bg-slate-800 rounded-lg p-2 text-sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Select shared comp</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          disabled={!template}
          className="px-3 py-2 rounded-lg bg-indigo-500 text-xs font-semibold disabled:opacity-40"
          onClick={() => template && onRunShared(template)}
          type="button"
        >
          Run
        </button>
      </div>

      <div className="bg-slate-800 rounded-lg p-3 space-y-2">
        <h3 className="text-sm font-semibold">Run from Share Code</h3>
        <textarea
          className="w-full bg-slate-900 rounded-lg p-2 text-xs min-h-[76px]"
          placeholder="Paste a share code here"
          value={shareCode}
          onChange={(e) => {
            setImportErr("");
            setShareCode(e.target.value);
          }}
        />
        {importErr && <div className="text-xs text-red-400">{importErr}</div>}
        <button
          className="w-full py-2 rounded-lg bg-emerald-500 text-slate-900 text-sm font-semibold disabled:opacity-40"
          disabled={!shareCode.trim()}
          onClick={() => {
            try {
              onImportShareCode(shareCode);
              setShareCode("");
              setImportErr("");
            } catch {
              setImportErr("That code looks cursed. Try a different one.");
            }
          }}
          type="button"
        >
          Import & Run
        </button>
        <p className="text-[10px] text-slate-400">Heads up: share codes include images (big).</p>
      </div>

      <div className="bg-slate-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Global Leaderboard</h3>
          <button
            className="text-[10px] px-2 py-1 rounded-md bg-slate-900 text-slate-300 disabled:opacity-40"
            onClick={() => onClearLeaderboard && onClearLeaderboard()}
            type="button"
            disabled={globalLeaderboard.length === 0}
          >
            Clear leaderboard
          </button>
        </div>
        {globalLeaderboard.length === 0 ? (
          <p className="text-xs text-slate-400">No sessions yet.</p>
        ) : (
          <ol className="space-y-1 text-xs">
            {globalLeaderboard.map((s, i) => (
              <li key={s.id} className="flex justify-between">
                <span>
                  {i + 1}. {s.playerName} – {s.totalScore}
                </span>
                <span className="text-slate-400 truncate max-w-[140px] text-right">{s.templateName}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="bg-slate-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Saved Comps</h3>
          <button
            className="text-[10px] px-2 py-1 rounded-md bg-slate-900 text-slate-300 disabled:opacity-40"
            onClick={() => {
              onClearTemplates && onClearTemplates();
              setSelected("");
            }}
            type="button"
            disabled={templates.length === 0}
          >
            Clear comps
          </button>
        </div>
        <p className="text-[10px] text-slate-400">This removes saved comp templates on this device.</p>
      </div>
    </div>
  );
}

function BoulderImage({ imageUrl, holds, onClick, clickable }) {
  if (!imageUrl) return null;
  return (
    <div
      className="relative w-full pt-[100%] bg-slate-800 rounded-lg overflow-hidden"
      onClick={clickable ? onClick : undefined}
    >
      <img src={imageUrl} alt="Boulder" className="absolute inset-0 w-full h-full object-cover" />
      {holds &&
        Object.entries(holds).map(([k, p]) =>
          p ? (
            <div
              key={k}
              className="absolute w-6 h-6 rounded-full bg-emerald-500/80 flex items-center justify-center text-[10px] font-bold text-slate-900 border border-slate-900"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: "translate(-50%, -50%)" }}
            >
              {HOLD_LABELS[k]}
            </div>
          ) : null
        )}
    </div>
  );
}

function SetupWizard({ onCancel, onTemplateCreated, playerName, setPlayerName }) {
  const [gymName, setGymName] = useState("");
  const [boulders, setBoulders] = useState(
    [0, 1, 2, 3].map((i) => ({
      id: `b${i}`,
      index: i + 1,
      name: `Boulder ${i + 1}`,
      imageUrl: "",
      holds: { start: null, five: null, ten: null, fifteen: null, twenty: null, twentyFive: null },
    }))
  );

  const ready = (b) =>
    !!(
      b &&
      b.holds &&
      b.holds.start &&
      b.holds.twentyFive &&
      (b.holds.five || b.holds.ten || b.holds.fifteen || b.holds.twenty)
    );

  const allReady = boulders.every(ready);

  const setHold = (i, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setBoulders((prev) => {
      const c = [...prev];
      const h = { ...c[i].holds };
      const k = HOLD_ORDER.find((key) => !h[key]);
      if (!k) return prev;
      h[k] = { x, y };
      c[i] = { ...c[i], holds: h };
      return c;
    });
  };

  const setImage = (i, e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) =>
      setBoulders((p) => {
        const c = [...p];
        c[i] = { ...c[i], imageUrl: String(ev.target.result) };
        return c;
      });
    r.readAsDataURL(f);
  };

  const resetHolds = (i) => {
    setBoulders((p) => {
      const c = [...p];
      c[i] = {
        ...c[i],
        holds: { start: null, five: null, ten: null, fifteen: null, twenty: null, twentyFive: null },
      };
      return c;
    });
  };

  const create = () => {
    if (!playerName || !allReady) return;
    onTemplateCreated({
      id: `t-${Date.now()}`,
      name: `${gymName || "My Comp"} – ${new Date().toLocaleDateString()} – Set by ${playerName}`,
      gymName,
      createdBy: playerName,
      createdAt: new Date().toISOString(),
      boulders,
      sessions: [],
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <button onClick={onCancel} className="text-xs text-slate-300 underline" type="button">
          Home
        </button>
        <h2 className="text-lg font-semibold">Setup New Comp</h2>
        <button onClick={onCancel} className="text-xs text-slate-400" type="button">
          Cancel
        </button>
      </div>

      <input
        className="w-full p-2 bg-slate-800 rounded-lg"
        placeholder="Your name"
        value={playerName}
        onChange={(e) => setPlayerName(e.target.value)}
      />
      <input
        className="w-full p-2 bg-slate-800 rounded-lg"
        placeholder="Gym name (optional)"
        value={gymName}
        onChange={(e) => setGymName(e.target.value)}
      />

      <p className="text-xs text-slate-300">Add 4 boulder photos and click holds in order: S - 5 - 10 - 15 - 20 - 25.</p>

      {boulders.map((b, i) => (
        <div key={b.id} className="border border-slate-700 rounded-lg p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <input
              className="flex-1 bg-slate-800 rounded-lg p-2 text-sm"
              value={b.name}
              onChange={(e) => {
                const v = e.target.value;
                setBoulders((p) => {
                  const c = [...p];
                  c[i] = { ...c[i], name: v };
                  return c;
                });
              }}
              placeholder={`Boulder ${i + 1} name (optional)`}
            />
            <span
              className={
                "text-[10px] px-2 py-1 rounded-md " +
                (ready(b) ? "bg-emerald-500 text-slate-900" : "bg-slate-800 text-slate-300")
              }
            >
              {ready(b) ? "Ready" : "Not ready"}
            </span>
          </div>

          <input type="file" accept="image/*" onChange={(e) => setImage(i, e)} />

          {b.imageUrl ? (
            <>
              <BoulderImage imageUrl={b.imageUrl} holds={b.holds} onClick={(e) => setHold(i, e)} clickable />
              <div className="flex justify-between items-center text-[10px]">
                <span>Holds set: {Object.values(b.holds).filter(Boolean).length} / 6</span>
                <button className="text-slate-300 underline" onClick={() => resetHolds(i)} type="button">
                  Reset holds
                </button>
              </div>
            </>
          ) : null}
        </div>
      ))}

      <button
        disabled={!allReady || !playerName}
        onClick={create}
        className="w-full bg-emerald-500 text-slate-900 rounded-lg py-2 font-semibold disabled:opacity-40"
        type="button"
      >
        Create Template & Start
      </button>
    </div>
  );
}

function SharedCompRunner({ template, onCancel, onDone }) {
  const [name, setName] = useState("");
  const leaderboard = useMemo(() => {
    const list = (template.sessions || []).slice();
    list.sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    return list;
  }, [template.sessions]);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Run Shared Comp</h2>
        <button onClick={onCancel} className="text-xs text-slate-400" type="button">
          Cancel
        </button>
      </div>

      <div className="bg-slate-800 rounded-lg p-3">
        <div className="text-xs text-slate-300">Template</div>
        <div className="text-sm font-semibold">{template.name}</div>
      </div>

      <div className="bg-slate-800 rounded-lg p-3">
        <div className="text-sm font-semibold mb-2">Leaderboard</div>
        {leaderboard.length === 0 ? (
          <div className="text-xs text-slate-400">No runs yet. Set the bar.</div>
        ) : (
          <ol className="space-y-1 text-xs">
            {leaderboard.map((s, i) => (
              <li key={s.id} className="flex justify-between">
                <span>
                  {(i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : "")}
                  {i + 1}. {s.playerName}
                </span>
                <span>{s.totalScore}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <input
        className="w-full p-2 bg-slate-800 rounded-lg"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      {name.trim() ? (
        <CompRunner
          template={template}
          playerName={name.trim()}
          mode="shared"
          onHome={onCancel}
          onDone={(session) => onDone(session)}
        />
      ) : (
        <button
          disabled={!name.trim()}
          className="w-full bg-emerald-500 text-slate-900 rounded-lg py-2 font-semibold disabled:opacity-40"
          onClick={() => {}}
          type="button"
        >
          Enter your name to start
        </button>
      )}
    </div>
  );
}

function CompRunner({ template, playerName, onDone, mode, onHome }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState(PHASES.PRECLIMB);
  const [timeLeft, setTimeLeft] = useState(10);

  const [scores, setScores] = useState([0, 0, 0, 0]);
  const [attempts, setAttempts] = useState([0, 0, 0, 0]);

  const [shareCode, setShareCode] = useState("");
  const [doneSession, setDoneSession] = useState(null);

  const [showConfirmHome, setShowConfirmHome] = useState(false);
  const [showResume, setShowResume] = useState(false);

  const resumeCheckedRef = useRef(false);

  const currentBoulder = template.boulders[idx];

  const draftKey = useMemo(() => {
    const pn = (playerName || "Unknown").trim() || "Unknown";
    return `compDraft:${template.id}:${pn}`;
  }, [template.id, playerName]);

  const tickEnabled = phase !== PHASES.SCORE && phase !== PHASES.DONE;

  const hasAnyProgress = useMemo(() => {
    if (phase === PHASES.DONE) return false;
    if (idx > 0) return true;
    if (phase !== PHASES.PRECLIMB) return true;
    if (scores.some((s) => (s || 0) !== 0)) return true;
    if (attempts.some((a) => (a || 0) !== 0)) return true;
    return false;
  }, [idx, phase, scores, attempts]);

  const saveDraft = () => {
    if (mode !== "new") return;
    if (!hasAnyProgress) return;
    try {
      const payload = {
        v: 1,
        templateId: template.id,
        playerName: (playerName || "Unknown").trim() || "Unknown",
        updatedAt: new Date().toISOString(),
        state: { idx, phase, timeLeft, scores, attempts },
      };
      localStorage.setItem(draftKey, JSON.stringify(payload));
    } catch {}
  };

  const clearDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {}
  };

  // Load draft prompt (new comps only)
  useEffect(() => {
    if (mode !== "new") return;
    if (resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;

    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.state) return;
      setShowResume(true);
    } catch {}
  }, [draftKey, mode]);

  // Auto-save draft (new comps only)
  useEffect(() => {
    if (mode !== "new") return;
    if (!hasAnyProgress) return;
    if (phase === PHASES.DONE) return;
    saveDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, hasAnyProgress, idx, phase, timeLeft, scores, attempts]);

  // ticking timer + auto-advance
  useEffect(() => {
    if (!tickEnabled) return;
    if (timeLeft <= 0) {
      advance();
      return;
    }
    const t = setInterval(() => setTimeLeft((v) => v - 1), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickEnabled, timeLeft, phase, idx]);

  // voice cues
  useEffect(() => {
    if (phase === PHASES.PRECLIMB) {
      if (timeLeft <= 5 && timeLeft > 0) speak(String(timeLeft));
      if (timeLeft === 0) speak(`${playerName || "Climber"}, you may begin climbing.`);
    }
    if (phase === PHASES.CLIMB) {
      if (timeLeft === 60) speak("One minute warning.");
      if (timeLeft <= 10 && timeLeft > 0) speak(String(timeLeft));
      if (timeLeft === 0) speak("Time. Stop climbing.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  const startPhase = (nextPhase) => {
    setPhase(nextPhase);
    if (nextPhase === PHASES.PRECLIMB) setTimeLeft(10);
    if (nextPhase === PHASES.CLIMB) setTimeLeft(4 * 60);
    if (nextPhase === PHASES.REST) setTimeLeft(4 * 60);
    if (nextPhase === PHASES.SCORE) setTimeLeft(0);
  };

  const advance = () => {
    if (phase === PHASES.PRECLIMB) {
      startPhase(PHASES.CLIMB);
      return;
    }

    if (phase === PHASES.CLIMB) {
      startPhase(PHASES.SCORE);
      return;
    }

    if (phase === PHASES.REST) {
      const nextIdx = Math.min(3, idx + 1);
      setIdx(nextIdx);
      startPhase(PHASES.PRECLIMB);
      return;
    }

    if (phase === PHASES.SCORE) {
      if (idx === 3) {
        finish();
      } else {
        startPhase(PHASES.REST);
      }
    }
  };

  const finish = () => {
    const totalScore = computeTotal(scores, attempts);
    const session = {
      id: `s-${Date.now()}`,
      templateId: template.id,
      templateName: template.name,
      playerName: playerName || "Unknown",
      date: new Date().toISOString(),
      scores,
      attempts,
      totalScore,
    };

    // finished -> clear draft
    clearDraft();

    if (mode === "new") {
      const payload = {
        v: 1,
        template: {
          name: template.name,
          gymName: template.gymName || "",
          createdBy: template.createdBy || "",
          createdAt: template.createdAt || "",
          boulders: template.boulders,
          sessions: [],
        },
      };
      setShareCode(toShareCode(payload));
    } else {
      setShareCode("");
    }

    setDoneSession(session);
    setPhase(PHASES.DONE);
  };

  const totalSoFar = useMemo(() => computeTotal(scores, attempts), [scores, attempts]);

  const handleHomeClick = () => {
    // Only confirm during active climb (per request)
    if (phase === PHASES.CLIMB) {
      setShowConfirmHome(true);
      return;
    }
    // otherwise just leave (but save if progress)
    saveDraft();
    if (onHome) onHome();
  };

  return (
    <div className="space-y-3">
      {/* Resume modal */}
      {showResume && mode === "new" ? (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-800 rounded-2xl p-4 space-y-3">
            <div className="text-sm font-semibold">Resume your last run?</div>
            <div className="text-xs text-slate-300">We found saved progress for this comp.</div>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-lg bg-slate-900 text-slate-200 text-xs font-semibold"
                onClick={() => {
                  clearDraft();
                  setShowResume(false);
                }}
                type="button"
              >
                Start fresh
              </button>
              <button
                className="flex-1 py-2 rounded-lg bg-emerald-500 text-slate-900 text-xs font-semibold"
                onClick={() => {
                  try {
                    const raw = localStorage.getItem(draftKey);
                    const parsed = raw ? JSON.parse(raw) : null;
                    const st = parsed && parsed.state;
                    if (st) {
                      setIdx(clampInt(st.idx, 0, 3));
                      setPhase(st.phase || PHASES.PRECLIMB);
                      setTimeLeft(clampInt(st.timeLeft, 0, 24 * 60));
                      setScores(Array.isArray(st.scores) ? st.scores.slice(0, 4) : [0, 0, 0, 0]);
                      setAttempts(Array.isArray(st.attempts) ? st.attempts.slice(0, 4) : [0, 0, 0, 0]);
                    }
                  } catch {}
                  setShowResume(false);
                }}
                type="button"
              >
                Resume
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Confirm home modal (active climb only) */}
      {showConfirmHome ? (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-800 rounded-2xl p-4 space-y-3">
            <div className="text-sm font-semibold">Are you sure?</div>
            <div className="text-xs text-slate-300">If you leave now, we’ll auto-save so you can resume later.</div>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-lg bg-slate-900 text-slate-200 text-xs font-semibold"
                onClick={() => setShowConfirmHome(false)}
                type="button"
              >
                Stay
              </button>
              <button
                className="flex-1 py-2 rounded-lg bg-emerald-500 text-slate-900 text-xs font-semibold"
                onClick={() => {
                  saveDraft();
                  setShowConfirmHome(false);
                  if (onHome) onHome();
                }}
                type="button"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="bg-slate-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <button onClick={handleHomeClick} className="text-xs text-slate-300 underline" type="button">
            Home
          </button>
          <span className="text-xs text-slate-400">{playerName}</span>
        </div>

        <div className="flex justify-between text-xs">
          <span>
            Boulder {idx + 1} of 4
            {mode === "shared" ? " (shared)" : ""}
          </span>
          <span>Total: {totalSoFar}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs">Phase: {phaseLabel(phase)}</span>
          <span className="text-xl font-bold tabular-nums">
            {phase === PHASES.SCORE || phase === PHASES.DONE ? "--:--" : formatTime(timeLeft)}
          </span>
        </div>

        {currentBoulder && currentBoulder.imageUrl ? (
          <BoulderImage imageUrl={currentBoulder.imageUrl} holds={currentBoulder.holds} clickable={false} />
        ) : (
          <div className="text-xs text-slate-400">No image for this boulder.</div>
        )}

        {phase === PHASES.CLIMB && (
          <button
            className="w-full py-2 rounded-lg bg-emerald-500 text-slate-900 text-xs font-semibold"
            onClick={() => startPhase(PHASES.SCORE)}
            type="button"
          >
            Finished Early - Go to Scoring
          </button>
        )}

        {phase === PHASES.REST && (
          <button
            className="w-full py-2 rounded-lg bg-indigo-500 text-slate-900 text-xs font-semibold"
            onClick={() => {
              if (idx === 3) return;
              setIdx((v) => Math.min(3, v + 1));
              startPhase(PHASES.PRECLIMB);
            }}
            type="button"
          >
            Skip Rest - Next Boulder
          </button>
        )}

        {phase === PHASES.SCORE && (
          <div className="space-y-3">
            <div>
              <div className="text-xs">Highest hold reached:</div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {SCORE_CHOICES.map((v) => (
                  <button
                    key={v}
                    className={
                      "py-2 rounded-lg text-sm font-semibold " +
                      (scores[idx] === v ? "bg-emerald-500 text-slate-900" : "bg-slate-700")
                    }
                    onClick={() =>
                      setScores((s) => {
                        const c = [...s];
                        c[idx] = v;
                        return c;
                      })
                    }
                    type="button"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs">Attempts (0-{MAX_ATTEMPTS}):</div>
              <div className="grid grid-cols-6 gap-2 mt-2">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={
                      "py-2 rounded-lg text-xs font-semibold " +
                      (attempts[idx] === n ? "bg-emerald-500 text-slate-900" : "bg-slate-700")
                    }
                    onClick={() =>
                      setAttempts((a) => {
                        const c = [...a];
                        c[idx] = n;
                        return c;
                      })
                    }
                    type="button"
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2 mt-2">
                {[6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    className={
                      "py-2 rounded-lg text-xs font-semibold " +
                      (attempts[idx] === n ? "bg-emerald-500 text-slate-900" : "bg-slate-700")
                    }
                    onClick={() =>
                      setAttempts((a) => {
                        const c = [...a];
                        c[idx] = n;
                        return c;
                      })
                    }
                    type="button"
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Penalty: {ATTEMPT_PENALTY_PER_ATTEMPT} per attempt. Effective: {computeBoulderEffective(scores[idx], attempts[idx])}
              </div>
            </div>

            <button
              className="w-full py-2 rounded-lg bg-emerald-500 text-slate-900 text-xs font-semibold"
              onClick={() => advance()}
              type="button"
            >
              Done Scoring
            </button>
          </div>
        )}

        {phase === PHASES.DONE && doneSession && (
          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold">Finished</div>
              <div className="text-xs text-slate-300">Score: {doneSession.totalScore}</div>
            </div>

            {mode === "new" && shareCode ? (
              <div className="bg-slate-900 rounded-lg p-2">
                <div className="text-xs text-slate-300 mb-1">Share code</div>
                <textarea className="w-full bg-slate-800 rounded-lg p-2 text-[10px] min-h-[90px]" value={shareCode} readOnly />
                <button
                  className="w-full mt-2 py-2 rounded-lg bg-indigo-500 text-slate-900 text-xs font-semibold"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shareCode);
                      speak("Copied.");
                    } catch {
                      speak("Could not copy.");
                    }
                  }}
                  type="button"
                >
                  Copy Share Code
                </button>
              </div>
            ) : null}

            <button
              className="w-full py-2 rounded-lg bg-emerald-500 text-slate-900 text-xs font-semibold"
              onClick={() => {
                if (onDone) onDone(doneSession);
              }}
              type="button"
            >
              Save & Exit
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Live mode: multiplayer round-robin (each boulder, each player)
function createEmptyLiveBoulder(name) {
  return {
    name,
    imageUrl: "",
    holds: { start: null, five: null, ten: null, fifteen: null, twenty: null, twentyFive: null },
  };
}

function isBoulderConfigured(b) {
  return !!(
    b &&
    b.holds &&
    b.holds.start &&
    b.holds.twentyFive &&
    (b.holds.five || b.holds.ten || b.holds.fifteen || b.holds.twenty)
  );
}

function LiveCompSetup({ onCancel, onStart }) {
  const [playerNames, setPlayerNames] = useState([""]);
  const [mode, setMode] = useState("shared"); // shared | custom

  const [sharedBoulders, setSharedBoulders] = useState([
    createEmptyLiveBoulder("Boulder 1"),
    createEmptyLiveBoulder("Boulder 2"),
    createEmptyLiveBoulder("Boulder 3"),
    createEmptyLiveBoulder("Boulder 4"),
  ]);

  // customBoulders[playerIndex][boulderIndex]
  const [customBoulders, setCustomBoulders] = useState([]);

  useEffect(() => {
    if (mode !== "custom") return;
    setCustomBoulders((prev) => {
      const next = playerNames.map((_, pIdx) =>
        prev[pIdx] || [0, 1, 2, 3].map((i) => createEmptyLiveBoulder(`Boulder ${i + 1}`))
      );
      return next;
    });
  }, [mode, playerNames.length]);

  const trimmedPlayers = useMemo(() => playerNames.map((n) => n.trim()).filter(Boolean), [playerNames]);

  const canStart = useMemo(() => {
    if (trimmedPlayers.length === 0) return false;
    return true;
  }, [trimmedPlayers.length]);

  const addPlayer = () => {
    setPlayerNames((p) => (p.length >= 8 ? p : [...p, ""]));
  };

  const removePlayer = (idx) => {
    setPlayerNames((p) => (p.length <= 1 ? p : p.filter((_, i) => i !== idx)));
    setCustomBoulders((prev) => prev.filter((_, i) => i !== idx));
  };

  const setSharedHold = (bIdx, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;

    setSharedBoulders((prev) => {
      const c = [...prev];
      const b = c[bIdx];
      const holds = { ...b.holds };
      const k = HOLD_ORDER.find((key) => !holds[key]);
      if (!k) return prev;
      holds[k] = { x, y };
      c[bIdx] = { ...b, holds };
      return c;
    });
  };

  const setSharedImage = (bIdx, e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) =>
      setSharedBoulders((prev) => {
        const c = [...prev];
        c[bIdx] = { ...c[bIdx], imageUrl: String(ev.target.result) };
        return c;
      });
    r.readAsDataURL(f);
  };

  const resetSharedHolds = (bIdx) => {
    setSharedBoulders((prev) => {
      const c = [...prev];
      c[bIdx] = {
        ...c[bIdx],
        holds: { start: null, five: null, ten: null, fifteen: null, twenty: null, twentyFive: null },
      };
      return c;
    });
  };

  const setCustomHold = (pIdx, bIdx, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;

    setCustomBoulders((prev) => {
      const next = [...prev];
      const row = next[pIdx] || [0, 1, 2, 3].map((i) => createEmptyLiveBoulder(`Boulder ${i + 1}`));
      const b = row[bIdx];
      const holds = { ...b.holds };
      const k = HOLD_ORDER.find((key) => !holds[key]);
      if (!k) return prev;
      holds[k] = { x, y };
      const newRow = [...row];
      newRow[bIdx] = { ...b, holds };
      next[pIdx] = newRow;
      return next;
    });
  };

  const setCustomImage = (pIdx, bIdx, e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) =>
      setCustomBoulders((prev) => {
        const next = [...prev];
        const row = next[pIdx] || [0, 1, 2, 3].map((i) => createEmptyLiveBoulder(`Boulder ${i + 1}`));
        const newRow = [...row];
        newRow[bIdx] = { ...newRow[bIdx], imageUrl: String(ev.target.result) };
        next[pIdx] = newRow;
        return next;
      });
    r.readAsDataURL(f);
  };

  const resetCustomHolds = (pIdx, bIdx) => {
    setCustomBoulders((prev) => {
      const next = [...prev];
      const row = next[pIdx] || [0, 1, 2, 3].map((i) => createEmptyLiveBoulder(`Boulder ${i + 1}`));
      const newRow = [...row];
      newRow[bIdx] = {
        ...newRow[bIdx],
        holds: { start: null, five: null, ten: null, fifteen: null, twenty: null, twentyFive: null },
      };
      next[pIdx] = newRow;
      return next;
    });
  };

  const start = () => {
    if (!canStart) return;

    const players = trimmedPlayers.map((name, pIdx) => {
      if (mode === "shared") {
        return {
          name,
          boulders: sharedBoulders.map((b, i) => ({
            ...b,
            name: (b.name || `Boulder ${i + 1}`).trim() || `Boulder ${i + 1}`,
          })),
        };
      }

      const row = (customBoulders[pIdx] || [0, 1, 2, 3].map((i) => createEmptyLiveBoulder(`Boulder ${i + 1}`))).map(
        (b, i) => ({
          ...b,
          name: (b.name || `Boulder ${i + 1}`).trim() || `Boulder ${i + 1}`,
        })
      );

      return { name, boulders: row };
    });

    onStart({ players, mode, createdAt: new Date().toISOString() });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <button onClick={onCancel} className="text-xs text-slate-300 underline" type="button">
          Home
        </button>
        <h2 className="text-lg font-semibold">Setup Live Comp</h2>
        <button onClick={onCancel} className="text-xs text-slate-400" type="button">
          Cancel
        </button>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Players (up to 8)</div>
        <div className="space-y-2">
          {playerNames.map((n, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                className="flex-1 bg-slate-800 rounded-lg p-2 text-sm"
                value={n}
                onChange={(e) => {
                  const v = e.target.value;
                  setPlayerNames((p) => {
                    const c = [...p];
                    c[idx] = v;
                    return c;
                  });
                }}
                placeholder={`Player ${idx + 1}`}
              />
              {playerNames.length > 1 ? (
                <button className="text-xs text-red-400" onClick={() => removePlayer(idx)} type="button">
                  Remove
                </button>
              ) : null}
            </div>
          ))}

          {playerNames.length < 8 ? (
            <button className="text-xs text-emerald-400 underline" onClick={addPlayer} type="button">
              Add Player
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm font-semibold">Boulder Sets</div>
        <div className="flex gap-2 text-xs">
          <button
            className={`flex-1 py-1 rounded-lg ${mode === "shared" ? "bg-emerald-500 text-slate-900" : "bg-slate-800"}`}
            onClick={() => setMode("shared")}
            type="button"
          >
            Same 4 Boulders
          </button>
          <button
            className={`flex-1 py-1 rounded-lg ${mode === "custom" ? "bg-emerald-500 text-slate-900" : "bg-slate-800"}`}
            onClick={() => setMode("custom")}
            type="button"
          >
            Custom per Player
          </button>
        </div>

        {mode === "shared" ? (
          <div className="space-y-3 mt-2 text-xs">
            {[0, 1, 2, 3].map((i) => {
              const b = sharedBoulders[i];
              const ready = isBoulderConfigured(b);
              return (
                <div key={i} className="border border-slate-700 rounded-lg p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      className="flex-1 bg-slate-800 rounded-lg p-2 text-sm"
                      value={b.name}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSharedBoulders((p) => {
                          const c = [...p];
                          c[i] = { ...c[i], name: v };
                          return c;
                        });
                      }}
                      placeholder={`Boulder ${i + 1} name (optional)`}
                    />
                    <span
                      className={
                        "text-[10px] px-2 py-1 rounded-md " +
                        (ready ? "bg-emerald-500 text-slate-900" : "bg-slate-800 text-slate-300")
                      }
                    >
                      {ready ? "Ready" : "Not ready"}
                    </span>
                  </div>

                  <input type="file" accept="image/*" onChange={(e) => setSharedImage(i, e)} />

                  {b.imageUrl ? (
                    <>
                      <BoulderImage imageUrl={b.imageUrl} holds={b.holds} onClick={(e) => setSharedHold(i, e)} clickable />
                      <div className="flex justify-between items-center text-[10px]">
                        <span>Holds set: {Object.values(b.holds).filter(Boolean).length} / 6</span>
                        <button className="text-slate-300 underline" onClick={() => resetSharedHolds(i)} type="button">
                          Reset holds
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3 mt-2 text-xs max-h-72 overflow-y-auto pr-1">
            {playerNames.map((nm, pIdx) => {
              const row =
                customBoulders[pIdx] || [0, 1, 2, 3].map((i) => createEmptyLiveBoulder(`Boulder ${i + 1}`));

              return (
                <div key={pIdx} className="border border-slate-700 rounded-lg p-2 space-y-2">
                  <div className="text-sm font-semibold">{nm.trim() || `Player ${pIdx + 1}`}</div>

                  {[0, 1, 2, 3].map((bIdx) => {
                    const b = row[bIdx];
                    const ready = isBoulderConfigured(b);
                    return (
                      <div key={bIdx} className="border border-slate-800 rounded-md p-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <input
                            className="flex-1 bg-slate-800 rounded-lg p-2 text-sm"
                            value={b.name}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCustomBoulders((prev) => {
                                const next = [...prev];
                                const rr =
                                  next[pIdx] || [0, 1, 2, 3].map((i) => createEmptyLiveBoulder(`Boulder ${i + 1}`));
                                const newRow = [...rr];
                                newRow[bIdx] = { ...newRow[bIdx], name: v };
                                next[pIdx] = newRow;
                                return next;
                              });
                            }}
                            placeholder={`Boulder ${bIdx + 1} name (optional)`}
                          />
                          <span
                            className={
                              "text-[10px] px-2 py-1 rounded-md " +
                              (ready ? "bg-emerald-500 text-slate-900" : "bg-slate-800 text-slate-300")
                            }
                          >
                            {ready ? "Ready" : "Not ready"}
                          </span>
                        </div>

                        <input type="file" accept="image/*" onChange={(e) => setCustomImage(pIdx, bIdx, e)} />

                        {b.imageUrl ? (
                          <>
                            <BoulderImage
                              imageUrl={b.imageUrl}
                              holds={b.holds}
                              onClick={(e) => setCustomHold(pIdx, bIdx, e)}
                              clickable
                            />
                            <div className="flex justify-between items-center text-[10px]">
                              <span>Holds set: {Object.values(b.holds).filter(Boolean).length} / 6</span>
                              <button
                                className="text-slate-300 underline"
                                onClick={() => resetCustomHolds(pIdx, bIdx)}
                                type="button"
                              >
                                Reset holds
                              </button>
                            </div>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        disabled={!canStart}
        onClick={start}
        className="w-full bg-emerald-500 text-slate-900 rounded-lg py-2 font-semibold disabled:opacity-40"
        type="button"
      >
        Start Live Comp
      </button>
    </div>
  );
}

function LiveCompRunner({ config, onHome }) {
  const players = config.players || [];

  const [playerIdx, setPlayerIdx] = useState(0);
  const [boulderIdx, setBoulderIdx] = useState(0);
  const [phase, setPhase] = useState(PHASES.PRECLIMB);
  const [timeLeft, setTimeLeft] = useState(10);

  const [scores, setScores] = useState(() => players.map(() => [0, 0, 0, 0]));
  const [attempts, setAttempts] = useState(() => players.map(() => [0, 0, 0, 0]));

  const [finished, setFinished] = useState(false);
  const [results, setResults] = useState([]);
  const [showConfirmHome, setShowConfirmHome] = useState(false);

  const player = players[playerIdx];
  const boulder = player && player.boulders ? player.boulders[boulderIdx] : null;

  const tickEnabled = !finished && phase !== PHASES.SCORE && phase !== PHASES.DONE;

  useEffect(() => {
    if (!tickEnabled) return;
    if (timeLeft <= 0) {
      advance();
      return;
    }
    const t = setInterval(() => setTimeLeft((v) => v - 1), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickEnabled, timeLeft, phase, playerIdx, boulderIdx]);

  useEffect(() => {
    if (finished) return;
    if (phase === PHASES.PRECLIMB) {
      if (timeLeft <= 5 && timeLeft > 0) speak(String(timeLeft));
      if (timeLeft === 0 && player) speak(`${player.name}, you may begin climbing.`);
    }
    if (phase === PHASES.CLIMB) {
      if (timeLeft === 60) speak("One minute warning.");
      if (timeLeft <= 10 && timeLeft > 0) speak(String(timeLeft));
      if (timeLeft === 0) speak("Time. Stop climbing.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft, finished, playerIdx]);

  const startPhase = (nextPhase) => {
    setPhase(nextPhase);
    if (nextPhase === PHASES.PRECLIMB) setTimeLeft(10);
    if (nextPhase === PHASES.CLIMB) setTimeLeft(4 * 60);
    if (nextPhase === PHASES.SCORE) setTimeLeft(0);
    if (nextPhase === PHASES.DONE) setTimeLeft(0);
  };

  const advance = () => {
    if (finished) return;

    if (phase === PHASES.PRECLIMB) {
      startPhase(PHASES.CLIMB);
      return;
    }

    if (phase === PHASES.CLIMB) {
      startPhase(PHASES.SCORE);
      return;
    }

    if (phase === PHASES.SCORE) {
      const lastPlayer = playerIdx === players.length - 1;
      const lastBoulder = boulderIdx === 3;

      if (!lastPlayer) {
        setPlayerIdx((i) => i + 1);
        startPhase(PHASES.PRECLIMB);
        return;
      }

      if (!lastBoulder) {
        setPlayerIdx(0);
        setBoulderIdx((i) => i + 1);
        startPhase(PHASES.PRECLIMB);
        return;
      }

      finish();
    }
  };

  const finish = () => {
    const totals = players.map((p, pIdx) => {
      const t = computeTotal(scores[pIdx] || [0, 0, 0, 0], attempts[pIdx] || [0, 0, 0, 0]);
      return { name: p.name, total: t };
    });

    totals.sort((a, b) => b.total - a.total);
    setResults(totals);
    setFinished(true);
    setPhase(PHASES.DONE);
  };

  const setScoreForCurrent = (v) => {
    setScores((prev) => {
      const next = prev.map((row) => [...row]);
      next[playerIdx][boulderIdx] = v;
      return next;
    });
  };

  const setAttemptsForCurrent = (n) => {
    setAttempts((prev) => {
      const next = prev.map((row) => [...row]);
      next[playerIdx][boulderIdx] = clampInt(n, 0, MAX_ATTEMPTS);
      return next;
    });
  };

  const handleHomeClick = () => {
    if (phase === PHASES.CLIMB) {
      setShowConfirmHome(true);
      return;
    }
    if (onHome) onHome();
  };

  if (!players.length) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Live Comp</h2>
          <button onClick={onHome} className="text-xs text-slate-300 underline" type="button">
            Home
          </button>
        </div>
        <div className="bg-slate-800 rounded-lg p-3 text-xs text-slate-300">No players in this live comp.</div>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Live Results</h2>
          <button onClick={onHome} className="text-xs text-slate-300 underline" type="button">
            Home
          </button>
        </div>

        <div className="bg-slate-800 rounded-lg p-3">
          <ol className="space-y-2 text-sm">
            {results.map((r, i) => (
              <li key={r.name} className="flex justify-between">
                <span>
                  {(i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : "")}
                  {i + 1}. {r.name}
                </span>
                <span>{r.total}</span>
              </li>
            ))}
          </ol>
        </div>

        <button className="w-full bg-emerald-500 text-slate-900 rounded-lg py-2 font-semibold" onClick={onHome} type="button">
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showConfirmHome ? (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-800 rounded-2xl p-4 space-y-3">
            <div className="text-sm font-semibold">Are you sure?</div>
            <div className="text-xs text-slate-300">This will end the live comp run.</div>
            <div className="flex gap-2">
              <button
                className="flex-1 py-2 rounded-lg bg-slate-900 text-slate-200 text-xs font-semibold"
                onClick={() => setShowConfirmHome(false)}
                type="button"
              >
                Stay
              </button>
              <button
                className="flex-1 py-2 rounded-lg bg-emerald-500 text-slate-900 text-xs font-semibold"
                onClick={() => {
                  setShowConfirmHome(false);
                  if (onHome) onHome();
                }}
                type="button"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="bg-slate-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <button onClick={handleHomeClick} className="text-xs text-slate-300 underline" type="button">
            Home
          </button>
          <span className="text-xs text-slate-400">Live • {config.mode === "custom" ? "Custom" : "Shared"}</span>
        </div>

        <div className="flex justify-between text-xs">
          <span>
            Boulder {boulderIdx + 1} / 4 • Climber {playerIdx + 1} / {players.length}
          </span>
          <span className="text-slate-300">{player.name}</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs">Phase: {phaseLabel(phase)}</span>
          <span className="text-xl font-bold tabular-nums">
            {phase === PHASES.SCORE || phase === PHASES.DONE ? "--:--" : formatTime(timeLeft)}
          </span>
        </div>

        <div className="text-xs text-slate-300">Problem: {boulder ? boulder.name : `Boulder ${boulderIdx + 1}`}</div>

        {boulder && boulder.imageUrl ? (
          <BoulderImage imageUrl={boulder.imageUrl} holds={boulder.holds} clickable={false} />
        ) : (
          <div className="text-xs text-slate-400">No image for this boulder.</div>
        )}

        {phase === PHASES.PRECLIMB ? (
          <button
            className="w-full py-2 rounded-lg bg-indigo-500 text-slate-900 text-xs font-semibold"
            onClick={() => startPhase(PHASES.CLIMB)}
            type="button"
          >
            Skip Pre-Climb
          </button>
        ) : null}

        {phase === PHASES.CLIMB ? (
          <button
            className="w-full py-2 rounded-lg bg-emerald-500 text-slate-900 text-xs font-semibold"
            onClick={() => startPhase(PHASES.SCORE)}
            type="button"
          >
            Finished Early - Go to Scoring
          </button>
        ) : null}

        {phase === PHASES.SCORE ? (
          <div className="space-y-3">
            <div>
              <div className="text-xs">Highest hold reached:</div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {SCORE_CHOICES.map((v) => (
                  <button
                    key={v}
                    className={
                      "py-2 rounded-lg text-sm font-semibold " +
                      (scores[playerIdx][boulderIdx] === v ? "bg-emerald-500 text-slate-900" : "bg-slate-700")
                    }
                    onClick={() => setScoreForCurrent(v)}
                    type="button"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs">Attempts (0-{MAX_ATTEMPTS}):</div>
              <div className="grid grid-cols-6 gap-2 mt-2">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={
                      "py-2 rounded-lg text-xs font-semibold " +
                      (attempts[playerIdx][boulderIdx] === n ? "bg-emerald-500 text-slate-900" : "bg-slate-700")
                    }
                    onClick={() => setAttemptsForCurrent(n)}
                    type="button"
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2 mt-2">
                {[6, 7, 8, 9, 10].map((n) => (
                  <button
                    key={n}
                    className={
                      "py-2 rounded-lg text-xs font-semibold " +
                      (attempts[playerIdx][boulderIdx] === n ? "bg-emerald-500 text-slate-900" : "bg-slate-700")
                    }
                    onClick={() => setAttemptsForCurrent(n)}
                    type="button"
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Effective: {computeBoulderEffective(scores[playerIdx][boulderIdx], attempts[playerIdx][boulderIdx])}
              </div>
            </div>

            <button
              className="w-full py-2 rounded-lg bg-emerald-500 text-slate-900 text-xs font-semibold"
              onClick={() => advance()}
              type="button"
            >
              Done Scoring
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
