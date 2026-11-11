// Keep the landing estimate aligned with the server tariff.
const menuToggle = document.querySelector('.menu-toggle');
const mainNav = document.getElementById('main-nav');
document.querySelector('.site-header').dataset.menuReady = '';
function closeMenu() {
    mainNav.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
}
menuToggle.addEventListener('click', () => {
    const expanded = menuToggle.getAttribute('aria-expanded') !== 'true';
    menuToggle.setAttribute('aria-expanded', String(expanded));
    mainNav.classList.toggle('is-open', expanded);
    if (expanded) mainNav.querySelector('a').focus();
});
mainNav.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;
    const wasOpen = menuToggle.getAttribute('aria-expanded') === 'true';
    closeMenu();
    if (wasOpen && link.hash) {
        const target = document.getElementById(link.hash.slice(1));
        if (target) {
            target.tabIndex = -1;
            target.focus({preventScroll: true});
        }
    }
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
        closeMenu();
        menuToggle.focus();
    }
});

const estimator = document.getElementById('estimator');
function updateAnchor() {
    if (location.hash === '#estimator') estimator.open = true;
    for (const link of mainNav.querySelectorAll('a[href^="#"]')) {
        const current = link.hash === (location.hash || '#beranda');
        if (current) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
    }
}
document.addEventListener('click', event => {
    if (event.target.closest('a[href="#estimator"]')) estimator.open = true;
});
window.addEventListener('hashchange', updateAnchor);
updateAnchor();

const estimatorForm = document.getElementById('estimator-form');
const categorySelect = document.getElementById('estimator-category');
populateWasteOptions(categorySelect, 'Computers', {showTariff: false});
const weightInput = document.getElementById('estimator-weight');
const resultCard = document.getElementById('estimator-result-card');
const rupiah = new Intl.NumberFormat('id-ID', {style:'currency',currency:'IDR',maximumFractionDigits:0});
const compactRupiah = (amount) => rupiah.format(amount).replace(/\s/g, '');
const estimateStatus = document.getElementById('estimator-status');
let estimateRequest = 0;
estimatorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!estimatorForm.reportValidity()) return;
    const request = ++estimateRequest;
    const category = wasteCategories.find(item => item.name === categorySelect.value);
    const weight = weightInput.value;
    resultCard.hidden = true;
    estimateStatus.textContent = 'Menghitung estimasi…';
    try {
        const response = await fetch('/api/ecorecycle/estimate_reward', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({category: categorySelect.value, weight_kg: weight})
        });
        const result = await response.json();
        if (request !== estimateRequest) return;
        if (!response.ok) throw new Error(result.message);
        const data = result.data;
        document.getElementById('result-rate-label').textContent = compactRupiah(data.reward_rate) + ' × ' + new Intl.NumberFormat('id-ID').format(data.weight_kg) + ' kg';
        document.getElementById('result-gross-val').textContent = compactRupiah(data.total_estimate);
        document.getElementById('result-fee-val').textContent = compactRupiah(data.processing_fee);
        document.getElementById('result-reward-val').textContent = compactRupiah(data.net_estimate);
        document.getElementById('result-net-val').textContent = compactRupiah(data.net_estimate);
        document.getElementById('estimator-category-note').textContent = category?.note || '';
        estimateStatus.textContent = '';
        resultCard.hidden = false;
    } catch (error) {
        if (request === estimateRequest) estimateStatus.textContent = error.message || 'Estimasi belum tersedia.';
    }
});
estimatorForm.addEventListener('input', () => {
    estimateRequest++;
    resultCard.hidden = true;
    estimateStatus.textContent = '';
});

// Keep scrolling and control transitions optional.
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionToggle = document.querySelector('.motion-toggle');
let motionPaused = false;
function updateMotionControl() {
    const reduced = motionPreference.matches;
    document.body.classList.toggle('motion-paused', motionPaused || reduced);
    motionToggle.disabled = reduced;
    motionToggle.setAttribute('aria-pressed', String(motionPaused || reduced));
    let label = 'Jeda animasi';
    if (motionPaused) label = 'Aktifkan animasi';
    if (reduced) label = 'Animasi nonaktif';
    motionToggle.textContent = label;
}
motionToggle.addEventListener('click', () => {
    motionPaused = !motionPaused;
    updateMotionControl();
});
motionPreference.addEventListener('change', updateMotionControl);
updateMotionControl();
