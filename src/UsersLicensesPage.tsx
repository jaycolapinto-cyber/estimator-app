// src/UsersLicensesPage.tsx
// =========================================================
// CLEAN TSX (no inline styles) — matches ul-* CSS
// Includes:
// - List users (admin-users edge fn)
// - Manage role + deactivate (admin-users edge fn)
// - Send invite (invite-user edge fn)
// - Create user directly (create-user edge fn)
// - Option A: Inactive tab (read-only)
// =========================================================

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import "./UsersLicensesPage.css";

async function invokeFn<T>(
  name: string,
  body: any
): Promise<{ data: T | null; error: any | null }> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess?.session?.access_token;
  if (!token) throw new Error("Not logged in (missing access token)");

  return supabase.functions.invoke<T>(name, {
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
}

type DbUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  license: string;
  status: "Active" | "Invited" | "Inactive";
  created_at?: string;
};

type AdminUsersListResponse = { ok: boolean; users: DbUser[] };
type AdminUsersUpdateResponse = { ok: boolean; user?: DbUser };
type InviteUserResponse = { ok: boolean; error?: string };

type TabKey = "all" | "admins" | "users" | "inactive";

export default function UsersLicensesPage({ orgId }: { orgId: string | null }) {
  const [rows, setRows] = useState<DbUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [myEmail, setMyEmail] = useState("");
  const [orgName, setOrgName] = useState("");

  // Manage modal
  const [selectedUser, setSelectedUser] = useState<DbUser | null>(null);
  const [editRole, setEditRole] = useState<"admin" | "user">("user");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "user">("user");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  // Create user modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<"admin" | "user">("user");
  const [createTempPassword, setCreateTempPassword] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // UI
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [q, setQ] = useState("");

  // Add user dropdown
  const [addUserMenuOpen, setAddUserMenuOpen] = useState(false);
  const addUserWrapRef = useRef<HTMLDivElement | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  }

  function isValidEmail(s: string) {
    const v = s.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  async function loadOrgName(localOrgId: string) {
    try {
      const { data, error } = await supabase.from("orgs").select("name").eq("id", localOrgId).single();
      if (error) throw error;
      setOrgName(data?.name || "");
    } catch {
      setOrgName("");
    }
  }

  async function loadMeEmail() {
    const { data } = await supabase.auth.getSession();
    const email = (data?.session?.user?.email || "").toLowerCase();
    setMyEmail(email);
  }

  async function loadUsers(localOrgId: string) {
    setLoading(true);
    setLoadError(null);

    try {
      await loadMeEmail();

      const { data, error } = await invokeFn<AdminUsersListResponse>("admin-users", {
        action: "list",
        account_id: localOrgId,
      });

      if (error) throw new Error(error.message || "Edge function failed");
      if ((data as any)?.error) throw new Error((data as any).error);

      setRows(data?.users || []);
    } catch (e: any) {
      setLoadError(e?.message || "Failed to load users.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // Load on orgId
  useEffect(() => {
    let cancelled = false;

    if (!orgId) {
      setLoading(true);
      setRows([]);
      setOrgName("");
      setLoadError(null);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        await Promise.all([loadUsers(orgId), loadOrgName(orgId)]);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || "Failed to load.");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Close Add user dropdown when clicking outside
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!addUserMenuOpen) return;
      const wrap = addUserWrapRef.current;
      if (!wrap) return;
      if (wrap.contains(e.target as Node)) return;
      setAddUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [addUserMenuOpen]);

 const inactive = useMemo(() => rows.filter((r) => r.status === "Inactive"), [rows]);

// Anything NOT inactive (these are the only users allowed in All/Admins/Users)
const activePool = useMemo(() => rows.filter((r) => r.status !== "Inactive"), [rows]);

const admins = useMemo(() => activePool.filter((r) => r.role === "admin"), [activePool]);
const nonAdmins = useMemo(() => activePool.filter((r) => r.role !== "admin"), [activePool]);


  const activeSeats = useMemo(() => rows.filter((r) => r.status === "Active").length, [rows]);
  const pendingInvites = useMemo(() => rows.filter((r) => r.status === "Invited").length, [rows]);

  const isLastAdmin = !!(
    selectedUser &&
    selectedUser.role === "admin" &&
    admins.length === 1 &&
    (selectedUser.email || "").toLowerCase() === (myEmail || "").toLowerCase()
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    const base =
  tab === "admins" ? admins : tab === "users" ? nonAdmins : tab === "inactive" ? inactive : activePool;


    if (!needle) return base;

    return base.filter((u) => {
      const n = (u.name || "").toLowerCase();
      const e = (u.email || "").toLowerCase();
      const r = (u.role || "").toLowerCase();
      const s = (u.status || "").toLowerCase();
      return n.includes(needle) || e.includes(needle) || r.includes(needle) || s.includes(needle);
    });
  }, [q, tab, admins, nonAdmins, inactive, rows]);

  async function handleSaveManage() {
    if (!selectedUser || !orgId) return;

    setSaving(true);
    setSaveError(null);

    try {
      const { data, error } = await invokeFn<AdminUsersUpdateResponse>("admin-users", {
        action: "update",
        account_id: orgId,
        id: selectedUser.id,
        patch: { role: editRole },
      });

      if (error) throw new Error(error.message || "Update failed");
      if ((data as any)?.error) throw new Error((data as any).error);

      showToast("Saved.");
      setSelectedUser(null);
      await loadUsers(orgId);
    } catch (e: any) {
      const msg = e?.message || "Failed to save changes.";
      setSaveError(msg);
      showToast(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivateUser() {
    if (!selectedUser || !orgId) return;

    const ok = window.confirm(
      `Make ${selectedUser.email} inactive?\n\nThis removes them from this organization and they will lose access.`
    );
    if (!ok) return;

    setDeactivating(true);
    setSaveError(null);

    try {
      const { data, error } = await invokeFn("admin-users", {
        action: "deactivate",
        account_id: orgId,
        id: selectedUser.id,
      });

      if (error) throw new Error(error.message || "Deactivate failed");
      if ((data as any)?.error) throw new Error((data as any).error);

      showToast("User made inactive.");
      setSelectedUser(null);
      await loadUsers(orgId);
    } catch (e: any) {
      const msg = e?.message || "Failed to deactivate user.";
      setSaveError(msg);
      showToast(msg);
    } finally {
      setDeactivating(false);
    }
  }

  function openInviteModal() {
    setInviteEmail("");
    setInviteRole("user");
    setInviteError(null);
    setInviteOpen(true);
  }

  function closeInviteModal() {
    setInviteOpen(false);
    setInviteError(null);
    setInviteSubmitting(false);
  }

  function openCreateUserModal() {
    setCreateName("");
    setCreateEmail("");
    setCreateRole("user");
    setCreateTempPassword("");
    setCreateError(null);
    setCreateOpen(true);
  }

  function closeCreateUserModal() {
    setCreateOpen(false);
    setCreateError(null);
    setCreateSubmitting(false);
  }

  async function edgeErrorToMessage(err: any): Promise<string> {
    const fallback = err?.message || err?.error_description || err?.details || "Request failed.";

    try {
      const ctx = err?.context;

      if (ctx && typeof ctx.json === "function") {
        const payload = await ctx.json();
        if (typeof payload?.error === "string") return payload.error;
        if (typeof payload?.message === "string") return payload.message;
        return JSON.stringify(payload);
      }

      if (typeof err?.context?.error === "string") return err.context.error;
    } catch {
      // ignore
    }

    return fallback;
  }

  async function submitInvite() {
    const email = inviteEmail.trim().toLowerCase();

    if (!email) return setInviteError("Email is required.");
    if (!isValidEmail(email)) return setInviteError("Enter a valid email address.");
    if (!orgId) return setInviteError("Missing organization/account.");

    setInviteSubmitting(true);
    setInviteError(null);

    try {
      const { data, error } = await invokeFn<InviteUserResponse>("invite-user", {
        email,
        role: inviteRole,
        account_id: orgId,
      });

      if (error) {
        const msg = await edgeErrorToMessage(error);
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);

      showToast("Invitation sent.");
      closeInviteModal();
      await loadUsers(orgId);
    } catch (e: any) {
      const msg = e?.message || "Failed to send invite.";
      setInviteError(msg);
      showToast(msg);
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function submitCreateUser() {
    if (createSubmitting) return;
    if (!orgId) return setCreateError("Missing organization/account.");

    const name = createName.trim();
    const email = createEmail.trim().toLowerCase();
    const password = createTempPassword;

    if (!name) return setCreateError("Name is required.");
    if (!email) return setCreateError("Email is required.");
    if (!isValidEmail(email)) return setCreateError("Enter a valid email address.");
    if (!password || password.length < 6) return setCreateError("Password must be at least 6 characters.");

    setCreateSubmitting(true);
    setCreateError(null);

    try {
      const { data, error } = await invokeFn<{ ok: boolean; error?: string }>("create-user", {
        account_id: orgId,
        name,
        email,
        password,
        role: createRole,
      });

      if (error) {
        const msg = await edgeErrorToMessage(error);
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      if (!data?.ok) throw new Error("Create user failed.");

      showToast("User created.");
      closeCreateUserModal();
      await loadUsers(orgId);
    } catch (e: any) {
      const msg = e?.message || "Create user failed.";
      setCreateError(msg);
      showToast(msg);
    } finally {
      setCreateSubmitting(false);
    }
  }

  if (!orgId) {
    return <div className="ul-emptyOrg">Loading organization…</div>;
  }

  return (
    <div className="ul-page">
      {toast ? <div className="ul-toast">{toast}</div> : null}

      <div className="ul-headerBar">
        <div className="ul-headerLeft">
          <div className="ul-kicker">
            Admin Console <span className="ul-dot">•</span>{" "}
            <span className="ul-orgName">{orgName || "Organization"}</span>
          </div>

          <div className="ul-title">Users &amp; Licenses</div>
          <div className="ul-subtitle">Manage roles and seats for this account.</div>

          <div className="ul-pills">
            <span className="ul-pill ul-pill--slate">Total: {loading ? "…" : rows.length}</span>
            <span className="ul-pill ul-pill--green">Active: {loading ? "…" : activeSeats}</span>
            <span className="ul-pill ul-pill--gold">Invited: {loading ? "…" : pendingInvites}</span>
            <span className="ul-pill ul-pill--slate">Admins: {loading ? "…" : admins.length}</span>
          </div>
        </div>

        <div className="ul-headerRight">
          <button
            onClick={() => loadUsers(orgId)}
            disabled={loading}
            className="ul-btn ul-btn--light"
            title="Refresh list"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>

          <div ref={addUserWrapRef} className="ul-addUserWrap">
            <button
              onClick={() => setAddUserMenuOpen((v) => !v)}
              className="ul-btn ul-btn--addUser"
              aria-haspopup="menu"
              aria-expanded={addUserMenuOpen}
              title="Add user"
            >
              Add user <span className="ul-caret">▾</span>
            </button>

            {addUserMenuOpen ? (
              <div className="ul-dropdownMenu" role="menu" aria-label="Add user menu">
                <button
                  type="button"
                  onClick={() => {
                    setAddUserMenuOpen(false);
                    openInviteModal();
                  }}
                  className="ul-dropdownItem"
                  role="menuitem"
                >
                  <span className="ul-dropdownIcon">✉️</span>
                  <span>Send invitation</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAddUserMenuOpen(false);
                    openCreateUserModal();
                  }}
                  className="ul-dropdownItem"
                  role="menuitem"
                >
                  <span className="ul-dropdownIcon">👤</span>
                  <span>Create new user</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {loadError ? (
        <div className="ul-alert ul-alert--danger">
          <b>Error:</b> {loadError}
        </div>
      ) : null}

      <div className="ul-panel">
        <div className="ul-panelTop">
          <div className="ul-tabs">
            <button className={`ul-tabBtn ${tab === "all" ? "is-active" : ""}`} onClick={() => setTab("all")}>
              All
            </button>
            <button className={`ul-tabBtn ${tab === "admins" ? "is-active" : ""}`} onClick={() => setTab("admins")}>
              Admins
            </button>
            <button className={`ul-tabBtn ${tab === "users" ? "is-active" : ""}`} onClick={() => setTab("users")}>
              Users
            </button>
            <button className={`ul-tabBtn ${tab === "inactive" ? "is-active" : ""}`} onClick={() => setTab("inactive")}>
              Inactive ({inactive.length})
            </button>
          </div>

          <div className="ul-searchWrap">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search users…"
              className="ul-searchInput"
            />
          </div>
        </div>

        <div className="ul-tableWrap">
          <table className="ul-table">
            <thead>
              <tr>
                <th className="ul-th">Name</th>
                <th className="ul-th">Email</th>
                <th className="ul-th">Role</th>
                <th className="ul-th">License</th>
                <th className="ul-th">Status</th>
                <th className="ul-th ul-th--right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <LoadingRow />
              ) : filtered.length === 0 ? (
                <EmptyRow text={q ? "No matches." : "No users yet."} />
              ) : (
                filtered.map((u, idx) => (
                  <Row
                    key={u.id}
                    user={u}
                    zebra={idx % 2 === 1}
                    onManage={() => {
                      if (u.status === "Inactive") {
                        showToast("Inactive users are read-only.");
                        return;
                      }
                      setSelectedUser(u);
                      setEditRole(u.role);
                      setSaveError(null);
                    }}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="ul-panelFooter">
          Showing <b>{loading ? "…" : filtered.length}</b> users
          {q ? (
            <>
              {" "}
              for <b>“{q}”</b>
            </>
          ) : null}
        </div>
      </div>

      {/* Manage Modal */}
      {selectedUser ? (
        <div className="ul-modalBackdrop" onClick={() => setSelectedUser(null)}>
          <div className="ul-modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="ul-modalHead">
              <div>
                <div className="ul-modalTitle">Manage User</div>
                <div className="ul-modalSubtitle">{selectedUser.email}</div>
              </div>

              <button onClick={() => setSelectedUser(null)} className="ul-modalCloseBtn">
                ✕
              </button>
            </div>

            <div className="ul-modalBody">
              <div className="ul-modalSection">
                <div className="ul-fieldLabel">Role</div>

                <select
                  value={editRole}
                  disabled={isLastAdmin}
                  onChange={(e) => setEditRole(e.target.value as "admin" | "user")}
                  className={`ul-select ${isLastAdmin ? "is-disabled" : ""}`}
                >
                  <option value="admin">admin</option>
                  <option value="user">user</option>
                </select>

                {isLastAdmin ? (
                  <div className="ul-warnText">This org must always have at least one admin.</div>
                ) : null}
              </div>

              {saveError ? <div className="ul-alert ul-alert--danger">{saveError}</div> : null}

              <div className="ul-modalFooter">
                <button
                  onClick={() => setSelectedUser(null)}
                  disabled={saving || deactivating}
                  className="ul-btn ul-btn--light"
                >
                  Cancel
                </button>

                <button
                  onClick={handleDeactivateUser}
                  disabled={saving || deactivating || isLastAdmin}
                  className="ul-btn ul-btn--light"
                  title={isLastAdmin ? "You cannot deactivate the last admin in the org." : "Remove user access"}
                >
                  {deactivating ? "Making inactive…" : "Make inactive"}
                </button>

                <button
                  onClick={handleSaveManage}
                  disabled={saving || deactivating || (isLastAdmin && editRole === "user")}
                  className="ul-btn ul-btn--primary"
                >
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Invite Modal */}
      {inviteOpen ? (
        <div className="ul-modalBackdrop" onClick={closeInviteModal}>
          <div className="ul-modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="ul-modalHead">
              <div>
                <div className="ul-modalTitle">Send invitation</div>
                <div className="ul-modalSubtitle">Invite a user to join this organization.</div>
              </div>

              <button onClick={closeInviteModal} className="ul-modalCloseBtn">
                ✕
              </button>
            </div>

            <div className="ul-modalBody">
              <div className="ul-modalSection">
                <div className="ul-fieldLabel">Email</div>
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@company.com"
                  autoFocus
                  className="ul-textInput"
                />
              </div>

              <div className="ul-modalSection">
                <div className="ul-fieldLabel">Role</div>
                <div className="ul-roleRow">
                  <button
                    type="button"
                    onClick={() => setInviteRole("admin")}
                    className={`ul-rolePill ${inviteRole === "admin" ? "is-active" : ""}`}
                  >
                    Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteRole("user")}
                    className={`ul-rolePill ${inviteRole === "user" ? "is-active" : ""}`}
                  >
                    User
                  </button>
                </div>
              </div>

              {inviteError ? <div className="ul-alert ul-alert--danger">{inviteError}</div> : null}

              <div className="ul-modalFooter">
                <button onClick={closeInviteModal} disabled={inviteSubmitting} className="ul-btn ul-btn--light">
                  Cancel
                </button>
                <button onClick={submitInvite} disabled={inviteSubmitting} className="ul-btn ul-btn--primary">
                  {inviteSubmitting ? "Sending…" : "Send invite"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Create User Modal */}
      {createOpen ? (
        <div className="ul-modalBackdrop" onClick={closeCreateUserModal}>
          <div className="ul-modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="ul-modalHead">
              <div>
                <div className="ul-modalTitle">Create new user</div>
                <div className="ul-modalSubtitle">Create a user directly (no email invite).</div>
              </div>

              <button onClick={closeCreateUserModal} className="ul-modalCloseBtn">
                ✕
              </button>
            </div>

            <div className="ul-modalBody">
              <div className="ul-modalSection">
                <div className="ul-fieldLabel">Name</div>
                <input
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Full name"
                  className="ul-textInput"
                />
              </div>

              <div className="ul-modalSection">
                <div className="ul-fieldLabel">Email</div>
                <input
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="ul-textInput"
                />
              </div>

              <div className="ul-modalSection">
                <div className="ul-fieldLabel">Role</div>
                <div className="ul-roleRow">
                  <button
                    type="button"
                    onClick={() => setCreateRole("admin")}
                    className={`ul-rolePill ${createRole === "admin" ? "is-active" : ""}`}
                  >
                    Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateRole("user")}
                    className={`ul-rolePill ${createRole === "user" ? "is-active" : ""}`}
                  >
                    User
                  </button>
                </div>
              </div>

              <div className="ul-modalSection">
                <div className="ul-fieldLabel">Temporary password</div>
                <input
                  value={createTempPassword}
                  onChange={(e) => setCreateTempPassword(e.target.value)}
                  placeholder="Set a temp password"
                  className="ul-textInput"
                />
                <div className="ul-warnText">Give this password to the user. They can change it after logging in.</div>
              </div>

              {createError ? <div className="ul-alert ul-alert--danger">{createError}</div> : null}

              <div className="ul-modalFooter">
                <button onClick={closeCreateUserModal} disabled={createSubmitting} className="ul-btn ul-btn--light">
                  Cancel
                </button>

                <button disabled={createSubmitting} className="ul-btn ul-btn--primary" onClick={submitCreateUser}>
                  {createSubmitting ? "Creating…" : "Create user"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------- small components -------------------- */

function displayName(u: DbUser) {
  const raw = (u.name || "").trim();
  if (raw && raw.includes(" ")) return raw;

  const local = (u.email || "").split("@")[0] || "";
  const pretty = local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

  return pretty || raw || "—";
}

function LoadingRow() {
  return (
    <tr>
      <td className="ul-td" colSpan={6}>
        <div className="ul-loadingTitle">Loading…</div>
        <div className="ul-loadingSub">Fetching from Supabase…</div>
      </td>
    </tr>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <tr>
      <td className="ul-td" colSpan={6}>
        <div className="ul-emptyRow">{text}</div>
      </td>
    </tr>
  );
}

function Row({
  user,
  zebra,
  onManage,
}: {
  user: DbUser;
  zebra: boolean;
  onManage: () => void;
}) {
  return (
    <tr className={`ul-tr ${zebra ? "is-zebra" : ""}`}>
      <td className="ul-td">
        <div className="ul-name">{displayName(user)}</div>
      </td>

      <td className="ul-td">
        <div className="ul-emailMono">{user.email || "—"}</div>
      </td>

      <td className="ul-td">
        <span className={`ul-pill ${user.role === "admin" ? "ul-pill--green" : "ul-pill--slate"}`}>
          {user.role}
        </span>
      </td>

      <td className="ul-td">{user.license || "—"}</td>

      <td className="ul-td">
        <span className={`ul-pill ${user.status === "Active" ? "ul-pill--green" : "ul-pill--gold"}`}>
          {user.status}
        </span>
      </td>

      <td className="ul-td ul-td--right">
        <button onClick={onManage} className="ul-manageBtn">
          Manage
        </button>
      </td>
    </tr>
  );
}
