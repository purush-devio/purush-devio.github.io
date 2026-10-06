const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const root = document.documentElement;

/** Tiny element builder: h("span", { class: "x" }, "text", child) */
function h(tag, attrs = {}, ...children) {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === "class") el.className = v;
		else el.setAttribute(k, v);
	}
	el.append(...children);
	return el;
}

function yearsSince(value) {
	const [y, m] = value.split("-").map(Number);
	const now = new Date();
	return now.getFullYear() - y - (now.getMonth() + 1 < m ? 1 : 0);
}

/* ---------------------------------------------------
   Theme: follow the system, or pin the opposite of it
--------------------------------------------------- */
const systemDark = matchMedia("(prefers-color-scheme: dark)");
const themeListeners = [];

function isDark() {
	if (root.classList.contains("scheme-dark")) return true;
	if (root.classList.contains("scheme-light")) return false;
	return systemDark.matches;
}

function toggleTheme() {
	const next = isDark() ? "light" : "dark";
	const pinned = next === (systemDark.matches ? "dark" : "light") ? null : next;
	root.classList.remove("scheme-light", "scheme-dark");
	if (pinned) root.classList.add(`scheme-${pinned}`);
	$('meta[name="color-scheme"]').content = pinned ?? "light dark";
	try {
		pinned ? localStorage.setItem("color-scheme", pinned) : localStorage.removeItem("color-scheme");
	} catch { }
	themeListeners.forEach((fn) => fn());
}

$(".theme-toggle").addEventListener("click", toggleTheme);
systemDark.addEventListener("change", () => themeListeners.forEach((fn) => fn()));

