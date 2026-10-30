(function () {
    var root = document.documentElement;
    root.classList.remove('no-js');
    root.classList.add('js');

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    function store(type, key, val) {
        try {
            var s = window[type];
            if (val === undefined) return s.getItem(key);
            s.setItem(key, val);
        } catch (e) { return null; }
    }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

    /* ------------------------------------------------------------
       Theme
    ------------------------------------------------------------ */
    var themeBtn = document.getElementById('themeToggle');
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    function currentTheme() {
        return root.getAttribute('data-theme') || (mq.matches ? 'dark' : 'light');
    }
    themeBtn.addEventListener('click', function () {
        var next = currentTheme() === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        store('localStorage', 'theme', next);
        readColors();
    });
    if (mq.addEventListener) mq.addEventListener('change', function () { readColors(); });

    /* ------------------------------------------------------------
       Headline: split into words for a staggered mask reveal
    ------------------------------------------------------------ */
    var h1 = document.querySelector('.hero h1 > span');
    var wordIndex = 0;
    function splitWords(node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (child) {
            if (child.nodeType === 3) {
                var frag = document.createDocumentFragment();
                child.textContent.split(/(\s+)/).forEach(function (part) {
                    if (!part) return;
                    if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
                    var w = document.createElement('span');
                    w.className = 'w';
                    var inner = document.createElement('span');
                    inner.textContent = part;
                    inner.style.transitionDelay = (wordIndex++ * 55) + 'ms';
                    w.appendChild(inner);
                    frag.appendChild(w);
                });
                node.replaceChild(frag, child);
            } else if (child.nodeType === 1 && !child.classList.contains('rotator')) {
                splitWords(child);
            } else if (child.nodeType === 1) {
                // Keep the rotator as one unit
                var w2 = document.createElement('span');
                w2.className = 'w';
                var inner2 = document.createElement('span');
                inner2.style.transitionDelay = (wordIndex++ * 55) + 'ms';
                child.parentNode.replaceChild(w2, child);
                inner2.appendChild(child);
                w2.appendChild(inner2);
            }
        });
    }
    if (h1 && !reduced) splitWords(h1);

    /* ------------------------------------------------------------
       Rotating, scrambling word
    ------------------------------------------------------------ */
    var rot = document.getElementById('rotator');
    if (rot && !reduced) {
        var words = rot.getAttribute('data-words').split('|');
        var glyphs = '01<>/{}[]#%&*+=?·∑∂λ';
        var wi = 0;
        function scrambleTo(target) {
            var from = rot.textContent;
            var len = Math.max(from.length, target.length);
            var queue = [];
            for (var i = 0; i < len; i++) {
                var start = Math.floor(Math.random() * 14);
                queue.push({ from: from[i] || '', to: target[i] || '', start: start, end: start + 8 + Math.floor(Math.random() * 14) });
            }
            var frame = 0;
            (function tick() {
                var out = '';
                var done = 0;
                for (var j = 0; j < queue.length; j++) {
                    var q = queue[j];
                    if (frame >= q.end) { done++; out += q.to; }
                    else if (frame >= q.start) {
                        out += q.to === ' ' ? ' ' : '<span class="scr">' + glyphs[Math.floor(Math.random() * glyphs.length)] + '</span>';
                    } else out += q.from;
                }
                rot.innerHTML = out;
                frame++;
                if (done < queue.length) requestAnimationFrame(tick);
            })();
        }
        setInterval(function () {
            if (document.hidden) return;
            wi = (wi + 1) % words.length;
            scrambleTo(words[wi]);
        }, 3200);
    }

    /* ------------------------------------------------------------
       Loader: plays once per browser session
    ------------------------------------------------------------ */
    var loader = document.getElementById('loader');
    function startPage() {
        document.querySelectorAll('.hero .reveal').forEach(function (el) { el.classList.add('in'); });
    }
    if (loader) {
        if (reduced || store('sessionStorage', 'seenLoader')) {
            loader.classList.add('gone');
            startPage();
        } else {
            store('sessionStorage', 'seenLoader', '1');
            var pct = document.getElementById('loaderPct');
            var bar = document.getElementById('loaderBar');
            var ep = document.getElementById('loaderEpoch');
            var loss = document.getElementById('loaderLoss');
            var t0 = performance.now();
            var DURATION = 1400;
            (function step(now) {
                var p = clamp((now - t0) / DURATION, 0, 1);
                var e = 1 - Math.pow(1 - p, 3);
                pct.textContent = String(Math.round(e * 100)).padStart(3, '0') + '%';
                bar.style.width = (e * 100) + '%';
                ep.textContent = 'epoch ' + Math.round(e * 12) + '/12';
                loss.textContent = 'loss ' + (2.41 * Math.exp(-4 * e) + 0.031 + Math.random() * 0.01).toFixed(4);
                if (p < 1) requestAnimationFrame(step);
                else {
                    setTimeout(function () {
                        loader.classList.add('done');
                        setTimeout(startPage, 250);
                        setTimeout(function () { loader.classList.add('gone'); }, 1000);
                    }, 180);
                }
            })(t0);
        }
    } else startPage();

    /* ------------------------------------------------------------
       Neural-network canvas in the hero
    ------------------------------------------------------------ */
    var canvas = document.getElementById('net');
    var colors = { ink: '#16150f', accent: '#d9481a' };
    function readColors() {
        var cs = getComputedStyle(root);
        colors.ink = cs.getPropertyValue('--ink').trim() || colors.ink;
        colors.accent = cs.getPropertyValue('--accent').trim() || colors.accent;
    }
    readColors();

    if (canvas && !reduced) {
        var ctx = canvas.getContext('2d');
        var W = 0, H = 0, dpr = 1, nodes = [], pulses = [];
        var mouse = { x: -9999, y: -9999, active: false };
        var visible = true;

        function hexToRgb(c) {
            if (c[0] !== '#') return '128,128,128';
            var n = parseInt(c.slice(1), 16);
            return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
        }

        function build() {
            var rect = canvas.getBoundingClientRect();
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            W = rect.width; H = rect.height;
            canvas.width = W * dpr; canvas.height = H * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            var count = Math.round(clamp(W * H / 14000, 30, 110));
            nodes = [];
            for (var i = 0; i < count; i++) {
                nodes.push({
                    x: Math.random() * W, y: Math.random() * H,
                    vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25,
                    r: Math.random() * 1.6 + .8
                });
            }
            pulses = [];
        }

        var LINK = 130;
        function frame() {
            if (!visible) { requestAnimationFrame(frame); return; }
            ctx.clearRect(0, 0, W, H);
            var ink = hexToRgb(colors.ink), acc = hexToRgb(colors.accent);

            for (var i = 0; i < nodes.length; i++) {
                var n = nodes[i];
                // Gentle attraction to cursor
                if (mouse.active) {
                    var dxm = mouse.x - n.x, dym = mouse.y - n.y;
                    var dm = Math.sqrt(dxm * dxm + dym * dym);
                    if (dm < 220 && dm > 1) { n.vx += dxm / dm * .012; n.vy += dym / dm * .012; }
                }
                n.vx *= .985; n.vy *= .985;
                n.vx += (Math.random() - .5) * .012; n.vy += (Math.random() - .5) * .012;
                n.x += n.vx; n.y += n.vy;
                if (n.x < 0 || n.x > W) n.vx *= -1;
                if (n.y < 0 || n.y > H) n.vy *= -1;
                n.x = clamp(n.x, 0, W); n.y = clamp(n.y, 0, H);
            }

            for (var a = 0; a < nodes.length; a++) {
                for (var b = a + 1; b < nodes.length; b++) {
                    var p = nodes[a], q = nodes[b];
                    var dx = p.x - q.x, dy = p.y - q.y;
                    var d2 = dx * dx + dy * dy;
                    if (d2 < LINK * LINK) {
                        var d = Math.sqrt(d2);
                        var near = mouse.active && Math.hypot((p.x + q.x) / 2 - mouse.x, (p.y + q.y) / 2 - mouse.y) < 160;
                        var alpha = (1 - d / LINK) * (near ? .55 : .14);
                        ctx.strokeStyle = 'rgba(' + (near ? acc : ink) + ',' + alpha + ')';
                        ctx.lineWidth = near ? 1.1 : .7;
                        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
                        // Occasionally fire a signal along this edge
                        if (pulses.length < 14 && Math.random() < .0009) pulses.push({ a: p, b: q, t: 0 });
                    }
                }
            }

            for (var k = pulses.length - 1; k >= 0; k--) {
                var s = pulses[k];
                s.t += .02;
                if (s.t >= 1) { pulses.splice(k, 1); continue; }
                var px = s.a.x + (s.b.x - s.a.x) * s.t, py = s.a.y + (s.b.y - s.a.y) * s.t;
                ctx.fillStyle = 'rgba(' + acc + ',' + (1 - s.t) + ')';
                ctx.beginPath(); ctx.arc(px, py, 2.2, 0, Math.PI * 2); ctx.fill();
            }

            for (var m = 0; m < nodes.length; m++) {
                var nn = nodes[m];
                var hot = mouse.active && Math.hypot(nn.x - mouse.x, nn.y - mouse.y) < 140;
                ctx.fillStyle = 'rgba(' + (hot ? acc : ink) + ',' + (hot ? .9 : .35) + ')';
                ctx.beginPath(); ctx.arc(nn.x, nn.y, hot ? nn.r + 1 : nn.r, 0, Math.PI * 2); ctx.fill();
            }
            requestAnimationFrame(frame);
        }

        var shell = canvas.parentElement;
        shell.addEventListener('pointermove', function (e) {
            var r = canvas.getBoundingClientRect();
            mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.active = true;
        });
        shell.addEventListener('pointerleave', function () { mouse.active = false; });
        shell.addEventListener('click', function (e) {
            if (e.target.closest('a,button')) return;
            // Click spawns a burst of signals from the nearest node
            var best = null, bd = Infinity;
            nodes.forEach(function (n) { var d = Math.hypot(n.x - mouse.x, n.y - mouse.y); if (d < bd) { bd = d; best = n; } });
            if (!best) return;
            nodes.forEach(function (n) {
                if (n !== best && Math.hypot(n.x - best.x, n.y - best.y) < LINK * 1.6) pulses.push({ a: best, b: n, t: 0 });
                var dx = n.x - mouse.x, dy = n.y - mouse.y, d = Math.hypot(dx, dy);
                if (d < 200 && d > 1) { n.vx += dx / d * 2.2; n.vy += dy / d * 2.2; }
            });
        });
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(canvas);
        }
        var rt;
        window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(build, 150); });
        build();
        requestAnimationFrame(frame);
    }

    /* ------------------------------------------------------------
       Mobile menu
    ------------------------------------------------------------ */
    var menuBtn = document.getElementById('menuToggle');
    var nav = document.getElementById('nav');
    function setMenu(open) {
        nav.classList.toggle('open', open);
        menuBtn.setAttribute('aria-expanded', String(open));
        menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    menuBtn.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

    /* ------------------------------------------------------------
       Scroll-driven: top bar, progress, nav, parallax, timeline rail
    ------------------------------------------------------------ */
    var topbar = document.querySelector('.topbar');
    var progress = document.getElementById('progress');
    var photo = document.querySelector('.photo-frame img');
    var xpList = document.querySelector('.xp-list');
    var rail = document.getElementById('xpRail');
    var xps = Array.prototype.slice.call(document.querySelectorAll('.xp'));
    var links = Array.prototype.slice.call(nav.querySelectorAll('a'));
    var sections = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
    var ticking = false;

    function onScroll() {
        var y = window.scrollY;
        var vh = window.innerHeight;
        var max = document.documentElement.scrollHeight - vh;
        topbar.classList.toggle('scrolled', y > 8);
        progress.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';

        if (photo && !reduced && y < vh * 1.5) photo.style.setProperty('--py', (y * 0.08) + 'px');

        if (xpList && rail) {
            var r = xpList.getBoundingClientRect();
            var frac = clamp((vh * 0.6 - r.top) / r.height, 0, 1);
            rail.parentElement.style.setProperty('--rail', reduced ? 1 : frac);
            xps.forEach(function (x) {
                var xr = x.getBoundingClientRect();
                x.classList.toggle('lit', xr.top < vh * 0.6);
            });
        }

        var probe = y + vh * 0.35;
        var active = -1;
        sections.forEach(function (s, i) { if (s && s.offsetTop <= probe) active = i; });
        if (vh + y >= document.body.scrollHeight - 4) active = links.length - 1;
        links.forEach(function (a, i) { a.classList.toggle('active', i === active); });
        ticking = false;
    }
    window.addEventListener('scroll', function () {
        if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();

    /* ------------------------------------------------------------
       Reveal on scroll + count-up stats + toolkit stagger
    ------------------------------------------------------------ */
    function countUp(el) {
        var target = parseFloat(el.getAttribute('data-count'));
        var dec = parseInt(el.getAttribute('data-decimals') || '0', 10);
        if (reduced) { el.textContent = target.toFixed(dec); return; }
        var t0 = performance.now(), dur = 1600;
        (function step(now) {
            var p = clamp((now - t0) / dur, 0, 1);
            var e = 1 - Math.pow(1 - p, 4);
            el.textContent = (target * e).toFixed(dec);
            if (p < 1) requestAnimationFrame(step);
        })(t0);
    }

    document.querySelectorAll('.toolkit .tags').forEach(function (ul) {
        Array.prototype.forEach.call(ul.children, function (li, i) { li.style.transitionDelay = (i * 45) + 'ms'; });
    });

    var reveals = document.querySelectorAll('.reveal:not(.hero .reveal)');
    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var el = entry.target;
                el.classList.add('in');
                el.querySelectorAll('[data-count]').forEach(countUp);
                io.unobserve(el);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
        reveals.forEach(function (el, i) {
            el.style.transitionDelay = (Math.min(i % 4, 3) * 70) + 'ms';
            io.observe(el);
        });
    } else {
        reveals.forEach(function (el) { el.classList.add('in'); });
    }

    /* ------------------------------------------------------------
       Pointer effects: cursor, magnetic buttons, tilt, spotlight
    ------------------------------------------------------------ */
    if (finePointer && !reduced) {
        var dot = document.querySelector('.cursor-dot');
        var ring = document.querySelector('.cursor-ring');
        var cx = -100, cy = -100, rx = -100, ry = -100;
        root.classList.add('has-cursor');
        window.addEventListener('pointermove', function (e) {
            cx = e.clientX; cy = e.clientY;
            dot.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
        });
        (function follow() {
            rx += (cx - rx) * 0.18; ry += (cy - ry) * 0.18;
            ring.style.transform = 'translate(' + rx + 'px,' + ry + 'px)';
            requestAnimationFrame(follow);
        })();
        document.addEventListener('pointerover', function (e) {
            ring.classList.toggle('hover', !!e.target.closest('a,button,[data-tilt],.tags li'));
        });
        window.addEventListener('pointerdown', function () { ring.classList.add('down'); });
        window.addEventListener('pointerup', function () { ring.classList.remove('down'); });
        document.addEventListener('pointerleave', function () { cx = cy = -100; });

        document.querySelectorAll('.magnetic').forEach(function (btn) {
            btn.addEventListener('pointermove', function (e) {
                var r = btn.getBoundingClientRect();
                var mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
                btn.style.transform = 'translate(' + mx * 0.25 + 'px,' + my * 0.35 + 'px)';
            });
            btn.addEventListener('pointerleave', function () {
                btn.style.transition = 'transform .5s cubic-bezier(.2,.8,.2,1)';
                btn.style.transform = '';
                setTimeout(function () { btn.style.transition = ''; }, 500);
            });
        });

        document.querySelectorAll('[data-tilt]').forEach(function (card) {
            card.addEventListener('pointermove', function (e) {
                var r = card.getBoundingClientRect();
                var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
                card.style.transition = 'border-color .3s ease, box-shadow .3s ease';
                card.style.transform = 'rotateX(' + ((.5 - py) * 10) + 'deg) rotateY(' + ((px - .5) * 12) + 'deg) translateZ(0)';
                card.style.setProperty('--gx', px * 100 + '%');
                card.style.setProperty('--gy', py * 100 + '%');
            });
            card.addEventListener('pointerleave', function () {
                card.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1), border-color .3s ease, box-shadow .3s ease';
                card.style.transform = '';
            });
        });

        document.querySelectorAll('.work').forEach(function (row) {
            row.addEventListener('pointermove', function (e) {
                var r = row.getBoundingClientRect();
                row.style.setProperty('--mx', (e.clientX - r.left) + 'px');
                row.style.setProperty('--my', (e.clientY - r.top) + 'px');
            });
        });
    }

    /* ------------------------------------------------------------
       Copy email
    ------------------------------------------------------------ */
    var copyBtn = document.getElementById('copyEmail');
    if (copyBtn) {
        var hint = copyBtn.querySelector('.email-hint');
        copyBtn.addEventListener('click', function () {
            var email = copyBtn.getAttribute('data-email');
            var done = function () {
                copyBtn.classList.add('copied');
                hint.textContent = 'Copied';
                setTimeout(function () { copyBtn.classList.remove('copied'); hint.textContent = 'Copy'; }, 1800);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(email).then(done, function () { window.location.href = 'mailto:' + email; });
            } else {
                window.location.href = 'mailto:' + email;
            }
        });
    }

    var year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
})();
