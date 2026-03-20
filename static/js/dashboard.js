const token = localStorage.getItem('token');
const username = localStorage.getItem('username');

const welcomeText = document.getElementById('welcomeText');
if (welcomeText && username) {
    welcomeText.textContent = `Welcome back, ${username}.`;
}

// File Upload Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadStatus = document.getElementById('uploadStatus');
const filesGrid = document.getElementById('filesGrid');

// Drag and Drop Effects
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
});
['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
});

dropZone.addEventListener('drop', handleDrop, false);
fileInput.addEventListener('change', (e) => handleFiles(e.target.files), false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

function handleFiles(files) {
    if (files.length === 0) return;
    [...files].forEach(uploadFile);
}

async function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    uploadStatus.innerHTML = `<span style="color: var(--secondary)">Uploading ${file.name}...</span>`;

    try {
        const res = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        const data = await res.json();

        if (res.ok) {
            uploadStatus.innerHTML = `<span class="success-message">Successfully uploaded ${file.name}!</span>`;
            loadFiles(); // refresh list
            setTimeout(() => { uploadStatus.innerHTML = ''; }, 3000);
        } else {
            uploadStatus.innerHTML = `<span class="error-message">Error: ${data.error}</span>`;
        }
    } catch (e) {
        uploadStatus.innerHTML = `<span class="error-message">Server error uploading file.</span>`;
    }
}

// Load Files Grid
async function loadFiles() {
    try {
        const res = await fetch('/api/files', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        const data = await res.json();

        if (res.ok) {
            renderFiles(data.files);
        } else if (res.status === 401) {
            localStorage.clear();
            window.location.href = '/';
        }
    } catch (e) {
        console.error("Failed to fetch files");
    }
}

function renderFiles(files) {
    filesGrid.innerHTML = '';
    
    if (files.length === 0) {
        filesGrid.innerHTML = '<p style="color: var(--text-muted)">You haven\'t uploaded any files yet.</p>';
        return;
    }

    files.forEach((file, index) => {
        // Icon mapping
        let icon = '📄';
        let cardClass = '';
        if (['jpg', 'jpeg', 'png', 'gif'].includes(file.file_type)) {
            icon = '🖼️'; cardClass = 'image';
        } else if (file.file_type === 'pdf') {
            icon = '📕'; cardClass = 'pdf';
        }

        const date = new Date(file.uploaded_at).toLocaleDateString();

        const card = document.createElement('div');
        card.className = `file-card glass delay-${(index % 3) + 1} ${cardClass}`;
        card.style.animation = 'fadeIn 0.5s ease backwards';
        
        let commentHtml = '';
        if (file.comment && file.comment.trim() !== '') {
            commentHtml = `
                <div class="file-comment" id="comment-text-${file.id}">"${file.comment}"</div>
                ${file.comment.length > 80 ? `<button class="read-more-btn" onclick="toggleComment(${file.id})">Read more</button>` : ''}
            `;
        } else {
            // Need a placeholder to preserve layout if desired, or just margin
            commentHtml = '<div style="margin-bottom: 1rem;"></div>';
        }

        // Add View and Comment buttons
        let viewBtnHtml = '';
        if (['jpg', 'jpeg', 'png', 'gif', 'txt', 'pdf'].includes(file.file_type.toLowerCase())) {
            viewBtnHtml = `<button class="btn btn-secondary view-btn" data-id="${file.id}" data-type="${file.file_type}" data-name="${file.original_filename}">View</button>`;
        }
        
        card.innerHTML = `
            <div class="file-icon">${icon}</div>
            <div class="file-name" title="${file.original_filename}">${file.original_filename}</div>
            <div class="file-date">${date} &bull; ${file.file_type.toUpperCase()}</div>
            ${commentHtml}
            <div class="file-actions">
                ${viewBtnHtml}
                <button class="btn btn-secondary comment-btn" data-id="${file.id}" data-comment="${file.comment || ''}">Comment</button>
            </div>
            <div style="width: 100%; margin-top: 0.5rem;" class="file-actions">
                <a href="#" class="btn download-btn" style="background: rgba(255, 255, 255, 0.1); width: 100%;">Download</a>
            </div>
        `;
        
        // Add auth header intercept logic for download if we were doing a fetch, 
        // but simple <a> tags don't send auth headers easily. 
        // We will intercept the click to download it securely via fetch.
        const downloadBtn = card.querySelector('.download-btn');
        downloadBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            downloadFile(file.id, file.original_filename);
        });

        const viewBtn = card.querySelector('.view-btn');
        if (viewBtn) {
            viewBtn.addEventListener('click', (e) => {
                e.preventDefault();
                openViewModal(file.id, file.original_filename, file.file_type);
            });
        }

        const commentBtn = card.querySelector('.comment-btn');
        commentBtn.addEventListener('click', (e) => {
            e.preventDefault();
            openCommentModal(file.id, file.comment || '');
        });

        filesGrid.appendChild(card);
    });
}

