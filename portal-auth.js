// Real tenant login and document access, backed by Supabase.
// Falls back to the old sample-preview behaviour until supabase-config.js
// has real values in it, so the site never breaks mid-setup.

(function () {
  // Whether real credentials have been entered in supabase-config.js.
  // This is independent of whether the Supabase library actually loaded
  // (e.g. no internet, or the CDN is briefly down) — those two cases need
  // very different handling, see below.
  var keysConfigured =
    typeof SUPABASE_URL !== 'undefined' &&
    typeof SUPABASE_ANON_KEY !== 'undefined' &&
    SUPABASE_URL.indexOf('YOUR_SUPABASE') !== 0;

  var libraryLoaded = typeof supabase !== 'undefined';

  var client = (keysConfigured && libraryLoaded)
    ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

  window.__houseagoPortal = client; // handy for console debugging

  // ---- Document icons ----
  // Documents are free-text (whatever name the management team gives them
  // in Supabase), so icons are picked by matching keywords in the name
  // rather than a fixed lookup — a sensible default for anything we don't
  // recognise, and a relevant icon for the common tenancy document types.
  var DOC_ICONS = {
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
    userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>',
    clipboard: '<path d="M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="16" y2="16"/>',
    flame: '<path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-1-2-1-3 2 1 3 3 3 5a5 5 0 0 1-10 0c0-5 3-6 5-11z"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    shieldCheck: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    alertTriangle: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    box: '<path d="M21 8L12 3 3 8v8l9 5 9-5V8z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>'
  };

  function docIconPath(label) {
    var s = (label || '').toLowerCase();
    if (/deposit/.test(s)) return DOC_ICONS.shieldCheck;
    if (/insurance/.test(s)) return DOC_ICONS.shield;
    if (/fire|smoke|alarm/.test(s)) return DOC_ICONS.alertTriangle;
    if (/gas safety|gas cert/.test(s)) return DOC_ICONS.flame;
    if (/energy performance|epc|electrical|eicr/.test(s)) return DOC_ICONS.zap;
    if (/inventory|check-in|check in|check-out|check out/.test(s)) return DOC_ICONS.clipboard;
    if (/right to rent|referenc|verificat|identity|id check/.test(s)) return DOC_ICONS.userCheck;
    return DOC_ICONS.file;
  }

  function docIconSvg(label) {
    return '<svg viewBox="0 0 24 24">' + docIconPath(label) + '</svg>';
  }

  // ---- Maintenance report icons, matched by category ----
  function maintIconPath(category) {
    var s = (category || '').toLowerCase();
    if (/plumbing/.test(s)) return DOC_ICONS.droplet;
    if (/electrical/.test(s)) return DOC_ICONS.zap;
    if (/heating/.test(s)) return DOC_ICONS.flame;
    if (/appliance/.test(s)) return DOC_ICONS.box;
    if (/lock|security/.test(s)) return DOC_ICONS.lock;
    return DOC_ICONS.wrench;
  }

  function maintIconSvg(category) {
    return '<svg viewBox="0 0 24 24">' + maintIconPath(category) + '</svg>';
  }

  function statusClass(status) {
    var s = (status || '').toLowerCase();
    if (s.indexOf('progress') !== -1) return 'status-in-progress';
    if (s.indexOf('resolved') !== -1) return 'status-resolved';
    return 'status-new';
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return '';
    }
  }

  // ---- First name for the dashboard greeting ----
  // Prefers a name set in the Supabase user's metadata (first_name,
  // given_name, full_name, or name); falls back to a title-cased version
  // of the part of their email before the @ so the greeting never shows
  // a blank, even for accounts set up with just an email and password.
  function firstNameFor(user) {
    var meta = (user && user.user_metadata) || {};
    var name = meta.first_name || meta.given_name || meta.full_name || meta.name;
    if (name) return String(name).trim().split(/\s+/)[0];

    var local = ((user && user.email) || '').split('@')[0];
    local = local.split(/[.\-_+0-9]/).filter(Boolean)[0] || local;
    if (!local) return 'there';
    return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
  }

  document.addEventListener('DOMContentLoaded', function () {
    var loginForm = document.getElementById('portal-login-form');
    var dashboard = document.querySelector('.doc-list');

    // ---- Configured, but the Supabase library itself failed to load ----
    // Never fall back to the "let anyone in" preview here: that would mean
    // a dropped CDN request quietly turns off real login checking.
    if (keysConfigured && !libraryLoaded) {
      if (loginForm) {
        loginForm.addEventListener('submit', function (e) {
          e.preventDefault();
          var errorBox = document.getElementById('portal-error');
          if (errorBox) {
            errorBox.textContent = 'The portal could not load just now. Please refresh the page and try again in a moment.';
            errorBox.hidden = false;
          }
        });
      }
      if (dashboard) {
        dashboard.innerHTML = '<div class="doc-row"><div class="doc-row-main"><div>The portal could not load your documents just now. Please refresh the page and try again in a moment.</div></div></div>';
      }
      return;
    }

    // ---- Not configured yet: keep the old mock behaviour ----
    if (!client) {
      var setupNote = document.getElementById('portal-setup-note');
      if (setupNote) setupNote.hidden = false;

      if (loginForm) {
        loginForm.addEventListener('submit', function (e) {
          e.preventDefault();
          window.location.href = 'portal-dashboard.html';
        });
      }

      if (dashboard) {
        var sample = [
          ['Tenancy Agreement', 'Signed · PDF'],
          ['Right to Rent Check', 'Confirmed · PDF'],
          ['Check-in Inventory Report', 'PDF, with photographs'],
          ['Gas Safety Certificate', 'Current · PDF'],
          ['Energy Performance Certificate', 'Current · PDF'],
          ['Deposit Protection Certificate', 'Protected with the DPS · PDF']
        ];
        dashboard.innerHTML = sample.map(function (row) {
          return '<div class="doc-row"><div class="doc-row-main"><div class="doc-icon">' + docIconSvg(row[0]) + '</div><div><div class="doc-name">' + row[0] + '</div><div class="doc-meta">' + row[1] + '</div></div></div><a href="#" class="btn btn-outline">Download</a></div>';
        }).join('');
      }

      document.querySelectorAll('.doc-row a[href="#"]').forEach(function (link) {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          alert('This is a sample document row. Add your Supabase project details to assets/supabase-config.js to make this real (see PORTAL-SETUP.md).');
        });
      });

      // ---- Maintenance section: sample property, sample history ----
      var maintIntro = document.getElementById('maintenance-intro');
      var maintForm = document.getElementById('maintenance-form');
      var maintPropertyLabel = document.getElementById('maintenance-property-label');
      var maintList = document.getElementById('maintenance-list');

      if (maintIntro) maintIntro.textContent = "You're reporting issues for Horning Close.";
      if (maintPropertyLabel) maintPropertyLabel.textContent = 'Horning Close';
      if (maintForm) {
        maintForm.hidden = false;
        maintForm.addEventListener('submit', function (e) {
          e.preventDefault();
          alert('This is a preview. Add your Supabase project details to assets/supabase-config.js to make maintenance reporting real (see PORTAL-SETUP.md).');
        });
      }
      if (maintList) {
        var sampleReports = [
          ['Heating & hot water', 'Radiator in the upstairs bathroom is not heating up.', 'In progress', '2026-09-02'],
          ['Plumbing', 'Kitchen tap drips constantly, even when fully closed.', 'Resolved', '2026-08-14']
        ];
        maintList.innerHTML = sampleReports.map(function (row) {
          return '<div class="doc-row"><div class="doc-row-main"><div class="doc-icon">' + maintIconSvg(row[0]) + '</div><div><div class="doc-name">' + row[0] + '</div><div class="doc-meta">' + row[1] + ' &middot; ' + formatDate(row[3]) + '</div></div></div><span class="tag ' + statusClass(row[2]) + '">' + row[2] + '</span></div>';
        }).join('');
      }
      return;
    }

    // ---- Login page ----
    if (loginForm) {
      var errorBox = document.getElementById('portal-error');

      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = document.getElementById('portal-email').value.trim();
        var password = document.getElementById('portal-password').value;
        var submitBtn = loginForm.querySelector('button[type="submit"]');

        if (errorBox) errorBox.hidden = true;
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Logging in…'; }

        client.auth.signInWithPassword({ email: email, password: password }).then(function (result) {
          if (result.error) {
            if (errorBox) {
              errorBox.textContent = 'That email and password were not recognised. Contact the management team if you need your account set up.';
              errorBox.hidden = false;
            }
            if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Log in'; }
            return;
          }
          window.location.href = 'portal-dashboard.html';
        });
      });
    }

    // ---- Dashboard page ----
    if (dashboard) {
      client.auth.getSession().then(function (result) {
        var session = result.data.session;
        if (!session) {
          window.location.href = 'portal.html';
          return;
        }

        var userEmail = document.getElementById('portal-user-email');
        if (userEmail) userEmail.textContent = session.user.email;

        var firstName = firstNameFor(session.user);
        var welcomeName = document.getElementById('portal-welcome-name');
        if (welcomeName) welcomeName.textContent = firstName;
        var avatar = document.getElementById('portal-avatar');
        if (avatar) avatar.textContent = firstName.charAt(0).toUpperCase();

        loadDocuments(session);
        loadTenantDetails(session);
        loadMaintenanceHistory(session);
        setupMaintenanceForm(session);
      });

      document.querySelectorAll('a[data-portal-logout]').forEach(function (link) {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          client.auth.signOut().then(function () {
            window.location.href = 'portal.html';
          });
        });
      });
    }

    function loadDocuments(session) {
      client
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
        .then(function (result) {
          dashboard.innerHTML = '';

          if (result.error) {
            dashboard.innerHTML = '<div class="doc-row"><div class="doc-row-main"><div>Could not load your documents right now. Please try again shortly.</div></div></div>';
            return;
          }

          var docs = result.data || [];
          if (docs.length === 0) {
            dashboard.innerHTML = '<div class="doc-row"><div class="doc-row-main"><div>No documents have been added to your account yet.</div></div></div>';
            return;
          }

          docs.forEach(function (doc) {
            var row = document.createElement('div');
            row.className = 'doc-row';

            var metaBits = [];
            if (doc.category) metaBits.push(doc.category);
            if (doc.valid_until) metaBits.push('Valid until ' + doc.valid_until);

            row.innerHTML =
              '<div class="doc-row-main">' +
                '<div class="doc-icon">' + docIconSvg(doc.name || doc.category || '') + '</div>' +
                '<div>' +
                  '<div class="doc-name">' + escapeHtml(doc.name || 'Document') + '</div>' +
                  '<div class="doc-meta">' + escapeHtml(metaBits.join(' · ')) + '</div>' +
                '</div>' +
              '</div>' +
              '<a href="#" class="btn btn-outline">Download</a>';

            var downloadLink = row.querySelector('a');
            downloadLink.addEventListener('click', function (e) {
              e.preventDefault();
              client.storage
                .from('tenant-documents')
                .createSignedUrl(doc.file_path, 300)
                .then(function (signedResult) {
                  if (signedResult.error || !signedResult.data) {
                    alert('This file could not be opened. Contact the management team.');
                    return;
                  }
                  window.open(signedResult.data.signedUrl, '_blank', 'noopener');
                });
            });

            dashboard.appendChild(row);
          });
        });
    }

    function loadTenantDetails(session) {
      var detailsList = document.getElementById('portal-details-list');
      if (!detailsList) return;

      client
        .from('tenant_details')
        .select('*')
        .maybeSingle()
        .then(function (result) {
          if (result.error) {
            detailsList.innerHTML = '<li>Could not load your details right now. Please try again shortly.</li>';
            return;
          }

          var details = result.data;
          if (!details) {
            detailsList.innerHTML = '<li>Your details have not been set up yet. Contact the management team.</li>';
            return;
          }

          var rows = [
            ['Property', details.property],
            ['Tenancy', details.tenancy_period],
            ['Utility package', details.utility_package]
          ].filter(function (row) { return !!row[1]; });

          if (rows.length === 0) {
            detailsList.innerHTML = '<li>Your details have not been set up yet. Contact the management team.</li>';
            return;
          }

          detailsList.innerHTML = rows.map(function (row) {
            return '<li>' + escapeHtml(row[0]) + ': ' + escapeHtml(row[1]) + '</li>';
          }).join('');
        });
    }

    function setupMaintenanceForm(session) {
      var intro = document.getElementById('maintenance-intro');
      var form = document.getElementById('maintenance-form');
      var unavailable = document.getElementById('maintenance-unavailable');
      var propertyLabel = document.getElementById('maintenance-property-label');
      var propertyField = document.getElementById('maintenance-property-field');
      var emailField = document.getElementById('maintenance-email-field');
      if (!form) return;

      client
        .from('tenant_details')
        .select('property')
        .maybeSingle()
        .then(function (result) {
          var property = result.data && result.data.property;

          if (result.error || !property) {
            if (intro) intro.textContent = "We can't take a maintenance report until your account is linked to a property.";
            if (unavailable) unavailable.hidden = false;
            return;
          }

          if (intro) intro.textContent = 'Reporting an issue for ' + property + '.';
          if (propertyLabel) propertyLabel.textContent = property;
          if (propertyField) propertyField.value = property;
          if (emailField) emailField.value = session.user.email;
          form.hidden = false;

          form.addEventListener('submit', function (e) {
            e.preventDefault();
            var category = document.getElementById('maintenance-category').value;
            var description = document.getElementById('maintenance-description').value.trim();
            var status = document.getElementById('maintenance-status');
            var submitBtn = form.querySelector('button[type="submit"]');

            if (!category || !description) return;

            if (status) status.textContent = '';
            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

            client
              .from('maintenance_requests')
              .insert({ user_id: session.user.id, property: property, category: category, description: description })
              .then(function (insertResult) {
                if (insertResult.error) {
                  if (status) status.textContent = 'Something went wrong submitting that. Please email us directly at houseagopropertiesltd@gmail.com instead.';
                  if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit report'; }
                  return;
                }

                // Also email the management team directly via FormSubmit, so
                // a report doesn't sit unnoticed until someone checks the
                // dashboard. The saved database row above is the record of
                // truth either way.
                var formData = new FormData(form);
                fetch(form.action.replace('formsubmit.co/', 'formsubmit.co/ajax/'), {
                  method: 'POST',
                  headers: { 'Accept': 'application/json' },
                  body: formData
                }).catch(function () {
                  // Ignore — the report is already saved and visible to the
                  // management team from the Supabase dashboard regardless.
                });

                if (status) status.textContent = 'Thanks — your report has been sent to the management team.';
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit report'; }
                form.reset();
                loadMaintenanceHistory(session);
              });
          });
        });
    }

    function loadMaintenanceHistory(session) {
      var list = document.getElementById('maintenance-list');
      if (!list) return;

      client
        .from('maintenance_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .then(function (result) {
          if (result.error) {
            list.innerHTML = '<div class="doc-row"><div class="doc-row-main"><div>Could not load your maintenance reports right now. Please try again shortly.</div></div></div>';
            return;
          }

          var reports = result.data || [];
          if (reports.length === 0) {
            list.innerHTML = '<div class="doc-row"><div class="doc-row-main"><div>No maintenance issues reported yet.</div></div></div>';
            return;
          }

          list.innerHTML = reports.map(function (r) {
            return '<div class="doc-row"><div class="doc-row-main"><div class="doc-icon">' + maintIconSvg(r.category) + '</div><div><div class="doc-name">' + escapeHtml(r.category || 'Maintenance issue') + '</div><div class="doc-meta">' + escapeHtml(r.description || '') + ' &middot; ' + formatDate(r.created_at) + '</div></div></div><span class="tag ' + statusClass(r.status) + '">' + escapeHtml(r.status || 'New') + '</span></div>';
          }).join('');
        });
    }

    function escapeHtml(str) {
      var div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  });
})();
