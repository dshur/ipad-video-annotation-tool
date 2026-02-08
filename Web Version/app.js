// DOM Elements
const videoFile = document.getElementById('video-file');
const videoName = document.getElementById('video-name');
const video = document.getElementById('video-player');
const scrubber = document.getElementById('scrubber');
const scrubberProgress = document.getElementById('scrubber-progress');
const currentTimeInput = document.getElementById('current-time');
const durationDisplay = document.getElementById('duration');
const speedDown = document.getElementById('speed-down');
const speedUp = document.getElementById('speed-up');
const speed1xBtn = document.getElementById('speed-1x');
const speed2xBtn = document.getElementById('speed-2x');
const speedDisplay = document.getElementById('speed-display');
const playPauseBtn = document.getElementById('play-pause');
const noteTimestamp = document.getElementById('note-timestamp');
const noteInput = document.getElementById('note-input');
const saveNoteBtn = document.getElementById('save-note');
const notesList = document.getElementById('notes-list');
const exportJsonBtn = document.getElementById('export-json');
const exportCsvBtn = document.getElementById('export-csv');
const autoPauseToggle = document.getElementById('auto-pause-toggle');

// State
let notes = [];
let currentNoteTime = null;
let currentVideoName = '';
let currentVideoId = null;
const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4];
let currentSpeedIndex = 3; // Default 1x
let autoPauseEnabled = true;
let wasPlayingBeforePause = false;
let isScrubbing = false;

// Initialize
function init() {
    loadSettingsFromStorage();
    setupEventListeners();
    updateSpeedDisplay();
    renderNotes();
}

// Event Listeners
function setupEventListeners() {
    // Video file loading
    videoFile.addEventListener('change', handleVideoLoad);

    // Video events
    video.addEventListener('loadedmetadata', handleVideoMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', updatePlayPauseButton);
    video.addEventListener('pause', updatePlayPauseButton);
    video.addEventListener('click', togglePlayPause);

    // Scrubber
    scrubber.addEventListener('input', handleScrubberInput);
    scrubber.addEventListener('mousedown', () => isScrubbing = true);
    scrubber.addEventListener('mouseup', () => isScrubbing = false);

    // Time input
    currentTimeInput.addEventListener('focus', handleTimeInputFocus);
    currentTimeInput.addEventListener('blur', handleTimeInputBlur);
    currentTimeInput.addEventListener('keydown', handleTimeInputKeydown);

    // Controls
    playPauseBtn.addEventListener('click', togglePlayPause);
    speedDown.addEventListener('click', decreaseSpeed);
    speedUp.addEventListener('click', increaseSpeed);
    speed1xBtn.addEventListener('click', () => setSpeed(1));
    speed2xBtn.addEventListener('click', () => setSpeed(2));

    // Note input
    noteInput.addEventListener('input', handleNoteInput);
    noteInput.addEventListener('keydown', handleNoteKeydown);
    saveNoteBtn.addEventListener('click', saveNote);

    // Export
    exportJsonBtn.addEventListener('click', exportToJson);
    exportCsvBtn.addEventListener('click', exportToCsv);

    // Settings
    autoPauseToggle.addEventListener('change', handleAutoPauseToggle);

    // Global keyboard shortcuts
    document.addEventListener('keydown', handleGlobalKeydown);
}

// Video Loading
function handleVideoLoad(e) {
    const file = e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    video.src = url;
    currentVideoName = file.name;
    currentVideoId = generateVideoId(file);
    videoName.textContent = file.name;

    // Load notes for this video (or start fresh if none exist)
    loadNotesForVideo(currentVideoId);
}

function generateVideoId(file) {
    // Create unique ID from filename + size + last modified date
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
    video.playbackRate = speeds[currentSpeedIndex];
}

function handleTimeUpdate() {
    if (!isScrubbing && document.activeElement !== currentTimeInput) {
        currentTimeInput.value = formatTime(video.currentTime);
    }
    if (!isScrubbing) {
        scrubber.value = video.currentTime;
        updateScrubberProgress();
    }
}

function handleScrubberInput() {
    video.currentTime = scrubber.value;
    currentTimeInput.value = formatTime(video.currentTime);
    updateScrubberProgress();
}

function updateScrubberProgress() {
    const progress = (video.currentTime / video.duration) * 100 || 0;
    scrubberProgress.style.width = progress + '%';
}

// Time Input
function handleTimeInputFocus() {
    currentTimeInput.select();
}

function handleTimeInputBlur() {
    const seconds = parseTimeInput(currentTimeInput.value);
    if (seconds !== null && seconds >= 0 && seconds <= video.duration) {
        video.currentTime = seconds;
    }
    currentTimeInput.value = formatTime(video.currentTime);
}

function handleTimeInputKeydown(e) {
    if (e.key === 'Enter') {
        currentTimeInput.blur();
    } else if (e.key === 'Escape') {
        currentTimeInput.value = formatTime(video.currentTime);
        currentTimeInput.blur();
    }
}

function parseTimeInput(input) {
    // Handle formats: "1:23", "1:23:45", "83" (seconds)
    const trimmed = input.trim();

    // Check if it's just a number (seconds)
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return parseFloat(trimmed);
    }

    // Check for time format (M:SS or H:MM:SS)
    const parts = trimmed.split(':').map(p => parseFloat(p));
    if (parts.some(isNaN)) return null;

    if (parts.length === 2) {
        // M:SS
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
        // H:MM:SS
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    return null;
}

// Playback Controls
function togglePlayPause() {
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
}

function updatePlayPauseButton() {
    playPauseBtn.textContent = video.paused ? '▶' : '⏸';
}

function decreaseSpeed() {
    if (currentSpeedIndex > 0) {
        currentSpeedIndex--;
        updateSpeed();
    }
}

function increaseSpeed() {
    if (currentSpeedIndex < speeds.length - 1) {
        currentSpeedIndex++;
        updateSpeed();
    }
}

function updateSpeed() {
    video.playbackRate = speeds[currentSpeedIndex];
    updateSpeedDisplay();
}

function setSpeed(targetSpeed) {
    const index = speeds.indexOf(targetSpeed);
    if (index !== -1) {
        currentSpeedIndex = index;
        updateSpeed();
    }
}

function updateSpeedDisplay() {
    const currentSpeed = speeds[currentSpeedIndex];
    speedDisplay.textContent = currentSpeed + 'x';

    // Update preset button states
    speed1xBtn.classList.toggle('active', currentSpeed === 1);
    speed2xBtn.classList.toggle('active', currentSpeed === 2);
}

// Note Taking
function handleNoteInput() {
    // Capture timestamp on first keystroke in empty input
    if (currentNoteTime === null && noteInput.value.length > 0) {
        currentNoteTime = video.currentTime;
        noteTimestamp.textContent = formatTime(currentNoteTime);
        noteTimestamp.classList.add('active');

        // Auto-pause if enabled
        if (autoPauseEnabled && !video.paused) {
            wasPlayingBeforePause = true;
            video.pause();
        }
    }

    // Clear timestamp if input is emptied
    if (noteInput.value.length === 0) {
        resetNoteTimestamp();
    }
}

// Settings
function handleAutoPauseToggle() {
    autoPauseEnabled = autoPauseToggle.checked;
    saveSettingsToStorage();
}

function handleNoteKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveNote();
    } else if (e.key === 'Escape') {
        cancelNote();
    }
}

