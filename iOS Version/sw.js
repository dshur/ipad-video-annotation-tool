// Service Worker for Video Annotation Tool
// Holds video File in memory and serves range requests for Safari iOS

let videoFile = null;
let videoMimeType = 'video/mp4';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Receive the video File object from the main thread
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'store-video') {
        videoFile = event.data.file;
        videoMimeType = event.data.mimeType || 'video/mp4';
    }
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.pathname.endsWith('/__video__/current')) {
        event.respondWith(handleVideoRequest(event.request));
    }
});

async function handleVideoRequest(request) {
    if (!videoFile) {
        return new Response('Video not found', { status: 404 });
    }

    const totalSize = videoFile.size;
    const rangeHeader = request.headers.get('range');

    if (!rangeHeader) {
        // Full request — return the whole file
        return new Response(videoFile, {
            status: 200,
            headers: {
                'Content-Type': videoMimeType,
                'Content-Length': totalSize.toString(),
                'Accept-Ranges': 'bytes'
            }
        });
    }

    // Parse range header
    const bytes = /^bytes=(\d+)-(\d+)?$/.exec(rangeHeader);
    if (!bytes) {
        return new Response(null, {
            status: 416,
            statusText: 'Range Not Satisfiable',
            headers: { 'Content-Range': `bytes */${totalSize}` }
        });
    }

    const start = parseInt(bytes[1], 10);
    const end = bytes[2] ? parseInt(bytes[2], 10) : totalSize - 1;

    if (start >= totalSize) {
        return new Response(null, {
            status: 416,
            statusText: 'Range Not Satisfiable',
            headers: { 'Content-Range': `bytes */${totalSize}` }
        });
    }

    // Slice the file — memory-efficient, creates a view not a copy
    const sliced = videoFile.slice(start, end + 1, videoMimeType);

    return new Response(sliced, {
        status: 206,
        statusText: 'Partial Content',
        headers: {
            'Content-Type': videoMimeType,
            'Content-Length': (end - start + 1).toString(),
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes'
        }
    });
}
