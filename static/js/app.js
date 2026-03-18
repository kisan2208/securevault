const API_URL = '/api';

// DOM Elements
const formCreateVault = document.getElementById('formCreateVault');
const formAccessVault = document.getElementById('formAccessVault');
const miniDropZone = document.getElementById('miniDropZone');
const reqFilesInput = document.getElementById('regFiles');
const miniUploadText = document.getElementById('miniUploadText');

// Mini Upload Zone Drag/Drop handling
if (miniDropZone && reqFilesInput) {
    const preventDefaults = (e) => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        miniDropZone.addEventListener(eventName, preventDefaults, false);
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        miniDropZone.addEventListener(eventName, () => miniDropZone.classList.add('dragover'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        miniDropZone.addEventListener(eventName, () => miniDropZone.classList.remove('dragover'), false);
    });
    
    miniDropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        reqFilesInput.files = dt.files;
        updateMiniUploadText();
    }, false);
    
    reqFilesInput.addEventListener('change', updateMiniUploadText);
    
    function updateMiniUploadText() {
        const count = reqFilesInput.files.length;
        if (count > 0) {
            miniUploadText.innerHTML = `<span style="color: var(--primary)">${count} file(s) selected Ready to vault!</span>`;
        } else {
            miniUploadText.textContent = 'Click or Drop files here';
        }
    }
}

// Check Auth state
function checkAuth() {
    const token = localStorage.getItem('token');
    const path = window.location.pathname;

    if (token && path === '/') {
        window.location.href = '/dashboard';
    } else if (!token && path === '/dashboard') {
        window.location.href = '/';
    }
}

// Access Vault
if (formAccessVault) {
    formAccessVault.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const errDiv = document.getElementById('loginError');

        try {
            const res = await fetch(`${API_URL}/access_vault`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            let data;
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                data = await res.json();
            } else {
                const text = await res.text();
                data = { error: `Server error (${res.status})` };
            }

            if (res.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', data.user.username);
                window.location.href = '/dashboard';
            } else {
                errDiv.textContent = data.error || 'Access Denied: Incorrect Vault Name or Password';
            }
        } catch (err) {
            errDiv.textContent = 'Connection error: ' + err.message;
        }
    });
}

// Create Vault
if (formCreateVault) {
    formCreateVault.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('regUsername').value;
        const password = document.getElementById('regPassword').value;
        const btnCreate = document.getElementById('btnCreate');
        const errDiv = document.getElementById('regError');
        const successDiv = document.getElementById('regSuccess');
        
        errDiv.textContent = '';
        successDiv.textContent = '';
        btnCreate.disabled = true;
        btnCreate.textContent = 'Creating Vault & Uploading...';

        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);
            
            if (reqFilesInput && reqFilesInput.files.length > 0) {
                for (let i = 0; i < reqFilesInput.files.length; i++) {
                    formData.append('files', reqFilesInput.files[i]);
                }
            }

            const res = await fetch(`${API_URL}/create_vault`, {
                method: 'POST',
                body: formData
            });
            
            // Safely parse response — Flask may return HTML on errors like 413
            let data;
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                data = await res.json();
            } else {
                const text = await res.text();
                data = { error: `Server error (${res.status}): ${text.substring(0, 100)}` };
            }

            if (res.ok) {
                successDiv.textContent = data.message;
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', data.user.username);
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1500);
            } else {
                errDiv.textContent = data.error || 'Vault creation failed';
                btnCreate.disabled = false;
                btnCreate.textContent = 'Create Vault & Upload';
            }
        } catch (err) {
            errDiv.textContent = 'Connection error: ' + err.message;
            btnCreate.disabled = false;
            btnCreate.textContent = 'Create Vault & Upload';
        }
    });
}

// Logout
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        window.location.href = '/';
    });
}

// Load Footer Promotion
async function loadPromotion() {
    try {
        const res = await fetch(`${API_URL}/promotion`);
        const data = await res.json();
        
        if (data.image_url && data.link_url) {
            const promoImg = document.getElementById('promoImg');
            const promoLink = document.getElementById('promoLink');
            if (promoImg && promoLink) {
                promoImg.src = data.image_url;
                promoImg.style.display = 'block';
                promoLink.href = data.link_url;
            }
        }
    } catch (e) {
        console.error('Failed to load promotions');
    }
}

// Init
checkAuth();
loadPromotion();

// ==========================================
// QUICK SHARE (Send-Anywhere Style)
// ==========================================

const quickSendDropZone = document.getElementById('quickSendDropZone');
const quickSendFile = document.getElementById('quickSendFile');
const quickSendText = document.getElementById('quickSendText');
const formQuickSend = document.getElementById('formQuickSend');
const formQuickReceive = document.getElementById('formQuickReceive');