async function downloadFile(id, filename) {
    try {
        const res = await fetch(`/api/files/download/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!res.ok) throw new Error("Download failed");
        
        const data = await res.json();
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = data.url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e) {
        alert("Failed to download file");
    }
}

// Fetch files on load
loadFiles();

// ---------- Comment Expand Logic ----------
function toggleComment(id) {
    const textDiv = document.getElementById(`comment-text-${id}`);
    const btn = textDiv.nextElementSibling;
    if (textDiv.classList.contains('expanded')) {
        textDiv.classList.remove('expanded');
        btn.textContent = 'Read more';
    } else {
        textDiv.classList.add('expanded');
        btn.textContent = 'Show less';
    }
}

// ---------- Modal Logic ----------

function openCommentModal(id, currentComment) {
    document.getElementById('commentFileId').value = id;
    document.getElementById('commentInput').value = currentComment;
    document.getElementById('commentStatus').innerHTML = '';
    document.getElementById('commentModal').classList.remove('hidden');
}

function closeCommentModal() {
    document.getElementById('commentModal').classList.add('hidden');
}

async function saveComment() {
    const id = document.getElementById('commentFileId').value;
    const commentText = document.getElementById('commentInput').value;
    const statusDiv = document.getElementById('commentStatus');
    
    statusDiv.innerHTML = '<span style="color: var(--secondary)">Saving...</span>';
    
    try {
        const res = await fetch(`/api/files/comment/${id}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ comment: commentText })
        });
        
        if (res.ok) {
            statusDiv.innerHTML = '<span class="success-message">Comment saved!</span>';
            setTimeout(() => {
                closeCommentModal();
                loadFiles();
            }, 1000);
        } else {
            statusDiv.innerHTML = '<span class="error-message">Failed to save comment.</span>';
        }
    } catch (e) {
        statusDiv.innerHTML = '<span class="error-message">Server error.</span>';
    }
}

async function openViewModal(id, filename, fileType) {
    document.getElementById('viewFileName').textContent = filename;
    document.getElementById('viewModal').classList.remove('hidden');
    const contentDiv = document.getElementById('viewContent');
    contentDiv.innerHTML = '<p>Loading...</p>';
    
    try {
        const res = await fetch(`/api/files/view/${id}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!res.ok) throw new Error("Failed to fetch file");
        
        const data = await res.json();
        const url = data.url;
        
        const modalContent = document.querySelector('#viewModal .modal-content');
        
        if (['jpg', 'jpeg', 'png', 'gif'].includes(fileType.toLowerCase())) {
            modalContent.classList.remove('large');
            contentDiv.innerHTML = `<img src="${url}" style="max-width: 100%; max-height: 100%; object-fit: contain;">`;
        } else if (fileType.toLowerCase() === 'pdf') {
            modalContent.classList.add('large');
            contentDiv.innerHTML = `<iframe src="${url}" style="width: 100%; height: 100%; border: none;"></iframe>`;
        } else if (fileType.toLowerCase() === 'txt') {
             modalContent.classList.add('large');
             contentDiv.innerHTML = `<iframe src="${url}" style="width: 100%; height: 100%; border: none; background: white;"></iframe>`;
        } else {
             modalContent.classList.remove('large');
             contentDiv.innerHTML = '<p>Cannot preview this file type.</p>';
        }
    } catch (e) {
        contentDiv.innerHTML = '<span class="error-message">Could not load preview.</span>';
    }
}

function closeViewModal() {
    document.getElementById('viewModal').classList.add('hidden');
    // Remove large class when closing so it resets
    document.querySelector('#viewModal .modal-content').classList.remove('large');
    document.getElementById('viewContent').innerHTML = '';
}
