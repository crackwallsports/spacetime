(() => {
  const root = document.querySelector("[data-archive-root]");
  if (!root) return;

  const QUERY_KEYS = ["q", "tag", "year", "sort"];
  const DEFAULT_SORT = "newest";
  const PAGE_SIZE = 30;
  const initialQuery = new URLSearchParams(window.location.search);
  const state = {
    all: [],
    query: initialQuery,
    page: Math.max(1, Number.parseInt(initialQuery.get("page") || "1", 10) || 1),
  };
  let removeOutsideListener = () => {};

  const basePath = new URL(".", window.location.href).pathname.replace(/\/$/, "");
  const siteUrl = (value) => {
    const url = String(value ?? "");
    if (!url || /^(?:https?:|\/\/|mailto:|#)/i.test(url)) return url;
    return url.startsWith("/") && !url.startsWith(`${basePath}/`) ? `${basePath}${url}` : url;
  };
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const dateValue = (value) => {
    const parsed = Date.parse(String(value ?? ""));
    return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  };
  const formatDate = (value) => {
    const parsed = dateValue(value);
    return parsed === Number.NEGATIVE_INFINITY ? "Undated" : new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(parsed));
  };
  const compareText = (left, right) => String(left ?? "").localeCompare(String(right ?? ""));

  function normalizeEntry(entry) {
    const value = entry && typeof entry === "object" ? entry : {};
    const tags = Array.isArray(value.tags) ? [...new Set(value.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))] : [];
    const title = typeof value.title === "string" ? value.title.trim() : "";
    const excerpt = typeof value.excerpt === "string" ? value.excerpt.trim() : "";
    return {
      id: typeof value.id === "string" ? value.id : "",
      url: typeof value.url === "string" ? value.url : "",
      title,
      date: typeof value.date === "string" ? value.date : "",
      tags,
      excerpt,
      cover: typeof value.cover === "string" ? value.cover : "",
      searchable: [title, excerpt, ...tags].join(" ").toLowerCase(),
    };
  }

  function updateUrl() {
    const next = new URLSearchParams();
    for (const key of QUERY_KEYS) if (state.query.get(key)) next.set(key, state.query.get(key));
    if (state.page > 1) next.set("page", String(state.page));
    const search = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }

  function hasActiveFilters() {
    return Boolean(state.query.get("q") || state.query.get("tag") || state.query.get("year") || state.query.get("sort") === "oldest");
  }

  function filtered() {
    const query = (state.query.get("q") || "").trim().toLowerCase();
    const tag = state.query.get("tag") || "";
    const year = state.query.get("year") || "";
    const sort = state.query.get("sort") === "oldest" ? "oldest" : DEFAULT_SORT;
    const direction = sort === "oldest" ? 1 : -1;
    return state.all.filter((entry) => {
      return (!query || entry.searchable.includes(query)) && (!tag || entry.tags.includes(tag)) && (!year || entry.date.startsWith(year));
    }).sort((left, right) => {
      const dateDifference = (dateValue(left.date) - dateValue(right.date)) * direction;
      if (dateDifference) return dateDifference;
      const idDifference = compareText(right.id, left.id);
      return idDifference || compareText(right.url, left.url);
    });
  }

  function card(entry) {
    const hasCover = Boolean(entry.cover);
    const media = hasCover ? `<div class="archive-card-media"><img loading="lazy" decoding="async" src="${escapeHtml(siteUrl(entry.cover))}" alt="${escapeHtml(entry.title || "Page cover")}"></div>` : "";
    const displayTags = entry.tags.includes("测试用例")
      ? ["测试用例", ...entry.tags.filter((tag) => tag !== "测试用例")].slice(0, 3)
      : entry.tags.slice(0, 3);
    const tags = displayTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
    const datetime = entry.date ? ` datetime="${escapeHtml(entry.date)}"` : "";
    return `<article class="archive-card ${hasCover ? "has-cover" : "text-card"}"><a href="${escapeHtml(siteUrl(entry.url) || "#")}">${media}<div class="archive-card-body"><time${datetime}>${escapeHtml(formatDate(entry.date))}</time><h2>${escapeHtml(entry.title || "Untitled Page")}</h2>${entry.excerpt ? `<p>${escapeHtml(entry.excerpt)}</p>` : ""}${tags ? `<div class="archive-card-tags">${tags}</div>` : ""}</div></a></article>`;
  }

  function selectControl(key, label, options, selected) {
    const current = options.find((option) => option.value === selected) || options[0];
    const ariaLabel = key === "tag" ? "Filter by tag" : key === "year" ? "Filter by year" : "Sort Pages";
    const menuId = `archive-${key}-options`;
    return `<label class="archive-filter"><span>${label}</span><div class="archive-select" data-archive-select="${key}"><button type="button" class="archive-select-trigger" aria-label="${ariaLabel}" aria-haspopup="listbox" aria-controls="${menuId}" aria-expanded="false"><span data-archive-selected>${escapeHtml(current.label)}</span><span class="archive-select-chevron" aria-hidden="true"></span></button><div class="archive-select-menu" id="${menuId}" role="listbox" hidden>${options.map((option) => `<button type="button" role="option" tabindex="-1" aria-selected="${option.value === current.value}" data-value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</button>`).join("")}</div></div></label>`;
  }

  function renderActiveFilters() {
    const container = root.querySelector("[data-archive-active-filters]");
    if (!container) return;
    const filters = [];
    const query = state.query.get("q");
    if (query) filters.push(`<button type="button" data-clear-filter="q">Search: ${escapeHtml(query)}<span aria-hidden="true"> ×</span></button>`);
    if (state.query.get("tag")) filters.push(`<button type="button" data-clear-filter="tag">Tag: ${escapeHtml(state.query.get("tag"))}<span aria-hidden="true"> ×</span></button>`);
    if (state.query.get("year")) filters.push(`<button type="button" data-clear-filter="year">Year: ${escapeHtml(state.query.get("year"))}<span aria-hidden="true"> ×</span></button>`);
    if (state.query.get("sort") === "oldest") filters.push(`<button type="button" data-clear-filter="sort">Sort: Oldest<span aria-hidden="true"> ×</span></button>`);
    container.hidden = filters.length === 0;
    container.innerHTML = filters.length ? `<div class="archive-active-filter-list">${filters.join("")}</div><button type="button" class="archive-clear-filters" data-archive-clear-filters>Clear filters</button>` : "";
    container.querySelectorAll("[data-clear-filter]").forEach((button) => button.addEventListener("click", () => {
      state.query.delete(button.dataset.clearFilter || "");
      state.page = 1;
      controls();
      render({ focusResults: true });
    }));
    container.querySelector("[data-archive-clear-filters]")?.addEventListener("click", () => {
      state.query = new URLSearchParams();
      state.page = 1;
      controls();
      render({ focusResults: true });
    });
  }

  function render({ focusResults = false } = {}) {
    const results = filtered();
    const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), totalPages);
    const visible = results.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);
    const resultsRoot = root.querySelector("[data-archive-results]");
    const emptyMessage = state.all.length ? "No Pages match these filters." : "No published Pages yet.";
    resultsRoot.innerHTML = visible.length ? visible.map(card).join("") : `<div class="archive-empty"><p>${emptyMessage}</p>${hasActiveFilters() ? '<button type="button" class="archive-clear-filters" data-archive-clear-filters>Clear filters</button>' : ""}</div>`;
    root.querySelector("[data-archive-count]").textContent = `${results.length} Page${results.length === 1 ? "" : "s"}`;
    root.querySelector("[data-archive-page]").textContent = `Page ${state.page} of ${totalPages}`;
    root.querySelector("[data-archive-prev]").disabled = state.page <= 1;
    root.querySelector("[data-archive-next]").disabled = state.page >= totalPages;
    const clearSearch = root.querySelector("[data-archive-clear-search]");
    if (clearSearch) clearSearch.hidden = !state.query.get("q");
    renderActiveFilters();
    resultsRoot.querySelector("[data-archive-clear-filters]")?.addEventListener("click", () => {
      state.query = new URLSearchParams();
      state.page = 1;
      controls();
      render({ focusResults: true });
    });
    updateUrl();
    if (focusResults) root.querySelector("#archive-results-heading")?.focus({ preventScroll: true });
  }

  function normalizeQuery(options) {
    const query = state.query.get("q")?.trim() || "";
    if (query) state.query.set("q", query);
    else state.query.delete("q");
    for (const key of ["tag", "year"]) {
      const value = state.query.get(key) || "";
      if (!options[key].some((option) => option.value === value)) state.query.delete(key);
    }
    if (!["newest", "oldest"].includes(state.query.get("sort"))) state.query.delete("sort");
  }

  function controls() {
    const years = [...new Set(state.all.map((entry) => entry.date.slice(0, 4)).filter((year) => /^\d{4}$/.test(year)))].sort().reverse();
    const tags = [...new Set(state.all.flatMap((entry) => entry.tags))].sort((left, right) => left.localeCompare(right));
    const options = {
      tag: [{ value: "", label: "All tags" }, ...tags.map((tag) => ({ value: tag, label: tag }))],
      year: [{ value: "", label: "All years" }, ...years.map((year) => ({ value: year, label: year }))],
    };
    normalizeQuery(options);
    removeOutsideListener();
    const sortOptions = [{ value: "newest", label: "Newest" }, { value: "oldest", label: "Oldest" }];
    root.innerHTML = `<section class="archive-controls"><label class="archive-search"><span>Search</span><div class="archive-search-field"><input data-archive-query aria-label="Search title, tag, or excerpt" type="search" placeholder="Title, tag, or excerpt" value="${escapeHtml(state.query.get("q") || "")}"><button type="button" data-archive-clear-search aria-label="Clear search" hidden>Clear</button></div></label>${selectControl("tag", "Tag", options.tag, state.query.get("tag") || "")}${selectControl("year", "Year", options.year, state.query.get("year") || "")}${selectControl("sort", "Sort", sortOptions, state.query.get("sort") || DEFAULT_SORT)}</section><div class="archive-active-filters" data-archive-active-filters hidden></div><div class="archive-summary" role="status" aria-live="polite"><strong data-archive-count></strong><span data-archive-page></span></div><h2 id="archive-results-heading" class="archive-visually-hidden" tabindex="-1">Archive results</h2><section class="archive-results" aria-live="polite" aria-labelledby="archive-results-heading" data-archive-results></section><nav class="archive-navigation" aria-label="Archive pagination"><button data-archive-prev aria-label="Previous Archive page" type="button">Previous</button><button data-archive-next aria-label="Next Archive page" type="button">Next</button></nav>`;
    const query = root.querySelector("[data-archive-query]");
    query.addEventListener("input", () => {
      const value = query.value.trim();
      if (value) state.query.set("q", value);
      else state.query.delete("q");
      state.page = 1;
      render();
    });
    root.querySelector("[data-archive-clear-search]").addEventListener("click", () => {
      state.query.delete("q");
      state.page = 1;
      controls();
      render({ focusResults: true });
    });
    const closeMenus = () => root.querySelectorAll(".archive-select.is-open").forEach((select) => {
      select.classList.remove("is-open");
      select.querySelector(".archive-select-trigger")?.setAttribute("aria-expanded", "false");
      const menu = select.querySelector(".archive-select-menu");
      if (menu) menu.hidden = true;
    });
    const openMenu = (select, focusSelected = false) => {
      closeMenus();
      select.classList.add("is-open");
      select.querySelector(".archive-select-trigger")?.setAttribute("aria-expanded", "true");
      const menu = select.querySelector(".archive-select-menu");
      if (menu) menu.hidden = false;
      if (focusSelected) select.querySelector('[role="option"][aria-selected="true"]')?.focus();
    };
    root.querySelectorAll("[data-archive-select]").forEach((select) => {
      const trigger = select.querySelector(".archive-select-trigger");
      trigger.addEventListener("click", () => select.classList.contains("is-open") ? closeMenus() : openMenu(select));
      trigger.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); closeMenus(); trigger.focus(); return; }
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); openMenu(select, true); }
      });
      select.querySelectorAll('[role="option"]').forEach((option) => option.addEventListener("click", () => {
        const key = select.dataset.archiveSelect;
        const value = option.dataset.value || "";
        if (value) state.query.set(key, value);
        else state.query.delete(key);
        state.page = 1;
        closeMenus();
        controls();
        render({ focusResults: true });
      }));
      select.querySelectorAll('[role="option"]').forEach((option) => option.addEventListener("keydown", (event) => {
        const optionList = [...select.querySelectorAll('[role="option"]')];
        const index = optionList.indexOf(option);
        if (event.key === "ArrowDown") { event.preventDefault(); optionList[(index + 1) % optionList.length].focus(); }
        if (event.key === "ArrowUp") { event.preventDefault(); optionList[(index - 1 + optionList.length) % optionList.length].focus(); }
        if (event.key === "Home") { event.preventDefault(); optionList[0].focus(); }
        if (event.key === "End") { event.preventDefault(); optionList.at(-1).focus(); }
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); option.click(); }
        if (event.key === "Escape") { event.preventDefault(); closeMenus(); trigger.focus(); }
      }));
    });
    const outsideListener = (event) => { if (!root.contains(event.target)) closeMenus(); };
    document.addEventListener("pointerdown", outsideListener);
    removeOutsideListener = () => document.removeEventListener("pointerdown", outsideListener);
    root.querySelector("[data-archive-prev]").addEventListener("click", () => {
      state.page -= 1;
      render({ focusResults: true });
      window.scrollTo({ top: root.offsetTop, behavior: "smooth" });
    });
    root.querySelector("[data-archive-next]").addEventListener("click", () => {
      state.page += 1;
      render({ focusResults: true });
      window.scrollTo({ top: root.offsetTop, behavior: "smooth" });
    });
  }

  window.addEventListener("popstate", () => {
    state.query = new URLSearchParams(window.location.search);
    state.page = Math.max(1, Number.parseInt(state.query.get("page") || "1", 10) || 1);
    controls();
    render();
  });

  async function loadIndex() {
    removeOutsideListener();
    root.innerHTML = '<p class="archive-empty archive-loading" role="status" aria-live="polite">Loading Pages…</p>';
    try {
      const response = await fetch(`${basePath}/page-index.json`, { cache: "no-store" });
      if (!response.ok) throw new Error("Archive index unavailable");
      const entries = await response.json();
      if (!Array.isArray(entries)) throw new Error("Archive index malformed");
      state.all = entries.map(normalizeEntry);
      controls();
      render();
    } catch {
      root.innerHTML = '<div class="archive-empty" role="alert"><p>The Page index could not be loaded. Please try again later.</p><button type="button" class="archive-state-action" data-archive-retry>Try again</button></div>';
      root.querySelector("[data-archive-retry]")?.addEventListener("click", loadIndex);
    }
  }

  loadIndex();
})();
