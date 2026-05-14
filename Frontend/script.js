const BACKEND_BASE_URL = 'http://127.0.0.1:3000/api';

// State
let currentUser = null;
let currentAiQuestion = null;

// DOM Elements
const sections = document.querySelectorAll('.page-section');
const navbar = document.getElementById('navbar');
const loading = document.getElementById('loading');
const toast = document.getElementById('toast');

// --- Routing ---

function showPage(pageId) {
    sections.forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(pageId);
    if (target) target.classList.remove('hidden');
    
    // Update Navbar visibility and links
    if (currentUser) {
        navbar.classList.remove('hidden');
        document.querySelectorAll('.user-only').forEach(el => {
            el.classList.toggle('hidden', currentUser.role !== 'user');
        });
        document.querySelectorAll('.admin-only').forEach(el => {
            el.classList.toggle('hidden', currentUser.role !== 'admin');
        });
    } else {
        navbar.classList.add('hidden');
    }

    // Auto-fetch data if needed
    if (pageId === 'my-complaints-page') fetchMyComplaints();
    if (pageId === 'admin-page') fetchAllComplaints();
}

// --- UI Helpers ---

function showToast(message, isError = false) {
    toast.textContent = message;
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function toggleLoading(show) {
    loading.classList.toggle('hidden', !show);
}

// --- Auth Functions ---

async function checkSession() {
    try {
        const res = await fetch(`${BACKEND_BASE_URL}/auth/me`, { credentials: 'include' });
        if (res.ok) {
            currentUser = await res.json();
            if (currentUser.role === 'admin') showPage('admin-page');
            else showPage('my-complaints-page');
        } else {
            showPage('login-page');
        }
    } catch (err) {
        showPage('login-page');
    }
}

async function sendOtp() {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    if (!name || !email) return showToast('Please fill all fields', true);

    toggleLoading(true);
    try {
        const res = await fetch(`${BACKEND_BASE_URL}/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email })
        });
        const data = await res.json();
        if (res.ok) {
            document.getElementById('register-step-1').classList.add('hidden');
            document.getElementById('register-step-2').classList.remove('hidden');
            showToast(data.message);
        } else {
            showToast(data.message, true);
        }
    } catch (err) {
        showToast('Connection error', true);
    } finally {
        toggleLoading(false);
    }
}

async function register() {
    const email = document.getElementById('reg-email').value;
    const otp = document.getElementById('reg-otp').value;
    const password = document.getElementById('reg-pass').value;
    const confirmPass = document.getElementById('reg-confirm-pass').value;

    if (password !== confirmPass) return showToast('Passwords do not match', true);
    if (password.length < 6) return showToast('Password too short', true);

    toggleLoading(true);
    try {
        const res = await fetch(`${BACKEND_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, password })
        });
        const data = await res.json();
        if (res.ok) {
            showToast('Registration successful! Please login.');
            showPage('login-page');
        } else {
            showToast(data.message, true);
        }
    } catch (err) {
        showToast('Registration failed', true);
    } finally {
        toggleLoading(false);
    }
}

async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-pass').value;

    toggleLoading(true);
    try {
        const res = await fetch(`${BACKEND_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: 'include'
        });
        const data = await res.json();
        if (res.ok) {
            currentUser = data;
            if (currentUser.role === 'admin') showPage('admin-page');
            else showPage('my-complaints-page');
            showToast(`Welcome, ${currentUser.name}!`);
        } else {
            showToast(data.message, true);
        }
    } catch (err) {
        showToast('Login failed', true);
    } finally {
        toggleLoading(false);
    }
}

async function logout() {
    await fetch(`${BACKEND_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    currentUser = null;
    showPage('login-page');
}

// --- Complaint Functions ---

async function getAiQuestion() {
    const text = document.getElementById('complaint-text').value;
    if (!text) return showToast('Please describe your complaint', true);

    toggleLoading(true);
    try {
        const res = await fetch(`${BACKEND_BASE_URL}/ai/question`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ complaint_text: text }),
            credentials: 'include'
        });
        const data = await res.json();
        if (res.ok) {
            currentAiQuestion = data.question;
            document.getElementById('ai-question-text').textContent = currentAiQuestion;
            document.getElementById('ai-section').classList.remove('hidden');
            showToast('AI analysis complete');
        } else {
            showToast(data.message, true);
        }
    } catch (err) {
        showToast('AI analysis failed', true);
    } finally {
        toggleLoading(false);
    }
}

