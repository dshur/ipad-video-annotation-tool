// DOM Elements
const videoFile = document.getElementById('video-file');
const loadVideoBtn = document.getElementById('load-video-btn');
const videoNameDisplay = document.getElementById('video-name');
const video = document.getElementById('video-player');
const videoContainer = document.getElementById('video-container');
const videoOverlay = document.getElementById('video-overlay');
const scrubber = document.getElementById('scrubber');
const scrubberProgress = document.getElementById('scrubber-progress');
const currentTimeDisplay = document.getElementById('current-time');
const durationDisplay = document.getElementById('duration');
const playPauseBtn = document.getElementById('play-pause');
const skipBackBtn = document.getElementById('skip-back');
const skipForwardBtn = document.getElementById('skip-forward');
const speedToggleBtn = document.getElementById('speed-toggle');
const noteTimestamp = document.getElementById('note-timestamp');
const noteInput = document.getElementById('note-input');
const saveNoteBtn = document.getElementById('save-note');
const notesList = document.getElementById('notes-list');
const notesCount = document.getElementById('notes-count');
const exportBtn = document.getElementById('export-btn');
const autoPauseToggle = document.getElementById('auto-pause-toggle');
const quickNoteBtns = document.querySelectorAll('.quick-note-btn');

// Modals
const exportModal = document.getElementById('export-modal');
const speedModal = document.getElementById('speed-modal');
const exportJsonBtn = document.getElementById('export-json');
const exportCsvBtn = document.getElementById('export-csv');
const exportTextBtn = document.getElementById('export-text');
const copyNotesBtn = document.getElementById('copy-notes');
const closeModalBtn = document.getElementById('close-modal');
const closeSpeedModalBtn = document.getElementById('close-speed-modal');
const speedOptions = document.querySelectorAll('.speed-option');

// State
let notes = [];
let currentNoteTime = null;
let currentVideoName = '';
let currentVideoId = null;
let currentSpeed = 1;
let autoPauseEnabled = true;
let wasPlayingBeforePause = false;
let isScrubbing = false;
let currentBlobUrl = null;

// Initialize
function init() {
    loadSettingsFromStorage();
    setupEventListeners();
    renderNotes();
    updatePlayPauseButton();
}

// Event Listeners
function setupEventListeners() {
    // Video file loading
    loadVideoBtn.addEventListener('click', () => videoFile.click());
    videoFile.addEventListener('change', handleVideoLoad);

    // Video events
    video.addEventListener('loadedmetadata', handleVideoMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', updatePlayPauseButton);
    video.addEventListener('pause', updatePlayPauseButton);
    video.addEventListener('ended', updatePlayPauseButton);

    // Stall recovery for Safari blob URL buffering issues
    video.addEventListener('stalled', handleVideoStall);
    video.addEventListener('waiting', handleVideoWaiting);
    video.addEventListener('playing', resetStallRecovery);

    // Video container tap to play/pause
    videoContainer.addEventListener('click', handleVideoTap);

    // Scrubber
    scrubber.addEventListener('input', handleScrubberInput);
    scrubber.addEventListener('touchstart', () => isScrubbing = true, { passive: true });
    scrubber.addEventListener('touchend', () => isScrubbing = false, { passive: true });

    // Playback controls
    playPauseBtn.addEventListener('click', togglePlayPause);
    skipBackBtn.addEventListener('click', () => skip(-10));
    skipForwardBtn.addEventListener('click', () => skip(10));
    speedToggleBtn.addEventListener('click', () => speedModal.classList.remove('hidden'));

    // Speed options
    speedOptions.forEach(btn => {
        btn.addEventListener('click', () => {
            const speed = parseFloat(btn.dataset.speed);
            setSpeed(speed);
            updateSpeedOptionsUI();
            speedModal.classList.add('hidden');
        });
    });
    closeSpeedModalBtn.addEventListener('click', () => speedModal.classList.add('hidden'));
    speedModal.addEventListener('click', (e) => {
        if (e.target === speedModal) speedModal.classList.add('hidden');
    });

    // Note input - pause on FOCUS, not on input
    noteInput.addEventListener('focus', handleNoteInputFocus);
    noteInput.addEventListener('blur', handleNoteInputBlur);
    saveNoteBtn.addEventListener('click', saveNote);

    // Quick notes
    quickNoteBtns.forEach(btn => {
        btn.addEventListener('click', () => handleQuickNote(btn.dataset.note));
    });

    // Export
    exportBtn.addEventListener('click', () => exportModal.classList.remove('hidden'));
    exportJsonBtn.addEventListener('click', exportToJson);
    exportCsvBtn.addEventListener('click', exportToCsv);
    exportTextBtn.addEventListener('click', exportToText);
    copyNotesBtn.addEventListener('click', copyToClipboard);
    closeModalBtn.addEventListener('click', () => exportModal.classList.add('hidden'));
    exportModal.addEventListener('click', (e) => {
        if (e.target === exportModal) exportModal.classList.add('hidden');
    });

    // Settings
    autoPauseToggle.addEventListener('change', handleAutoPauseToggle);

    // Prevent zooming on double tap
    document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });
}

