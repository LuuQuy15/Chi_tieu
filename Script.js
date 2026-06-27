const CATS = {
    'Ăn uống': { icon: '🍜', color: '#F59E0B', bg: '#FFF8E1' },
    'Mua sắm': { icon: '🛍', color: '#EC4899', bg: '#FDF2F8' },
    'Di chuyển': { icon: '🚌', color: '#3B82F6', bg: '#EFF6FF' },
    'Giải trí': { icon: '🎬', color: '#8B5CF6', bg: '#F5F3FF' },
    'Sức khỏe': { icon: '💊', color: '#10B981', bg: '#ECFDF5' },
    'Học tập': { icon: '📚', color: '#06B6D4', bg: '#ECFEFF' },
    'Hoá đơn': { icon: '⚡', color: '#F97316', bg: '#FFF7ED' },
    'Khác': { icon: '📦', color: '#9CA3AF', bg: '#F9FAFB' },
};

let currentFilter = 'all';
let viewDate = new Date();

// ─── Giao tiếp với server (thay thế localStorage) ───────

async function loadData() {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth(); // 0-11
    try {
        const res = await fetch(`/api/expenses?year=${y}&month=${m}`);
        if (!res.ok) {
            console.error('Lỗi tải dữ liệu:', res.status, await res.text());
            return [];
        }
        const data = await res.json();
        // Đảm bảo luôn trả về mảng, tránh crash nếu server trả về object lỗi
        return Array.isArray(data) ? data : [];
    } catch (err) {
        console.error('Lỗi kết nối server:', err);
        return [];
    }
}

async function addToServer(expense) {
    const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expense)
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Lỗi không xác định' }));
        throw new Error(err.error || 'Lỗi server khi lưu dữ liệu');
    }
    return await res.json();
}

async function deleteFromServer(id) {
    const res = await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Lỗi không xác định' }));
        throw new Error(err.error || 'Lỗi server khi xóa');
    }
}

// ─── Tiện ích ────────────────────────────────────────────

function fmt(n) {
    return Number(n).toLocaleString('vi-VN') + ' ₫';
}

function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Thêm & xoá ─────────────────────────────────────────

async function addExpense() {
    const note = document.getElementById('inp-note').value.trim();
    const amount = parseFloat(document.getElementById('inp-amount').value);
    const cat = document.getElementById('inp-cat').value;
    if (!note || !amount || amount <= 0) {
        alert('Vui lòng điền đủ mô tả và số tiền.');
        return;
    }
    const expense = {
        id: Date.now(),
        note,
        amount,
        cat,
        date: today(),
        year: viewDate.getFullYear(),
        month: viewDate.getMonth()
    };
    try {
        await addToServer(expense);
        // Chỉ xóa ô nhập sau khi lưu thành công
        document.getElementById('inp-note').value = '';
        document.getElementById('inp-amount').value = '';
        await render();
    } catch (err) {
        console.error('Lỗi thêm khoản chi:', err);
        alert('❌ Không thể lưu: ' + err.message + '\n\nKiểm tra kết nối mạng hoặc cấu hình DATABASE_URL.');
    }
}

async function deleteExpense(id) {
    try {
        await deleteFromServer(id);
        await render();
    } catch (err) {
        console.error('Lỗi xóa:', err);
        alert('❌ Không thể xóa: ' + err.message);
    }
}

// ─── Lọc theo danh mục ──────────────────────────────────

function setFilter(cat) {
    currentFilter = cat;
    document.querySelectorAll('.pill').forEach(p => {
        p.classList.toggle('active', p.dataset.cat === cat);
    });
    // Chỉ vẽ lại danh sách, không cần tải lại dữ liệu
    renderList(window._cachedData || []);
}

// ─── Cập nhật nhãn tháng ────────────────────────────────

function updateMonthLabel() {
    const months = [
        'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
        'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
    ];
    document.getElementById('month-label').textContent =
        months[viewDate.getMonth()] + ' ' + viewDate.getFullYear();
}

// ─── Vẽ lại toàn bộ giao diện ───────────────────────────

