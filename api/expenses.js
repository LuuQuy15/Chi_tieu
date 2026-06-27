// api/expenses.js — Vercel Serverless Function (có xác thực)
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

// ─── Xác minh JWT (copy từ auth.js vì Vercel không share module dễ) ─────
function verifyToken(token) {
    try {
        const [header, payload, signature] = token.split('.');
        const secret = process.env.JWT_SECRET || 'chitieu-secret-key-2024';
        const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
        if (signature !== expected) return null;
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (data.exp < Math.floor(Date.now() / 1000)) return null;
        return data;
    } catch {
        return null;
    }
}

// ─── Lấy userId từ request header ────────────────────────
function getUserId(req) {
    const auth = req.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    if (!token) return null;
    const data = verifyToken(token);
    return data ? data.userId : null;
}

// ─── Khởi tạo DB (thêm cột user_id) ─────────────────────
async function getDb() {
    const sql = neon(process.env.DATABASE_URL);
    // Tạo bảng mới có user_id
    await sql`
        CREATE TABLE IF NOT EXISTS expenses (
            id        BIGINT PRIMARY KEY,
            user_id   BIGINT NOT NULL DEFAULT 0,
            note      TEXT    NOT NULL,
            amount    NUMERIC NOT NULL,
            cat       TEXT    NOT NULL,
            date      TEXT    NOT NULL,
            year      INTEGER NOT NULL,
            month     INTEGER NOT NULL,
            person    TEXT    NOT NULL DEFAULT ''
        )
    `;
    // Migration an toàn cho bảng cũ
    try {
        await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS user_id BIGINT NOT NULL DEFAULT 0`;
    } catch (_) { /* bỏ qua nếu đã có */ }
    try {
        await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS person TEXT NOT NULL DEFAULT ''`;
    } catch (_) { /* bỏ qua nếu đã có */ }

    return sql;
}

// ─── Handler chính ────────────────────────────────────────
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Xác thực token — bắt buộc với mọi request
    const userId = getUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
    }

    try {
        const sql = await getDb();

        // ── GET: Lấy danh sách chi tiêu của user theo tháng ──
        if (req.method === 'GET') {
            const { year, month } = req.query;
            if (!year || month === undefined) {
                return res.status(400).json({ error: 'Thiếu year hoặc month' });
            }
            const rows = await sql`
                SELECT * FROM expenses
                WHERE user_id = ${userId}
                  AND year = ${Number(year)}
                  AND month = ${Number(month)}
                ORDER BY id DESC
            `;
            return res.status(200).json(rows);
        }

        // ── POST: Thêm khoản chi ──
        if (req.method === 'POST') {
            const { id, note, amount, cat, date, year, month, person } = req.body;
            if (!note || !amount || !cat || !date || year === undefined || month === undefined) {
                return res.status(400).json({ error: 'Thiếu dữ liệu' });
            }
            await sql`
                INSERT INTO expenses (id, user_id, note, amount, cat, date, year, month, person)
                VALUES (${id}, ${userId}, ${note}, ${Number(amount)}, ${cat}, ${date}, ${Number(year)}, ${Number(month)}, ${person || ''})
            `;
            return res.status(200).json({ ok: true });
        }

        // ── DELETE: Xoá khoản chi (chỉ xoá của chính user) ──
        if (req.method === 'DELETE') {
            const id = req.query.id;
            if (!id || isNaN(Number(id))) {
                return res.status(400).json({ error: 'ID không hợp lệ' });
            }
            await sql`DELETE FROM expenses WHERE id = ${Number(id)} AND user_id = ${userId}`;
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: 'Method không được hỗ trợ' });

    } catch (err) {
        console.error('Lỗi database:', err);
        return res.status(500).json({ error: 'Lỗi server: ' + err.message });
    }
};