// Prevent double-tap zoom
let lastTouchEnd = 0;
function preventDoubleTapZoom(e) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}

// Video Loading
function handleVideoLoad(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Revoke previous blob URL to free memory
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }

    // Ensure the blob has an explicit MIME type.
    // Safari's media pipeline uses this to determine buffering/byte-range
    // strategy for blob URLs. Without it, playback stalls on large files.
    const mimeType = file.type || getMimeTypeFromExtension(file.name);
    const typedBlob = new Blob([file], { type: mimeType });
    const url = URL.createObjectURL(typedBlob);
    currentBlobUrl = url;

    video.src = url;
    currentVideoName = file.name;
    currentVideoId = generateVideoId(file);

    // Update button text to show filename
    const displayName = file.name.length > 20
        ? file.name.substring(0, 17) + '...'
        : file.name;
    videoNameDisplay.textContent = displayName;

    // Load notes for this video
    loadNotesForVideo(currentVideoId);
}

function generateVideoId(file) {
    return `${file.name}_${file.size}_${file.lastModified}`;
}

function loadNotesForVideo(videoId) {
    try {
        const allNotes = JSON.parse(localStorage.getItem('videoNotesLibrary') || '{}');
        notes = allNotes[videoId] || [];
        renderNotes();
    } catch (e) {
        console.warn('Could not load notes for video:', e);
        notes = [];
        renderNotes();
    }
}

function handleVideoMetadata() {
    durationDisplay.textContent = formatTime(video.duration);
    scrubber.max = video.duration;
    video.playbackRate = currentSpeed;
}

// Stall recovery
let stallRecoveryTimeout = null;
let stallRecoveryAttempts = 0;

function handleVideoStall() {
    if (video.paused || video.ended) return;
    if (stallRecoveryTimeout) clearTimeout(stallRecoveryTimeout);
    stallRecoveryTimeout = setTimeout(() => attemptStallRecovery(), 2000);
}

function handleVideoWaiting() {
    if (video.paused || video.ended) return;
    if (stallRecoveryTimeout) clearTimeout(stallRecoveryTimeout);
    stallRecoveryTimeout = setTimeout(() => {
        if (!video.paused && video.readyState < 3) {
            attemptStallRecovery();
        }
    }, 4000);
}

function attemptStallRecovery() {
    if (stallRecoveryAttempts >= 3) {
        stallRecoveryAttempts = 0;
        return;
    }
    stallRecoveryAttempts++;
    const savedTime = video.currentTime;
    video.currentTime = savedTime + 0.01;
    video.play().catch(() => {});
}

function resetStallRecovery() {
    stallRecoveryAttempts = 0;
    if (stallRecoveryTimeout) {
        clearTimeout(stallRecoveryTimeout);
        stallRecoveryTimeout = null;
    }
}

function handleTimeUpdate() {
    if (!isScrubbing) {
        currentTimeDisplay.textContent = formatTime(video.currentTime);
        scrubber.value = video.currentTime;
        updateScrubberProgress();
    }
}

function handleScrubberInput() {
    video.currentTime = scrubber.value;
    currentTimeDisplay.textContent = formatTime(video.currentTime);
    updateScrubberProgress();
}

function updateScrubberProgress() {
    const progress = (video.currentTime / video.duration) * 100 || 0;
    const scrubberWidth = scrubber.offsetWidth - 16; // Account for padding
    scrubberProgress.style.width = (progress / 100 * scrubberWidth) + 'px';
}

