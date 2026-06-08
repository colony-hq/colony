/**
 * Colony HQ — Frontend JavaScript
 * Wallet connect, API calls, page rendering
 */

const API = '';  // Same origin

// State
let state = {
  token: localStorage.getItem('colony_token') || '',
  user: null,
  wallet: localStorage.getItem('colony_wallet') || '',
};

// API helpers
async function api(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['Authorization'] = `Bearer ${state.token}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.detail || 'Request failed');
  return data;
}

// Auth
async function connectWallet() {
  if (typeof window.ethereum === 'undefined') {
    showToast('Install MetaMask or another wallet to connect', 'error');
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const wallet = accounts[0];
    state.wallet = wallet;

    const { message } = await api('GET', `/api/auth/message?wallet=${wallet}`);

    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, wallet],
    });

    const { token, user } = await api('POST', '/api/auth/verify', {
      wallet,
      signature,
    });

    state.token = token;
    state.user = user;
    localStorage.setItem('colony_token', token);
    localStorage.setItem('colony_wallet', wallet);

    updateNavAuth();
    showToast(`Connected: ${wallet.slice(0, 6)}...${wallet.slice(-4)}`, 'success');
  } catch (err) {
    console.error('Auth error:', err);
    showToast(err.message || 'Connection failed', 'error');
  }
}

function disconnect() {
  state.token = '';
  state.user = null;
  state.wallet = '';
  localStorage.removeItem('colony_token');
  localStorage.removeItem('colony_wallet');
  updateNavAuth();
  showToast('Disconnected', 'success');
}

async function loadProfile() {
  if (!state.token) return;
  try {
    state.user = await api('GET', '/api/auth/me');
    updateNavAuth();
  } catch {
    state.token = '';
    localStorage.removeItem('colony_token');
  }
}

function updateNavAuth() {
  const authBtn = document.getElementById('authBtn');
  if (!authBtn) return;

  if (state.token && state.wallet) {
    authBtn.textContent = `${state.wallet.slice(0, 6)}...${state.wallet.slice(-4)}`;
    authBtn.onclick = () => window.location.href = '/dashboard';
    authBtn.classList.remove('btn-outline');
    authBtn.classList.add('btn-primary');
  } else {
    authBtn.textContent = 'Connect Wallet';
    authBtn.onclick = connectWallet;
    authBtn.classList.remove('btn-primary');
    authBtn.classList.add('btn-outline');
  }
}

// Toast
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// Format helpers
function formatPrice(pricingType, priceUsd) {
  if (pricingType === 'free') return 'Free';
  if (pricingType === 'per_use') return `$${priceUsd}/use`;
  return `$${priceUsd}/mo`;
}

function formatPriceClass(pricingType) {
  return pricingType === 'free' ? 'free' : 'paid';
}

function formatInstalls(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function formatRating(n) {
  if (n === 0) return '—';
  return `★ ${n.toFixed(1)}`;
}

function timeAgo(dateStr) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = (now - date) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function agentCard(a) {
  return `
    <a href="/agents/${a.id}" class="agent-card">
      <div class="agent-card-top">
        <div>
          <div class="agent-card-creator">by ${a.creator_name || 'Anonymous'}</div>
          <div class="agent-card-name">${a.name}</div>
        </div>
        <span class="agent-card-category">${a.category}</span>
      </div>
      <div class="agent-card-desc">${a.description}</div>
      <div class="agent-card-meta">
        <div class="agent-card-stats">
          <span class="agent-card-stat"><span class="value">${formatRating(a.rating_avg)}</span></span>
          <span class="agent-card-stat"><span class="value">${formatInstalls(a.installs)}</span> installs</span>
        </div>
        <span class="agent-card-price ${formatPriceClass(a.pricing_type)}">${formatPrice(a.pricing_type, a.price_usd)}</span>
      </div>
    </a>
  `;
}

// Browse page
async function renderBrowse() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get('category') || 'all';
  const sort = params.get('sort') || 'popular';
  const search = params.get('search') || '';

  document.querySelectorAll('.filter-btn[data-category]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });
  document.querySelectorAll('.filter-btn[data-sort]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === sort);
  });

  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = search;

  try {
    const { agents, total } = await api('GET', `/api/agents?category=${category}&sort=${sort}&search=${search}&limit=50`);
    const grid = document.getElementById('agentsGrid');
    const count = document.getElementById('agentsCount');

    if (count) count.textContent = `${total} agent${total !== 1 ? 's' : ''}`;

    if (grid) {
      if (agents.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column: 1/-1">
            <div class="empty-state-title">No agents here</div>
            <div class="empty-state-desc">${search ? `Nothing matches "${search}". Try a different search.` : 'Nobody has published an agent in this category yet.'}</div>
            ${!search ? '<a href="/create" class="btn btn-primary" style="margin-top:16px">Be the first</a>' : ''}
          </div>
        `;
      } else {
        grid.innerHTML = agents.map(a => agentCard(a)).join('');
      }
    }
  } catch (err) {
    console.error('Failed to load agents:', err);
  }
}

