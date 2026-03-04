// Vanilla JS conversion of RetroGrid Component
(function() {
    const container = document.getElementById('retro-grid-container');
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    // Config
    const gridColor = '#ff00ff';
    const showScanlines = true;
    const glowEffect = true;
    const cellWidth = 120;
    const cellDepth = 80;
    const numCellsWide = 16;
    const numCellsDeep = 20;
    const cameraX = 0, cameraY = 60, cameraZ = 400;
    const focalLength = 500;
    let offset = 0;
    const speed = 1.5;

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result
            ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
            : { r: 255, g: 0, b: 255 };
    }

    function project3DTo2D(x, y, z) {
        const relX = x - cameraX, relY = y - cameraY, relZ = z - cameraZ;
        if (relZ <= 10) return null;
        const scale = focalLength / relZ;
        return { 
            x: canvas.width / 2 + relX * scale, 
            y: canvas.height * 0.5 - relY * scale, 
            scale, 
            z: relZ 
        };
    }

    function drawCell(x, z, zOffset) {
        const actualZ = z - zOffset;
        if (actualZ < -cellDepth || actualZ > numCellsDeep * cellDepth) return;
        
        const tl = project3DTo2D(x - cellWidth / 2, 0, actualZ);
        const tr = project3DTo2D(x + cellWidth / 2, 0, actualZ);
        const bl = project3DTo2D(x - cellWidth / 2, 0, actualZ + cellDepth);
        const br = project3DTo2D(x + cellWidth / 2, 0, actualZ + cellDepth);
        
        if (!tl || !tr || !bl || !br) return;
        if (actualZ < 0) return;

        const df = Math.min(1, actualZ / (numCellsDeep * cellDepth));
        const alpha = Math.max(0.3, 1 - df * 0.7);
        const lw = Math.max(1, 2.5 * (1 - df * 0.5));
        
        if (glowEffect) { 
            ctx.shadowBlur = 10 * (1 - df); 
            ctx.shadowColor = gridColor; 
        }
        ctx.lineWidth = lw;
        ctx.strokeStyle = gridColor;
        ctx.globalAlpha = alpha; 
        
        ctx.beginPath();
        ctx.moveTo(bl.x, bl.y); 
        ctx.lineTo(br.x, br.y); 
        ctx.lineTo(tr.x, tr.y); 
        ctx.lineTo(tl.x, tl.y);
        ctx.closePath(); 
        ctx.stroke();
        
        ctx.shadowBlur = 0; 
        ctx.globalAlpha = 1;
    }

    function drawScanlines() {
        if (!showScanlines) return;
        ctx.globalAlpha = 0.1; 
        ctx.fillStyle = "#000000";
        for (let y = 0; y < canvas.height; y += 4) 
            ctx.fillRect(0, y, canvas.width, 2);
        ctx.globalAlpha = 1;
    }

    function drawSun(horizonY) {
        const cx = canvas.width / 2;
        const sunRadius = Math.min(canvas.width, canvas.height) * 0.12;
        const sunY = horizonY - sunRadius * 0.4;
        
        const glow = ctx.createRadialGradient(cx, sunY, sunRadius * 0.5, cx, sunY, sunRadius * 3);
        glow.addColorStop(0, "rgba(255, 120, 50, 0.3)");
        glow.addColorStop(0.3, "rgba(255, 50, 100, 0.15)");
        glow.addColorStop(1, "rgba(255, 0, 255, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, sunY, sunRadius, 0, Math.PI * 2);
        ctx.clip();
        
        const sunGrad = ctx.createLinearGradient(cx, sunY - sunRadius, cx, sunY + sunRadius);
        sunGrad.addColorStop(0, "#ffcc33");
        sunGrad.addColorStop(0.3, "#ff8833");
        sunGrad.addColorStop(0.6, "#ff3388");
        sunGrad.addColorStop(1, "#cc00ff");
        ctx.fillStyle = sunGrad;
        ctx.fillRect(cx - sunRadius, sunY - sunRadius, sunRadius * 2, sunRadius * 2);
        
        ctx.globalCompositeOperation = "destination-out";
        const stripeCount = 7;
        for (let i = 0; i < stripeCount; i++) {
            const stripeY = sunY + sunRadius * 0.1 + (i * sunRadius * 0.9 / stripeCount) * 1.2;
            const stripeH = 2 + i * 1.2;
            ctx.fillStyle = "rgba(0,0,0,1)";
            ctx.fillRect(cx - sunRadius, stripeY, sunRadius * 2, stripeH);
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.restore();
    }

    function drawSkyline(horizonY) {
        ctx.fillStyle = "#0a0012";
        const buildings = [
            { x: 0.05, w: 0.04, h: 0.08 }, { x: 0.09, w: 0.03, h: 0.12 },
            { x: 0.12, w: 0.05, h: 0.06 }, { x: 0.17, w: 0.02, h: 0.15 },
            { x: 0.20, w: 0.06, h: 0.09 }, { x: 0.26, w: 0.03, h: 0.18 },
            { x: 0.30, w: 0.05, h: 0.11 }, { x: 0.35, w: 0.04, h: 0.07 },
            { x: 0.39, w: 0.03, h: 0.14 }, { x: 0.42, w: 0.06, h: 0.10 },
            { x: 0.48, w: 0.02, h: 0.20 }, { x: 0.51, w: 0.05, h: 0.08 },
            { x: 0.56, w: 0.04, h: 0.16 }, { x: 0.60, w: 0.03, h: 0.06 },
            { x: 0.63, w: 0.05, h: 0.13 }, { x: 0.68, w: 0.04, h: 0.09 },
            { x: 0.72, w: 0.03, h: 0.17 }, { x: 0.76, w: 0.06, h: 0.07 },
            { x: 0.82, w: 0.04, h: 0.11 }, { x: 0.86, w: 0.03, h: 0.14 },
            { x: 0.90, w: 0.05, h: 0.08 }, { x: 0.95, w: 0.04, h: 0.10 },
        ];
        buildings.forEach((b) => {
            const bx = b.x * canvas.width;
            const bw = b.w * canvas.width;
            const bh = b.h * canvas.height;
            ctx.fillRect(bx, horizonY - bh, bw, bh + 4);
        });
    }

    function drawNeonBeams(horizonY) {
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#00ffff";
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#00ffff";
        ctx.beginPath();
        ctx.moveTo(canvas.width * 0.15, 0);
        ctx.lineTo(canvas.width * 0.55, horizonY);
        ctx.stroke();
        
        ctx.strokeStyle = "#ff00ff";
        ctx.shadowColor = "#ff00ff";
        ctx.beginPath();
        ctx.moveTo(canvas.width * 0.85, 0);
        ctx.lineTo(canvas.width * 0.45, horizonY);
        ctx.stroke();
        
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const horizonY = canvas.height * 0.52;
        
        // Sky
        const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
        sky.addColorStop(0, "#0a0015");
        sky.addColorStop(0.3, "#1a0530");
        sky.addColorStop(0.5, "#2d0a45");
        sky.addColorStop(0.7, "#4a1060");
        sky.addColorStop(0.85, "#7a2080");
        sky.addColorStop(1, "#aa3090");
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, canvas.width, horizonY + 2);
        
        // Ground
        const ground = ctx.createLinearGradient(0, horizonY, 0, canvas.height);
        ground.addColorStop(0, "#1a0828");
        ground.addColorStop(0.3, "#0d0415");
        ground.addColorStop(1, "#000000");
        ctx.fillStyle = ground;
        ctx.fillRect(0, horizonY, canvas.width, canvas.height - horizonY);
        
        drawSun(horizonY);
        drawNeonBeams(horizonY);
        drawSkyline(horizonY);
        
        offset += speed;
        if (offset >= cellDepth) offset = 0;
        
        for (let row = -5; row < numCellsDeep + 5; row++) {
            const z = row * cellDepth;
            for (let col = -Math.floor(numCellsWide / 2); col <= Math.floor(numCellsWide / 2); col++) {
                drawCell(col * cellWidth, z, offset);
            }
        }
        
        drawScanlines();
        
        // Vignette
        const v = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.height * 0.3, canvas.width / 2, canvas.height / 2, canvas.height * 0.8);
        v.addColorStop(0, "rgba(0,0,0,0)");
        v.addColorStop(1, "rgba(0,0,0,0.5)");
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        requestAnimationFrame(animate);
    }

    // Init
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    animate();
})();