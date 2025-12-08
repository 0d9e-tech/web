function loadVideo(src) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.onloadeddata = () => resolve(video);
        video.onerror = reject;
        video.src = src;
    });
}

const physicsData = [];
const main = document.querySelector('main');

// Audio context for collision sounds
let audioContext;
function initAudio() {
    if (!audioContext) {
        audioContext = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    }
}

// Play collision sound
function playCollisionSound(intensity = 0.5) {
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Create a "pop" sound with frequency based on collision intensity
    oscillator.frequency.setValueAtTime(200 + intensity * 300, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(50, audioContext.currentTime + 0.1);

    // Volume envelope
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(Math.min(0.1, intensity * 0.2), audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

// Drag and drop state management
const dragState = {
    isDragging: false,
    draggedBallIndex: -1,
    dragOffset: { x: 0, y: 0 },
    lastMousePos: { x: 0, y: 0 },
    dragStartTime: 0
};

// Get actual viewport dimensions accounting for mobile quirks
function getViewportDimensions() {
    const rect = main.getBoundingClientRect();
    return {
        width: rect.width,
        height: rect.height
    };
}

// Helper function to find which ball is at a given position
function findBallAtPosition(x, y) {
    for (let i = 0; i < physicsData.length; i++) {
        const data = physicsData[i];
        const ballCenterX = data.x + data.radius;
        const ballCenterY = data.y + data.radius;
        const distance = Math.sqrt(
            Math.pow(x - ballCenterX, 2) +
            Math.pow(y - ballCenterY, 2)
        );

        // Check if click/touch is within the ball's radius
        if (distance <= data.radius) {
            return i;
        }
    }
    return -1;
}

// Helper function to get mouse/touch position relative to main element
function getRelativePosition(clientX, clientY) {
    const rect = main.getBoundingClientRect();
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

// Centralized ball size management
function getBallRadius() {
    const viewport = getViewportDimensions();
    return Math.min(viewport.width, viewport.height) / 7.5; // Simplified - 2x bigger everywhere
}

function setBallSize(video, radius) {
    const diameter = radius * 2;
    video.style.width = diameter + 'px';
    video.style.height = diameter + 'px';
}

function spawnVideo(video) {
    const radius = getBallRadius();
    const diameter = radius * 2;
    const viewport = getViewportDimensions();

    const x = Math.random() * (viewport.width - diameter);
    const y = 100;
    const vx = (Math.random() - 0.5) * 4;
    const vy = (Math.random() - 0.5) * 4;
    const vr = (Math.random() - 0.5) * 0.3;

    video.style.left = x + 'px';
    video.style.top = y + 'px';
    setBallSize(video, radius);

    physicsData.push({
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        r: 0,
        vr: vr,
        radius: radius
    });

    main.appendChild(video);
    console.log('Spawned video:', video.src, 'at', x, y, 'velocity', vx, vy);
}

function startNextDownload(i) {
    loadVideo(`/api/videos/${i}`)
        .then(spawnVideo)
        .then(function() { setTimeout(function(){startNextDownload(i+1);},2000);})
        .catch((error) => {
            setTimeout( function() { startNextDownload(i); }, 2000);
            console.log('Failed to load video:', i, error);
        });
}

function updatePhysics() {
    const viewport = getViewportDimensions();

    for (let i = 0; i < main.children.length; i++) {
        const video = main.children[i];
        const data = physicsData[i];

        // Skip physics updates for the ball being dragged
        if (dragState.isDragging && dragState.draggedBallIndex === i) {
            continue;
        }

        //data.vy += 0.2;

        data.x += data.vx;
        data.y += data.vy;
        data.r += data.vr;

        const maxSpin = 3;
        if (data.r > maxSpin) data.r = maxSpin;
        if (data.r < -maxSpin) data.r = -maxSpin;

        const centerX = data.x + data.radius;
        const centerY = data.y + data.radius;

        const high_update = 1.05;
        const low_update = 0.97;

        // Simple wall collision with spin effects
        if (centerX - data.radius <= 0 || centerX + data.radius >= viewport.width) {
            const bounceIntensity = Math.abs(data.vx) / 10;
            playCollisionSound(bounceIntensity);
            data.vx *= -high_update;
            data.vy *= high_update;
            data.vr *= low_update;
            data.x = Math.max(0, Math.min(viewport.width - data.radius * 2, data.x));
        }

        if (centerY - data.radius <= 0 || centerY + data.radius >= viewport.height) {
            const bounceIntensity = Math.abs(data.vy) / 10;
            playCollisionSound(bounceIntensity);
            data.vy *= -high_update;
            data.vx *= high_update;
            data.vr *= low_update;
            data.y = Math.max(0, Math.min(viewport.height - data.radius * 2, data.y));
        }

        video.style.left = data.x + 'px';
        video.style.top = data.y + 'px';
        video.style.transform = `rotate(${data.r}rad)`;
    }

    for (let i = 0; i < physicsData.length; i++) {
        for (let j = i + 1; j < physicsData.length; j++) {
            // Skip collision detection if either ball is being dragged
            if (dragState.isDragging && (dragState.draggedBallIndex === i || dragState.draggedBallIndex === j)) {
                continue;
            }

            const ball1 = physicsData[i];
            const ball2 = physicsData[j];

            const center1X = ball1.x + ball1.radius;
            const center1Y = ball1.y + ball1.radius;
            const center2X = ball2.x + ball2.radius;
            const center2Y = ball2.y + ball2.radius;

            const dx = center2X - center1X;
            const dy = center2Y - center1Y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Simple collision detection and response
            if (distance < ball1.radius + ball2.radius) {
                const overlap = ball1.radius + ball2.radius - distance;
                const nx = dx / distance;
                const ny = dy / distance;

                // Separate balls
                const separation = overlap * 0.5;
                ball1.x -= nx * separation;
                ball1.y -= ny * separation;
                ball2.x += nx * separation;
                ball2.y += ny * separation;

                // Simple velocity exchange
                const dvx = ball2.vx - ball1.vx;
                const dvy = ball2.vy - ball1.vy;
                const dvn = dvx * nx + dvy * ny;

                const impulse = dvn * 0.8;

                // Play collision sound based on impact force
                const collisionIntensity = Math.abs(impulse) / 5;
                playCollisionSound(collisionIntensity);

                ball1.vx += impulse * nx;
                ball1.vy += impulse * ny;
                ball2.vx -= impulse * nx;
                ball2.vy -= impulse * ny;

                // Exchange some spin
                const spinExchange = (ball1.r + ball2.r)/2 / 100;
                ball1.vr += spinExchange;
                ball2.vr -= spinExchange;
            }
        }
    }
}

// Update ball radius on window resize
function updateBallRadius() {
    const newRadius = getBallRadius();

    // Update all existing balls
    for (let i = 0; i < physicsData.length; i++) {
        physicsData[i].radius = newRadius;
        // Update DOM size
        const video = main.children[i];
        setBallSize(video, newRadius);
    }
}

// Handle both resize and orientation change events
globalThis.addEventListener('resize', updateBallRadius);
globalThis.addEventListener('orientationchange', function() {
    // Delay to allow viewport to settle after orientation change
    setTimeout(updateBallRadius, 100);
});

// Simple touch interaction
function addTouchInteraction() {
    let touchStartTime = 0;

    main.addEventListener('touchstart', function(e) {
        e.preventDefault();
        initAudio(); // Initialize audio on first touch
        touchStartTime = Date.now();

        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const pos = getRelativePosition(touch.clientX, touch.clientY);
            const ballIndex = findBallAtPosition(pos.x, pos.y);

            if (ballIndex !== -1) {
                dragState.isDragging = true;
                dragState.draggedBallIndex = ballIndex;
                dragState.dragOffset = {
                    x: pos.x - physicsData[ballIndex].x,
                    y: pos.y - physicsData[ballIndex].y
                };

                physicsData[ballIndex].vx = 0;
                physicsData[ballIndex].vy = 0;
                physicsData[ballIndex].vr = 0;
                main.children[ballIndex].classList.add('dragging');
            }
        }
    }, { passive: false });

    main.addEventListener('touchmove', function(e) {
        e.preventDefault();

        if (dragState.isDragging && e.touches.length === 1) {
            const touch = e.touches[0];
            const pos = getRelativePosition(touch.clientX, touch.clientY);
            const data = physicsData[dragState.draggedBallIndex];
            const video = main.children[dragState.draggedBallIndex];

            data.x = pos.x - dragState.dragOffset.x;
            data.y = pos.y - dragState.dragOffset.y;

            const viewport = getViewportDimensions();
            data.x = Math.max(0, Math.min(viewport.width - data.radius * 2, data.x));
            data.y = Math.max(0, Math.min(viewport.height - data.radius * 2, data.y));

            video.style.left = data.x + 'px';
            video.style.top = data.y + 'px';
        }
    }, { passive: false });

    main.addEventListener('touchend', function(e) {
        e.preventDefault();

        if (dragState.isDragging) {
            const video = main.children[dragState.draggedBallIndex];
            video.classList.remove('dragging');
            dragState.isDragging = false;
            dragState.draggedBallIndex = -1;
        } else if (Date.now() - touchStartTime < 200) {
            // Quick tap - push nearby balls
            const touch = e.changedTouches[0];
            const pos = getRelativePosition(touch.clientX, touch.clientY);

            for (let i = 0; i < physicsData.length; i++) {
                const data = physicsData[i];
                const dx = pos.x - (data.x + data.radius);
                const dy = pos.y - (data.y + data.radius);
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 100) {
                    const force = (100 - distance) / 100 * 3;
                    const angle = Math.atan2(dy, dx);
                    data.vx -= Math.cos(angle) * force;
                    data.vy -= Math.sin(angle) * force;
                    data.vr += (Math.random() - 0.5) * 0.3;
                }
            }
        }
    }, { passive: false });
}

// Prevent context menu on long press
main.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

// Initialize touch interaction
addTouchInteraction();

// Simple mouse interaction
function addMouseInteraction() {
    main.addEventListener('mousedown', function(e) {
        e.preventDefault();
        initAudio(); // Initialize audio on first click

        const pos = getRelativePosition(e.clientX, e.clientY);
        const ballIndex = findBallAtPosition(pos.x, pos.y);

        if (ballIndex !== -1) {
            dragState.isDragging = true;
            dragState.draggedBallIndex = ballIndex;
            dragState.dragOffset = {
                x: pos.x - physicsData[ballIndex].x,
                y: pos.y - physicsData[ballIndex].y
            };

            physicsData[ballIndex].vx = 0;
            physicsData[ballIndex].vy = 0;
            physicsData[ballIndex].vr = 0;
            main.children[ballIndex].classList.add('dragging');
            document.body.style.cursor = 'grabbing';
        }
    });

    main.addEventListener('mousemove', function(e) {
        if (dragState.isDragging) {
            const pos = getRelativePosition(e.clientX, e.clientY);
            const data = physicsData[dragState.draggedBallIndex];
            const video = main.children[dragState.draggedBallIndex];

            data.x = pos.x - dragState.dragOffset.x;
            data.y = pos.y - dragState.dragOffset.y;

            const viewport = getViewportDimensions();
            data.x = Math.max(0, Math.min(viewport.width - data.radius * 2, data.x));
            data.y = Math.max(0, Math.min(viewport.height - data.radius * 2, data.y));

            video.style.left = data.x + 'px';
            video.style.top = data.y + 'px';
        } else {
            const pos = getRelativePosition(e.clientX, e.clientY);
            const ballIndex = findBallAtPosition(pos.x, pos.y);
            document.body.style.cursor = ballIndex !== -1 ? 'grab' : 'default';
        }
    });

    main.addEventListener('mouseup', function() {
        if (dragState.isDragging) {
            const video = main.children[dragState.draggedBallIndex];
            video.classList.remove('dragging');
            dragState.isDragging = false;
            dragState.draggedBallIndex = -1;
            document.body.style.cursor = 'default';
        }
    });
}

// Initialize mouse interaction
addMouseInteraction();

// Handle mobile viewport changes and prevent scrolling
function initializeMobileHandling() {
    // Prevent pull-to-refresh on mobile
    document.body.addEventListener('touchstart', function(e) {
        if (e.touches.length > 1) {
            e.preventDefault(); // Prevent pinch zoom
        }
    }, { passive: false });

    document.body.addEventListener('touchend', function(e) {
        if (e.touches.length > 0) {
            e.preventDefault();
        }
    }, { passive: false });

    // Handle viewport height changes (mobile keyboard, etc.)
    let lastViewportHeight = globalThis.innerHeight;
    globalThis.addEventListener('resize', function() {
        const currentHeight = globalThis.innerHeight;
        if (Math.abs(currentHeight - lastViewportHeight) > 100) {
            // Significant height change, likely keyboard or orientation
            setTimeout(function() {
                updateBallRadius();
                // Ensure balls stay within new boundaries
                const viewport = getViewportDimensions();
                for (let i = 0; i < physicsData.length; i++) {
                    const data = physicsData[i];
                    data.x = Math.max(0, Math.min(viewport.width - data.radius * 2, data.x));
                    data.y = Math.max(0, Math.min(viewport.height - data.radius * 2, data.y));
                }
            }, 300);
        }
        lastViewportHeight = currentHeight;
    });
}

// Initialize mobile handling
initializeMobileHandling();

// Initialize the app
startNextDownload(0);

setInterval(updatePhysics, 16);