function filterCategory(cat) {
  const params = new URLSearchParams(window.location.search);
  params.set('category', cat);
  window.location.search = params.toString();
}

function filterSort(sort) {
  const params = new URLSearchParams(window.location.search);
  params.set('sort', sort);
  window.location.search = params.toString();
}

function searchAgents() {
  const input = document.getElementById('searchInput');
  const params = new URLSearchParams(window.location.search);
  params.set('search', input.value);
  window.location.search = params.toString();
}

// Agent detail page
async function renderAgentDetail() {
  const agentId = window.location.pathname.split('/').pop();
  try {
    const agent = await api('GET', `/api/agents/${agentId}`);
    renderAgentContent(agent);
  } catch (err) {
    document.getElementById('agentContent').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Agent not found</div>
        <div class="empty-state-desc">${err.message}</div>
        <a href="/browse" class="btn btn-outline">Browse Agents</a>
      </div>
    `;
  }
}

function renderAgentContent(agent) {
  const content = document.getElementById('agentContent');
  content.innerHTML = `
    <div class="agent-detail">
      <div>
        <div class="agent-detail-header">
          <div>
            <div class="agent-card-creator">by ${agent.creator_name || 'Anonymous'}</div>
            <div class="agent-detail-name">${agent.name}</div>
          </div>
          <span class="agent-card-category">${agent.category}</span>
        </div>

        <div class="agent-detail-desc">${agent.long_description || agent.description}</div>

        <div class="agent-detail-section">
          <h3>Capabilities</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${(agent.capabilities || []).map(c => `<span class="agent-card-category">${c}</span>`).join('')}
            ${(agent.tags || []).map(t => `<span class="agent-card-category" style="background:#1a1a2e;color:#818cf8">${t}</span>`).join('')}
          </div>
        </div>

        <div class="agent-detail-section">
          <h3>Model</h3>
          <code class="mono" style="color:var(--accent-light)">${agent.model}</code>
        </div>

        <div class="agent-detail-section">
          <h3>Reviews (${agent.rating_count})</h3>
          ${(agent.reviews || []).length === 0 ? '<p style="color:var(--text-muted)">No reviews yet.</p>' : ''}
          ${(agent.reviews || []).map(r => `
            <div class="review-card">
              <div class="review-header">
                <span class="review-author">${r.user_name}</span>
                <span class="review-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
              </div>
              <div class="review-text">${r.comment}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <div>
        <div class="sidebar-card">
          <div class="sidebar-card-price ${agent.pricing_type === 'free' ? 'free' : ''}">${formatPrice(agent.pricing_type, agent.price_usd)}</div>
          <div class="sidebar-card-period">${agent.pricing_type === 'free' ? 'Free forever' : agent.pricing_type === 'per_use' ? 'Per use' : 'Per month'}</div>

          <button class="btn btn-primary btn-lg" onclick="installAgent('${agent.id}')">Deploy Agent</button>
          <button class="btn btn-outline" onclick="window.location.href='/agents/${agent.id}/chat'" style="width:100%">Try it</button>

          <div class="sidebar-card-stats">
            <div>
              <div class="sidebar-stat-label">Installs</div>
              <div class="sidebar-stat-value">${formatInstalls(agent.installs)}</div>
            </div>
            <div>
              <div class="sidebar-stat-label">Rating</div>
              <div class="sidebar-stat-value">${formatRating(agent.rating_avg)}</div>
            </div>
            <div>
              <div class="sidebar-stat-label">Version</div>
              <div class="sidebar-stat-value">${agent.version}</div>
            </div>
            <div>
              <div class="sidebar-stat-label">Status</div>
              <div class="sidebar-stat-value" style="color:var(--success)">${agent.status}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function installAgent(agentId) {
  if (!state.token) {
    showToast('Connect your wallet first', 'error');
    connectWallet();
    return;
  }

  try {
    const result = await api('POST', `/api/agents/${agentId}/install`, {});
    if (result.payment_required) {
      showToast(`Payment required: $${result.payment.total_usdc} USDC on Base`, 'success');
    } else {
      showToast('Agent deployed', 'success');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Dashboard
async function renderDashboard() {
  if (!state.token) {
    window.location.href = '/';
    return;
  }

  try {
    const profile = await api('GET', '/api/auth/me');
    document.getElementById('dashWallet').textContent = `${profile.wallet.slice(0, 6)}...${profile.wallet.slice(-4)}`;

    const earnings = await api('GET', '/api/creator/earnings');
    document.getElementById('dashEarnings').textContent = `$${earnings.total_earnings_usdc.toFixed(2)}`;
    document.getElementById('dashAgents').textContent = earnings.total_agents;
    document.getElementById('dashInstalls').textContent = earnings.total_installs;

    const { agents } = await api('GET', '/api/creator/agents');
    const tbody = document.getElementById('dashAgentsTable');
    if (tbody) {
      if (agents.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px">You haven\'t published any agents yet. <a href="/create">Publish one</a>.</td></tr>';
      } else {
        tbody.innerHTML = agents.map(a => `
          <tr onclick="window.location.href='/agents/${a.id}'">
            <td><strong style="color:var(--text-white)">${a.name}</strong></td>
            <td><span class="status-badge ${a.status === 'active' ? 'success' : 'paused'}">${a.status}</span></td>
            <td>${a.installs}</td>
            <td>${formatRating(a.rating_avg)}</td>
            <td>${formatPrice(a.pricing_type, a.price_usd)}</td>
            <td style="color:var(--success)">$${a.total_revenue.toFixed(2)}</td>
          </tr>
        `).join('');
      }
    }

    const analytics = await api('GET', '/api/creator/analytics');
    document.getElementById('dashReviews').textContent = analytics.total_reviews;
  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

// Create agent
async function createAgent(event) {
  event.preventDefault();
  if (!state.token) {
    showToast('Connect your wallet first', 'error');
    return;
  }

  const form = event.target;
  const data = {
    name: form.name.value,
    description: form.description.value,
    long_description: form.long_description.value,
    category: form.category.value,
    model: form.model.value,
    system_prompt: form.system_prompt.value,
    pricing_type: form.pricing_type.value,
    price_usd: parseFloat(form.price_usd.value) || 0,
    tags: form.tags.value.split(',').map(t => t.trim()).filter(Boolean),
  };

  try {
    const result = await api('POST', '/api/agents', data);
    showToast('Agent published', 'success');
    window.location.href = `/agents/${result.id}`;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Chat
let chatHistory = [];

async function sendChatMessage(agentId) {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;

  input.value = '';

  chatHistory.push({ role: 'user', content: message });
  renderChat();

  const loadingEl = document.createElement('div');
  loadingEl.className = 'chat-message agent';
  loadingEl.innerHTML = `
    <div class="chat-avatar agent">AI</div>
    <div class="chat-bubble agent"><div class="spinner" style="display:inline-block;margin-right:8px"></div> Thinking...</div>
  `;
  document.getElementById('chatMessages').appendChild(loadingEl);
  scrollChat();

  try {
    const result = await api('POST', `/api/agents/${agentId}/chat`, {
      message,
      history: chatHistory.slice(0, -1),
      api_key: localStorage.getItem('colony_api_key') || '',
    });

    loadingEl.remove();
    chatHistory.push({ role: 'assistant', content: result.response });
    renderChat();
  } catch (err) {
    loadingEl.remove();
    chatHistory.push({ role: 'assistant', content: `Error: ${err.message}` });
    renderChat();
  }
}

function renderChat() {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  container.innerHTML = chatHistory.map(msg => `
    <div class="chat-message ${msg.role}">
      <div class="chat-avatar ${msg.role}">${msg.role === 'user' ? 'You' : 'AI'}</div>
      <div class="chat-bubble ${msg.role}">${msg.content}</div>
    </div>
  `).join('');

  scrollChat();
}

function scrollChat() {
  const container = document.getElementById('chatMessages');
  if (container) container.scrollTop = container.scrollHeight;
}