async function render() {
    updateMonthLabel();
    const allData = await loadData();
    window._cachedData = allData; // lưu tạm để setFilter dùng lại

    // Tổng kết
    const nowStr = today();
    const total = allData.reduce((s, e) => s + e.amount, 0);
    const todayTotal = allData.filter(e => e.date === nowStr).reduce((s, e) => s + e.amount, 0);
    const days = new Set(allData.map(e => e.date)).size || 1;
    document.getElementById('sum-total').textContent = fmt(total);
    document.getElementById('sum-count').textContent = allData.length + ' khoản chi';
    document.getElementById('sum-today').textContent = fmt(todayTotal);
    document.getElementById('sum-avg').textContent = fmt(Math.round(total / days));

    // Tổng theo danh mục
    const catTotals = {};
    allData.forEach(e => { catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount; });
    const maxCat = Math.max(...Object.values(catTotals), 1);

    // Bộ lọc dạng pill
    const filterRow = document.getElementById('filter-row');
    filterRow.innerHTML = `<div class="pill ${currentFilter === 'all' ? 'active' : ''}" data-cat="all" onclick="setFilter('all')"><span>Tất cả</span></div>`;
    Object.keys(catTotals).sort().forEach(cat => {
        const c = CATS[cat] || CATS['Khác'];
        filterRow.innerHTML += `<div class="pill ${currentFilter === cat ? 'active' : ''}" data-cat="${cat}" onclick="setFilter('${cat}')">
      <span style="font-size:14px">${c.icon}</span><span>${cat}</span>
    </div>`;
    });

    // Biểu đồ cột theo danh mục
    const catBars = document.getElementById('cat-bars');
    if (Object.keys(catTotals).length === 0) {
        catBars.innerHTML = '<div class="empty-state">Chưa có dữ liệu trong tháng này</div>';
    } else {
        catBars.innerHTML = Object.entries(catTotals)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, val]) => {
                const c = CATS[cat] || CATS['Khác'];
                const pct = Math.round(val / maxCat * 100);
                return `<div class="cat-bar-row">
          <div class="cat-bar-label"><span style="font-size:16px">${c.icon}</span>${cat}</div>
          <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${pct}%;background:${c.color}"></div></div>
          <div class="cat-bar-val">${fmt(val)}</div>
        </div>`;
            }).join('');
    }

    renderList(allData);
}

// ─── Vẽ danh sách chi tiêu ──────────────────────────────

function renderList(allData) {
    const nowStr = today();
    const filtered = currentFilter === 'all' ? allData : allData.filter(e => e.cat === currentFilter);
    const byDate = {};
    filtered.forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    const list = document.getElementById('expense-list');
    if (sortedDates.length === 0) {
        list.innerHTML = '<div class="empty-state">Không có khoản chi nào</div>';
        return;
    }

    const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    list.innerHTML = sortedDates.map(date => {
        const [y, m, d] = date.split('-').map(Number);
        const dayObj = new Date(y, m - 1, d);
        const isToday = date === nowStr;
        const dayLabel = isToday
            ? `Hôm nay — ${d}/${m}/${y}`
            : `${dayNames[dayObj.getDay()]}, ${d}/${m}/${y}`;
        const dayTotal = byDate[date].reduce((s, e) => s + e.amount, 0);

        const rows = byDate[date]
            .sort((a, b) => b.id - a.id)
            .map(e => {
                const c = CATS[e.cat] || CATS['Khác'];
                return `<div class="expense-row">
          <div class="cat-icon" style="background:${c.bg}">${c.icon}</div>
          <div class="exp-info">
            <div class="exp-note">${e.note}</div>
            <div class="exp-cat">${e.cat}</div>
          </div>
          <div class="exp-amount">${fmt(e.amount)}</div>
          <button class="btn-del" onclick="deleteExpense(${e.id})" title="Xoá"><i class="fa fa-trash-can"></i></button>
        </div>`;
            }).join('');

        return `<div class="day-group">
      <div class="day-header">
        <span class="day-date">${dayLabel}</span>
        <span class="day-total">${fmt(dayTotal)}</span>
      </div>
      ${rows}
    </div>`;
    }).join('');
}

// ─── Event listeners ─────────────────────────────────────

document.getElementById('prev-month').onclick = () => {
    viewDate.setMonth(viewDate.getMonth() - 1);
    currentFilter = 'all';
    render();
};
document.getElementById('next-month').onclick = () => {
    viewDate.setMonth(viewDate.getMonth() + 1);
    currentFilter = 'all';
    render();
};
document.getElementById('inp-note').addEventListener('keydown', e => {
    if (e.key === 'Enter') addExpense();
});
document.getElementById('inp-amount').addEventListener('keydown', e => {
    if (e.key === 'Enter') addExpense();
});

render();