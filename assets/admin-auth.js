// Powers admin.html: admin login, tenant account creation, per-tenant
// details/documents/maintenance management. Uses the same Supabase
// project as the tenant portal (assets/supabase-config.js) but is a
// completely separate page — nothing here is reachable from the public
// site or the tenant portal.
//
// Important: this page never uses the Supabase "service_role" key. It
// only ever uses the same public "anon" key as the rest of the site.
// What makes an account an admin is being listed in the `admins` table
// (see supabase-schema.sql) — everything below relies on the row-level
// security policies added there, not on anything in this file being
// secret.

(function () {
  var keysConfigured =
    typeof SUPABASE_URL !== 'undefined' &&
    typeof SUPABASE_ANON_KEY !== 'undefined' &&
    SUPABASE_URL.indexOf('YOUR_SUPABASE') !== 0;

  var libraryLoaded = typeof supabase !== 'undefined';

  if (!keysConfigured) {
    document.addEventListener('DOMContentLoaded', function () {
      show('admin-not-configured');
      hide('admin-login-shell');
    });
    return;
  }

  if (!libraryLoaded) {
    document.addEventListener('DOMContentLoaded', function () {
      var errorBox = document.getElementById('admin-login-error');
      if (errorBox) {
        errorBox.textContent = 'This page could not load just now. Please refresh and try again in a moment.';
        errorBox.hidden = false;
      }
    });
    return;
  }

  // Primary client: the admin's own logged-in session. All reads/writes
  // that should happen "as the admin" (and therefore rely on the admin
  // RLS policies) go through this one.
  var client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Second, isolated client used only for creating brand-new tenant
  // accounts. Signing up on the *primary* client would log the admin out
  // of their own session and into the new tenant's — this client keeps
  // its own session entirely separate (and never persists it), so the
  // admin stays logged in as themselves throughout.
  var signupClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'houseago-admin-signup' }
  });

  window.__houseagoAdmin = client;

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

  function docIconSvg(label) {
    var s = (label || '').toLowerCase();
    var path = DOC_ICONS.file;
    if (/deposit/.test(s)) path = DOC_ICONS.shieldCheck;
    else if (/insurance/.test(s)) path = DOC_ICONS.shield;
    else if (/fire|smoke|alarm/.test(s)) path = DOC_ICONS.alertTriangle;
    else if (/gas safety|gas cert/.test(s)) path = DOC_ICONS.flame;
    else if (/energy performance|epc|electrical|eicr/.test(s)) path = DOC_ICONS.zap;
    else if (/inventory|check-in|check in|check-out|check out/.test(s)) path = DOC_ICONS.clipboard;
    else if (/right to rent|referenc|verificat|identity|id check/.test(s)) path = DOC_ICONS.userCheck;
    return '<svg viewBox="0 0 24 24">' + path + '</svg>';
  }

  function maintIconSvg(category) {
    var s = (category || '').toLowerCase();
    var path = DOC_ICONS.wrench;
    if (/plumbing/.test(s)) path = DOC_ICONS.droplet;
    else if (/electrical/.test(s)) path = DOC_ICONS.zap;
    else if (/heating/.test(s)) path = DOC_ICONS.flame;
    else if (/appliance/.test(s)) path = DOC_ICONS.box;
    else if (/lock|security/.test(s)) path = DOC_ICONS.lock;
    return '<svg viewBox="0 0 24 24">' + path + '</svg>';
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

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  function show(id) { var el = document.getElementById(id); if (el) el.hidden = false; }
  function hide(id) { var el = document.getElementById(id); if (el) el.hidden = true; }

  var currentTenant = null; // { user_id, email }

  document.addEventListener('DOMContentLoaded', function () {
    hide('admin-not-configured');

    document.querySelectorAll('[data-admin-logout]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        client.auth.signOut().then(function () { window.location.reload(); });
      });
    });

    var loginForm = document.getElementById('admin-login-form');
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('admin-email').value.trim();
      var password = document.getElementById('admin-password').value;
      var errorBox = document.getElementById('admin-login-error');
      var submitBtn = loginForm.querySelector('button[type="submit"]');
      errorBox.hidden = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in…';

      client.auth.signInWithPassword({ email: email, password: password }).then(function (result) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log in';
        if (result.error) {
          errorBox.textContent = 'That email and password were not recognised.';
          errorBox.hidden = false;
          return;
        }
        checkAdminAndEnter();
      });
    });

    // Already logged in from an earlier visit?
    client.auth.getSession().then(function (result) {
      if (result.data.session) checkAdminAndEnter();
    });

    function checkAdminAndEnter() {
      client.from('admins').select('user_id').maybeSingle().then(function (result) {
        if (result.error || !result.data) {
          hide('admin-login-shell');
          hide('admin-workspace');
          show('admin-not-authorised');
          document.querySelectorAll('[data-admin-logout]').forEach(function (el) { el.hidden = false; });
          return;
        }
        hide('admin-login-shell');
        hide('admin-not-authorised');
        show('admin-workspace');
        document.querySelectorAll('[data-admin-logout]').forEach(function (el) { el.hidden = false; });
        loadTenantDirectory();
      });
    }

    // ---- Add a new tenant ----
    var addForm = document.getElementById('admin-add-tenant-form');
    addForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('admin-new-email').value.trim();
      var password = document.getElementById('admin-new-password').value;
      var firstName = document.getElementById('admin-new-first-name').value.trim();
      var property = document.getElementById('admin-new-property').value.trim();
      var tenancy = document.getElementById('admin-new-tenancy').value.trim();
      var utility = document.getElementById('admin-new-utility').value;
      var errorBox = document.getElementById('admin-add-tenant-error');
      var status = document.getElementById('admin-add-tenant-status');
      var submitBtn = addForm.querySelector('button[type="submit"]');

      errorBox.hidden = true;
      status.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating…';

      var signUpOptions = firstName ? { data: { first_name: firstName } } : undefined;

      signupClient.auth.signUp({ email: email, password: password, options: signUpOptions }).then(function (result) {
        if (result.error || !result.data || !result.data.user) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create tenant account';
          errorBox.textContent = (result.error && result.error.message) || 'Could not create that account. It may already exist.';
          errorBox.hidden = false;
          return;
        }

        var newUserId = result.data.user.id;
        // The signup client's own session is isolated and never persisted
        // (persistSession: false above), so there's nothing to clean up on
        // the admin's side — the admin stays logged in throughout.

        if (!property && !tenancy && !utility) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create tenant account';
          status.textContent = 'Tenant account created for ' + email + '. Add their property details below once ready.';
          addForm.reset();
          loadTenantDirectory();
          return;
        }

        client.from('tenant_details').upsert({
          user_id: newUserId,
          property: property || null,
          tenancy_period: tenancy || null,
          utility_package: utility || null
        }, { onConflict: 'user_id' }).then(function (detailsResult) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create tenant account';
          if (detailsResult.error) {
            status.textContent = 'Account created for ' + email + ', but their details could not be saved. Open their row below to try again.';
          } else {
            status.textContent = 'Tenant account created for ' + email + '.';
          }
          addForm.reset();
          loadTenantDirectory();
        });
      });
    });

    // ---- Tenant directory ----
    function loadTenantDirectory() {
      var list = document.getElementById('admin-tenant-list');
      client.rpc('admin_list_tenants').then(function (result) {
        if (result.error) {
          list.innerHTML = '<div class="doc-row"><div class="doc-row-main"><div>Could not load tenants right now.</div></div></div>';
          return;
        }
        var tenants = result.data || [];
        if (tenants.length === 0) {
          list.innerHTML = '<div class="doc-row"><div class="doc-row-main"><div>No tenants yet. Add one above.</div></div></div>';
          return;
        }
        list.innerHTML = '';
        tenants.forEach(function (t) {
          var row = document.createElement('div');
          row.className = 'doc-row admin-tenant-row';
          var metaBits = [];
          if (t.property) metaBits.push(t.property);
          if (t.tenancy_period) metaBits.push(t.tenancy_period);
          if (t.utility_package) metaBits.push(t.utility_package + ' package');
          row.innerHTML =
            '<div class="doc-row-main"><div class="doc-icon">' + docIconSvg('user') + '</div><div>' +
              '<div class="doc-name">' + escapeHtml(t.email) + '</div>' +
              '<div class="doc-meta">' + (metaBits.length ? escapeHtml(metaBits.join(' · ')) : 'No details set yet') + '</div>' +
            '</div></div>' +
            '<button type="button" class="btn btn-outline">Manage</button>';
          row.addEventListener('click', function () { openTenantPanel(t.user_id, t.email); });
          list.appendChild(row);
        });
      });
    }

    // ---- Manage a single tenant ----
    document.getElementById('admin-tenant-panel-close').addEventListener('click', function () {
      hide('admin-tenant-panel');
      currentTenant = null;
    });

    function openTenantPanel(userId, email) {
      currentTenant = { user_id: userId, email: email };
      document.getElementById('admin-tenant-panel-email').textContent = email;
      show('admin-tenant-panel');
      document.getElementById('admin-tenant-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      loadTenantDetailsIntoForm(userId);
      loadTenantDocuments(userId);
      loadTenantMaintenance(userId);
    }

    function loadTenantDetailsIntoForm(userId) {
      client.from('tenant_details').select('*').eq('user_id', userId).maybeSingle().then(function (result) {
        var d = result.data || {};
        document.getElementById('admin-details-property').value = d.property || '';
        document.getElementById('admin-details-tenancy').value = d.tenancy_period || '';
        document.getElementById('admin-details-utility').value = d.utility_package || '';
      });
    }

    document.getElementById('admin-details-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!currentTenant) return;
      var status = document.getElementById('admin-details-status');
      var submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';
      status.textContent = '';

      client.from('tenant_details').upsert({
        user_id: currentTenant.user_id,
        property: document.getElementById('admin-details-property').value.trim() || null,
        tenancy_period: document.getElementById('admin-details-tenancy').value.trim() || null,
        utility_package: document.getElementById('admin-details-utility').value || null
      }, { onConflict: 'user_id' }).then(function (result) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save details';
        status.textContent = result.error ? 'Could not save just now. Please try again.' : 'Saved.';
        if (!result.error) loadTenantDirectory();
      });
    });

    // ---- Documents ----
    function loadTenantDocuments(userId) {
      var list = document.getElementById('admin-doc-list');
      list.innerHTML = '<div class="doc-row"><div class="doc-row-main"><div>Loading documents&hellip;</div></div></div>';
      client.from('documents').select('*').eq('user_id', userId).order('created_at', { ascending: false }).then(function (result) {
        if (result.error) {
          list.innerHTML = '<div class="doc-row"><div class="doc-row-main"><div>Could not load documents right now.</div></div></div>';
          return;
        }
        var docs = result.data || [];
        if (docs.length === 0) {
          list.innerHTML = '<div class="doc-row"><div class="doc-row-main"><div>No documents uploaded yet.</div></div></div>';
          return;
        }
        list.innerHTML = '';
        docs.forEach(function (doc) {
          var metaBits = [];
          if (doc.category) metaBits.push(doc.category);
          if (doc.valid_until) metaBits.push('Valid until ' + doc.valid_until);
          var row = document.createElement('div');
          row.className = 'doc-row';
          row.innerHTML =
            '<div class="doc-row-main"><div class="doc-icon">' + docIconSvg(doc.name || doc.category || '') + '</div><div>' +
              '<div class="doc-name">' + escapeHtml(doc.name || 'Document') + '</div>' +
              '<div class="doc-meta">' + escapeHtml(metaBits.join(' · ')) + '</div>' +
            '</div></div>' +
            '<div class="doc-row-actions"><button type="button" class="btn-text">Delete</button></div>';
          row.querySelector('.btn-text').addEventListener('click', function () {
            if (!window.confirm('Delete "' + doc.name + '" for ' + currentTenant.email + '? This cannot be undone.')) return;
            client.storage.from('tenant-documents').remove([doc.file_path]).then(function () {
              client.from('documents').delete().eq('id', doc.id).then(function () {
                loadTenantDocuments(userId);
              });
            });
          });
          list.appendChild(row);
        });
      });
    }

    document.getElementById('admin-upload-form').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!currentTenant) return;
      var fileInput = document.getElementById('admin-doc-file');
      var file = fileInput.files[0];
      var status = document.getElementById('admin-upload-status');
      var submitBtn = e.target.querySelector('button[type="submit"]');
      if (!file) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading…';
      status.textContent = '';

      var name = document.getElementById('admin-doc-name').value.trim();
      var category = document.getElementById('admin-doc-category').value.trim();
      var validUntil = document.getElementById('admin-doc-valid-until').value;
      var safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      var path = currentTenant.user_id + '/' + Date.now() + '-' + safeFileName;

      client.storage.from('tenant-documents').upload(path, file).then(function (uploadResult) {
        if (uploadResult.error) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Upload document';
          status.textContent = 'Could not upload that file. Please try again.';
          return;
        }

        client.from('documents').insert({
          user_id: currentTenant.user_id,
          name: name,
          category: category || null,
          valid_until: validUntil || null,
          file_path: path
        }).then(function (insertResult) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Upload document';
          if (insertResult.error) {
            status.textContent = 'The file uploaded, but could not be added to their document list. Please try again.';
            return;
          }
          status.textContent = 'Uploaded.';
          e.target.reset();
          loadTenantDocuments(currentTenant.user_id);
        });
      });
    });

    // ---- Maintenance ----
    function loadTenantMaintenance(userId) {
      var list = document.getElementById('admin-maint-list');
      list.innerHTML = '<div class="doc-row"><div class="doc-row-main"><div>Loading maintenance reports&hellip;</div></div></div>';
      client.from('maintenance_requests').select('*').eq('user_id', userId).order('created_at', { ascending: false }).then(function (result) {
        if (result.error) {
          list.innerHTML = '<div class="doc-row"><div class="doc-row-main"><div>Could not load maintenance reports right now.</div></div></div>';
          return;
        }
        var reports = result.data || [];
        if (reports.length === 0) {
          list.innerHTML = '<div class="doc-row"><div class="doc-row-main"><div>No maintenance issues reported.</div></div></div>';
          return;
        }
        list.innerHTML = '';
        reports.forEach(function (r) {
          var row = document.createElement('div');
          row.className = 'doc-row';
          row.innerHTML =
            '<div class="doc-row-main"><div class="doc-icon">' + maintIconSvg(r.category) + '</div><div>' +
              '<div class="doc-name">' + escapeHtml(r.category || 'Maintenance issue') + '</div>' +
              '<div class="doc-meta">' + escapeHtml(r.description || '') + ' &middot; ' + formatDate(r.created_at) + '</div>' +
            '</div></div>' +
            '<div class="doc-row-actions"><select class="status-select">' +
              ['New', 'In progress', 'Resolved'].map(function (s) {
                return '<option' + (s === r.status ? ' selected' : '') + '>' + s + '</option>';
              }).join('') +
            '</select></div>';
          row.querySelector('select').addEventListener('change', function (e) {
            client.from('maintenance_requests').update({ status: e.target.value }).eq('id', r.id).then(function (updateResult) {
              if (updateResult.error) alert('Could not update the status just now. Please try again.');
            });
          });
          list.appendChild(row);
        });
      });
    }
  });
})();