function cancelNote() {
    noteInput.blur();
    noteInput.value = '';
    resetNoteTimestamp();

    // Resume playback if we auto-paused
    if (wasPlayingBeforePause) {
        wasPlayingBeforePause = false;
        video.play();
    }
}

function saveNote() {
    const text = noteInput.value.trim();
    if (!text || currentNoteTime === null) return;

    const note = {
        id: Date.now(),
        timestamp: currentNoteTime,
        formatted: formatTime(currentNoteTime),
        text: text
    };

    notes.push(note);
    notes.sort((a, b) => a.timestamp - b.timestamp);

    saveNotesToStorage();
    renderNotes();

    // Reset input and blur so Space works for play/pause
    noteInput.value = '';
    resetNoteTimestamp();
    noteInput.blur();

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
    if (notes.length === 0) {
        notesList.innerHTML = '<p class="empty-state">No notes yet. Start typing while watching to add notes.</p>';
        return;
    }

    notesList.innerHTML = notes.map(note => `
        <div class="note-item" data-id="${note.id}">
            <span class="note-time" onclick="seekToTimestamp(${note.timestamp})" title="Click to jump to this time">
                ${note.formatted}
            </span>
            <span class="note-text">${escapeHtml(note.text)}</span>
            <button class="note-delete" onclick="deleteNote(${note.id})" title="Delete note">×</button>
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

// Keyboard Shortcuts
function handleGlobalKeydown(e) {
    // Don't trigger shortcuts when typing in inputs
    const isTypingNote = document.activeElement === noteInput;
    const isTypingTime = document.activeElement === currentTimeInput;

    // Arrow keys for seeking (only when not typing)
    if (!isTypingNote && !isTypingTime) {
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 5);
            return;
        }
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
            return;
        }
    }

    switch (e.key) {
        case ' ':
            if (!isTypingNote && !isTypingTime) {
                e.preventDefault();
                togglePlayPause();
            }
            break;
        case '[':
            if (!isTypingTime) {
                e.preventDefault();
                decreaseSpeed();
            }
            break;
        case ']':
            if (!isTypingTime) {
                e.preventDefault();
                increaseSpeed();
            }
            break;
        case 'Escape':
            if (isTypingNote) {
                cancelNote();
            } else if (isTypingTime) {
                currentTimeInput.blur();
            }
            break;
        default:
            // Auto-focus note input when typing printable characters
            if (!isTypingNote && !isTypingTime && !e.metaKey && !e.ctrlKey && !e.altKey) {
                // Check if it's a printable character (single character, not a special key)
                if (e.key.length === 1) {
                    noteInput.focus();
                    // The keystroke will naturally be captured by the now-focused input
                }
            }
            break;
    }
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
            autoPauseEnabled
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
            autoPauseToggle.checked = autoPauseEnabled;
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

// Initialize on load
init();
