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

// Centralized ball size management
function getBallRadius() {
    const k = Math.round(window.innerWidth / 200);
    return window.innerWidth / (2 * k);
}

function setBallSize(video, radius) {
    const diameter = radius * 2;
    video.style.width = diameter + 'px';
    video.style.height = diameter + 'px';
}

function spawnVideo(video) {
    const radius = getBallRadius();
    const diameter = radius * 2;

    const x = Math.random() * (window.innerWidth - diameter);
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

        if (centerX - data.radius <= 0 || centerX + data.radius >= window.innerWidth) {
            data.vx = -data.vx * 0.8;
            data.vr *= 0.9;
            data.x = Math.max(0, Math.min(window.innerWidth - data.radius * 2, data.x));
        }

        if (centerY + data.radius >= window.innerHeight) {
            data.vy = -data.vy * 0.8;
            data.vr = data.vx / data.radius; // no slip
            data.vx *= 0.95;
            data.y = window.innerHeight - data.radius * 2;
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

window.addEventListener('resize', updateBallRadius);

// Initialize the app
startNextDownload(0);

setInterval(updatePhysics, 16);
