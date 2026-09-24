import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <section id="view-estimates" aria-label="Estimate list">
      <div className="card">
        <div className="microlabel">
          ESTIMATE LIST <span className="mlsub">— synced from your tracker</span>
        </div>
        <div className="estbar">
          <span className="statusline">{msg}</span>
          <button className="btn ghost sbtn" onClick={listEstimates}>
            <RefreshCw size={14} strokeWidth={2} /> REFRESH
          </button>
        </div>
        <div className="esttable">
          <table>
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Name</th>
                <th style={{ width: "30%" }}>Status</th>
                <th style={{ width: "30%" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center" }}>
                    No estimates found.
                  </td>
                </tr>
              )}
              {visible.map(({ row, i }) => (
                <tr key={i} id={`row-${i}`}>
                  <td>
                    {editing === i ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        aria-label="Estimate name"
                      />
                    ) : (
                      row[0] || ""
                    )}
                  </td>
                  <td>
                    {editing === i ? (
                      <Input
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                        aria-label="Estimate status"
                      />
                    ) : (
                      <span className="status-badge">{row[1] || "Pending"}</span>
                    )}
                  </td>
                  <td>
                    {editing === i ? (
                      <>
                        <button
                          className="action-btn"
                          style={{ marginRight: 5 }}
                          onClick={() => saveEstimate(i)}
                        >
                          Save
                        </button>
                        <button className="action-btn" onClick={() => { setEditing(null); listEstimates(); }}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="action-btn"
                          style={{ marginRight: 5 }}
                          onClick={() => startEdit(i)}
                          title="Edit estimate"
                        >
                          <Pencil size={13} strokeWidth={2} /> Edit
                        </button>
                        <button
                          className="delete-btn"
                          onClick={() => deleteEstimate(i)}
                          title="Delete estimate"
                        >
                          <Trash2 size={13} strokeWidth={2} /> Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="estadd">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Client name..."
            aria-label="New estimate name"
          />
          <Input
            value={statusInput}
            onChange={(e) => setStatusInput(e.target.value)}
            placeholder="Status (optional)"
            aria-label="New estimate status"
          />
          <Button variant="default" onClick={addEstimate} className={cn("est-add-btn")}>
            <Plus size={15} strokeWidth={2} /> ADD
          </Button>
        </div>
      </div>
    </section>
  );
}