/* ---------------------------------------------------
   Header, scrollspy, mobile nav
--------------------------------------------------- */
const header = $(".site-header");
const onScroll = () => header.classList.toggle("is-scrolled", scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
onScroll();

const navLinks = $$(".site-nav a");
if (CSS.supports("scroll-target-group: auto")) {
	const sync = () => {
		const current = $(".site-nav a:target-current");
		navLinks.forEach((a) => a.setAttribute("aria-current", a === current ? "true" : "false"));
	};
	sync();
	document.addEventListener("scrollend", sync);
} else {
	const spy = new IntersectionObserver((entries) => {
		for (const entry of entries) {
			if (!entry.isIntersecting) continue;
			navLinks.forEach((a) => {
				const active = a.getAttribute("href") === `#${entry.target.id}`;
				a.classList.toggle(":target-current", active);
				a.setAttribute("aria-current", active ? "true" : "false");
			});
		}
	}, { rootMargin: "-50% 0px -50% 0px" });
	navLinks.forEach((a) => {
		const section = $(a.getAttribute("href"));
		if (section) spy.observe(section);
	});
}

const mobileNav = $("#mobile-nav");
$$("a", mobileNav).forEach((a) => a.addEventListener("click", () => mobileNav.hidePopover?.()));

/* ---------------------------------------------------
   Dates that shouldn't go stale
--------------------------------------------------- */
$$("[data-years-since]").forEach((el) => (el.textContent = yearsSince(el.dataset.yearsSince)));
$$("[data-current-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

/* ---------------------------------------------------
   Toast + copy email
--------------------------------------------------- */
const toastEl = $(".toast");
let toastTimer;
function toast(message) {
	toastEl.textContent = message;
	toastEl.classList.add("is-visible");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
}

async function copyEmail(email) {
	try {
		await navigator.clipboard.writeText(email);
		toast("Email copied to clipboard ✓");
	} catch {
		toast(email);
	}
}

$$(".copy-email").forEach((btn) => btn.addEventListener("click", () => copyEmail(btn.dataset.email)));

/* ---------------------------------------------------
   Magnetic buttons
--------------------------------------------------- */
if (finePointer && !reduceMotion) {
	$$(".magnetic").forEach((el) => {
		el.addEventListener("pointermove", (e) => {
			const r = el.getBoundingClientRect();
			el.style.setProperty("--mx", `${(e.clientX - r.left - r.width / 2) * 0.2}px`);
			el.style.setProperty("--my", `${(e.clientY - r.top - r.height / 2) * 0.3}px`);
		});
		el.addEventListener("pointerleave", () => {
			el.style.removeProperty("--mx");
			el.style.removeProperty("--my");
		});
	});
}

/* ---------------------------------------------------
   Hero: typed headline
--------------------------------------------------- */
const phrases = [
	"Node.js and TypeScript.",
	"Angular and React.",
	"IoT devices and MQTT.",
	"AWS, GCP and Azure.",
];
const typedEl = $(".typed");

if (reduceMotion) {
	typedEl.textContent = phrases[0];
} else {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	(async () => {
		for (let i = 0; ; i = (i + 1) % phrases.length) {
			const text = phrases[i];
			for (let n = 1; n <= text.length; n++) {
				typedEl.textContent = text.slice(0, n);
				await sleep(38 + Math.random() * 40);
			}
			await sleep(1900);
			for (let n = text.length; n >= 0; n--) {
				typedEl.textContent = text.slice(0, n);
				await sleep(18);
			}
			await sleep(300);
		}
	})();
}

/* ---------------------------------------------------
   Hero: device-network canvas
   Devices drift, link to neighbours, and send packets.
   The pointer acts as a gateway that nearby devices connect to.
--------------------------------------------------- */
const hero = $(".hero");
let heroVisible = true;

(() => {
	const canvas = $(".hero-canvas");
	const ctx = canvas.getContext("2d");
	let w = 0, h = 0, dpr = 1;
	let nodes = [];
	let packets = [];
	let colors = {};
	const pointer = { x: -9999, y: -9999, active: false };
	const LINK = 140;

	function readColors() {
		const cs = getComputedStyle(root);
		colors = {
			node: cs.getPropertyValue("--accent").trim(),
			packet: cs.getPropertyValue("--accent-2").trim(),
			line: cs.getPropertyValue("--text-3").trim(),
		};
		if (reduceMotion) draw();
	}

	function resize() {
		const rect = canvas.getBoundingClientRect();
		dpr = Math.min(devicePixelRatio || 1, 2);
		w = rect.width;
		h = rect.height;
		canvas.width = w * dpr;
		canvas.height = h * dpr;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		const count = Math.min(90, Math.round((w * h) / 15000));
		nodes = Array.from({ length: count }, (_, i) => ({
			x: Math.random() * w,
			y: Math.random() * h,
			vx: (Math.random() - 0.5) * 0.3,
			vy: (Math.random() - 0.5) * 0.3,
			hub: i % 11 === 0,
		}));
		packets = [];
		if (reduceMotion) draw();
	}

	function spawnPacket() {
		const a = nodes[(Math.random() * nodes.length) | 0];
		if (!a) return;
		let best = null, bestD = LINK;
		for (const b of nodes) {
			if (b === a) continue;
			const d = Math.hypot(a.x - b.x, a.y - b.y);
			if (d < bestD && (b.hub || Math.random() < 0.3)) {
				best = b;
				bestD = d;
			}
		}
		if (best) packets.push({ a, b: best, t: 0 });
	}

	function draw() {
		ctx.clearRect(0, 0, w, h);
		ctx.lineWidth = 1;

		for (let i = 0; i < nodes.length; i++) {
			const a = nodes[i];
			for (let j = i + 1; j < nodes.length; j++) {
				const b = nodes[j];
				const d = Math.hypot(a.x - b.x, a.y - b.y);
				if (d < LINK) {
					ctx.globalAlpha = (1 - d / LINK) * 0.35;
					ctx.strokeStyle = colors.line;
					ctx.beginPath();
					ctx.moveTo(a.x, a.y);
					ctx.lineTo(b.x, b.y);
					ctx.stroke();
				}
			}
			if (pointer.active) {
				const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
				if (d < LINK * 1.3) {
					ctx.globalAlpha = (1 - d / (LINK * 1.3)) * 0.8;
					ctx.strokeStyle = colors.node;
					ctx.beginPath();
					ctx.moveTo(a.x, a.y);
					ctx.lineTo(pointer.x, pointer.y);
					ctx.stroke();
				}
			}
		}

		for (const n of nodes) {
			ctx.globalAlpha = n.hub ? 0.9 : 0.55;
			ctx.fillStyle = colors.node;
			ctx.beginPath();
			ctx.arc(n.x, n.y, n.hub ? 3.2 : 1.8, 0, Math.PI * 2);
			ctx.fill();
			if (n.hub) {
				ctx.globalAlpha = 0.15;
				ctx.beginPath();
				ctx.arc(n.x, n.y, 9, 0, Math.PI * 2);
				ctx.fill();
			}
		}

		ctx.fillStyle = colors.packet;
		for (const p of packets) {
			ctx.globalAlpha = 1 - Math.abs(p.t - 0.5);
			ctx.beginPath();
			ctx.arc(p.a.x + (p.b.x - p.a.x) * p.t, p.a.y + (p.b.y - p.a.y) * p.t, 2.4, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	function step() {
		for (const n of nodes) {
			if (pointer.active) {
				const dx = pointer.x - n.x, dy = pointer.y - n.y;
				const d = Math.hypot(dx, dy);
				if (d < 180 && d > 1) {
					n.vx += (dx / d) * 0.012;
					n.vy += (dy / d) * 0.012;
				}
			}
			n.vx *= 0.99;
			n.vy *= 0.99;
			const speed = Math.hypot(n.vx, n.vy);
			if (speed < 0.08) {
				n.vx += (Math.random() - 0.5) * 0.04;
				n.vy += (Math.random() - 0.5) * 0.04;
			}
			n.x += n.vx;
			n.y += n.vy;
			if (n.x < 0 || n.x > w) n.vx *= -1;
			if (n.y < 0 || n.y > h) n.vy *= -1;
			n.x = Math.max(0, Math.min(w, n.x));
			n.y = Math.max(0, Math.min(h, n.y));
		}
		if (Math.random() < 0.08) spawnPacket();
		packets = packets.filter((p) => (p.t += 0.018) < 1);
	}

	let raf = 0;
	function loop() {
		step();
		draw();
		raf = requestAnimationFrame(loop);
	}
	function start() {
		if (!raf && !reduceMotion && heroVisible && !document.hidden) raf = requestAnimationFrame(loop);
	}
	function stop() {
		cancelAnimationFrame(raf);
		raf = 0;
	}

	new ResizeObserver(resize).observe(canvas);
	themeListeners.push(readColors);
	readColors();

	new IntersectionObserver(([entry]) => {
		heroVisible = entry.isIntersecting;
		heroVisible ? start() : stop();
	}).observe(hero);
	document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

	if (finePointer) {
		hero.addEventListener("pointermove", (e) => {
			const r = canvas.getBoundingClientRect();
			pointer.x = e.clientX - r.left;
			pointer.y = e.clientY - r.top;
			pointer.active = true;
		});
		hero.addEventListener("pointerleave", () => (pointer.active = false));
	}
	start();
})();

/* ---------------------------------------------------
   Hero: live telemetry feed (illustrative — generic
   dev/ops flavour text, not any specific system)
--------------------------------------------------- */
(() => {
	const log = $(".telemetry-log");
	const rand = (a, b) => a + Math.random() * (b - a);
	const pick = (arr) => arr[(Math.random() * arr.length) | 0];
	const id = () => Math.floor(rand(1000, 99999));
	const time = () => new Date().toTimeString().slice(0, 8);

	const templates = [
		() => [["t-topic", `device/${id()}/telemetry `], ["t-key", `{temp:${rand(18, 27).toFixed(1)}, mode:"${pick(["cool", "heat", "auto"])}"}`], ["t-ok", " ✓"]],
		() => [["t-topic", "api/deploy "], ["", `build #${id() % 900 + 100} → production`], ["t-ok", " ✓"]],
		() => [["t-topic", `queue/jobs `], ["t-key", `{pending:${Math.round(rand(2, 40))}}`]],
		() => [["t-topic", "auth/verify "], ["", `${pick(["IN", "SG", "EU", "US"])}-${id()} `], ["t-ok", "token valid ✓"]],
		() => [["t-topic", "mqtt/register "], ["", `dev-${id().toString(16)} `], ["t-ok", "provisioned ✓"]],
		() => [["t-topic", "worker/upload "], ["", `ack ${Math.round(rand(8, 60))}ms`]],
		() => [["t-topic", "cloud/scale "], ["", `${pick(["out", "in"])} → ${Math.round(rand(4, 12))} instances`], ["t-ok", " ✓"]],
	];

	function addLine() {
		const parts = pick(templates)().map(([cls, text]) => h("span", cls ? { class: cls } : {}, text));
		log.append(h("li", {}, h("span", { class: "t-time" }, `${time()} `), ...parts));
		while (log.children.length > 14) log.firstElementChild.remove();
	}

	for (let i = 0; i < 9; i++) addLine();
	if (!reduceMotion) {
		setInterval(() => {
			if (heroVisible && !document.hidden) addLine();
		}, 1300);
	}
})();

/* ---------------------------------------------------
   Stats count-up
--------------------------------------------------- */
(() => {
	const counters = $$(".count");
	counters.forEach((el) => {
		el.dataset.target = el.dataset.countYearsSince ? yearsSince(el.dataset.countYearsSince) : el.dataset.count;
		el.textContent = el.dataset.target;
	});
	if (reduceMotion) return;

	const io = new IntersectionObserver((entries) => {
		for (const entry of entries) {
			if (!entry.isIntersecting) continue;
			io.unobserve(entry.target);
			const el = entry.target;
			const target = Number(el.dataset.target);
			const t0 = performance.now();
			const dur = 1600;
			const tick = (now) => {
				const p = Math.min(1, (now - t0) / dur);
				el.textContent = Math.round(target * (1 - Math.pow(2, -10 * p)));
				if (p < 1) requestAnimationFrame(tick);
				else el.textContent = target;
			};
			requestAnimationFrame(tick);
		}
	}, { threshold: 0.6 });
	counters.forEach((el) => io.observe(el));
})();

/* ---------------------------------------------------
   Projects: tech filter, detail dialog, tilt
   (no category filter buttons — see index.html's own
   comment on why: one project doesn't need one yet)
--------------------------------------------------- */
const cards = $$(".project-card");
const filterBtns = $$(".filter");
const techPill = $(".tech-filter");
const emptyState = $(".empty-state");
const state = { tag: "all", tech: null };

cards.forEach((card, i) => {
	card.style.viewTransitionName = `project-${i}`;
	card.techs = card.dataset.tech.split(",");
	card.tags = card.dataset.tags.split(" ");
});

function renderFilters() {
	let shown = 0;
	for (const card of cards) {
		const ok = (state.tag === "all" || card.tags.includes(state.tag)) && (!state.tech || card.techs.includes(state.tech));
		card.hidden = !ok;
		if (ok) shown++;
	}
	filterBtns.forEach((b) => {
		const active = b.dataset.filter === state.tag;
		b.classList.toggle("is-active", active);
		b.setAttribute("aria-pressed", active);
	});
	techPill.hidden = !state.tech;
	if (state.tech) $(".tech-filter-name").textContent = state.tech;
	emptyState.hidden = shown > 0;
}

function applyFilters(update) {
	const run = () => {
		update();
		renderFilters();
	};
	if (document.startViewTransition && !reduceMotion) document.startViewTransition(run);
	else run();
}

filterBtns.forEach((btn) => btn.addEventListener("click", () => applyFilters(() => (state.tag = btn.dataset.filter))));
$(".tech-filter-clear").addEventListener("click", () => applyFilters(() => (state.tech = null)));

function filterByTech(tech) {
	$("#projects").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
	setTimeout(() => applyFilters(() => {
		state.tag = "all";
		state.tech = tech;
	}), reduceMotion ? 0 : 450);
}

// Dialog
const dialog = $("#project-dialog");

function openProject(card) {
	$(".dialog-meta", dialog).textContent = `${$(".project-year", card).textContent} · ${$(".project-client", card).textContent}`;
	$("#dialog-title").textContent = $("h3", card).textContent;
	const body = $(".dialog-body", dialog);
	body.replaceChildren(...[...$(".project-details", card).children].map((n) => n.cloneNode(true)));
	body.append($(".tags", card).cloneNode(true));
	dialog.showModal();
	dialog.scrollTop = 0;
}

cards.forEach((card) => $(".project-open", card).addEventListener("click", () => openProject(card)));

if (!("closedBy" in HTMLDialogElement.prototype)) {
	dialog.addEventListener("click", (e) => {
		if (e.target !== dialog) return;
		const r = dialog.getBoundingClientRect();
		const inside = r.top <= e.clientY && e.clientY <= r.bottom && r.left <= e.clientX && e.clientX <= r.right;
		if (!inside) dialog.close();
	});
}
if (!("commandForElement" in HTMLButtonElement.prototype)) {
	$(".dialog-close").addEventListener("click", () => dialog.close());
}

// Spotlight + subtle tilt
if (finePointer) {
	cards.forEach((card) => {
		card.addEventListener("pointermove", (e) => {
			const r = card.getBoundingClientRect();
			const x = e.clientX - r.left, y = e.clientY - r.top;
			card.style.setProperty("--spot-x", `${x}px`);
			card.style.setProperty("--spot-y", `${y}px`);
			if (!reduceMotion) {
				card.style.setProperty("--rx", `${((y / r.height) - 0.5) * -5}deg`);
				card.style.setProperty("--ry", `${((x / r.width) - 0.5) * 5}deg`);
			}
		});
		card.addEventListener("pointerleave", () => {
			card.style.removeProperty("--rx");
			card.style.removeProperty("--ry");
		});
	});
}

/* ---------------------------------------------------
   Skills → projects
--------------------------------------------------- */
$$(".chips button[data-tech]").forEach((btn) => {
	const tech = btn.dataset.tech;
	const count = cards.filter((c) => c.techs.includes(tech)).length;
	if (!count) {
		btn.setAttribute("aria-disabled", "true");
		btn.title = "Part of my toolkit; no featured project uses it yet";
		return;
	}
	btn.setAttribute("aria-label", `${btn.textContent}: show ${count} project${count > 1 ? "s" : ""}`);
	btn.append(h("span", { class: "chip-count", "aria-hidden": "true" }, String(count)));
	btn.addEventListener("click", () => filterByTech(tech));
});

/* ---------------------------------------------------
   Terminal
--------------------------------------------------- */
(() => {
	const out = $(".terminal-output");
	const body = $(".terminal-body");
	const form = $(".terminal-form");
	const input = $(".terminal-input");
	const history = [];
	let hIdx = 0;

	const EMAIL = "purushoth.devlancer@gmail.com";
	const link = (text, href) => ({ text, href });
	const c = (cls, text) => ({ cls, text });

	function print(...lines) {
		for (const line of lines) {
			const parts = Array.isArray(line) ? line : [line];
			const p = h("p");
			for (const part of parts) {
				if (typeof part === "string") p.append(part);
				else if (part.href) p.append(h("a", { href: part.href, target: part.href.startsWith("#") ? "_self" : "_blank", rel: "noopener" }, part.text));
				else p.append(h("span", { class: part.cls }, part.text));
			}
			out.append(p);
		}
		body.scrollTop = body.scrollHeight;
	}

	const projectNames = cards.map((card) => $("h3", card).textContent);

	const commands = {
		help: {
			desc: "list commands",
			run: () => print(
				c("dim", "Available commands:"),
				...Object.entries(commands)
					.filter(([, v]) => v.desc)
					.map(([k, v]) => [c("hl", k.padEnd(12)), c("dim", v.desc)]),
			),
		},
		whoami: {
			desc: "about me",
			run: () => print(
				[c("hl", "Purushothaman K"), " · freelance full-stack developer · Chennai"],
				`${yearsSince("2018-05")}+ years working with Node.js, Angular, React and IoT apps.`,
			),
		},
		now: {
			desc: "what I'm working on",
			run: () => print(
				[c("ok", "●"), " Taking on new freelance & contract projects."],
				c("dim", "  Full-stack web apps, APIs, and cloud/IoT integrations."),
			),
		},
		experience: {
			desc: "a quick summary",
			run: () => print(
				[c("hl", "8+ years "), "building production web apps, APIs and cloud/IoT backends."],
				[c("hl", "Now "), "available for freelance and contract work."],
				c("dim", "Type 'stack' for the technologies, or 'projects' to see what I've built."),
			),
		},
		projects: {
			desc: "list projects (then: open <n>)",
			run: () => print(
				...projectNames.map((name, i) => [c("hl", `  ${i + 1}. `), name]),
				c("dim", "Type 'open 1' to see details."),
			),
		},
		open: {
			run: (arg) => {
				const n = Number(arg) - 1;
				if (!cards[n]) return print(c("err", "usage: open <1-" + cards.length + ">"));
				print(c("ok", `Opening ${projectNames[n]}…`));
				openProject(cards[n]);
			},
		},
		stack: {
			desc: "technologies I use",
			run: () => print(
				[c("hl", "lang     "), "TypeScript, JavaScript, Node.js"],
				[c("hl", "backend  "), "Express, microservices, Sequelize, Firebase Functions"],
				[c("hl", "messaging"), " MQTT, RabbitMQ, Redis"],
				[c("hl", "data     "), "MongoDB, MySQL, PostgreSQL, Firestore"],
				[c("hl", "cloud    "), "AWS, GCP, Azure, Terraform, Kubernetes"],
				[c("hl", "frontend "), "Angular, React, Vue"],
			),
		},
		contact: {
			desc: "how to reach me",
			run: () => print(
				[c("hl", "email    "), link(EMAIL, `mailto:${EMAIL}`)],
				[c("hl", "linkedin "), link("in/dev-purushothaman-k", "https://www.linkedin.com/in/dev-purushothaman-k")],
				[c("hl", "github   "), link("github.com/purush-devio", "https://github.com/purush-devio")],
				c("dim", "Tip: 'copy' puts my email on your clipboard."),
			),
		},
		copy: {
			desc: "copy my email",
			run: () => {
				copyEmail(EMAIL);
				print(c("ok", "✓ copied " + EMAIL));
			},
		},
		theme: {
			desc: "toggle light/dark",
			run: () => {
				toggleTheme();
				print(c("ok", `✓ switched to ${isDark() ? "dark" : "light"} mode`));
			},
		},
		ls: {
			run: () => print("about.txt  services/  projects/  stack.json  contact.md"),
		},
		cat: {
			run: (arg = "") => {
				const map = { "about.txt": "whoami", "stack.json": "stack", "contact.md": "contact", "services": "experience", "services/": "experience", "projects": "projects", "projects/": "projects" };
				map[arg] ? commands[map[arg]].run() : print(c("err", `cat: ${arg || "missing file"}: No such file`));
			},
		},
		sudo: {
			run: (arg) => arg === "hire-me"
				? print(c("ok", "[sudo] access granted."), ["Let's talk → ", link(EMAIL, `mailto:${EMAIL}`)])
				: print(c("err", "Permission denied."), c("dim", "…unless you try 'sudo hire-me'.")),
		},
		clear: { desc: "clear the screen", run: () => out.replaceChildren() },
		exit: { run: () => print(c("dim", "There's no exit. Try 'contact' instead. 🙂")) },
	};
	commands.skills = { run: commands.stack.run };

	function run(raw) {
		const line = raw.trim();
		out.append(h("p", { class: "cmd" }, line));
		body.scrollTop = body.scrollHeight;
		if (!line) return;
		history.push(line);
		hIdx = history.length;
		const [name, ...args] = line.split(/\s+/);
		const cmd = commands[name.toLowerCase()];
		if (cmd) cmd.run(args.join(" "));
		else print([c("err", `command not found: ${name}`), c("dim", " · type 'help'")]);
	}

	form.addEventListener("submit", (e) => {
		e.preventDefault();
		run(input.value);
		input.value = "";
	});

	input.addEventListener("keydown", (e) => {
		if (e.key === "ArrowUp" && history.length) {
			e.preventDefault();
			hIdx = Math.max(0, hIdx - 1);
			input.value = history[hIdx];
		} else if (e.key === "ArrowDown" && history.length) {
			e.preventDefault();
			hIdx = Math.min(history.length, hIdx + 1);
			input.value = history[hIdx] ?? "";
		} else if (e.key === "Tab" && input.value) {
			const matches = Object.keys(commands).filter((k) => k.startsWith(input.value.toLowerCase()));
			if (matches.length === 1) {
				e.preventDefault();
				input.value = matches[0] + " ";
			}
		}
	});

	$$(".terminal-chips button").forEach((btn) => btn.addEventListener("click", () => run(btn.dataset.cmd)));
	body.addEventListener("click", (e) => {
		if (!e.target.closest("a") && !getSelection().toString()) input.focus({ preventScroll: true });
	});

	document.addEventListener("keydown", (e) => {
		if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.target.closest("input, textarea, [contenteditable]") || dialog.open) return;
		e.preventDefault();
		$(".terminal").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
		input.focus({ preventScroll: true });
	});

	print(c("dim", "Welcome! This terminal works. Type 'help', or tap a command below."));

	// Type out `whoami` the first time the terminal scrolls into view.
	const io = new IntersectionObserver(async ([entry]) => {
		if (!entry.isIntersecting) return;
		io.disconnect();
		const cmd = "whoami";
		if (input.value || document.activeElement === input) return run(cmd);
		if (!reduceMotion) {
			for (let i = 1; i <= cmd.length; i++) {
				input.value = cmd.slice(0, i);
				await new Promise((r) => setTimeout(r, 90));
			}
			await new Promise((r) => setTimeout(r, 250));
		}
		input.value = "";
		run(cmd);
	}, { threshold: 0.5 });
	io.observe($(".terminal"));
})();
