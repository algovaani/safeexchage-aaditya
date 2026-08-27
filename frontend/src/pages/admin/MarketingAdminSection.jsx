import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCcw } from 'lucide-react';
import { adminMarketingAPI } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import { BANNER_SIZE_HINT } from '../../components/BannerSlider.jsx';
import { resolveAssetUrl } from '../../utils/assetUrl.js';

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

export default function MarketingAdminSection({ mode, refreshKey, onMutate }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  // Shared
  const [busyId, setBusyId] = useState(null);

  // Banners
  const [bannerForm, setBannerForm] = useState({ message: '', enabled: true, sortOrder: 0 });
  const [bannerImageFile, setBannerImageFile] = useState(null);

  // Notices
  const [noticeForm, setNoticeForm] = useState({ title: '', message: '', enabled: true, sortOrder: 0 });
  const [noticeImageFile, setNoticeImageFile] = useState(null);

  // Support contacts
  const [supportForm, setSupportForm] = useState({
    name: '',
    phone: '',
    email: '',
    enabled: true,
  });

  const canUseMode = useMemo(() => ['banners', 'notices', 'support'].includes(mode), [mode]);

  async function load() {
    if (!canUseMode) return;
    setLoading(true);
    try {
      if (mode === 'banners') {
        const data = await adminMarketingAPI.listBanners();
        setRows(asArray(data));
      } else if (mode === 'notices') {
        const data = await adminMarketingAPI.listNotices();
        setRows(asArray(data));
      } else if (mode === 'support') {
        const data = await adminMarketingAPI.listSupportContacts();
        setRows(asArray(data));
      }
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, refreshKey]);

  async function submitCreate() {
    if (!canUseMode) return;
    setBusyId('create');
    try {
      if (mode === 'banners') {
        const msg = String(bannerForm.message || '').trim();
        if (!msg && !bannerImageFile) {
          toast.warning('Add a banner image or message.');
          return;
        }
        const fd = new FormData();
        fd.append('message', msg);
        fd.append('enabled', String(Boolean(bannerForm.enabled)));
        fd.append('sortOrder', String(Number(bannerForm.sortOrder || 0)));
        if (bannerImageFile) fd.append('image', bannerImageFile);

        await adminMarketingAPI.createBannerWithImage(fd);
      } else if (mode === 'notices') {
        if (!String(noticeForm.title).trim() || !String(noticeForm.message).trim()) {
          toast.warning('Notice title and message are required.');
          return;
        }
        const fd = new FormData();
        fd.append('title', noticeForm.title);
        fd.append('message', noticeForm.message);
        fd.append('enabled', String(Boolean(noticeForm.enabled)));
        fd.append('sortOrder', String(Number(noticeForm.sortOrder || 0)));
        if (noticeImageFile) fd.append('image', noticeImageFile);

        await adminMarketingAPI.createNoticeWithImage(fd);
      } else if (mode === 'support') {
        if (!String(supportForm.name).trim()) {
          toast.warning('Support name is required.');
          return;
        }
        await adminMarketingAPI.createSupportContact({
          enabled: Boolean(supportForm.enabled),
          name: supportForm.name,
          phone: supportForm.phone,
          email: supportForm.email,
        });
      }

      toast.success('Saved successfully.');
      onMutate?.();
      await load();
      if (mode === 'banners') setBannerImageFile(null);
      if (mode === 'notices') setNoticeImageFile(null);
    } catch (e) {
      toast.error(e?.message || 'Save failed');
    } finally {
      setBusyId(null);
    }
  }

  async function updateRow(id, payload) {
    if (!id) return;
    setBusyId(String(id));
    try {
      if (mode === 'banners') await adminMarketingAPI.updateBanner(id, payload);
      if (mode === 'notices') await adminMarketingAPI.updateNotice(id, payload);
      if (mode === 'support') await adminMarketingAPI.updateSupportContact(id, payload);

      toast.success('Updated.');
      onMutate?.();
      await load();
    } catch (e) {
      toast.error(e?.message || 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteBannerRow(id) {
    if (!id) return;
    const ok = window.confirm('Delete this banner? This cannot be undone.');
    if (!ok) return;
    setBusyId(String(id));
    try {
      await adminMarketingAPI.deleteBanner(id);
      toast.success('Banner deleted.');
      onMutate?.();
      await load();
    } catch (e) {
      toast.error(e?.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  async function deleteNoticeRow(id) {
    if (!id) return;
    const ok = window.confirm('Delete this notice? This cannot be undone.');
    if (!ok) return;
    setBusyId(String(id));
    try {
      await adminMarketingAPI.deleteNotice(id);
      toast.success('Notice deleted.');
      onMutate?.();
      await load();
    } catch (e) {
      toast.error(e?.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="admin-card">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-medium">
              {mode === 'banners' ? 'Banner Management' : null}
              {mode === 'notices' ? 'Notice Management' : null}
              {mode === 'support' ? 'Support Management' : null}
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              {mode === 'banners'
                ? 'Enabled banners appear as an auto-sliding carousel on the user Dashboard (10s interval).'
                : mode === 'notices'
                  ? 'Enabled notices are shown as a session dialog on user first load.'
                  : 'Configure support contacts. Name and phone visibility is set per user from their profile page.'}
            </p>
          </div>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={load} disabled={loading}>
            <RefreshCcw size={14} />
          </button>
        </div>

        <div className="space-y-4">
          {mode === 'banners' && (
            <div className="ui-card p-4 space-y-3">
              <div className="rounded-md border border-border bg-bg-secondary px-3 py-2.5 text-sm">
                <p className="font-medium text-text-primary mb-1">Recommended banner size</p>
                <ul className="text-text-secondary space-y-0.5 list-disc pl-4">
                  <li>
                    Best look: <span className="text-text-primary font-medium">{BANNER_SIZE_HINT.width} × {BANNER_SIZE_HINT.height} px</span>{' '}
                    ({BANNER_SIZE_HINT.ratio} landscape)
                  </li>
                  <li>Min width ~800 px; keep subject in the center (edges may crop on mobile)</li>
                  <li>
                    Formats: {BANNER_SIZE_HINT.formats} · Max {BANNER_SIZE_HINT.maxMb} MB
                  </li>
                  <li>Multiple enabled banners rotate automatically every 10 seconds (sort order = slide order)</li>
                </ul>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="ui-label">
                  Message (optional)
                  <input
                    className="ui-input"
                    value={bannerForm.message}
                    onChange={(e) => setBannerForm((f) => ({ ...f, message: e.target.value }))}
                    placeholder="Optional caption on banner"
                  />
                </label>
                <label className="ui-label">
                  Sort order
                  <input
                    className="ui-input"
                    value={bannerForm.sortOrder}
                    onChange={(e) => setBannerForm((f) => ({ ...f, sortOrder: e.target.value }))}
                    type="number"
                  />
                </label>
              </div>

              <label className="ui-label">
                Banner image (optional) — {BANNER_SIZE_HINT.width}×{BANNER_SIZE_HINT.height} px recommended
                <input
                  className="ui-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => setBannerImageFile(e.target.files?.[0] || null)}
                />
                {bannerImageFile ? (
                  <span className="text-xs text-text-muted block mt-1">{bannerImageFile.name}</span>
                ) : null}
              </label>
              <label className="flex items-center gap-3 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-border accent-accent"
                  checked={bannerForm.enabled}
                  onChange={(e) => setBannerForm((f) => ({ ...f, enabled: e.target.checked }))}
                />
                Enabled (show on Dashboard)
              </label>
              <button type="button" className="admin-btn admin-btn--primary" onClick={submitCreate} disabled={busyId === 'create'}>
                <Plus size={16} />
                Add banner
              </button>
            </div>
          )}

          {mode === 'notices' && (
            <div className="ui-card p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="ui-label">
                  Title
                  <input
                    className="ui-input"
                    value={noticeForm.title}
                    onChange={(e) => setNoticeForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Notice title"
                  />
                </label>
                <label className="ui-label">
                  Sort order
                  <input
                    className="ui-input"
                    value={noticeForm.sortOrder}
                    onChange={(e) => setNoticeForm((f) => ({ ...f, sortOrder: e.target.value }))}
                    type="number"
                  />
                </label>
              </div>
              <label className="ui-label">
                Message
                <textarea
                  className="ui-input"
                  rows={3}
                  value={noticeForm.message}
                  onChange={(e) => setNoticeForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Notice message"
                />
              </label>

              <label className="ui-label">
                Notice image (optional)
                <input
                  className="ui-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNoticeImageFile(e.target.files?.[0] || null)}
                />
                {noticeImageFile ? (
                  <span className="text-xs text-text-muted block mt-1">{noticeImageFile.name}</span>
                ) : null}
              </label>
              <label className="flex items-center gap-3 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-border accent-accent"
                  checked={noticeForm.enabled}
                  onChange={(e) => setNoticeForm((f) => ({ ...f, enabled: e.target.checked }))}
                />
                Enabled (show on user session)
              </label>
              <button type="button" className="admin-btn admin-btn--primary" onClick={submitCreate} disabled={busyId === 'create'}>
                <Plus size={16} />
                Add notice
              </button>
            </div>
          )}

          {mode === 'support' && (
            <div className="ui-card p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <label className="ui-label">
                  Name
                  <input className="ui-input" value={supportForm.name} onChange={(e) => setSupportForm((f) => ({ ...f, name: e.target.value }))} placeholder="Support person name" />
                </label>
                <label className="ui-label">
                  Phone
                  <input className="ui-input" value={supportForm.phone} onChange={(e) => setSupportForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+91…" />
                </label>
                <label className="ui-label">
                  Email
                  <input className="ui-input" value={supportForm.email} onChange={(e) => setSupportForm((f) => ({ ...f, email: e.target.value }))} placeholder="support@…" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex items-center gap-3 text-sm text-text-secondary cursor-pointer md:col-span-2">
                  <input type="checkbox" className="rounded border-border accent-accent" checked={supportForm.enabled} onChange={(e) => setSupportForm((f) => ({ ...f, enabled: e.target.checked }))} />
                  Enabled (support person visible)
                </label>
              </div>

              <button type="button" className="admin-btn admin-btn--primary" onClick={submitCreate} disabled={busyId === 'create'}>
                <Plus size={16} />
                Add support person
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="admin-card">
        <h2 className="text-lg font-medium mb-3">Current configuration</h2>

        {loading ? (
          <p className="admin-empty">Loading…</p>
        ) : rows.length ? (
          <div className="space-y-4">
            {rows.map((r) => {
              const id = String(r._id || r.id || '');
              return (
                <div key={id} className="ui-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm text-text-secondary">
                      <code className="font-mono text-xs">{id}</code>
                    </div>
                  </div>

                  {mode === 'banners' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="ui-label">
                        Message (optional)
                        <input
                          className="ui-input"
                          value={r.message || ''}
                          onChange={(e) =>
                            setRows((prev) => prev.map((x) => (String(x._id || x.id) === id ? { ...x, message: e.target.value } : x)))
                          }
                          placeholder="Optional caption"
                        />
                      </label>
                      <label className="ui-label">
                        Sort order
                        <input
                          className="ui-input"
                          type="number"
                          value={r.sortOrder ?? 0}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) => (String(x._id || x.id) === id ? { ...x, sortOrder: Number(e.target.value || 0) } : x))
                            )
                          }
                        />
                      </label>
                      {r.imageUrl ? (
                        <div className="md:col-span-2">
                          <p className="text-sm text-text-muted mb-2">
                            Current image (ideal {BANNER_SIZE_HINT.width}×{BANNER_SIZE_HINT.height})
                          </p>
                          <img
                            src={resolveAssetUrl(r.imageUrl)}
                            alt="banner"
                            className="w-full rounded-md object-cover max-h-44"
                            style={{ aspectRatio: '3 / 1' }}
                            loading="lazy"
                          />
                        </div>
                      ) : null}
                      <label className="flex items-center gap-3 text-sm text-text-secondary cursor-pointer md:col-span-2">
                        <input
                          type="checkbox"
                          className="rounded border-border accent-accent"
                          checked={Boolean(r.enabled)}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) => (String(x._id || x.id) === id ? { ...x, enabled: e.target.checked } : x))
                            )
                          }
                        />
                        Enabled (show on Dashboard)
                      </label>

                      <div className="md:col-span-2 flex justify-end">
                        <button
                          type="button"
                          className="admin-btn admin-btn--primary"
                          disabled={busyId === id}
                          onClick={() =>
                            updateRow(id, {
                              message: r.message,
                              enabled: Boolean(r.enabled),
                              sortOrder: Number(r.sortOrder || 0),
                            })
                          }
                        >
                          {busyId === id ? 'Saving…' : 'Save changes'}
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--danger ml-3"
                          disabled={busyId === id}
                          onClick={() => deleteBannerRow(id)}
                        >
                          {busyId === id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}

                  {mode === 'notices' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="ui-label md:col-span-1">
                        Title
                        <input
                          className="ui-input"
                          value={r.title || ''}
                          onChange={(e) =>
                            setRows((prev) => prev.map((x) => (String(x._id || x.id) === id ? { ...x, title: e.target.value } : x)))
                          }
                        />
                      </label>
                      <label className="ui-label">
                        Sort order
                        <input
                          className="ui-input"
                          type="number"
                          value={r.sortOrder ?? 0}
                          onChange={(e) =>
                            setRows((prev) =>
                              prev.map((x) => (String(x._id || x.id) === id ? { ...x, sortOrder: Number(e.target.value || 0) } : x))
                            )
                          }
                        />
                      </label>
                      <label className="ui-label md:col-span-2">
                        Message
                        <textarea
                          className="ui-input"
                          rows={3}
                          value={r.message || ''}
                          onChange={(e) =>
                            setRows((prev) => prev.map((x) => (String(x._id || x.id) === id ? { ...x, message: e.target.value } : x)))
                          }
                        />
                      </label>
                      {r.imageUrl ? (
                        <div className="md:col-span-2">
                          <p className="text-sm text-text-muted mb-2">Current image</p>
                          <img
                            src={r.imageUrl}
                            alt="notice"
                            className="w-full rounded-md object-cover max-h-44"
                            loading="lazy"
                          />
                        </div>
                      ) : null}
                      <label className="flex items-center gap-3 text-sm text-text-secondary cursor-pointer md:col-span-2">
                        <input
                          type="checkbox"
                          className="rounded border-border accent-accent"
                          checked={Boolean(r.enabled)}
                          onChange={(e) =>
                            setRows((prev) => prev.map((x) => (String(x._id || x.id) === id ? { ...x, enabled: e.target.checked } : x)))
                          }
                        />
                        Enabled (show as session dialog)
                      </label>
                      <div className="md:col-span-2 flex justify-end">
                        <button
                          type="button"
                          className="admin-btn admin-btn--primary"
                          disabled={busyId === id}
                          onClick={() =>
                            updateRow(id, {
                              title: r.title,
                              message: r.message,
                              enabled: Boolean(r.enabled),
                              sortOrder: Number(r.sortOrder || 0),
                            })
                          }
                        >
                          {busyId === id ? 'Saving…' : 'Save changes'}
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--danger ml-3"
                          disabled={busyId === id}
                          onClick={() => deleteNoticeRow(id)}
                        >
                          {busyId === id ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}

                  {mode === 'support' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label className="ui-label">
                        Name
                        <input
                          className="ui-input"
                          value={r.name || ''}
                          onChange={(e) =>
                            setRows((prev) => prev.map((x) => (String(x._id || x.id) === id ? { ...x, name: e.target.value } : x)))
                          }
                        />
                      </label>
                      <label className="ui-label">
                        Phone
                        <input
                          className="ui-input"
                          value={r.phone || ''}
                          onChange={(e) =>
                            setRows((prev) => prev.map((x) => (String(x._id || x.id) === id ? { ...x, phone: e.target.value } : x)))
                          }
                        />
                      </label>
                      <label className="ui-label md:col-span-2">
                        Email
                        <input
                          className="ui-input"
                          value={r.email || ''}
                          onChange={(e) =>
                            setRows((prev) => prev.map((x) => (String(x._id || x.id) === id ? { ...x, email: e.target.value } : x)))
                          }
                        />
                      </label>

                      <div className="md:col-span-2 space-y-2">
                        <p className="text-xs text-text-muted">Name and phone visibility is controlled per user from Admin → Users → user profile.</p>
                        <label className="flex items-center gap-3 text-sm text-text-secondary cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-border accent-accent"
                            checked={Boolean(r.enabled)}
                            onChange={(e) =>
                              setRows((prev) => prev.map((x) => (String(x._id || x.id) === id ? { ...x, enabled: e.target.checked } : x)))
                            }
                          />
                          Enabled (visible to users)
                        </label>
                      </div>

                      <div className="md:col-span-2 flex justify-end">
                        <button
                          type="button"
                          className="admin-btn admin-btn--primary"
                          disabled={busyId === id}
                          onClick={() =>
                            updateRow(id, {
                              enabled: Boolean(r.enabled),
                              name: r.name,
                              phone: r.phone,
                              email: r.email,
                            })
                          }
                        >
                          {busyId === id ? 'Saving…' : 'Save changes'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="admin-empty">No records yet.</div>
        )}
      </div>
    </div>
  );
}

