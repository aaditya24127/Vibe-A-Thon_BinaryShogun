"use client";
import { useState } from "react";
import { format } from "date-fns";
import { Empty, Field, Input, Section, Select, Table } from "@/components/ui";
import { PageHead, Screen } from "@/components/shared";

export default function TimelinePage() {
  const [entity, setEntity] = useState("all");
  const [kind, setKind] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <Screen>
      {(view) => {
        const entities = [...new Set(view.events.map((e) => e.entity_type))].sort();
        const kinds = [...new Set(view.events.map((e) => e.event_type).filter(Boolean))].sort() as string[];
        const rows = filtered(view.events, entity, kind, from, to);
        return (
          <>
            <PageHead title="Event timeline"><p className="text-[13px] text-mocha-700">Every state change recorded by the database, newest first.</p></PageHead>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label="Entity type" htmlFor="f-entity"><Select id="f-entity" value={entity} onChange={(e) => setEntity(e.target.value)}><option value="all">All</option>{entities.map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Event type" htmlFor="f-kind"><Select id="f-kind" value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">All</option>{kinds.map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="From" htmlFor="f-from"><Input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="To" htmlFor="f-to"><Input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
            <Section title="Events" aside={`${rows.length} shown`}>
              {!rows.length ? <Empty>No events match these filters.</Empty> : (
                <Table head={["Time", "Entity", "Change", "Reason"]}>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap">{format(new Date(e.created_at), "dd MMM HH:mm:ss")}</td>
                      <td><span className="font-semibold">{e.entity_id}</span><div className="text-mocha-700">{e.entity_type}{e.event_type ? `, ${e.event_type}` : ""}</div></td>
                      <td>{e.previous_state ?? "none"} to {e.new_state ?? "none"}</td>
                      <td>{e.reason}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
          </>
        );
      }}
    </Screen>
  );
}

function filtered<T extends { entity_type: string; event_type: string | null; created_at: string }>(events: T[], entity: string, kind: string, from: string, to: string) {
  return events.filter((e) =>
    (entity === "all" || e.entity_type === entity) && (kind === "all" || e.event_type === kind) &&
    (!from || e.created_at >= new Date(from).toISOString()) && (!to || e.created_at <= new Date(`${to}T23:59:59`).toISOString()),
  );
}