// Video Controls
function handleVideoTap(e) {
    // Don't toggle if tapping the video controls
    if (e.target !== video && e.target !== videoContainer && e.target !== videoOverlay) {
        return;
    }
    togglePlayPause();

    // Show brief overlay feedback
    videoOverlay.classList.add('visible');
    setTimeout(() => videoOverlay.classList.remove('visible'), 300);
}

function togglePlayPause() {
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
}

function updatePlayPauseButton() {
    const playIcon = playPauseBtn.querySelector('.play-icon');
    playIcon.innerHTML = video.paused ? '&#9654;' : '&#10074;&#10074;';
}

function skip(seconds) {
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
}

function setSpeed(speed) {
    currentSpeed = speed;
    video.playbackRate = speed;
    speedToggleBtn.textContent = speed + 'x';
    saveSettingsToStorage();
}

function updateSpeedOptionsUI() {
    speedOptions.forEach(btn => {
        const speed = parseFloat(btn.dataset.speed);
        btn.classList.toggle('active', speed === currentSpeed);
    });
}

// Note Taking - Focus-based pause
function handleNoteInputFocus() {
    // Capture timestamp when focusing on input
    if (currentNoteTime === null) {
        currentNoteTime = video.currentTime;
        noteTimestamp.textContent = formatTime(currentNoteTime);
        noteTimestamp.classList.add('active');
    }

    // Auto-pause if enabled
    if (autoPauseEnabled && !video.paused) {
        wasPlayingBeforePause = true;
        video.pause();
    }
}

function handleNoteInputBlur() {
    // If input is empty and we lose focus, reset timestamp
    if (noteInput.value.trim().length === 0) {
        resetNoteTimestamp();

        // Resume playback if we auto-paused and no note was added
        if (wasPlayingBeforePause) {
            wasPlayingBeforePause = false;
            video.play();
        }
    }
}

// Quick Notes
function handleQuickNote(noteText) {
    const timestamp = video.currentTime;

    const note = {
        id: Date.now(),
        timestamp: timestamp,
        formatted: formatTime(timestamp),
        text: noteText
    };

    notes.push(note);
    notes.sort((a, b) => a.timestamp - b.timestamp);

    saveNotesToStorage();
    renderNotes();

    // Brief visual feedback - flash the button
    const btn = document.querySelector(`[data-note="${noteText}"]`);
    if (btn) {
        btn.style.background = '#2ecc71';
        btn.style.color = '#fff';
        setTimeout(() => {
            btn.style.background = '';
            btn.style.color = '';
        }, 200);
    }
}

// Settings
function handleAutoPauseToggle() {
    autoPauseEnabled = autoPauseToggle.checked;
    saveSettingsToStorage();
}

function saveNote() {
    const text = noteInput.value.trim();
    if (!text) return;

    // Use captured timestamp or current time
    const timestamp = currentNoteTime !== null ? currentNoteTime : video.currentTime;

    const note = {
        id: Date.now(),
        timestamp: timestamp,
        formatted: formatTime(timestamp),
        text: text
    };

    notes.push(note);
    notes.sort((a, b) => a.timestamp - b.timestamp);

    saveNotesToStorage();
    renderNotes();

    // Reset input
    noteInput.value = '';
    noteInput.blur();
    resetNoteTimestamp();

    // Resume playback if we auto-paused
    if (wasPlayingBeforePause) {
        wasPlayingBeforePause = false;
        video.play();
    }
}

function resetNoteTimestamp() {
    currentNoteTime = null;
    noteTimestamp.textContent = '--:--';
    noteTimestamp.classList.remove('active');
}

function deleteNote(id) {
    notes = notes.filter(note => note.id !== id);
    saveNotesToStorage();
    renderNotes();
}

function seekToTimestamp(timestamp) {
    video.currentTime = timestamp;
    video.play();
}

// Render Notes
function renderNotes() {
    notesCount.textContent = `(${notes.length})`;

    if (notes.length === 0) {
        notesList.innerHTML = '<p class="empty-state">No notes yet. Tap the text field or a quick note button to add annotations.</p>';
        return;
    }

    notesList.innerHTML = notes.map(note => `
        <div class="note-item" data-id="${note.id}">
            <span class="note-time" onclick="seekToTimestamp(${note.timestamp})" title="Tap to jump to this time">
                ${note.formatted}
            </span>
            <span class="note-text">${escapeHtml(note.text)}</span>
            <button class="note-delete" onclick="deleteNote(${note.id})" title="Delete note">&times;</button>
        </div>
    `).join('');
}

