// ─────── Online leaderboards (Supabase) ───────
// Browser writes directly to a hosted Postgres table. Security is enforced
// by RLS policies on the Supabase side, not by hiding the anon key.
//
// Setup: see README "Leaderboards setup" section.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { state } from './state.js';

// ─── Config: paste your Supabase project URL + anon key here ───
const SUPABASE_URL = 'PASTE_YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'PASTE_YOUR_SUPABASE_ANON_KEY';
const TABLE = 'scores';

// Detect unconfigured state so the module degrades gracefully
const CONFIGURED = !SUPABASE_URL.startsWith('PASTE_') && !SUPABASE_KEY.startsWith('PASTE_');
const supa = CONFIGURED ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// ─── Nickname (saved in localStorage so we don't ask every time) ───
const NICK_KEY = 'scope3d.nickname';
function getNickname(){ return localStorage.getItem(NICK_KEY) || ''; }
function setNickname(n){ localStorage.setItem(NICK_KEY, n); }

// ─── API ───

export async function submitScore({ contract = null } = {}){
  if (!CONFIGURED) {
    showStatus('Leaderboards offline — Supabase not configured.', true);
    return;
  }
  let nickname = getNickname();
  if (!nickname) {
    nickname = (prompt('Nickname (1–24 chars):') || '').trim();
    if (!nickname) return;
    if (nickname.length > 24) nickname = nickname.slice(0, 24);
    setNickname(nickname);
  }
  const payload = {
    nickname,
    score: state.score | 0,
    kills: state.kills | 0,
    headshots: state.headshots | 0,
    contract,
  };
  showStatus('Submitting…');
  const { error } = await supa.from(TABLE).insert(payload);
  if (error) {
    console.error('Leaderboard submit failed:', error);
    showStatus('Submit failed: ' + error.message, true);
    return;
  }
  showStatus('Submitted.');
  // Refresh list if modal is open
  if (modalEl && modalEl.classList.contains('open')) await renderTop();
}

export async function fetchTop(limit = 10){
  if (!CONFIGURED) return [];
  const { data, error } = await supa
    .from(TABLE)
    .select('nickname, score, kills, headshots, contract, created_at')
    .order('score', { ascending: false })
    .limit(limit);
  if (error) { console.error('Leaderboard fetch failed:', error); return []; }
  return data || [];
}

// ─── UI: button + modal ───

let buttonEl = null;
let modalEl = null;
let listEl = null;
let statusEl = null;

function buildUI(){
  // Button: small "🏆 LB" tucked in the top-left HUD area
  buttonEl = document.createElement('button');
  buttonEl.id = 'lbBtn';
  buttonEl.className = 'lb-btn';
  buttonEl.textContent = '🏆';
  buttonEl.title = 'Leaderboard';
  buttonEl.addEventListener('click', openModal);
  document.body.appendChild(buttonEl);

  // Modal
  modalEl = document.createElement('div');
  modalEl.id = 'lbModal';
  modalEl.className = 'lb-modal';
  modalEl.innerHTML = `
    <div class="lb-modal-inner">
      <div class="lb-modal-header">
        <span class="lb-title">Leaderboard</span>
        <button class="lb-close" aria-label="Close">×</button>
      </div>
      <div class="lb-status" id="lbStatus"></div>
      <div class="lb-list" id="lbList"></div>
      <div class="lb-actions">
        <button class="lb-submit">Submit current score</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);
  listEl = modalEl.querySelector('#lbList');
  statusEl = modalEl.querySelector('#lbStatus');
  modalEl.querySelector('.lb-close').addEventListener('click', closeModal);
  modalEl.querySelector('.lb-submit').addEventListener('click', () => submitScore());
  modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });
}

async function openModal(){
  modalEl.classList.add('open');
  await renderTop();
}
function closeModal(){ modalEl.classList.remove('open'); }

async function renderTop(){
  if (!CONFIGURED) {
    listEl.innerHTML = '<div class="lb-empty">Leaderboards offline.<br><small>Edit src/leaderboard.js with your Supabase URL + key. See README.</small></div>';
    return;
  }
  listEl.innerHTML = '<div class="lb-loading">Loading…</div>';
  const rows = await fetchTop(10);
  if (!rows.length) { listEl.innerHTML = '<div class="lb-empty">No scores yet — be the first.</div>'; return; }
  listEl.innerHTML = rows.map((r, i) => `
    <div class="lb-row">
      <span class="lb-rank">${i+1}</span>
      <span class="lb-name">${escapeHtml(r.nickname)}</span>
      <span class="lb-score">$${r.score.toLocaleString()}</span>
      <span class="lb-extra">${r.kills} kills · ${r.headshots} HS</span>
    </div>
  `).join('');
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

let _statusTimer = null;
function showStatus(msg, isError = false){
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = 'lb-status' + (isError ? ' error' : '');
  clearTimeout(_statusTimer);
  _statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 3500);
}

// ─── Init (called from main.js) ───
export function initLeaderboard(){
  buildUI();
}
