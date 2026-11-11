const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const count = value => new Intl.NumberFormat('id-ID').format(value);

// Counts remain independent indicators; no percentages or invented time series.
export function countChart(title, rows, description = '', columns = false) {
    const values = rows.filter(row => Number.isFinite(row.value) && row.value >= 0);
    const max = Math.max(1, ...values.map(row => row.value));
    return `<section class="admin-count-chart${columns ? ' admin-count-chart--columns' : ''}"><header><h3>${escape(title)}</h3><p>${escape(description)}</p></header>
        <div class="admin-chart-axis"><span>0</span><span>${count(max)} catatan</span></div>
        <div class="admin-chart-rows">${values.map(row => ("<div class=\"admin-chart-row\" data-chart-key=\"" + String(escape(row.key)) + "\" data-chart-value=\"" + String(row.value) + "\">\n            <span>" + String(escape(row.label)) + "</span><svg viewBox=\"0 0 100 " + String(columns ? 100 : 12) + "\" preserveAspectRatio=\"none\" role=\"img\" aria-label=\"" + String(escape(row.label)) + ": " + String(count(row.value)) + "\"><title>" + String(escape(row.label)) + ": " + String(count(row.value)) + "</title>" + String(columns ? ("<rect x=\"30\" y=\"" + String(100-row.value/max*100) + "\" width=\"40\" height=\"" + String(row.value/max*100) + "\" rx=\"3\" fill=\"#277553\"/>") : ("<rect width=\"100\" height=\"12\" rx=\"3\" fill=\"#eaf3eb\"/><rect width=\"" + String(row.value/max*100) + "\" height=\"12\" rx=\"3\" fill=\"#277553\"/>")) + "</svg><strong>" + String(count(row.value)) + "</strong></div>")).join('')}</div>
        ${!values.some(row => row.value > 0) ? '<p class="admin-chart-empty">Belum ada catatan untuk indikator ini.</p>' : ''}</section>`;
}
