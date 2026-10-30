/* Three.js hero: a 3D feed-forward neural network.
   Signals propagate layer to layer, nodes flash as they fire,
   the network follows the cursor, and a click runs a forward pass. */
(function () {
    window.initHero3D = function (canvas, colors) {
        var T = window.THREE;
        var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(0x000000, 0);

        var scene = new T.Scene();
        var camera = new T.PerspectiveCamera(40, 1, 0.1, 200);
        camera.position.set(0, 0, 17);

        var rig = new T.Group();      // follows the cursor
        var net = new T.Group();      // spins around its own axis
        rig.add(net);
        scene.add(rig);

        /* ---------- Build layers ---------- */
        var LAYERS = [4, 7, 10, 10, 7, 4];
        var GAP = 2.5;
        var nodes = [];
        var layerStart = [];
        LAYERS.forEach(function (count, li) {
            layerStart.push(nodes.length);
            var x = (li - (LAYERS.length - 1) / 2) * GAP;
            var r = 0.9 + count * 0.2;
            for (var i = 0; i < count; i++) {
                var a = (i / count) * Math.PI * 2 + li * 0.35;
                nodes.push({
                    pos: new T.Vector3(x, Math.cos(a) * r, Math.sin(a) * r),
                    layer: li,
                    flash: 0,
                    out: []
                });
            }
        });

        // Fully connect consecutive layers
        var edges = [];
        nodes.forEach(function (n, idx) {
            if (n.layer >= LAYERS.length - 1) return;
            var s = layerStart[n.layer + 1], e = s + LAYERS[n.layer + 1];
            for (var j = s; j < e; j++) { n.out.push(edges.length); edges.push([idx, j]); }
        });

        /* ---------- Edges ---------- */
        var edgePos = new Float32Array(edges.length * 6);
        var edgeCol = new Float32Array(edges.length * 6);
        edges.forEach(function (e, i) {
            var a = nodes[e[0]].pos, b = nodes[e[1]].pos;
            edgePos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
        });
        var edgeGeo = new T.BufferGeometry();
        edgeGeo.setAttribute('position', new T.BufferAttribute(edgePos, 3));
        edgeGeo.setAttribute('color', new T.BufferAttribute(edgeCol, 3));
        var edgeMat = new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.16, depthWrite: false });
        net.add(new T.LineSegments(edgeGeo, edgeMat));

        /* ---------- Nodes ---------- */
        var nodeGeo = new T.SphereGeometry(0.11, 20, 20);
        var nodeMat = new T.MeshBasicMaterial({ color: 0xffffff });
        var nodeMesh = new T.InstancedMesh(nodeGeo, nodeMat, nodes.length);
        net.add(nodeMesh);

        // Soft halos around nodes
        var haloTex = (function () {
            var c = document.createElement('canvas');
            c.width = c.height = 64;
            var g = c.getContext('2d');
            var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
            grd.addColorStop(0, 'rgba(255,255,255,1)');
            grd.addColorStop(0.35, 'rgba(255,255,255,.35)');
            grd.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = grd;
            g.fillRect(0, 0, 64, 64);
            return new T.CanvasTexture(c);
        })();
        var haloPos = new Float32Array(nodes.length * 3);
        nodes.forEach(function (n, i) { haloPos.set([n.pos.x, n.pos.y, n.pos.z], i * 3); });
        var haloGeo = new T.BufferGeometry();
        haloGeo.setAttribute('position', new T.BufferAttribute(haloPos, 3));
        var haloMat = new T.PointsMaterial({ size: 1.1, map: haloTex, transparent: true, opacity: 0.12, depthWrite: false });
        net.add(new T.Points(haloGeo, haloMat));

        /* ---------- Signals ---------- */
        var MAX_PULSES = 90;
        var pulseGeo = new T.SphereGeometry(0.075, 12, 12);
        var pulseMat = new T.MeshBasicMaterial({ color: 0xffffff });
        var pulseMesh = new T.InstancedMesh(pulseGeo, pulseMat, MAX_PULSES);
        pulseMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
        net.add(pulseMesh);
        var pulses = [];

        function spawn(fromNode) {
            var n = nodes[fromNode];
            if (!n.out.length || pulses.length >= MAX_PULSES) return;
            var e = n.out[Math.floor(Math.random() * n.out.length)];
            pulses.push({ edge: e, t: 0, speed: 0.012 + Math.random() * 0.012 });
        }
        function forwardPass() {
            for (var i = 0; i < LAYERS[0]; i++) { spawn(i); spawn(i); }
        }

        /* ---------- Ambient dust for depth ---------- */
        var DUST = 500;
        var dustPos = new Float32Array(DUST * 3);
        for (var d = 0; d < DUST; d++) {
            dustPos.set([(Math.random() - 0.5) * 50, (Math.random() - 0.5) * 30, -Math.random() * 30 + 4], d * 3);
        }
        var dustGeo = new T.BufferGeometry();
        dustGeo.setAttribute('position', new T.BufferAttribute(dustPos, 3));
        var dustMat = new T.PointsMaterial({ size: 0.07, transparent: true, opacity: 0.5, depthWrite: false });
        var dust = new T.Points(dustGeo, dustMat);
        scene.add(dust);

        /* ---------- Colors ---------- */
        var cA = new T.Color(), cB = new T.Color(), cInk = new T.Color(), tmpC = new T.Color();
        function setColors(c) {
            cA.set(c.accent); cB.set(c.accent2 || c.accent); cInk.set(c.ink);
            edges.forEach(function (e, i) {
                var ta = nodes[e[0]].layer / (LAYERS.length - 1), tb = nodes[e[1]].layer / (LAYERS.length - 1);
                edgeCol.set([cInk.r, cInk.g, cInk.b, cInk.r, cInk.g, cInk.b], i * 6);
            });
            edgeGeo.attributes.color.needsUpdate = true;
            nodes.forEach(function (n, i) {
                nodeMesh.setColorAt(i, cInk);
            });
            nodeMesh.instanceColor.needsUpdate = true;
            haloMat.color.copy(cInk);
            pulseMat.color.copy(cA);
            dustMat.color.copy(cInk);
        }
        setColors(colors);

        /* ---------- Layout ---------- */
        var W = 1, H = 1, baseX = 0;
        function resize() {
            var r = canvas.getBoundingClientRect();
            W = Math.max(1, r.width); H = Math.max(1, r.height);
            renderer.setSize(W, H, false);
            camera.aspect = W / H;
            camera.updateProjectionMatrix();
            var worldH = 2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
            var worldW = worldH * camera.aspect;
            var mobile = W < 820;
            baseX = mobile ? 0 : worldW * 0.27;
            var s = mobile ? Math.min(0.7, worldW / 14) : Math.min(0.9, worldW / 22);
            rig.scale.setScalar(s);
            rig.position.y = mobile ? worldH * 0.18 : 0.4;
        }
        resize();
        window.addEventListener('resize', resize);

        /* ---------- Interaction ---------- */
        var mouse = { x: 0, y: 0 }, target = { x: 0, y: 0 };
        var shell = canvas.parentElement;
        window.addEventListener('pointermove', function (e) {
            target.x = (e.clientX / window.innerWidth) * 2 - 1;
            target.y = (e.clientY / window.innerHeight) * 2 - 1;
        }, { passive: true });
        shell.addEventListener('click', function (e) {
            if (e.target.closest('a,button')) return;
            forwardPass();
            spinBoost = 0.06;
        });

        var visible = true;
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(canvas);
        }

        /* ---------- Loop ---------- */
        var m4 = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), sc = new T.Vector3();
        var spinBoost = 0, t0 = performance.now();
        var hidden = new T.Matrix4().makeScale(0, 0, 0);

        function frame(now) {
            requestAnimationFrame(frame);
            if (!visible || document.hidden) return;
            var t = (now - t0) / 1000;

            mouse.x += (target.x - mouse.x) * 0.05;
            mouse.y += (target.y - mouse.y) * 0.05;

            var scrollY = window.scrollY;
            rig.position.x = baseX + mouse.x * 0.6;
            rig.rotation.y = -0.65 + mouse.x * 0.45 + scrollY * 0.0008;
            rig.rotation.z = 0.12 + mouse.y * 0.12;
            rig.rotation.x = mouse.y * 0.25;
            spinBoost *= 0.96;
            net.rotation.x += 0.0025 + spinBoost;
            camera.position.z = 17 + scrollY * 0.006;
            dust.rotation.y = t * 0.01 + mouse.x * 0.05;
            dust.position.y = scrollY * 0.004;

            // Idle signals
            if (Math.random() < 0.12) spawn(Math.floor(Math.random() * LAYERS[0]));
            if (Math.random() < 0.05) spawn(layerStart[1] + Math.floor(Math.random() * LAYERS[1]));

            // Advance signals; when one lands, the node fires onward
            for (var i = pulses.length - 1; i >= 0; i--) {
                var p = pulses[i];
                p.t += p.speed;
                if (p.t >= 1) {
                    var dest = edges[p.edge][1];
                    nodes[dest].flash = 1;
                    pulses.splice(i, 1);
                    if (Math.random() < 0.72) spawn(dest);
                }
            }
            for (var k = 0; k < MAX_PULSES; k++) {
                if (k < pulses.length) {
                    var pp = pulses[k], e = edges[pp.edge];
                    v.copy(nodes[e[0]].pos).lerp(nodes[e[1]].pos, pp.t);
                    var ps = 0.7 + Math.sin(pp.t * Math.PI) * 0.6;
                    m4.compose(v, q, sc.set(ps, ps, ps));
                    pulseMesh.setMatrixAt(k, m4);
                } else pulseMesh.setMatrixAt(k, hidden);
            }
            pulseMesh.instanceMatrix.needsUpdate = true;

            // Nodes breathe and flash
            for (var n = 0; n < nodes.length; n++) {
                var nd = nodes[n];
                nd.flash *= 0.92;
                var s = 1 + Math.sin(t * 2 + n) * 0.08 + nd.flash * 1.1;
                m4.compose(nd.pos, q, sc.set(s, s, s));
                nodeMesh.setMatrixAt(n, m4);
                tmpC.copy(cInk).lerp(cA, Math.min(1, nd.flash * 1.4));
                nodeMesh.setColorAt(n, tmpC);
            }
            nodeMesh.instanceMatrix.needsUpdate = true;
            nodeMesh.instanceColor.needsUpdate = true;

            renderer.render(scene, camera);
        }
        requestAnimationFrame(frame);
        setTimeout(forwardPass, 1200);

        return { setColors: setColors };
    };
})();
