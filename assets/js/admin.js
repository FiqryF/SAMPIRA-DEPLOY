function cmsNotice(options) {
    if (window.Swal) return Swal.fire(options);
    if (options.showCancelButton) return {isConfirmed: window.confirm(options.title)};
    window.alert(options.text || options.title);
}

let globalAnnouncements = [];

async function loadAdminAnnouncements() {
    const list = document.getElementById('announcement-admin-list');
    if (!list) return;

    try {
        const response = await portalFetch('/api/ecorecycle/announcements');
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message);
        globalAnnouncements = result.data || [];
        renderAdminAnnouncements();
    } catch (error) {
        list.innerHTML = '<div class="portal-empty-state">Pengumuman belum dapat dimuat.</div>';
        console.error('Error loading announcements:', error);
    }
}

function renderAdminAnnouncements() {
    const list = document.getElementById('announcement-admin-list');
    const count = document.getElementById('announcement-count');
    if (!list) return;
    if (count) count.innerText = `${globalAnnouncements.length} konten`;

    if (globalAnnouncements.length === 0) {
        list.innerHTML = '<div class="portal-empty-state">Belum ada pengumuman. Buat konten pertama dari formulir.</div>';
        return;
    }

    const escape = escapePortalHTML;
    const roleLabels = { all: 'Semua peran', user: 'Warga', petugas: 'Petugas' };
    list.innerHTML = globalAnnouncements.map(item => {
        const date = new Date(item.created_at).toLocaleDateString('id-ID', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
        return `
            <article class="cms-announcement-item ${item.is_active ? '' : 'is-inactive'}">
                <div class="cms-announcement-copy">
                    <div class="cms-announcement-meta">
                        <span class="cms-role-tag">${roleLabels[item.target_role] || 'Semua peran'}</span>
                        <span>${date}</span>
                    </div>
                    <h4>${escape(item.title)}</h4>
                    <p>${escape(item.message)}</p>
                </div>
                <div class="cms-announcement-actions">
                    <button type="button" class="cms-icon-btn ${item.is_active ? 'active' : ''}" title="${item.is_active ? 'Nonaktifkan' : 'Aktifkan'}" onclick="toggleAnnouncement(${item.id}, ${!item.is_active})">
                        ${item.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button type="button" class="cms-icon-btn danger" title="Hapus" onclick="deleteAnnouncement(${item.id})">
                        Hapus
                    </button>
                </div>
            </article>
        `;
    }).join('');
}

async function toggleAnnouncement(id, active) {
    try {
        const response = await portalFetch('api/ecorecycle/announcements', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: 'toggle', id, is_active: active })
        });
        const result = await response.json();
        if (result.status === 'success') {
            await loadAdminAnnouncements();
        } else {
            await cmsNotice({ icon: 'error', title: 'Gagal', text: result.message });
        }
    } catch (error) {
        await cmsNotice({icon: 'error', title: 'Gagal', text: error.message || 'Gagal menghubungi server.'});
    }
}

async function deleteAnnouncement(id) {
    const confirmation = await cmsNotice({
        icon: 'warning',
        title: 'Hapus pengumuman?',
        text: 'Konten akan dihapus dari seluruh portal tujuan.',
        showCancelButton: true,
        confirmButtonText: 'Hapus',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#c34444'
    });
    if (!confirmation.isConfirmed) return;

    try {
        const response = await portalFetch(`api/ecorecycle/announcements?id=${id}`, {
            method: 'DELETE',
        });
        const result = await response.json();
        if (result.status === 'success') {
            await loadAdminAnnouncements();
        } else {
            await cmsNotice({ icon: 'error', title: 'Gagal', text: result.message });
        }
    } catch (error) {
        await cmsNotice({icon: 'error', title: 'Gagal', text: error.message || 'Gagal menghubungi server.'});
    }
}

const announcementForm = document.getElementById('announcement-form');
if (announcementForm) {
    announcementForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const submitButton = this.querySelector('button[type="submit"]');
        submitButton.disabled = true;

        try {
            const response = await portalFetch('api/ecorecycle/announcements', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title: document.getElementById('announcement-title').value.trim(),
                    message: document.getElementById('announcement-message').value.trim(),
                    target_role: document.getElementById('announcement-target').value
                })
            });
            const result = await response.json();
            if (result.status !== 'success') throw new Error(result.message);
            this.reset();
            await loadAdminAnnouncements();
            await cmsNotice({ icon: 'success', title: 'Diterbitkan', text: 'Pengumuman sudah tampil pada portal tujuan.', timer: 1600, showConfirmButton: false });
        } catch (error) {
            await cmsNotice({ icon: 'error', title: 'Gagal', text: error.message || 'Pengumuman gagal diterbitkan.' });
        } finally {
            submitButton.disabled = false;
        }
    });
}


document.addEventListener('DOMContentLoaded', loadAdminAnnouncements);
