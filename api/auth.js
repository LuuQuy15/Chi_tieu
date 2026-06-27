// api/auth.js — Xử lý đăng ký & đăng nhập
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

// ─── Hash mật khẩu đơn giản bằng SHA-256 + salt ─────────
function hashPassword(password, salt) {
    return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

function generateSalt() {
    return crypto.randomBytes(16).toString('hex');
}

// ─── Tạo JWT đơn giản (không dùng thư viện ngoài) ────────
function createToken(userId, username) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
        userId,
        username,
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 ngày
    })).toString('base64url');
    const secret = process.env.JWT_SECRET || 'chitieu-secret-key-2024';
    const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
    try {
        const [header, payload, signature] = token.split('.');
        const secret = process.env.JWT_SECRET || 'chitieu-secret-key-2024';
        const expected = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
        if (signature !== expected) return null;
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (data.exp < Math.floor(Date.now() / 1000)) return null; // hết hạn
        return data;
    } catch {
        return null;
    }
}

// ─── Khởi tạo DB ─────────────────────────────────────────
async function getDb() {
    const sql = neon(process.env.DATABASE_URL);
    await sql`
        CREATE TABLE IF NOT EXISTS users (
            id        BIGSERIAL PRIMARY KEY,
            username  TEXT UNIQUE NOT NULL,
            salt      TEXT NOT NULL,
            password  TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `;
    return sql;
}

// ─── Handler chính ────────────────────────────────────────
module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Chỉ hỗ trợ POST' });

    const { action, username, password } = req.body || {};

    if (!action || !username || !password) {
        return res.status(400).json({ error: 'Thiếu action, username hoặc password' });
    }

    // Validate input
    if (username.length < 3 || username.length > 30) {
        return res.status(400).json({ error: 'Username phải từ 3-30 ký tự' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Mật khẩu phải ít nhất 6 ký tự' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ error: 'Username chỉ được dùng chữ, số và dấu _' });
    }

    try {
        const sql = await getDb();

        // ── ĐĂNG KÝ ──
        if (action === 'register') {
            const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
            if (existing.length > 0) {
                return res.status(409).json({ error: 'Username đã tồn tại' });
            }
            const salt = generateSalt();
            const hashed = hashPassword(password, salt);
            const result = await sql`
                INSERT INTO users (username, salt, password)
                VALUES (${username}, ${salt}, ${hashed})
                RETURNING id, username
            `;
            const user = result[0];
            const token = createToken(user.id, user.username);
            return res.status(200).json({ ok: true, token, username: user.username });
        }

        // ── ĐĂNG NHẬP ──
        if (action === 'login') {
            const rows = await sql`SELECT id, username, salt, password FROM users WHERE username = ${username}`;
            if (rows.length === 0) {
                return res.status(401).json({ error: 'Username hoặc mật khẩu không đúng' });
            }
            const user = rows[0];
            const hashed = hashPassword(password, user.salt);
            if (hashed !== user.password) {
                return res.status(401).json({ error: 'Username hoặc mật khẩu không đúng' });
            }
            const token = createToken(user.id, user.username);
            return res.status(200).json({ ok: true, token, username: user.username });
        }

        // ── XÁC MINH TOKEN ──
        if (action === 'verify') {
            const token = (req.headers.authorization || '').replace('Bearer ', '');
            const data = verifyToken(token);
            if (!data) return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
            return res.status(200).json({ ok: true, userId: data.userId, username: data.username });
        }

        return res.status(400).json({ error: 'action không hợp lệ' });

    } catch (err) {
        console.error('Lỗi auth:', err);
        return res.status(500).json({ error: 'Lỗi server: ' + err.message });
    }
};

// Export verifyToken để dùng ở expenses.js
module.exports.verifyToken = verifyToken;