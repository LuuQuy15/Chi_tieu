// api/expenses.js — Vercel Serverless Function
const { neon } = require('@neondatabase/serverless');

async function getDb() {
    const sql = neon(process.env.DATABASE_URL);
    await sql`
        CREATE TABLE IF NOT EXISTS expenses (
            id        BIGINT PRIMARY KEY,
            note      TEXT    NOT NULL,
            amount    NUMERIC NOT NULL,
            cat       TEXT    NOT NULL,
            date      TEXT    NOT NULL,
            year      INTEGER NOT NULL,
            month     INTEGER NOT NULL
        )
    `;
    return sql;
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const sql = await getDb();

        if (req.method === 'GET') {
            const { year, month } = req.query;
            if (!year || month === undefined) return res.status(400).json({ error: 'Thiếu year hoặc month' });
            const rows = await sql`
                SELECT * FROM expenses
                WHERE year = ${Number(year)} AND month = ${Number(month)}
                ORDER BY id DESC
            `;
            return res.status(200).json(rows);
        }

        if (req.method === 'POST') {
            const { id, note, amount, cat, date, year, month } = req.body;
            if (!note || !amount || !cat || !date || year === undefined || month === undefined)
                return res.status(400).json({ error: 'Thiếu dữ liệu' });
            await sql`
                INSERT INTO expenses (id, note, amount, cat, date, year, month)
                VALUES (${id}, ${note}, ${Number(amount)}, ${cat}, ${date}, ${Number(year)}, ${Number(month)})
            `;
            return res.status(200).json({ ok: true });
        }

        if (req.method === 'DELETE') {
            const urlParts = req.url.split('/');
            const id = urlParts[urlParts.length - 1];
            if (!id || isNaN(Number(id))) return res.status(400).json({ error: 'ID không hợp lệ' });
            await sql`DELETE FROM expenses WHERE id = ${Number(id)}`;
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: 'Method không được hỗ trợ' });

    } catch (err) {
        console.error('Lỗi database:', err);
        return res.status(500).json({ error: 'Lỗi server: ' + err.message });
    }
};