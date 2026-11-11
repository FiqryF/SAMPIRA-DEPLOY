(function () {
    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        })[char]);
    }

    async function load(sectionId, listId) {
        const section = document.getElementById(sectionId);
        const list = document.getElementById(listId);
        if (!section || !list) return;

        try {
            const response = await portalFetch('/api/ecorecycle/announcements');
            const result = await response.json();
            if (result.status !== 'success' || !result.data || result.data.length === 0) {
                section.style.display = 'none';
                return;
            }

            list.innerHTML = result.data.slice(0, 4).map(item => {
                const date = new Date(item.created_at).toLocaleDateString('id-ID', {
                    day: 'numeric', month: 'short', year: 'numeric'
                });
                return `
                    <article class="portal-announcement-item">
                        <div class="portal-announcement-icon"><i class="fas fa-circle-info"></i></div>
                        <div>
                            <h4>${escapeHTML(item.title)}</h4>
                            <p>${escapeHTML(item.message)}</p>
                            <span>${date}</span>
                        </div>
                    </article>
                `;
            }).join('');
            section.style.display = 'block';
        } catch (error) {
            console.error('Gagal memuat pengumuman portal:', error);
        }
    }

    window.PortalAnnouncements = { escapeHTML, load };

    document.addEventListener('DOMContentLoaded', async () => {
        await Promise.all([
            load('warrior-announcement-section', 'warrior-announcement-list'),
            load('collector-announcement-section', 'collector-announcement-list')
        ]);
    });
})();