// Quick Send Drag/Drop
if (quickSendDropZone && quickSendFile) {
    const preventDefaults = (e) => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        quickSendDropZone.addEventListener(eventName, preventDefaults, false);
    });
    ['dragenter', 'dragover'].forEach(eventName => {
        quickSendDropZone.addEventListener(eventName, () => quickSendDropZone.classList.add('dragover'), false);
    });
    ['dragleave', 'drop'].forEach(eventName => {
        quickSendDropZone.addEventListener(eventName, () => quickSendDropZone.classList.remove('dragover'), false);
    });
    
    quickSendDropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        quickSendFile.files = dt.files;
        updateQuickSendText();
    }, false);
    
    quickSendFile.addEventListener('change', updateQuickSendText);
    
    function updateQuickSendText() {
        if (quickSendFile.files.length > 0) {
            quickSendText.innerHTML = `<span style="color: var(--primary); font-weight: bold;">${quickSendFile.files[0].name}</span> selected`;
        } else {
            quickSendText.textContent = 'Click or Drop file here';
        }
    }
}

// Quick Send Form Submit
if (formQuickSend) {
    formQuickSend.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errDiv = document.getElementById('quickSendError');
        const btnSend = document.getElementById('btnQuickSend');
        const resultArea = document.getElementById('quickSendArea');
        const resultKey = document.getElementById('quickSendResultKey');
        
        errDiv.textContent = '';
        resultArea.classList.add('hidden');
        
        if (!quickSendFile.files || quickSendFile.files.length === 0) {
            errDiv.textContent = 'Please select a file to send.';
            return;
        }

        btnSend.disabled = true;
        btnSend.textContent = 'Uploading...';

        try {
            const formData = new FormData();
            formData.append('file', quickSendFile.files[0]);

            const res = await fetch(`${API_URL}/quick_share/send`, {
                method: 'POST',
                body: formData
            });
            
            let data;
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                data = await res.json();
            } else {
                const text = await res.text();
                data = { error: `Server error (${res.status})` };
            }

            if (res.ok) {
                resultKey.textContent = data.share_key;
                resultArea.classList.remove('hidden');
                
                formQuickSend.reset();
                if(quickSendText) quickSendText.textContent = 'Click or Drop file here';
                
                btnSend.disabled = false;
                btnSend.textContent = 'Send Another File';
            } else {
                errDiv.textContent = data.error || 'Upload failed';
                btnSend.disabled = false;
                btnSend.textContent = 'Get 6-Digit Key';
            }
        } catch (err) {
            errDiv.textContent = 'Connection error: ' + err.message;
            btnSend.disabled = false;
            btnSend.textContent = 'Get 6-Digit Key';
        }
    });
}

// Quick Receive Form Submit
if (formQuickReceive) {
    // Auto-format receiver key
    const receiveInput = document.getElementById('receiveKey');
    if(receiveInput) {
        receiveInput.addEventListener('input', (e) => {
            // Keep only numbers
            e.target.value = e.target.value.replace(/[^0-9]/g, '');
        });
    }

    formQuickReceive.addEventListener('submit', async (e) => {
        e.preventDefault();
        const key = receiveInput.value.trim();
        const errDiv = document.getElementById('receiveError');
        const successDiv = document.getElementById('receiveSuccess');
        const btnReceive = document.getElementById('btnReceive');
        
        errDiv.textContent = '';
        successDiv.textContent = '';

        if (key.length !== 6) {
            errDiv.textContent = 'Please enter a valid 6-digit key.';
            return;
        }

        btnReceive.disabled = true;
        btnReceive.textContent = 'Checking...';

        try {
            const res = await fetch(`${API_URL}/quick_share/receive/${key}`);
            
            let data;
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                data = await res.json();
            } else {
                data = { error: `Server error (${res.status})` };
            }

            if (res.ok) {
                successDiv.textContent = `Found file: ${data.original_filename}. Downloading...`;
                window.location.href = `/api/quick_share/download/${key}`;
                
                setTimeout(() => {
                    btnReceive.disabled = false;
                    btnReceive.textContent = 'Download Another File';
                    formQuickReceive.reset();
                    successDiv.textContent = '';
                }, 2000);
            } else {
                errDiv.textContent = data.error || 'Invalid key or file expired.';
                btnReceive.disabled = false;
                btnReceive.textContent = 'Download File';
            }
        } catch (err) {
            errDiv.textContent = 'Connection error: ' + err.message;
            btnReceive.disabled = false;
            btnReceive.textContent = 'Download File';
        }
    });
}