async function submitComplaint() {
    const text = document.getElementById('complaint-text').value;
    const answer = document.getElementById('ai-answer').value;

    toggleLoading(true);
    try {
        const res = await fetch(`${BACKEND_BASE_URL}/complaints`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                complaint_text: text, 
                ai_question: currentAiQuestion, 
                ai_answer: answer 
            }),
            credentials: 'include'
        });
        if (res.ok) {
            showToast('Complaint submitted successfully!');
            showPage('my-complaints-page');
            // Clear form
            document.getElementById('complaint-text').value = '';
            document.getElementById('ai-answer').value = '';
            document.getElementById('ai-section').classList.add('hidden');
        } else {
            showToast('Submission failed', true);
        }
    } catch (err) {
        showToast('Connection error', true);
    } finally {
        toggleLoading(false);
    }
}

async function fetchMyComplaints() {
    const container = document.getElementById('complaints-list');
    container.innerHTML = '<p>Loading your complaints...</p>';
    
    try {
        const res = await fetch(`${BACKEND_BASE_URL}/complaints/my`, { credentials: 'include' });
        const data = await res.json();
        if (res.ok) {
            container.innerHTML = data.length ? '' : '<p>No complaints yet.</p>';
            data.forEach(c => {
                const date = new Date(c.created_at).toLocaleDateString();
                container.innerHTML += `
                    <div class="complaint-item animate-fade-in">
                        <div class="item-header">
                            <span>ID: #${c.id}</span>
                            <span>${date}</span>
                        </div>
                        <div class="item-content">
                            <h4>Original Complaint</h4>
                            <p>${c.complaintText}</p>
                            ${c.aiQuestion ? `
                                <h4>AI Follow-up</h4>
                                <p><em>${c.aiQuestion}</em></p>
                                <h4>Your Answer</h4>
                                <p>${c.userAnswer || 'No answer provided'}</p>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
        }
    } catch (err) {
        container.innerHTML = '<p class="error">Failed to load complaints.</p>';
    }
}

async function fetchAllComplaints() {
    const container = document.getElementById('admin-complaints-list');
    container.innerHTML = '<p>Loading all complaints...</p>';
    
    try {
        const res = await fetch(`${BACKEND_BASE_URL}/admin/complaints`, { credentials: 'include' });
        const data = await res.json();
        if (res.ok) {
            container.innerHTML = data.length ? '' : '<p>No complaints found in system.</p>';
            data.forEach(c => {
                const date = new Date(c.created_at).toLocaleDateString();
                container.innerHTML += `
                    <div class="complaint-item animate-fade-in">
                        <div class="admin-info">
                            <strong>${c.userName}</strong>
                            <span>${c.userEmail}</span>
                        </div>
                        <div class="item-header">
                            <span>ID: #${c.id}</span>
                            <span>${date}</span>
                        </div>
                        <div class="item-content">
                            <h4>Complaint</h4>
                            <p>${c.complaintText}</p>
                            <h4>AI Interaction</h4>
                            <p><strong>Q:</strong> ${c.aiQuestion}</p>
                            <p><strong>A:</strong> ${c.userAnswer}</p>
                        </div>
                    </div>
                `;
            });
        }
    } catch (err) {
        container.innerHTML = '<p class="error">Failed to load complaints.</p>';
    }
}

// --- Event Listeners ---

document.getElementById('btn-send-otp').addEventListener('click', sendOtp);
document.getElementById('btn-verify-otp').addEventListener('click', () => {
    if (document.getElementById('reg-otp').value.length === 6) {
        document.getElementById('register-step-2').classList.add('hidden');
        document.getElementById('register-step-3').classList.remove('hidden');
    } else {
        showToast('Please enter a 6-digit OTP', true);
    }
});
document.getElementById('btn-register').addEventListener('click', register);
document.getElementById('btn-login').addEventListener('click', login);
document.getElementById('logout-btn').addEventListener('click', logout);
document.getElementById('btn-get-ai-question').addEventListener('click', getAiQuestion);
document.getElementById('btn-submit-full').addEventListener('click', submitComplaint);

document.getElementById('nav-my-complaints').addEventListener('click', () => showPage('my-complaints-page'));
document.getElementById('nav-submit').addEventListener('click', () => showPage('submission-page'));
document.getElementById('nav-admin').addEventListener('click', () => showPage('admin-page'));

// Init
window.onload = checkSession;
