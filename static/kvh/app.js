async function fetchNthVideo(index) {
    try {
        const response = await fetch();
        if (response.ok) {
            const blob = await response.blob();
            return URL.createObjectURL(blob);
        } 
    } catch (error) { }
    return null; // No more videos
}

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

// Get actual viewport dimensions accounting for mobile quirks
function getViewportDimensions() {
    const rect = main.getBoundingClientRect();
    return {
        width: rect.width,
        height: rect.height
    };
}

// Centralized ball size management
function getBallRadius() {
    const viewport = getViewportDimensions();
    const minDimension = Math.min(viewport.width, viewport.height);

    // Better scaling for mobile devices
    if (minDimension < 400) {
        // Small mobile screens
        return Math.max(25, minDimension / 12);
    } else if (minDimension < 800) {
        // Larger mobile screens and small tablets
        return Math.max(30, minDimension / 15);
    } else {
        // Desktop and large tablets
        const k = Math.round(viewport.width / 200);
        return viewport.width / (2 * k);
    }
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

let currentIndex = 0;

async function startNextDownload(i) {
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

        data.vy += 0.2;

        data.x += data.vx;
        data.y += data.vy;
        data.r += data.vr;

        const maxSpin = 1;
        if (data.vr > maxSpin) data.vr = maxSpin;
        if (data.vr < -maxSpin) data.vr = -maxSpin;

        const centerX = data.x + data.radius;
        const centerY = data.y + data.radius;

        // Use viewport dimensions instead of window dimensions
        if (centerX - data.radius <= 0 || centerX + data.radius >= viewport.width) {
            data.vx = -data.vx * 1.1;
            data.vr *= 0.9;
            data.x = Math.max(0, Math.min(viewport.width - data.radius * 2, data.x));
        }

        if (centerY - data.radius <= 0 || centerY + data.radius >= viewport.ght) {
            data.vy = -data.vy * 1.1;
            data.vr = data.vx / data.radius; // no slip
            data.vx *= 1.05;
            data.y = viewport.height - data.radius * 2;
        }

        video.style.left = data.x + 'px';
        video.style.top = data.y + 'px';
        video.style.transform = `rotate(${data.r}rad)`;
    }

    for (let i = 0; i < physicsData.length; i++) {
        for (let j = i + 1; j < physicsData.length; j++) {
            const ball1 = physicsData[i];
            const ball2 = physicsData[j];

            const center1X = ball1.x + ball1.radius;
            const center1Y = ball1.y + ball1.radius;
            const center2X = ball2.x + ball2.radius;
            const center2Y = ball2.y + ball2.radius;

            const dx = center2X - center1X;
            const dy = center2Y - center1Y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            const collisionDistance = ball1.radius + ball2.radius;
            if (distance < collisionDistance) {
                const overlap = collisionDistance - distance;
                const nx = dx / distance;
                const ny = dy / distance;
                const separationX = nx * overlap * 0.5;
                const separationY = ny * overlap * 0.5;
                ball1.x -= separationX;
                ball1.y -= separationY;
                ball2.x += separationX;
                ball2.y += separationY;

                const speed1 = Math.sqrt(ball1.vx * ball1.vx + ball1.vy * ball1.vy);
                const speed2 = Math.sqrt(ball2.vx * ball2.vx + ball2.vy * ball2.vy);
                const areTouching = speed1 < 1 && speed2 < 1;

                if (areTouching) {
                    const avgSpin = (ball1.vr + ball2.vr) * 0.5;
                    ball1.vr = avgSpin;
                    ball2.vr = avgSpin;

                    const separationForce = overlap * 0.1;
                    ball1.vx -= nx * separationForce;
                    ball1.vy -= ny * separationForce;
                    ball2.vx += nx * separationForce;
                    ball2.vy += ny * separationForce;

                    // Apply upward velocity to the upper ball
                    const upwardForce = overlap * 0.1;
                    if (ball1.y <= ball2.y) {
                        // ball1 is higher
                        ball1.vy -= upwardForce;
                    } else {
                        // ball2 is higher
                        ball2.vy -= upwardForce;
                    }
                } else {
                    // At least one ball moving fast - collision physics
                    const dvx = ball2.vx - ball1.vx;
                    const dvy = ball2.vy - ball1.vy;
                    const dvn = dvx * nx + dvy * ny;

                    const impulse = -dvn * 0.8;
                    ball1.vx -= impulse * nx;
                    ball1.vy -= impulse * ny;
                    ball2.vx += impulse * nx;
                    ball2.vy += impulse * ny;

                    // Rotational effects
                    const tangentialImpulse = impulse * 0.2;
                    ball1.vr += tangentialImpulse / ball1.radius;
                    ball2.vr -= tangentialImpulse / ball2.radius;
                }
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
window.addEventListener('resize', updateBallRadius);
window.addEventListener('orientationchange', function() {
    // Delay to allow viewport to settle after orientation change
    setTimeout(updateBallRadius, 100);
});

// Add touch event handling for mobile interaction
function addTouchInteraction() {
    let touchStartTime = 0;

    main.addEventListener('touchstart', function(e) {
        e.preventDefault(); // Prevent scrolling and zooming
        touchStartTime = Date.now();
    }, { passive: false });

    main.addEventListener('touchmove', function(e) {
        e.preventDefault(); // Prevent scrolling
    }, { passive: false });

    main.addEventListener('touchend', function(e) {
        e.preventDefault();
        const touchDuration = Date.now() - touchStartTime;

        // If it's a quick tap (less than 200ms), add some energy to nearby balls
        if (touchDuration < 200 && e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            const rect = main.getBoundingClientRect();
            const touchX = touch.clientX - rect.left;
            const touchY = touch.clientY - rect.top;

            // Find balls near the touch point and give them a little push
            for (let i = 0; i < physicsData.length; i++) {
                const data = physicsData[i];
                const ballCenterX = data.x + data.radius;
                const ballCenterY = data.y + data.radius;
                const distance = Math.sqrt(
                    Math.pow(touchX - ballCenterX, 2) +
                    Math.pow(touchY - ballCenterY, 2)
                );

                // If touch is within 100px of ball center, give it a push
                if (distance < 100) {
                    const pushStrength = Math.max(0.5, (100 - distance) / 100 * 3);
                    const angle = Math.atan2(ballCenterY - touchY, ballCenterX - touchX);
                    data.vx += Math.cos(angle) * pushStrength;
                    data.vy += Math.sin(angle) * pushStrength;
                    data.vr += (Math.random() - 0.5) * 0.2;
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
    let lastViewportHeight = window.innerHeight;
    window.addEventListener('resize', function() {
        const currentHeight = window.innerHeight;
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
