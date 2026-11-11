(() => {
    const form = document.getElementById('reward-payment-form');
    const select = document.getElementById('reward-pickup-id');
    const status = document.getElementById('reward-payment-status');
    const list = document.getElementById('reward-payment-list');

    async function refresh() {
        const response = await portalFetch('/api/administrator/pickup-rewards');
        if (!response.ok) throw new Error('Daftar reward gagal dimuat.');
        const {data} = await response.json();
        select.replaceChildren();
        list.replaceChildren();
        for (const row of data) {
            const caption = row.tracking_number + ' · Rp ' + row.amount;
            const li = document.createElement('li');
            li.textContent = caption + (row.status === 'paid' ? ' · Pembayaran tercatat' : ' · Pending');
            if (row.status === 'pending') select.add(new Option(caption, row.pickup_id));
            if (row.status === 'paid') {
                const proof = document.createElement('a');
                proof.href = '/api/administrator/pickup-rewards/' + row.pickup_id + '/proof';
                proof.textContent = 'Unduh bukti';
                li.append(' · ', proof);
            }
            list.append(li);
        }
        form.hidden = select.options.length === 0;
        if (!data.length) status.textContent = 'Belum ada kewajiban reward.';
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const body = new FormData(form);
            if (form.querySelector('#reward-payment-confirm').checked) body.set('confirm_payment', 'true');
            const response = await portalFetch('/api/ecorecycle/process_payout', {method: 'POST', body});
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            form.reset();
            status.textContent = result.message;
            await refresh();
        } catch (error) {
            status.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    });
    refresh().catch(error => { status.textContent = error.message; });
})();
