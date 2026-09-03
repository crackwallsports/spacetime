(() => {
  const root = document.querySelector("[data-archive-root]");
  if (!root) return;
  const initialQuery = new URLSearchParams(window.location.search);
  const state = {
    all: [],
    query: initialQuery,
    page: Math.max(1, Number(initialQuery.get("page")) || 1),
    pageSize: 30,
  };
  let removeOutsideListener = () => {};

  const basePath = new URL(".", window.location.href).pathname.replace(/\/$/, "");
  const siteUrl = (url) => url.startsWith("/") && !url.startsWith(`${basePath}/`) ? `${basePath}${url}` : url;
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const formatDate = (value) => value ? new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value)) : "Undated";

  function updateUrl() {
    const next = new URLSearchParams();
    for (const key of ["q", "tag", "year", "sort"]) if (state.query.get(key)) next.set(key, state.query.get(key));
    if (state.page > 1) next.set("page", String(state.page));
    const search = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }

  function filtered() {
    const query = (state.query.get("q") || "").trim().toLowerCase();
    const tag = state.query.get("tag") || "";
    const year = state.query.get("year") || "";
    const sort = state.query.get("sort") || "newest";
    return state.all.filter((entry) => {
      const searchable = entry.searchable ?? [entry.title, entry.excerpt, ...(entry.tags || [])].join(" ").toLowerCase();
      return (!query || searchable.includes(query)) && (!tag || (entry.tags || []).includes(tag)) && (!year || String(entry.date || "").startsWith(year));
    }).sort((left, right) => {
      const direction = sort === "oldest" ? 1 : -1;
      return (Date.parse(left.date || "") - Date.parse(right.date || "")) * direction;
    });
  }

  function card(entry) {
    const cover = entry.cover ? `<img loading="lazy" decoding="async" src="${escapeHtml(siteUrl(entry.cover))}" alt="${escapeHtml(entry.title || "Page cover")}">` : "<span class=\"archive-card-placeholder\" aria-hidden=\"true\"></span>";
    const displayTags = entry.tags?.includes("测试用例")
      ? ["测试用例", ...(entry.tags || []).filter((tag) => tag !== "测试用例")].slice(0, 3)
      : (entry.tags || []).slice(0, 3);
    const tags = displayTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
    return `<article class="archive-card"><a href="${escapeHtml(siteUrl(entry.url))}"><div class="archive-card-media">${cover}</div><div class="archive-card-body"><time>${escapeHtml(formatDate(entry.date))}</time><h2>${escapeHtml(entry.title || "Untitled Page")}</h2>${entry.excerpt ? `<p>${escapeHtml(entry.excerpt)}</p>` : ""}<div class="archive-card-tags">${tags}</div></div></a></article>`;
  }

  function selectControl(key, label, options, selected) {
    const current = options.find((option) => option.value === selected) || options[0];
    const ariaLabel = key === "tag" ? "Filter by tag" : key === "year" ? "Filter by year" : "Sort Pages";
    return `<label class="archive-filter"><span>${label}</span><div class="archive-select" data-archive-select="${key}"><button type="button" class="archive-select-trigger" aria-label="${ariaLabel}" aria-haspopup="listbox" aria-expanded="false"><span data-archive-selected>${escapeHtml(current.label)}</span><span class="archive-select-chevron" aria-hidden="true"></span></button><div class="archive-select-menu" role="listbox" hidden>${options.map((option) => `<button type="button" role="option" aria-selected="${option.value === current.value}" data-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join("")}</div></div></label>`;
  }

  function render() {
    const results = filtered();
    const totalPages = Math.max(1, Math.ceil(results.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const visible = results.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
    const cards = visible.map(card).join("");
    root.querySelector("[data-archive-results]").innerHTML = cards || `<p class="archive-empty">No Pages match these filters.</p>`;
    root.querySelector("[data-archive-count]").textContent = `${results.length} Page${results.length === 1 ? "" : "s"}`;
    root.querySelector("[data-archive-page]").textContent = `Page ${state.page} of ${totalPages}`;
    root.querySelector("[data-archive-prev]").disabled = state.page <= 1;
    root.querySelector("[data-archive-next]").disabled = state.page >= totalPages;
    updateUrl();
  }

  function controls() {
    const years = [...new Set(state.all.map((entry) => String(entry.date || "").slice(0, 4)).filter(Boolean))].sort().reverse();
    const tags = [...new Set(state.all.flatMap((entry) => entry.tags || []))].sort((left, right) => left.localeCompare(right));
    removeOutsideListener();
    const tagOptions = [{ value: "", label: "All tags" }, ...tags.map((tag) => ({ value: tag, label: tag }))];
    const yearOptions = [{ value: "", label: "All years" }, ...years.map((year) => ({ value: year, label: year }))];
    const sortOptions = [{ value: "newest", label: "Newest" }, { value: "oldest", label: "Oldest" }];
    root.innerHTML = `<section class="archive-controls"><label class="archive-search"><span>Search</span><input data-archive-query aria-label="Search title, tag, or excerpt" type="search" placeholder="Title, tag, or excerpt" value="${escapeHtml(state.query.get("q") || "")}"></label>${selectControl("tag", "Tag", tagOptions, state.query.get("tag") || "")}${selectControl("year", "Year", yearOptions, state.query.get("year") || "")}${selectControl("sort", "Sort", sortOptions, state.query.get("sort") || "newest")}</section><div class="archive-summary" role="status" aria-live="polite"><strong data-archive-count></strong><span data-archive-page></span></div><section class="archive-results" aria-live="polite" data-archive-results></section><nav class="archive-navigation" aria-label="Archive pagination"><button data-archive-prev aria-label="Previous Archive page" type="button">Previous</button><button data-archive-next aria-label="Next Archive page" type="button">Next</button></nav>`;
    const query = root.querySelector("[data-archive-query]");
    const change = () => { state.query.set("q", query.value); state.page = 1; render(); };
    query.addEventListener("input", change);
    const closeMenus = () => root.querySelectorAll(".archive-select.is-open").forEach((select) => { select.classList.remove("is-open"); select.querySelector(".archive-select-trigger")?.setAttribute("aria-expanded", "false"); const menu = select.querySelector(".archive-select-menu"); if (menu) menu.hidden = true; });
    const openMenu = (select) => { closeMenus(); select.classList.add("is-open"); select.querySelector(".archive-select-trigger")?.setAttribute("aria-expanded", "true"); const menu = select.querySelector(".archive-select-menu"); if (menu) menu.hidden = false; };
    root.querySelectorAll("[data-archive-select]").forEach((select) => {
      const trigger = select.querySelector(".archive-select-trigger");
      trigger.addEventListener("click", () => select.classList.contains("is-open") ? closeMenus() : openMenu(select));
      trigger.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { closeMenus(); return; }
        if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") { event.preventDefault(); openMenu(select); select.querySelector('[role="option"][aria-selected="true"]')?.focus(); }
      });
      select.querySelectorAll('[role="option"]').forEach((option) => option.addEventListener("click", () => {
        const value = option.dataset.value || "";
        const key = select.dataset.archiveSelect;
        state.query.set(key, value);
        state.page = 1;
        closeMenus();
        controls();
        render();
      }));
      select.querySelectorAll('[role="option"]').forEach((option) => option.addEventListener("keydown", (event) => {
        const options = [...select.querySelectorAll('[role="option"]')];
        const index = options.indexOf(option);
        if (event.key === "ArrowDown") { event.preventDefault(); options[(index + 1) % options.length].focus(); }
        if (event.key === "ArrowUp") { event.preventDefault(); options[(index - 1 + options.length) % options.length].focus(); }
        if (event.key === "Escape") { event.preventDefault(); closeMenus(); trigger.focus(); }
      }));
    });
    const outsideListener = (event) => { if (!root.contains(event.target)) closeMenus(); };
    document.addEventListener("pointerdown", outsideListener);
    removeOutsideListener = () => document.removeEventListener("pointerdown", outsideListener);
    root.querySelector("[data-archive-prev]").addEventListener("click", () => { state.page -= 1; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    root.querySelector("[data-archive-next]").addEventListener("click", () => { state.page += 1; render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  window.addEventListener("popstate", () => {
    state.query = new URLSearchParams(window.location.search);
    state.page = Math.max(1, Number(state.query.get("page")) || 1);
    controls();
    render();
  });

  fetch(`${basePath}/page-index.json`, { cache: "no-store" })
    .then((response) => { if (!response.ok) throw new Error("Archive index unavailable"); return response.json(); })
    .then((entries) => { state.all = (Array.isArray(entries) ? entries : []).map((entry) => ({ ...entry, searchable: [entry.title, entry.excerpt, ...(entry.tags || [])].join(" ").toLowerCase() })); controls(); render(); })
    .catch(() => { root.innerHTML = '<p class="archive-empty" role="alert">The Page index could not be loaded. Please try again later.</p>'; });
})();
