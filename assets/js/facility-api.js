export const base = '/api/ecorecycle/facility-reports';

class ReportError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

export async function request(path, options) {
    const signal = AbortSignal.timeout(15000);
    try {
        const response = await fetch(path, {credentials: 'same-origin', ...options, signal});
        if (response.status === 401) window.dispatchEvent(new Event('sampira:session-ended'));
        const payload = await response.json().catch(() => null);
        if (signal.aborted) throw signal.reason;
        if (!response.ok) throw new ReportError(response.status, payload?.message);
        if (payload?.status !== 'success' || !payload.data) {
            throw new ReportError(0, 'Respons layanan laporan tidak dapat dibaca.');
        }
        return payload.data;
    } catch (error) {
        if (error instanceof ReportError) throw error;
        const message = signal.aborted ? 'Waktu tunggu habis.' : 'Koneksi ke layanan laporan terputus.';
        throw new ReportError(0, message);
    }
}
