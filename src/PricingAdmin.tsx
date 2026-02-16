import React, { useEffect, useMemo, useRef, useState } from "react";
import "./PricingAdmin.css";
import { supabase } from "./supabaseClient";

type PricingCategory = {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string | null;
};

type PricingItem = {
  id: string;
  name: string;
  cost: number | null;
  unit: string | null;
  active: boolean;
  sort_order: number | null;
  category: string | null;
  category_id: number | string | null;
  proposal_description: string | null;
  deleted_at: string | null;
};

const PricingAdmin: React.FC<{ readOnly?: boolean }> = ({
  readOnly = false,
}) => {
  console.log("PricingAdmin readOnly =", readOnly);
  const [categories, setCategories] = useState<PricingCategory[]>([]);
  const [items, setItems] = useState<PricingItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [savingCats, setSavingCats] = useState(false);
  const [savingItems, setSavingItems] = useState(false);

  const [itemSearch, setItemSearch] = useState("");
  const [showTrash, setShowTrash] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSavingChanges, setIsSavingChanges] = useState(false);

  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  // ✅ Read-only helper (ONLY DECLARED ONCE)
  const denyIfReadOnly = () => {
    setError("Read-only access. Ask an admin to make changes.");
    setSuccess(null);
  };

  // =========================
  // Column resizing + visibility
  // =========================
  type ColKey =
    | "name"
    | "unit"
    | "cost"
    | "sort"
    | "desc"
    | "active"
    | "actions";

  const COLS: { key: ColKey; label: string; min: number }[] = [
    { key: "name", label: "Name", min: 180 },
    { key: "unit", label: "Unit", min: 40 },
    { key: "cost", label: "Cost", min: 60 },
    { key: "sort", label: "Sort", min: 70 },
    { key: "desc", label: "Proposal Description", min: 260 },
    { key: "active", label: "Active", min: 70 },
    { key: "actions", label: "Actions", min: 70 },
  ];

  const [colW, setColW] = useState<Record<ColKey, number>>({
    name: 280,
    unit: 90,
    cost: 110,
    sort: 90,
    desc: 520,
    active: 90,
    actions: 90,
  });

  const [colVis, setColVis] = useState<Record<ColKey, boolean>>({
    name: true,
    unit: true,
    cost: true,
    sort: true,
    desc: true,
    active: true,
    actions: true,
  });

  const [colsOpen, setColsOpen] = useState(false);
  const colsBtnRef = useRef<HTMLButtonElement | null>(null);
  const colsPopRef = useRef<HTMLDivElement | null>(null);

  const resizeRef = useRef<{
    key: ColKey;
    startX: number;
    startW: number;
  } | null>(null);

  const onResizeDown = (e: React.MouseEvent, key: ColKey) => {
    e.preventDefault();
    e.stopPropagation();

    resizeRef.current = {
      key,
      startX: e.clientX,
      startW: colW[key] ?? 120,
    };

    const minW =
      COLS.find((c) => c.key === key)?.min != null
        ? COLS.find((c) => c.key === key)!.min
        : 60;

    const onMove = (ev: MouseEvent) => {
      const ref = resizeRef.current;
      if (!ref) return;

      const dx = ev.clientX - ref.startX;
      const next = Math.max(minW, ref.startW + dx);

      setColW((prev) => {
        if (!ref.key) return prev;
        return { ...prev, [ref.key]: next };
      });
    };

    const onUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const visibleColCount = useMemo(() => {
    return (Object.keys(colVis) as ColKey[]).filter((k) => colVis[k]).length;
  }, [colVis]);

  const hiddenCols = useMemo(() => {
    return (Object.keys(colVis) as ColKey[]).filter((k) => !colVis[k]);
  }, [colVis]);

  const toggleCol = (key: ColKey) => {
    setColVis((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const stillVisible = (Object.keys(next) as ColKey[]).some((k) => next[k]);
      if (!stillVisible) return prev;
      return next;
    });
  };

  // close Columns popover on outside click
  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!colsOpen) return;

      const t = e.target as Node;
      const btn = colsBtnRef.current;
      const pop = colsPopRef.current;

      if (btn && btn.contains(t)) return;
      if (pop && pop.contains(t)) return;

      setColsOpen(false);
    };

    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [colsOpen]);

  // =========================
  // Data loading
  // =========================
  const loadAll = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    const [catRes, itemRes] = await Promise.all([
      supabase
        .from("pricing_categories")
        .select("id, name, sort_order, is_active, created_at")
        .order("name", { ascending: true }),
      supabase
        .from("pricing_items2")
        .select(
          "id, name, cost, unit, active, sort_order, category, category_id, proposal_description, deleted_at"
        )
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (catRes.error) {
      setError(catRes.error.message);
      setLoading(false);
      return;
    }
    if (itemRes.error) {
      setError(itemRes.error.message);
      setLoading(false);
      return;
    }

    const cleanedCats: PricingCategory[] =
      catRes.data?.map((c: any) => ({ ...c, is_active: !!c.is_active })) ?? [];

    const cleanedItems: PricingItem[] =
      itemRes.data?.map((r: any) => ({
        ...r,
        active: !!r.active,
        deleted_at: r.deleted_at ?? null,
        category_id: r.category_id == null ? null : Number(r.category_id),
      })) ?? [];

    setCategories(cleanedCats);
    setItems(cleanedItems);

    const activeCatsLocal = cleanedCats.filter((c) => c.is_active);
    const firstActiveId = activeCatsLocal.length
      ? Number(activeCatsLocal[0].id)
      : null;

    setSelectedCategoryId((prev) => {
      if (
        prev != null &&
        cleanedCats.some((c) => c.id === prev && c.is_active)
      ) {
        return prev;
      }
      return firstActiveId;
    });

    setLoading(false);
  };

  useEffect(() => {
    document.body.classList.add("pa-wide");
    loadAll();

    return () => {
      document.body.classList.remove("pa-wide");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!isDirty) return;

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const activeCats = useMemo(
    () => categories.filter((c) => c.is_active),
    [categories]
  );

  const itemsForCategory = useMemo(() => {
    if (!selectedCategoryId) return [];
    return items.filter(
      (it) => Number(it.category_id) === Number(selectedCategoryId)
    );
  }, [items, selectedCategoryId]);

  const trashCount = useMemo(
    () => itemsForCategory.filter((it) => it.deleted_at != null).length,
    [itemsForCategory]
  );

  const visibleItems = useMemo(() => {
    const base = showTrash
      ? itemsForCategory.filter((it) => it.deleted_at != null)
      : itemsForCategory.filter((it) => it.deleted_at == null);

    const q = itemSearch.trim().toLowerCase();
    if (!q) return base;
    return base.filter((it) => (it.name || "").toLowerCase().includes(q));
  }, [itemsForCategory, showTrash, itemSearch]);

  // ✅ Scroll sync (your existing logic)
  useEffect(() => {
    const top = topScrollRef.current;
    const table = tableScrollRef.current;
    if (!top || !table) return;

    const syncTopToTable = () => {
      if (table.scrollLeft !== top.scrollLeft) table.scrollLeft = top.scrollLeft;
    };

    const syncTableToTop = () => {
      if (top.scrollLeft !== table.scrollLeft) top.scrollLeft = table.scrollLeft;
    };

    const updateWidth = () => {
      const inner = top.querySelector<HTMLDivElement>(".paTopScrollInner");
      if (!inner) return;
      inner.style.width = `${table.scrollWidth}px`;
    };

    requestAnimationFrame(updateWidth);

    top.addEventListener("scroll", syncTopToTable, { passive: true });
    table.addEventListener("scroll", syncTableToTop, { passive: true });

    const ro = new ResizeObserver(updateWidth);
    ro.observe(table);

    return () => {
      top.removeEventListener("scroll", syncTopToTable);
      table.removeEventListener("scroll", syncTableToTop);
      ro.disconnect();
    };
  }, [
    visibleItems.length,
    loading,
    selectedCategoryId,
    showTrash,
    itemSearch,
    colVis,
    colW,
  ]);
const updateItem = (id: string, field: keyof PricingItem, value: any) => {
  if (readOnly) {
    denyIfReadOnly();
    return;
  }

  setItems((prev) =>
    prev.map((it) => (it.id === id ? { ...it, [field]: value } : it))
  );

  setIsDirty(true);
};

  

  const handleAddItem = () => {
    if (readOnly) {
      denyIfReadOnly();
      return;
    }

    if (!selectedCategoryId) {
      setError("Select a category first.");
      return;
    }

    const cat = categories.find((c) => c.id === selectedCategoryId);

    const tempId = (() => {
      const c: any = typeof crypto !== "undefined" ? crypto : null;
      return typeof c?.randomUUID === "function"
        ? c.randomUUID()
        : `tmp-${Date.now()}-${Math.random()}`;
    })();

    const maxSort =
      items
        .filter((it) => Number(it.category_id) === Number(selectedCategoryId))
        .reduce((m, it) => Math.max(m, it.sort_order ?? 0), 0) || 0;

    const newItem: PricingItem = {
      id: tempId,
      name: "New Item",
      unit: "ea",
      cost: 0,
      active: true,
      sort_order: maxSort + 1,
      category: cat?.name ?? null,
      category_id: selectedCategoryId,
      proposal_description: "",
      deleted_at: null,
    };

    setItems((prev) => [newItem, ...prev]);
        setIsDirty(true);

    setShowTrash(false);
    setItemSearch("");
    setSuccess(null);
  };

  const handleSaveCategories = async () => {
    if (readOnly) {
      denyIfReadOnly();
      return;
    }

    try {
      setSavingCats(true);
      setError(null);
      setSuccess(null);

      const payload = categories
        .map((c) => ({
          id: c.id,
          name: (c.name || "").trim(),
          sort_order: c.sort_order ?? 0,
          is_active: !!c.is_active,
        }))
        .filter((c) => c.name.length > 0);

      const { error: upsertErr } = await supabase
        .from("pricing_categories")
        .upsert(payload, { onConflict: "id" });

      if (upsertErr) throw upsertErr;

      setSuccess("Categories saved.");
      await loadAll();
    } catch (e: any) {
      setError(e?.message || "Failed to save categories");
    } finally {
      setSavingCats(false);
    }
  };

  const handleSaveItems = async () => {
    if (readOnly) {
      denyIfReadOnly();
      return;
    }

    try {
      setSavingItems(true);
      setError(null);
      setSuccess(null);

      const payload = items.map((it) => ({
        id: it.id,
        name: (it.name || "").trim(),
        cost: it.cost,
        unit: it.unit,
        active: !!it.active,
        sort_order: it.sort_order ?? 0,
        category: it.category ?? null,
        category_id: it.category_id ?? null,
        proposal_description: it.proposal_description ?? null,
        deleted_at: it.deleted_at ?? null,
      }));

      const { error: upsertErr } = await supabase
        .from("pricing_items2")
        .upsert(payload as any, { onConflict: "id" });

      if (upsertErr) throw upsertErr;

      setSuccess("Items saved.");
      await loadAll();
    } catch (e: any) {
      setError(e?.message || "Failed to save items");
    } finally {
      setSavingItems(false);
    }
  };
  const handleSaveAllChanges = async () => {
    if (readOnly) {
      denyIfReadOnly();
      return;
    }

    try {
      setIsSavingChanges(true);
      setError(null);
      setSuccess(null);
await Promise.all([handleSaveCategories(), handleSaveItems()]);


      setIsDirty(false);
      setSuccess("All changes saved.");
    } catch (e: any) {
      setError(e?.message || "Failed to save changes");
    } finally {
      setIsSavingChanges(false);
    }
  };

  const softDeleteItem = (id: string) => {
    if (readOnly) {
      denyIfReadOnly();
      return;
    }

    const ok = window.confirm("Move this item to Trash?");
    if (!ok) return;

    setItems((prev) =>
      prev.map((it) =>
        it.id === id ? { ...it, deleted_at: new Date().toISOString() } : it
      )
    );
    setIsDirty(true);

    setSuccess("Item moved to Trash. Click 'Save Items' to persist.");
  };

  return (
    <div className="paPage">
    {readOnly && (
  <div
    style={{
      margin: "8px 0 12px",
      padding: "6px 10px",
      borderRadius: 10,
      background: "rgba(245, 158, 11, 0.18)",
      border: "1px solid rgba(245, 158, 11, 0.45)",
      color: "#92400e",
      fontWeight: 700,
      fontSize: 13,
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
    }}
  >
    🔒 READ-ONLY MODE
  </div>
)}


      <div className="paHeader">
        <div>
          <div className="paSub">
  Spreadsheet view. {readOnly ? "READ ONLY ✅" : "EDIT MODE ✍️"}
</div>

        </div>

        <div className="paHeaderActions">
          <button className="paBtn" onClick={loadAll} disabled={loading}>
            Refresh
          </button>

          {/* Columns menu */}
          <div className="paColsWrap">
            <button
              ref={colsBtnRef}
              className={`paBtn ${
                hiddenCols.length > 0 ? "paBtnColsWarning" : ""
              }`}
              type="button"
              onClick={() => setColsOpen((v) => !v)}
            >
              Column Show/Hide ▾
            </button>

            {colsOpen && (
              <div ref={colsPopRef} className="paColsPop">
                <div className="paColsTitle">Column Show / Hide</div>

                <button
                  type="button"
                  className="paColsShowAll"
                  onClick={() => {
                    const allOn: any = {};
                    COLS.forEach((c) => (allOn[c.key] = true));
                    setColVis(allOn);
                  }}
                >
                  Show All Columns
                </button>

                <div className="paColsDivider" />

                {COLS.map((c) => (
                  <label key={c.key} className="paColsRow">
                    <input
                      type="checkbox"
                      checked={!!colVis[c.key]}
                      onChange={() => toggleCol(c.key)}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}

                <div className="paColsHint">Tip: drag header edges to resize.</div>
              </div>
            )}
          </div>

          <button
            className="paBtn"
            onClick={handleSaveCategories}
            disabled={savingCats || loading || readOnly}
            title={readOnly ? "Read-only" : ""}
          >
            {savingCats ? "Saving…" : "Save Categories"}
          </button>
                             {(isDirty || isSavingChanges) && (
            <button
              className="paBtn primary"
              onClick={handleSaveAllChanges}
              disabled={isSavingChanges || loading || readOnly}
              title={readOnly ? "Read-only" : ""}
            >
              {isSavingChanges ? "Saving…" : "Save Changes"}
            </button>
          )}


<button
  className="paBtn primary"
  onClick={handleAddItem}
  disabled={readOnly || !selectedCategoryId}
>
  + Add Item
</button>



        </div>
      </div>

      {(error || success) && (
        <div className="paNotices">
          {error && <div className="paNotice err">{error}</div>}
          {success && <div className="paNotice ok">{success}</div>}
        </div>
      )}

      <div className="paBar">
        <div className="paBarLeft">
          <label className="paLabel">Category</label>
          <select
            className="paSelect"
            value={selectedCategoryId ?? ""}
            onChange={(e) => {
              const v = e.target.value ? Number(e.target.value) : null;
              setSelectedCategoryId(v);
              setShowTrash(false);
              setItemSearch("");
            }}
            disabled={loading || activeCats.length === 0}
          >
            {activeCats.length === 0 ? (
              <option value="">No categories</option>
            ) : (
              activeCats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.replace(/_/g, " ")}
                </option>
              ))
            )}
          </select>

          <div className="paMeta">
            {showTrash ? "Trash" : "Active"} • {visibleItems.length} items
          </div>
        </div>

        <div className="paBarRight">
          <button
            className={`paBtn ${showTrash ? "on" : ""}`}
            onClick={() => setShowTrash((v) => !v)}
            disabled={!selectedCategoryId}
          >
            Trash ({trashCount})
          </button>

          <input
            className="paInput"
            placeholder={showTrash ? "Search trash…" : "Search items…"}
            value={itemSearch}
            onChange={(e) => setItemSearch(e.target.value)}
            disabled={!selectedCategoryId}
          />

          {!showTrash && (
            <button
              className="paBtn primary"
              onClick={handleAddItem}
              disabled={!selectedCategoryId || readOnly}
              title={readOnly ? "Read-only" : ""}
            >
              + Add Item
            </button>
          )}
        </div>
      </div>

      <div className="paTopScroll" ref={topScrollRef}>
        <div className="paTopScrollInner" />
      </div>

      <div className="paTableWrap" ref={tableScrollRef}>
        <table className="paTable">
          <thead>
            <tr>
              {colVis.name && (
                <th className="paTh" style={{ width: colW.name }}>
                  Name
                  <span
                    className="paResizer"
                    onMouseDown={(e) => onResizeDown(e, "name")}
                  />
                </th>
              )}
              {colVis.unit && (
                <th className="paTh paCenterCol" style={{ width: colW.unit }}>
                  Unit
                  <span
                    className="paResizer"
                    onMouseDown={(e) => onResizeDown(e, "unit")}
                  />
                </th>
              )}

              {colVis.cost && (
                <th className="paTh paCenterCol" style={{ width: colW.cost }}>
                  Cost
                  <span
                    className="paResizer"
                    onMouseDown={(e) => onResizeDown(e, "cost")}
                  />
                </th>
              )}

              {colVis.sort && (
                <th className="paTh" style={{ width: colW.sort }}>
                  Sort
                  <span
                    className="paResizer"
                    onMouseDown={(e) => onResizeDown(e, "sort")}
                  />
                </th>
              )}

              {colVis.desc && (
                <th className="paTh" style={{ width: colW.desc }}>
                  Proposal Description
                  <span
                    className="paResizer"
                    onMouseDown={(e) => onResizeDown(e, "desc")}
                  />
                </th>
              )}

              {colVis.active && (
                <th className="paTh" style={{ width: colW.active }}>
                  Active
                  <span
                    className="paResizer"
                    onMouseDown={(e) => onResizeDown(e, "active")}
                  />
                </th>
              )}

              {colVis.actions && (
                <th className="paTh" style={{ width: colW.actions }}>
                  <span
                    className="paResizer"
                    onMouseDown={(e) => onResizeDown(e, "actions")}
                  />
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {!loading && selectedCategoryId && visibleItems.length === 0 && (
              <tr>
                <td colSpan={visibleColCount} className="paEmpty">
                  {showTrash ? "Trash is empty." : "No items in this category."}
                </td>
              </tr>
            )}

            {!loading && !selectedCategoryId && (
              <tr>
                <td colSpan={visibleColCount} className="paEmpty">
                  Select a category.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={visibleColCount} className="paEmpty">
                  Loading…
                </td>
              </tr>
            )}

            {visibleItems.map((it) => (
              <tr key={it.id} className={it.deleted_at ? "trashRow" : ""}>
                {colVis.name && (
                  <td style={{ width: colW.name }}>
                    <input
                      className="paCellInput"
                      value={it.name ?? ""}
                      disabled={readOnly}
                      onChange={(e) => updateItem(it.id, "name", e.target.value)}
                    />
                  </td>
                )}

                {colVis.unit && (
                  <td className="paCenterCol" style={{ width: colW.unit }}>
                    <input
                      className="paCellInput"
                      value={it.unit ?? ""}
                      disabled={readOnly}
                      onChange={(e) => updateItem(it.id, "unit", e.target.value)}
                    />
                  </td>
                )}

                {colVis.cost && (
                  <td className="paCenterCol" style={{ width: colW.cost }}>
                    <input
                      className="paCellInput"
                      type="number"
                      value={it.cost ?? ""}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateItem(
                          it.id,
                          "cost",
                          e.target.value === "" ? null : Number(e.target.value)
                        )
                      }
                    />
                  </td>
                )}

                {colVis.sort && (
                  <td style={{ width: colW.sort }}>
                    <input
                      className="paCellInput"
                      type="number"
                      value={it.sort_order ?? 0}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateItem(
                          it.id,
                          "sort_order",
                          e.target.value === "" ? null : Number(e.target.value)
                        )
                      }
                    />
                  </td>
                )}

                {colVis.desc && (
                  <td style={{ width: colW.desc }}>
                    <textarea
                      className="paCellArea"
                      rows={2}
                      value={it.proposal_description ?? ""}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateItem(it.id, "proposal_description", e.target.value)
                      }
                    />
                  </td>
                )}

                {colVis.active && (
                  <td style={{ width: colW.active, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={!!it.active}
                      disabled={readOnly}
                      onChange={(e) =>
                        updateItem(it.id, "active", e.target.checked)
                      }
                    />
                  </td>
                )}

                {colVis.actions && (
                  <td style={{ width: colW.actions, textAlign: "right" }}>
                    <button
                      className="paBtn danger"
                      disabled={readOnly}
                      title={readOnly ? "Read-only" : ""}
                      onClick={() => softDeleteItem(it.id)}
                    >
                      Trash
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PricingAdmin;
