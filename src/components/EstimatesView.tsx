import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/primitives";
import { APPS_SCRIPT_URL, FILE_ID } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Estimates view — Google Apps Script backend (NOT Supabase), same
 * endpoints/row conventions as the v5 app.
 */
export function EstimatesView() {
  const [rows, setRows] = useState<string[][]>([]);
  const [msg, setMsg] = useState("EXCEL INTEGRATION READY.");
  const [name, setName] = useState("");
  const [statusInput, setStatusInput] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState("");

  const listEstimates = useCallback(async () => {
    setMsg("LOADING FROM TRACKER…");
    try {
      const response = await fetch(
        `${APPS_SCRIPT_URL}?action=list&fileId=${FILE_ID}`,
      );
      const json = await response.json();
      if (json.status === "error") throw new Error(json.error);
      setMsg("DATA LOADED.");
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      setMsg("ERROR: " + (err instanceof Error ? err.message : String(err)));
    }
  }, []);

  useEffect(() => {
    listEstimates();
  }, [listEstimates]);

  const addEstimate = async () => {
    if (!name.trim()) return;
    setMsg("ADDING…");
    try {
      const response = await fetch(`${APPS_SCRIPT_URL}?action=add&fileId=${FILE_ID}`, {
        method: "POST",
        body: JSON.stringify({ name, status: statusInput }),
      });
      const json = await response.json();
      if (json.status === "error") throw new Error(json.error);
      setName("");
      listEstimates();
    } catch (err) {
      setMsg("ERROR ADDING: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const saveEstimate = async (index: number) => {
    setMsg("SAVING…");
    try {
      const response = await fetch(
        `${APPS_SCRIPT_URL}?action=update&fileId=${FILE_ID}`,
        {
          method: "POST",
          body: JSON.stringify({
            action: "update",
            name: editName,
            status: editStatus,
            rowIndex: index,
          }),
        },
      );
      const json = await response.json();
      if (json.status !== "success") throw new Error(json.error || "Update failed");
      setMsg("SAVED.");
      setEditing(null);
      listEstimates();
    } catch (err) {
      setMsg("ERROR SAVING: " + (err instanceof Error ? err.message : String(err)));
      setEditing(null);
      listEstimates();
    }
  };

  const deleteEstimate = async (index: number) => {
    if (!window.confirm("Delete this estimate?")) return;
    setMsg("DELETING…");
    try {
      const response = await fetch(
        `${APPS_SCRIPT_URL}?action=delete&fileId=${FILE_ID}`,
        {
          method: "POST",
          body: JSON.stringify({ rowIndex: index }),
        },
      );
      const json = await response.json();
      if (json.status === "error") throw new Error(json.error);
      listEstimates();
    } catch (err) {
      window.alert("Error deleting: " + (err instanceof Error ? err.message : String(err)));
      setMsg("ERROR DELETING: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const startEdit = (i: number) => {
    setEditing(i);
    setEditName(rows[i]?.[0] ?? "");
    setEditStatus(rows[i]?.[1] ?? "Pending");
  };

  /* First data row is skipped when col 0 contains "name" (header row). */
  const startIndex =
    rows.length > 0 && String(rows[0][0]).toLowerCase().includes("name") ? 1 : 0;
  const visible = rows.slice(startIndex).map((r, k) => ({ row: r, i: startIndex + k }));

  return (
    <section
      id="view-estimates"
      aria-label="Estimate list"
      className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <Eyebrow>Estimates</Eyebrow>
          <p className="mt-1.5 text-[13px] text-muted">
            Synced from your tracker
          </p>
        </div>
        <button
          type="button"
          onClick={listEstimates}
          title="Refresh"
          aria-label="Refresh estimates"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface hover:text-ink"
        >
          <RefreshCw size={15} strokeWidth={1.75} />
        </button>
      </div>

      <p role="status" className="mt-2 font-num text-[12px] text-muted">
        {msg}
      </p>

      <div className="mt-4 overflow-hidden rounded-2xl bg-surface shadow-card">
        <table className="w-full text-left text-[14px]">
          <thead>
            <tr className="border-b border-hairline">
              <th
                className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
                style={{ width: "40%" }}
              >
                Name
              </th>
              <th
                className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
                style={{ width: "30%" }}
              >
                Status
              </th>
              <th
                className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
                style={{ width: "30%" }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-10 text-center text-[13px] text-muted"
                >
                  No estimates found.
                </td>
              </tr>
            )}
            {visible.map(({ row, i }) => (
              <tr
                key={i}
                id={`row-${i}`}
                className="border-b border-hairline transition-colors duration-150 last:border-0 hover:bg-fill"
              >
                <td className="px-4 py-3 text-ink">
                  {editing === i ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      aria-label="Estimate name"
                      className="h-10 bg-fill text-[14px]"
                    />
                  ) : (
                    row[0] || ""
                  )}
                </td>
                <td className="px-4 py-3">
                  {editing === i ? (
                    <Input
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value)}
                      aria-label="Estimate status"
                      className="h-10 bg-fill text-[14px]"
                    />
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-fill px-2.5 py-1 font-num text-[12px] text-ink">
                      {row[1] || "Pending"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {editing === i ? (
                      <>
                        <button
                          type="button"
                          onClick={() => saveEstimate(i)}
                          title="Save"
                          aria-label="Save estimate"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-ok transition-colors duration-150 hover:bg-fill"
                        >
                          <Check size={15} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(null);
                            listEstimates();
                          }}
                          title="Cancel"
                          aria-label="Cancel editing"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-fill hover:text-ink"
                        >
                          <X size={15} strokeWidth={2} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(i)}
                          title="Edit estimate"
                          aria-label="Edit estimate"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-fill hover:text-ink"
                        >
                          <Pencil size={14} strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEstimate(i)}
                          title="Delete estimate"
                          aria-label="Delete estimate"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-fill hover:text-bad"
                        >
                          <Trash2 size={14} strokeWidth={1.75} />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Client name..."
          aria-label="New estimate name"
          className="bg-surface text-[14px] shadow-sm"
        />
        <Input
          value={statusInput}
          onChange={(e) => setStatusInput(e.target.value)}
          placeholder="Status (optional)"
          aria-label="New estimate status"
          className="bg-surface text-[14px] shadow-sm"
        />
        <button
          type="button"
          onClick={addEstimate}
          className={cn(
            "flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-6",
            "text-[13px] font-semibold uppercase tracking-[0.06em] text-white shadow-accent",
            "transition-all duration-150 hover:brightness-110 active:scale-[0.99]",
          )}
        >
          <Plus size={15} strokeWidth={2} /> Add
        </button>
      </div>
    </section>
  );
}