// Export Functions
function exportToJson() {
    if (notes.length === 0) {
        alert('No notes to export');
        return;
    }

    const data = {
        videoName: currentVideoName || 'Unknown',
        exportedAt: new Date().toISOString(),
        notes: notes.map(({ timestamp, formatted, text }) => ({
            timestamp,
            formatted,
            text
        }))
    };

    downloadFile(
        JSON.stringify(data, null, 2),
        `notes-${sanitizeFilename(currentVideoName)}.json`,
        'application/json'
    );
    exportModal.classList.add('hidden');
}

function exportToCsv() {
    if (notes.length === 0) {
        alert('No notes to export');
        return;
    }

    const header = 'Timestamp (seconds),Formatted Time,Note';
    const rows = notes.map(note =>
        `${note.timestamp},"${note.formatted}","${note.text.replace(/"/g, '""')}"`
    );

    const csv = [header, ...rows].join('\n');

    downloadFile(
        csv,
        `notes-${sanitizeFilename(currentVideoName)}.csv`,
        'text/csv'
    );
    exportModal.classList.add('hidden');
}

function exportToText() {
    if (notes.length === 0) {
        alert('No notes to export');
        return;
    }

    const header = `Video Notes: ${currentVideoName || 'Unknown'}\nExported: ${new Date().toLocaleString()}\n${'='.repeat(50)}\n\n`;
    const content = notes.map(note => `[${note.formatted}] ${note.text}`).join('\n\n');

    downloadFile(
        header + content,
        `notes-${sanitizeFilename(currentVideoName)}.txt`,
        'text/plain'
    );
    exportModal.classList.add('hidden');
}

function copyToClipboard() {
    if (notes.length === 0) {
        alert('No notes to copy');
        return;
    }

    const content = notes.map(note => `[${note.formatted}] ${note.text}`).join('\n');

    navigator.clipboard.writeText(content).then(() => {
        copyNotesBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyNotesBtn.textContent = 'Copy to Clipboard';
        }, 1500);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    });
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Storage
function saveNotesToStorage() {
    if (!currentVideoId) return;

    try {
        const allNotes = JSON.parse(localStorage.getItem('videoNotesLibrary') || '{}');
        allNotes[currentVideoId] = notes;
        localStorage.setItem('videoNotesLibrary', JSON.stringify(allNotes));
    } catch (e) {
        console.warn('Could not save notes to localStorage:', e);
    }
}

function saveSettingsToStorage() {
    try {
        localStorage.setItem('videoNotesSettings', JSON.stringify({
            autoPauseEnabled,
            currentSpeed
        }));
    } catch (e) {
        console.warn('Could not save settings to localStorage:', e);
    }
}

function loadSettingsFromStorage() {
    try {
        const stored = localStorage.getItem('videoNotesSettings');
        if (stored) {
            const settings = JSON.parse(stored);
            autoPauseEnabled = settings.autoPauseEnabled ?? true;
            currentSpeed = settings.currentSpeed ?? 1;
            autoPauseToggle.checked = autoPauseEnabled;
            speedToggleBtn.textContent = currentSpeed + 'x';
            updateSpeedOptionsUI();
        }
    } catch (e) {
        console.warn('Could not load settings from localStorage:', e);
    }
}

// Utility Functions
function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function sanitizeFilename(name) {
    if (!name) return 'video';
    return name.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

function getMimeTypeFromExtension(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
        'mp4': 'video/mp4',
        'm4v': 'video/mp4',
        'mov': 'video/quicktime',
        'webm': 'video/webm',
        'ogv': 'video/ogg',
        'avi': 'video/x-msvideo',
        'mkv': 'video/x-matroska',
        '3gp': 'video/3gpp',
    };
    return mimeTypes[ext] || 'video/mp4';
}

// Make functions globally accessible for onclick handlers
window.seekToTimestamp = seekToTimestamp;
window.deleteNote = deleteNote;

// Clean up blob URL on page unload
window.addEventListener('beforeunload', () => {
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
    }
});

// Initialize on load
init();
