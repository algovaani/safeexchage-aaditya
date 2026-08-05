import { useEffect, useState } from 'react';
import { marketingAPI } from '../api/client.js';

export default function Support() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await marketingAPI.getSupportContacts();
        if (cancelled) return;
        setContacts(Array.isArray(payload) ? payload : payload?.rows || []);
      } catch {
        if (!cancelled) setContacts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium text-text-primary mb-1">Support</h1>
        <p className="text-sm text-text-secondary">Contact our support team</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-24 w-full" />
          ))}
        </div>
      ) : contacts.length ? (
        <div className="space-y-4">
          {contacts.map((c) => {
            const showContactDetails = Boolean(
              c.showContactDetails != null ? c.showContactDetails : c.showName && c.showPhone
            );
            const email = String(c.email || '').trim();

            return (
            <div key={String(c._id || c.id)} className="ui-card p-4">
              <div className="space-y-2">
                {showContactDetails && c.name ? (
                  <div className="text-sm">
                    <span className="text-text-muted">Name: </span>
                    <span className="text-text-primary font-medium">{c.name}</span>
                  </div>
                ) : null}

                {showContactDetails && c.phone ? (
                  <div className="text-sm">
                    <span className="text-text-muted">Phone: </span>
                    <span className="text-text-primary font-medium">{c.phone}</span>
                  </div>
                ) : null}

                {email ? (
                  <div className="text-sm">
                    <span className="text-text-muted">Email: </span>
                    <span className="text-text-primary font-medium">{email}</span>
                  </div>
                ) : null}

                {!showContactDetails && !email ? (
                  <p className="text-sm text-text-muted">Contact details hidden by admin</p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2 pt-3">
                {showContactDetails && c.phone ? (
                  <a
                    className="ui-btn ui-btn--primary text-sm"
                    href={`tel:${String(c.phone).replace(/\s+/g, '')}`}
                  >
                    Call
                  </a>
                ) : null}

                {email ? (
                  <a
                    className="ui-btn ui-btn--ghost text-sm"
                    href={`mailto:${email}?subject=${encodeURIComponent('Support')}`}
                  >
                    Gmail
                  </a>
                ) : null}
              </div>
            </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <p>No support contacts configured.</p>
        </div>
      )}
    </div>
  );
}

