"use client";
import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw, SkipForward, FlaskConical } from "lucide-react";
import { SCENARIOS, STAGES, simEtaSeconds, simRouteProgress, useSim, type Scenario } from "@/lib/sim";
import { useView } from "@/lib/data/hooks";
import { Button, Select, Status } from "./ui";

/** Runs the simulation clock for the whole app. Mounted once in the shell. */
export function SimDriver() {
  const tick = useSim((s) => s.tick);
  useEffect(() => {
    const id = setInterval(() => tick(100), 100);
    return () => clearInterval(id);
  }, [tick]);
  return null;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function SimPanel({ onClose }: { onClose: () => void }) {
  const sim = useSim();
  const view = useView();
  const [scenario, setScenario] = useState<Scenario>("normal");
  const stageIdx = STAGES.findIndex((s) => s.id === sim.stage);
  return (
    <div role="dialog" aria-label="Simulation controls" className="absolute right-0 top-11 z-40 flex w-[22rem] max-w-[92vw] flex-col gap-3 rounded-[10px] border border-mocha-600 bg-latte p-3 shadow-[0_8px_24px_rgba(74,15,31,0.18)]">
      <div className="flex items-center justify-between gap-2">
        <h2>Simulation</h2><Status tone="warn">SIMULATION, not real data</Status>
      </div>
      <p className="text-[13px] text-mocha-700">Runs in this browser only. It never moves a real rider or changes a real delivery.</p>
      {!sim.active ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="scn" className="text-[13px] font-semibold">Scenario</label>
          <Select id="scn" value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
            {Object.entries(SCENARIOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Button variant="primary" disabled={!view || sim.starting} onClick={() => view && void sim.start(view, scenario)}>
            <Play size={16} aria-hidden />{sim.starting ? "Loading route" : "Start simulation"}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {sim.running ? <Button size="sm" onClick={sim.pause}><Pause size={14} aria-hidden />Pause</Button> : <Button size="sm" variant="primary" onClick={sim.resume}><Play size={14} aria-hidden />Resume</Button>}
            <Button size="sm" onClick={sim.step} disabled={stageIdx >= STAGES.length - 1}><SkipForward size={14} aria-hidden />Next step</Button>
            <Button size="sm" variant="danger" onClick={sim.reset}><RotateCcw size={14} aria-hidden />Reset</Button>
            <label className="ml-auto flex items-center gap-1 text-[13px]">Speed
              <Select className="h-8 w-20 text-[13px]" value={sim.speed} onChange={(e) => sim.setSpeed(Number(e.target.value))} aria-label="Simulation speed">
                {[0.5, 1, 2, 4].map((n) => <option key={n} value={n}>{n}x</option>)}
              </Select>
            </label>
          </div>
          <ol className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
            {STAGES.map((s, i) => (
              <li key={s.id} className={i === stageIdx ? "font-semibold" : i < stageIdx ? "text-mocha-700" : "text-mocha-700 opacity-70"} aria-current={i === stageIdx ? "step" : undefined}>
                {i < stageIdx ? "Done: " : i === stageIdx ? "Now: " : "Next: "}{s.label}
              </li>
            ))}
          </ol>
          <p className="text-[13px]">Route {simRouteProgress(sim)}%. ETA {mmss(simEtaSeconds(sim))} simulated. {sim.routeSource === "osrm" ? "Road route from OSRM." : "Straight-line route (routing service unavailable)."}</p>
        </>
      )}
    </div>
  );
}

export function SimToggle() {
  const [open, setOpen] = useState(false);
  const active = useSim((s) => s.active);
  return (
    <div className="relative">
      <Button size="sm" variant={active ? "primary" : "secondary"} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <FlaskConical size={15} aria-hidden />Simulation{active ? " on" : ""}
      </Button>
      {open && <SimPanel onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Compact card showing the shared simulated scenario from one module's point of view. */
export function SimStatusCard({ perspective }: { perspective: "donor" | "rider" | "shelter" | "operations" }) {
  const sim = useSim();
  if (!sim.active) return null;
  const stage = STAGES.find((s) => s.id === sim.stage)!;
  const idx = STAGES.findIndex((s) => s.id === sim.stage);
  const text =
    perspective === "donor" ? `Batch SIM-001 from ${sim.donor?.name}: ${idx < 2 ? "waiting for allocation" : idx < 4 ? "allocated, awaiting pickup" : idx < 6 ? "picked up and on its way" : "delivered"}.`
    : perspective === "shelter" ? `${sim.shelter?.name}: incoming 60 meals with ${sim.rider}. ${idx < 6 ? "On the way" : idx === 6 ? "Arrived, awaiting receipt" : "Receipt recorded"}.`
    : perspective === "rider" ? `${sim.rider} is ${stage.label.toLowerCase()}.`
    : `${sim.rider} carrying SIM-001 to ${sim.shelter?.name}. ${stage.label}.`;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border border-dashed border-cherry bg-latte px-3 py-2 text-[13px]">
      <Status tone="warn">SIMULATION</Status>
      <span className="font-semibold">{stage.label}</span>
      <span>{text}</span>
      <span className="text-mocha-700">Route {simRouteProgress(sim)}%, ETA {mmss(simEtaSeconds(sim))}</span>
      <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-[3px] bg-mocha-200" aria-hidden><div className="h-full bg-cherry transition-[width] duration-200" style={{ width: `${simRouteProgress(sim)}%` }} /></div>
    </div>
  );
}
